import { app, BrowserWindow, ipcMain, protocol, shell } from "electron";
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

/**
 * Where reusable signatures live, and the guard that keeps them there.
 *
 * The id in a save or delete arrives from the renderer, so it is treated as
 * untrusted input: anything but a plain slug is refused outright rather than
 * sanitised, because a request carrying a path separator is a bug or an attack
 * and neither deserves a best-effort interpretation.
 */
function signatureDir() {
  return path.join(app.getPath("userData"), "signatures");
}

function signatureFile(id: unknown) {
  if (typeof id !== "string" || !/^[A-Za-z0-9_-]{1,64}$/.test(id)) {
    throw new Error("Invalid signature id.");
  }
  return path.join(signatureDir(), `${id}.json`);
}

/**
 * A fetchable scheme for the offline background-removal model.
 *
 * In production the renderer is loaded from disk with loadFile(), so its origin
 * is file: — and Chromium refuses fetch() against file: URLs. The model library
 * loads its manifest and every weight chunk with fetch(), so on the packaged app
 * it could not read them however they were bundled.
 *
 * Rather than move the whole window onto a custom scheme, or switch off
 * webSecurity, only the model files get one. Nothing else about how the app
 * loads changes, and the scheme serves exactly one directory.
 *
 * Registration has to happen before the app is ready, hence the module-level
 * call below rather than a line inside whenReady().
 */
const MODEL_SCHEME = "bgmodel";

protocol.registerSchemesAsPrivileged([
  {
    scheme: MODEL_SCHEME,
    privileges: { standard: true, secure: true, supportFetchAPI: true },
  },
]);

function registerModelProtocol() {
  protocol.handle(MODEL_SCHEME, async request => {
    // Only the last path segment is honoured, and only if it is a plain name.
    // Chunks are content-addressed hashes, so nothing legitimate needs a
    // separator, and refusing them outright keeps the handler from being a
    // window onto the rest of the disk.
    const name = decodeURIComponent(new URL(request.url).pathname).replace(/^\/+/, "");
    if (!/^[A-Za-z0-9._-]+$/.test(name) || name.includes("..")) {
      return new Response("Bad request", { status: 400 });
    }

    try {
      const data = await fs.promises.readFile(
        path.join(__dirname, "..", "dist-renderer", "bg-removal", name),
      );
      return new Response(data, {
        headers: {
          "content-type": name.endsWith(".json")
            ? "application/json"
            : "application/octet-stream",
        },
      });
    } catch {
      // The model pack is optional; a miss is the renderer's cue to report the
      // automatic cutout as unavailable rather than an error to shout about.
      return new Response("Not found", { status: 404 });
    }
  });
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
    // The OS caption bar is switched off — the renderer draws its own
    // TitleBar (drag region, logo and minimize/maximize/close buttons) and
    // drives this window through the IPC handlers below instead.
    frame: false,
    webPreferences: {
      preload: path.join(__dirname, "preload.cjs"),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  // Hidden for good, not merely auto-hidden. `autoHideMenuBar = true` is
  // specifically the "hide it until someone presses Alt" mode, which is why the
  // File/Edit/View bar kept appearing over the app.
  //
  // The menu itself is deliberately left in place rather than cleared with
  // Menu.setApplicationMenu(null). On Windows and Linux the default menu is
  // what supplies the standard editing accelerators — Ctrl+C, Ctrl+V, Ctrl+X,
  // Ctrl+A, Ctrl+Z — so removing it would silently break copy and paste in
  // every text field in the app. Keeping it and never showing it costs nothing.
  win.setMenuBarVisibility(false);
  win.autoHideMenuBar = false;

  const devServerUrl = process.env["VITE_DEV_SERVER_URL"];
  if (devServerUrl) {
    win.loadURL(devServerUrl);
    // DevTools no longer opens by itself. It used to open on every `npm run
    // dev`, which meant the app was never seen at the size it actually ships
    // at, and a stray dev window left the panel sitting over the document.
    // Set DEVTOOLS=1 to get it back for a session; F12 and Ctrl+Shift+I still
    // work at any time.
    if (process.env["DEVTOOLS"]) win.webContents.openDevTools();
  } else {
    win.loadFile(path.join(__dirname, "../dist-renderer/index.html"));
  }

  // Opening DevTools by hand needs a shortcut now that it is not automatic.
  // The menu bar is hidden, so there is nowhere else to reach it from.
  win.webContents.on("before-input-event", (_event, input) => {
    if (input.type !== "keyDown") return;
    const toggle =
      input.key === "F12" ||
      (input.control && input.shift && input.key.toLowerCase() === "i");
    if (toggle) win?.webContents.toggleDevTools();
  });

  // Belt and braces for the drop guard in the renderer: nothing in this app
  // ever navigates the main frame, so any attempt is a mishandled drop or a
  // stray link and is refused rather than allowed to replace the UI.
  win.webContents.on("will-navigate", (event, url) => {
    const target = new URL(url);
    const current = new URL(win?.webContents.getURL() || "about:blank");
    if (target.origin !== current.origin || target.pathname !== current.pathname) {
      debugLog("blocked navigation to", url);
      event.preventDefault();
    }
  });

  win.on("closed", () => {
    win = null;
  });

  // Drives the TitleBar's maximize/restore icon, which can also change from
  // outside the button itself — double-clicking the bar, dragging to a
  // screen edge, or the OS's own Win+Up/Win+Down shortcuts.
  win.on("maximize", () => {
    win?.webContents.send("window:maximized-changed", true);
  });
  win.on("unmaximize", () => {
    win?.webContents.send("window:maximized-changed", false);
  });
}

app.whenReady().then(() => {
  debugLog("app ready, gotTheLock =", gotTheLock, "process.argv =", process.argv);
  registerModelProtocol();
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

  // ── Custom TitleBar window controls ───────────────────────────────────────
  // Stand-ins for the buttons a native frame would otherwise draw, since
  // `frame: false` above removes them entirely.

  ipcMain.handle("window:minimize", () => {
    win?.minimize();
  });

  ipcMain.handle("window:toggleMaximize", () => {
    if (!win) return;
    if (win.isMaximized()) win.unmaximize();
    else win.maximize();
  });

  ipcMain.handle("window:close", () => {
    win?.close();
  });

  ipcMain.handle("window:isMaximized", () => {
    return win?.isMaximized() ?? false;
  });

  // ── Saved signature library ───────────────────────────────────────────────
  // One JSON file per signature under userData, rather than a single index or a
  // renderer-side database. The user asked to be able to reuse these, and files
  // on disk mean they can also back them up, copy them to another machine, or
  // delete one by hand — none of which is true of IndexedDB. One file each also
  // means a corrupt write costs a single signature instead of the library.

  ipcMain.handle("signatures:list", async () => {
    const dir = signatureDir();
    try {
      const names = await fs.promises.readdir(dir);
      const records = await Promise.all(
        names
          .filter(n => n.endsWith(".json"))
          .map(async n => {
            try {
              return JSON.parse(await fs.promises.readFile(path.join(dir, n), "utf8"));
            } catch {
              // A half-written or hand-edited file should not take the whole
              // library down with it.
              debugLog("signatures: skipping unreadable record", n);
              return null;
            }
          }),
      );
      return records.filter(Boolean);
    } catch (err: unknown) {
      if ((err as NodeJS.ErrnoException)?.code === "ENOENT") return [];
      throw err;
    }
  });

  ipcMain.handle("signatures:save", async (_event, record: { id?: string }) => {
    const file = signatureFile(record?.id);
    await fs.promises.mkdir(path.dirname(file), { recursive: true });
    // Write beside it and rename, so an interrupted save cannot leave a
    // truncated file where a good one used to be.
    const temp = `${file}.tmp`;
    await fs.promises.writeFile(temp, JSON.stringify(record), "utf8");
    await fs.promises.rename(temp, file);
    return true;
  });

  ipcMain.handle("signatures:delete", async (_event, id: string) => {
    try {
      await fs.promises.unlink(signatureFile(id));
    } catch (err: unknown) {
      if ((err as NodeJS.ErrnoException)?.code !== "ENOENT") throw err;
    }
    return true;
  });

  ipcMain.handle("signatures:reveal", async () => {
    const dir = signatureDir();
    await fs.promises.mkdir(dir, { recursive: true });
    await shell.openPath(dir);
    return dir;
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

    // Only real files. existsSync is also true for directories, and in dev the
    // launcher runs `electron .` — so the "." was taken for a document to open,
    // handed to the renderer, and failed there with EISDIR when something tried
    // to read a directory as a PDF.
    try {
      if (fs.statSync(arg).isFile()) {
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
