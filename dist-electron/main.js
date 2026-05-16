import { app as l, BrowserWindow as f, ipcMain as d } from "electron";
import { fileURLToPath as g } from "node:url";
import r from "node:path";
import p from "node:fs";
const u = r.dirname(g(import.meta.url));
process.env.APP_ROOT = r.join(u, "..");
const c = process.env.VITE_DEV_SERVER_URL, I = r.join(process.env.APP_ROOT, "dist-electron"), h = r.join(process.env.APP_ROOT, "dist-renderer");
process.env.VITE_PUBLIC = c ? r.join(process.env.APP_ROOT, "public") : h;
const v = r.join(process.env.APP_ROOT, "build", "icon.ico");
let e = null, i = [], a = !1;
const w = l.requestSingleInstanceLock();
w || (l.quit(), process.exit(0));
l.on("second-instance", (o, t) => {
  e && (e.isMinimized() && e.restore(), e.focus(), R(t));
});
l.on("window-all-closed", () => {
  process.platform !== "darwin" && (l.quit(), e = null);
});
l.on("activate", () => {
  f.getAllWindows().length === 0 && m();
});
l.whenReady().then(() => {
  m(), d.handle("read-file", async (o, t) => {
    const n = await p.promises.readFile(t);
    return {
      name: r.basename(t),
      buffer: n,
      path: t
    };
  }), d.handle("renderer-ready", () => {
    var o, t;
    return a = !0, i.length > 0 && e && (e.webContents.send("open-files", {
      files: i.map((n) => n.path).filter((n) => n !== ""),
      action: ((o = i.find((n) => n.action)) == null ? void 0 : o.action) || null,
      argv: ((t = i.find((n) => n.argv)) == null ? void 0 : t.argv) || []
    }), i = []), !0;
  }), R(process.argv);
});
function m() {
  e = new f({
    width: 1400,
    height: 900,
    minWidth: 1e3,
    minHeight: 700,
    title: "TooBee PDF Studio",
    icon: v,
    webPreferences: {
      preload: r.join(u, "preload.mjs"),
      contextIsolation: !0,
      nodeIntegration: !1
    }
  }), e.setMenuBarVisibility(!1), e.autoHideMenuBar = !0, c ? e.loadURL(c) : e.loadFile(r.join(h, "index.html")), e.webContents.once("did-finish-load", () => {
    var o, t;
    i.length && a && (e == null || e.webContents.send("open-files", {
      files: i.map((n) => n.path).filter((n) => n !== ""),
      action: ((o = i.find((n) => n.action)) == null ? void 0 : o.action) || null,
      argv: ((t = i.find((n) => n.argv)) == null ? void 0 : t.argv) || []
    }), i = []);
  });
}
function R(o) {
  let t = null;
  const n = [];
  for (const s of o) {
    if (s.split("=")[0] === "--action") {
      t = s.split("=")[1] ?? null;
      continue;
    }
    if (!s.startsWith("--"))
      try {
        p.existsSync(s) && n.push(s);
      } catch {
      }
  }
  if (!n.length) {
    a && (e != null && e.webContents) ? e.webContents.send("open-files", { files: [], action: null, argv: o }) : i.push({ path: "", action: null, argv: o });
    return;
  }
  const _ = n.map((s) => ({ path: s, action: t, argv: o }));
  i.push(..._), a && (e != null && e.webContents) && (e.webContents.send("open-files", {
    files: n,
    action: t,
    argv: o
  }), i = i.filter((s) => !n.includes(s.path)));
}
export {
  I as MAIN_DIST,
  h as RENDERER_DIST,
  c as VITE_DEV_SERVER_URL
};
