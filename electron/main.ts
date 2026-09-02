import { app, BrowserWindow, ipcMain } from "electron";
import path from "node:path";
import { fileURLToPath } from "node:url";
import fs from "node:fs";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const iconPath = path.join(__dirname, "..", "build", "icon.ico");

// Temporary diagnostic log for the "open with" / context-menu file handoff —
// this runs before any window exists, so console output isn't visible for a
// windowed (non-console) app; a log file survives regardless of DevTools timing.
const debugLogPath = path.join(app.getPath("userData"), "open-files-debug.log");
function debugLog(...args: unknown[]) {
  const line = `[${new Date().toISOString()}] ${args.map(a => typeof a === "string" ? a : JSON.stringify(a)).join(" ")}\n`;
  try { fs.appendFileSync(debugLogPath, line); } catch { /* ignore */ }
}

let win: BrowserWindow | null = null;

// Files opened before the renderer has mounted its 'open-files' listener (e.g.
// the very first launch via double-click or "Open with") are queued here; the
// renderer pulls them once ready via the 'get-pending-files' invoke below.
let pendingFiles: { files: string[]; action: string | null; argv: string[] } | null = null;

// single instance lock — a second launch (e.g. right-clicking another file)
// quits itself and forwards its argv to this already-running instance instead.
const gotTheLock = app.requestSingleInstanceLock();

if (!gotTheLock) {
  app.quit();
  process.exit(0);
}

app.on("second-instance", (_event, argv) => {
  debugLog("second-instance fired, argv =", argv, "win exists =", !!win);
  if (win) {
    if (win.isMinimized()) win.restore();
    win.focus();
    handleArgv(argv);
  }
});

function createWindow() {
  win = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 1000,
    minHeight: 700,
    title: "TooBee PDF Studio",
    icon: iconPath,
    webPreferences: {
      preload: path.join(__dirname, "preload.cjs"),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  win.setMenuBarVisibility(false);
  win.autoHideMenuBar = true;

  const devServerUrl = process.env["VITE_DEV_SERVER_URL"];
  if (devServerUrl) {
    win.loadURL(devServerUrl);
    win.webContents.openDevTools();
  } else {
    win.loadFile(path.join(__dirname, "../dist-renderer/index.html"));
  }

  win.on("closed", () => {
    win = null;
  });
}

app.whenReady().then(() => {
  debugLog("app ready, gotTheLock =", gotTheLock, "process.argv =", process.argv);
  createWindow();

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });

  ipcMain.handle("read-file", async (_event, filePath) => {
    const buffer = await fs.promises.readFile(filePath);
    return {
      name: path.basename(filePath),
      buffer,
      path: filePath,
    };
  });

  ipcMain.handle("get-pending-files", () => {
    const data = pendingFiles;
    debugLog("get-pending-files invoked by renderer, returning", data);
    pendingFiles = null;
    return data;
  });

  ipcMain.handle("app:getVersion", () => {
    return app.getVersion();
  });

  handleArgv(process.argv);
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
  }
});

// Windows doesn't reliably honor MultiSelectModel=Player for the generic
// "*\\shell" (all files) context-menu registration this app uses — in
// practice, right-clicking several selected files often launches one process
// PER file instead of one process with all of them. Each extra process loses
// the single-instance-lock race and forwards its own single file here via
// 'second-instance', arriving milliseconds apart. Rather than deliver each
// one immediately (which would just replace the previous file each time),
// batch everything that arrives within a short window into one combined
// open-files payload.
let batchFiles: string[] = [];
let batchAction: string | null = null;
let batchTimer: ReturnType<typeof setTimeout> | null = null;
const BATCH_WINDOW_MS = 400;

function handleArgv(argv: string[]) {
  let action: string | null = null;
  const files: string[] = [];

  // argv[0] is always this executable's own path (which exists on disk, so
  // fs.existsSync would otherwise treat it as an "opened file" on every launch).
  for (const arg of argv.slice(1)) {
    if (arg.split("=")[0] === "--action") {
      action = arg.split("=")[1] ?? null;
      continue;
    }

    // ignore flags
    if (arg.startsWith("--")) continue;

    // only real files
    try {
      if (fs.existsSync(arg)) {
        files.push(arg);
      }
    } catch { }
  }

  debugLog("handleArgv parsed", { argv, action, files });

  if (!files.length) {
    debugLog("handleArgv: no real files found in argv, ignoring.");
    return;
  }

  for (const f of files) {
    if (!batchFiles.includes(f)) batchFiles.push(f);
  }
  if (action) batchAction = action;

  if (batchTimer) clearTimeout(batchTimer);
  batchTimer = setTimeout(flushBatch, BATCH_WINDOW_MS);
  debugLog("queued into batch, now holding", batchFiles.length, "file(s); flushing in", BATCH_WINDOW_MS, "ms unless more arrive");
}

function flushBatch() {
  batchTimer = null;
  if (!batchFiles.length) return;

  const payload = { files: batchFiles, action: batchAction, argv: process.argv };
  batchFiles = [];
  batchAction = null;

  // Best-effort immediate delivery for when the renderer is already mounted
  // (app was already running, or the window finished loading long ago).
  win?.webContents.send("open-files", payload);
  debugLog("flushed batch to renderer (best-effort) and queued as pendingFiles:", payload);
  // Reliable fallback: the renderer pulls this on mount via 'get-pending-files'
  // in case the send above fired before its 'open-files' listener was attached
  // (e.g. the very first launch, while the page is still loading).
  pendingFiles = payload;
}
