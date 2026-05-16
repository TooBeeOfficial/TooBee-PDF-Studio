import { app, BrowserWindow, ipcMain } from 'electron';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import fs from 'node:fs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
process.env.APP_ROOT = path.join(__dirname, '..');

export const VITE_DEV_SERVER_URL = process.env['VITE_DEV_SERVER_URL'];
export const MAIN_DIST = path.join(process.env.APP_ROOT, 'dist-electron');
export const RENDERER_DIST = path.join(process.env.APP_ROOT, 'dist-renderer');

process.env.VITE_PUBLIC = VITE_DEV_SERVER_URL
  ? path.join(process.env.APP_ROOT, 'public')
  : RENDERER_DIST;

const iconPath = path.join(process.env.APP_ROOT, 'build', 'icon.ico');

let win: BrowserWindow | null = null;

// queue for files arriving before renderer is ready
let pendingFiles: { path: string; action: string | null; argv?: string[] }[] = [];
let rendererReady = false;

// single instance lock
const gotTheLock = app.requestSingleInstanceLock();

if (!gotTheLock) {
  app.quit();
  process.exit(0);
}

// second instance (Windows double-click files etc.)
app.on('second-instance', (_event, argv) => {
  if (win) {
    if (win.isMinimized()) win.restore();
    win.focus();
    handleArgv(argv);
  }
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
    win = null;
  }
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow();
  }
});

app.whenReady().then(() => {
  createWindow();

  ipcMain.handle('read-file', async (_event, filePath) => {
    const buffer = await fs.promises.readFile(filePath);
    return {
      name: path.basename(filePath),
      buffer,
      path: filePath,
    };
  });

  ipcMain.handle('renderer-ready', () => {
    rendererReady = true;

    if (pendingFiles.length > 0 && win) {
      win.webContents.send('open-files', {
        files: pendingFiles.map(f => f.path).filter(p => p !== ''),
        action: pendingFiles.find(f => f.action)?.action || null,
        argv: pendingFiles.find(f => f.argv)?.argv || [],
      });

      pendingFiles = [];
    }

    return true;
  });

  handleArgv(process.argv);
});

function createWindow() {
  win = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 1000,
    minHeight: 700,
    title: 'TooBee PDF Studio',
    icon: iconPath,
    webPreferences: {
      preload: path.join(__dirname, 'preload.mjs'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  win.setMenuBarVisibility(false);
  win.autoHideMenuBar = true;

  if (VITE_DEV_SERVER_URL) {
    win.loadURL(VITE_DEV_SERVER_URL);
  } else {
    win.loadFile(path.join(RENDERER_DIST, 'index.html'));
  }

  win.webContents.once('did-finish-load', () => {
    // flush anything that arrived early
    if (pendingFiles.length && rendererReady) {
      win?.webContents.send('open-files', {
        files: pendingFiles.map(f => f.path).filter(p => p !== ''),
        action: pendingFiles.find(f => f.action)?.action || null,
        argv: pendingFiles.find(f => f.argv)?.argv || [],
      });
      pendingFiles = [];
    }
  });
}

function handleArgv(argv: string[]) {
  let action: string | null = null;
  const files: string[] = [];

  for (const arg of argv) {
    if (arg.split('=')[0] === '--action') {
      action = arg.split('=')[1] ?? null;
      continue;
    }

    // ignore flags
    if (arg.startsWith('--')) continue;

    // only real files
    try {
      if (fs.existsSync(arg)) {
        files.push(arg);
      }
    } catch { }
  }

  if (!files.length) {
    // If no files were found but we still want to log argv, we can send a debug-only payload
    if (rendererReady && win?.webContents) {
      win.webContents.send('open-files', { files: [], action: null, argv });
    } else {
      pendingFiles.push({ path: '', action: null, argv });
    }
    return;
  }

  const payload = files.map(f => ({ path: f, action, argv }));

  // always queue
  pendingFiles.push(...payload);

  // send immediately if possible
  if (rendererReady && win?.webContents) {
    win.webContents.send('open-files', {
      files,
      action,
      argv,
    });

    // clear the queue of the ones we just sent
    pendingFiles = pendingFiles.filter(p => !files.includes(p.path));
  }
}