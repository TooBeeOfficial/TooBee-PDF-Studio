import { app as o, BrowserWindow as b, ipcMain as d } from "electron";
import a from "node:path";
import { fileURLToPath as y } from "node:url";
import p from "node:fs";
const _ = y(import.meta.url), f = a.dirname(_), S = a.join(f, "..", "build", "icon.ico"), T = a.join(o.getPath("userData"), "open-files-debug.log");
function r(...e) {
  const t = `[${(/* @__PURE__ */ new Date()).toISOString()}] ${e.map((i) => typeof i == "string" ? i : JSON.stringify(i)).join(" ")}
`;
  try {
    p.appendFileSync(T, t);
  } catch {
  }
}
let n = null, u = null;
const v = o.requestSingleInstanceLock();
v || (o.quit(), process.exit(0));
o.on("second-instance", (e, t) => {
  r("second-instance fired, argv =", t, "win exists =", !!n), n && (n.isMinimized() && n.restore(), n.focus(), w(t));
});
function h() {
  n = new b({
    width: 1400,
    height: 900,
    minWidth: 1e3,
    minHeight: 700,
    title: "TooBee PDF Studio",
    icon: S,
    webPreferences: {
      preload: a.join(f, "preload.cjs"),
      contextIsolation: !0,
      nodeIntegration: !1
    }
  }), n.setMenuBarVisibility(!1), n.autoHideMenuBar = !0;
  const e = process.env.VITE_DEV_SERVER_URL;
  e ? (n.loadURL(e), n.webContents.openDevTools()) : n.loadFile(a.join(f, "../dist-renderer/index.html")), n.on("closed", () => {
    n = null;
  });
}
o.whenReady().then(() => {
  r("app ready, gotTheLock =", v, "process.argv =", process.argv), h(), o.on("activate", () => {
    b.getAllWindows().length === 0 && h();
  }), d.handle("read-file", async (e, t) => {
    const i = await p.promises.readFile(t);
    return {
      name: a.basename(t),
      buffer: i,
      path: t
    };
  }), d.handle("get-pending-files", () => {
    const e = u;
    return r("get-pending-files invoked by renderer, returning", e), u = null, e;
  }), d.handle("app:getVersion", () => o.getVersion()), w(process.argv);
});
o.on("window-all-closed", () => {
  process.platform !== "darwin" && o.quit();
});
let l = [], g = null, c = null;
const m = 400;
function w(e) {
  let t = null;
  const i = [];
  for (const s of e.slice(1)) {
    if (s.split("=")[0] === "--action") {
      t = s.split("=")[1] ?? null;
      continue;
    }
    if (!s.startsWith("--"))
      try {
        p.existsSync(s) && i.push(s);
      } catch {
      }
  }
  if (r("handleArgv parsed", { argv: e, action: t, files: i }), !i.length) {
    r("handleArgv: no real files found in argv, ignoring.");
    return;
  }
  for (const s of i)
    l.includes(s) || l.push(s);
  t && (g = t), c && clearTimeout(c), c = setTimeout(L, m), r("queued into batch, now holding", l.length, "file(s); flushing in", m, "ms unless more arrive");
}
function L() {
  if (c = null, !l.length) return;
  const e = { files: l, action: g, argv: process.argv };
  l = [], g = null, n == null || n.webContents.send("open-files", e), r("flushed batch to renderer (best-effort) and queued as pendingFiles:", e), u = e;
}
