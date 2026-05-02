import { app as n, BrowserWindow as t } from "electron";
import { fileURLToPath as a } from "node:url";
import e from "node:path";
const r = e.dirname(a(import.meta.url));
process.env.APP_ROOT = e.join(r, "..");
const i = process.env.VITE_DEV_SERVER_URL, _ = e.join(process.env.APP_ROOT, "dist-electron"), s = e.join(process.env.APP_ROOT, "dist-renderer");
process.env.VITE_PUBLIC = i ? e.join(process.env.APP_ROOT, "public") : s;
const c = e.join(process.env.APP_ROOT, "build", "icon.ico");
let o;
function l() {
  o = new t({
    width: 1400,
    height: 900,
    minWidth: 1e3,
    minHeight: 700,
    title: "TooBee PDF Studio",
    icon: c,
    webPreferences: {
      preload: e.join(r, "preload.mjs"),
      contextIsolation: !0,
      nodeIntegration: !1
    }
    // Frameless options can be added here for even more premium feel
  }), o.setMenuBarVisibility(!1), o.autoHideMenuBar = !0, i ? o.loadURL(i) : o.loadFile(e.join(s, "index.html"));
}
n.on("window-all-closed", () => {
  process.platform !== "darwin" && (n.quit(), o = null);
});
n.on("activate", () => {
  t.getAllWindows().length === 0 && l();
});
n.whenReady().then(l);
export {
  _ as MAIN_DIST,
  s as RENDERER_DIST,
  i as VITE_DEV_SERVER_URL
};
