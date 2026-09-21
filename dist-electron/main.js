import { app as l, protocol as y, BrowserWindow as _, ipcMain as s, shell as j } from "electron";
import a from "node:path";
import { fileURLToPath as x } from "node:url";
import r from "node:fs";
const F = x(import.meta.url), f = a.dirname(F), R = a.join(f, "..", "build", "icon.ico"), T = a.join(l.getPath("userData"), "open-files-debug.log");
function c(...t) {
  const n = `[${(/* @__PURE__ */ new Date()).toISOString()}] ${t.map((i) => typeof i == "string" ? i : JSON.stringify(i)).join(" ")}
`;
  try {
    r.appendFileSync(T, n);
  } catch {
  }
}
function g() {
  return a.join(l.getPath("userData"), "signatures");
}
function w(t) {
  if (typeof t != "string" || !/^[A-Za-z0-9_-]{1,64}$/.test(t))
    throw new Error("Invalid signature id.");
  return a.join(g(), `${t}.json`);
}
const z = "bgmodel";
y.registerSchemesAsPrivileged([
  {
    scheme: z,
    privileges: { standard: !0, secure: !0, supportFetchAPI: !0 }
  }
]);
function k() {
  y.handle(z, async (t) => {
    const n = decodeURIComponent(new URL(t.url).pathname).replace(/^\/+/, "");
    if (!/^[A-Za-z0-9._-]+$/.test(n) || n.includes(".."))
      return new Response("Bad request", { status: 400 });
    try {
      const i = await r.promises.readFile(
        a.join(f, "..", "dist-renderer", "bg-removal", n)
      );
      return new Response(i, {
        headers: {
          "content-type": n.endsWith(".json") ? "application/json" : "application/octet-stream"
        }
      });
    } catch {
      return new Response("Not found", { status: 404 });
    }
  });
}
let e = null, m = null;
const L = l.requestSingleInstanceLock();
L || (l.quit(), process.exit(0));
l.on("second-instance", (t, n) => {
  c("second-instance fired, argv =", n, "win exists =", !!e), e && (e.isMinimized() && e.restore(), e.focus(), S(n));
});
function v() {
  e = new _({
    width: 1400,
    height: 900,
    minWidth: 1e3,
    minHeight: 700,
    title: "TooBee PDF Studio",
    icon: R,
    // The OS caption bar is switched off — the renderer draws its own
    // TitleBar (drag region, logo and minimize/maximize/close buttons) and
    // drives this window through the IPC handlers below instead.
    frame: !1,
    webPreferences: {
      preload: a.join(f, "preload.cjs"),
      contextIsolation: !0,
      nodeIntegration: !1
    }
  }), e.setMenuBarVisibility(!1), e.autoHideMenuBar = !1;
  const t = process.env.VITE_DEV_SERVER_URL;
  t ? (e.loadURL(t), process.env.DEVTOOLS && e.webContents.openDevTools()) : e.loadFile(a.join(f, "../dist-renderer/index.html")), e.webContents.on("before-input-event", (n, i) => {
    if (i.type !== "keyDown") return;
    (i.key === "F12" || i.control && i.shift && i.key.toLowerCase() === "i") && (e == null || e.webContents.toggleDevTools());
  }), e.webContents.on("will-navigate", (n, i) => {
    const o = new URL(i), h = new URL((e == null ? void 0 : e.webContents.getURL()) || "about:blank");
    (o.origin !== h.origin || o.pathname !== h.pathname) && (c("blocked navigation to", i), n.preventDefault());
  }), e.on("closed", () => {
    e = null;
  }), e.on("maximize", () => {
    e == null || e.webContents.send("window:maximized-changed", !0);
  }), e.on("unmaximize", () => {
    e == null || e.webContents.send("window:maximized-changed", !1);
  });
}
l.whenReady().then(() => {
  c("app ready, gotTheLock =", L, "process.argv =", process.argv), k(), v(), l.on("activate", () => {
    _.getAllWindows().length === 0 && v();
  }), s.handle("read-file", async (t, n) => {
    const i = await r.promises.readFile(n);
    return {
      name: a.basename(n),
      buffer: i,
      path: n
    };
  }), s.handle("get-pending-files", () => {
    const t = m;
    return c("get-pending-files invoked by renderer, returning", t), m = null, t;
  }), s.handle("app:getVersion", () => l.getVersion()), s.handle("window:minimize", () => {
    e == null || e.minimize();
  }), s.handle("window:toggleMaximize", () => {
    e && (e.isMaximized() ? e.unmaximize() : e.maximize());
  }), s.handle("window:close", () => {
    e == null || e.close();
  }), s.handle("window:isMaximized", () => (e == null ? void 0 : e.isMaximized()) ?? !1), s.handle("signatures:list", async () => {
    const t = g();
    try {
      const n = await r.promises.readdir(t);
      return (await Promise.all(
        n.filter((o) => o.endsWith(".json")).map(async (o) => {
          try {
            return JSON.parse(await r.promises.readFile(a.join(t, o), "utf8"));
          } catch {
            return c("signatures: skipping unreadable record", o), null;
          }
        })
      )).filter(Boolean);
    } catch (n) {
      if ((n == null ? void 0 : n.code) === "ENOENT") return [];
      throw n;
    }
  }), s.handle("signatures:save", async (t, n) => {
    const i = w(n == null ? void 0 : n.id);
    await r.promises.mkdir(a.dirname(i), { recursive: !0 });
    const o = `${i}.tmp`;
    return await r.promises.writeFile(o, JSON.stringify(n), "utf8"), await r.promises.rename(o, i), !0;
  }), s.handle("signatures:delete", async (t, n) => {
    try {
      await r.promises.unlink(w(n));
    } catch (i) {
      if ((i == null ? void 0 : i.code) !== "ENOENT") throw i;
    }
    return !0;
  }), s.handle("signatures:reveal", async () => {
    const t = g();
    return await r.promises.mkdir(t, { recursive: !0 }), await j.openPath(t), t;
  }), S(process.argv);
});
l.on("window-all-closed", () => {
  process.platform !== "darwin" && l.quit();
});
let d = [], p = null, u = null;
const b = 400;
function S(t) {
  let n = null;
  const i = [];
  for (const o of t.slice(1)) {
    if (o.split("=")[0] === "--action") {
      n = o.split("=")[1] ?? null;
      continue;
    }
    if (!o.startsWith("--"))
      try {
        r.statSync(o).isFile() && i.push(o);
      } catch {
      }
  }
  if (c("handleArgv parsed", { argv: t, action: n, files: i }), !i.length) {
    c("handleArgv: no real files found in argv, ignoring.");
    return;
  }
  for (const o of i)
    d.includes(o) || d.push(o);
  n && (p = n), u && clearTimeout(u), u = setTimeout(D, b), c("queued into batch, now holding", d.length, "file(s); flushing in", b, "ms unless more arrive");
}
function D() {
  if (u = null, !d.length) return;
  const t = { files: d, action: p, argv: process.argv };
  d = [], p = null, e == null || e.webContents.send("open-files", t), c("flushed batch to renderer (best-effort) and queued as pendingFiles:", t), m = t;
}
