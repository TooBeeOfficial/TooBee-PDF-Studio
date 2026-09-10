import { app as a, protocol as b, BrowserWindow as _, ipcMain as c, shell as F } from "electron";
import r from "node:path";
import { fileURLToPath as R } from "node:url";
import s from "node:fs";
const T = R(import.meta.url), f = r.dirname(T), k = r.join(f, "..", "build", "icon.ico"), D = r.join(a.getPath("userData"), "open-files-debug.log");
function l(...t) {
  const e = `[${(/* @__PURE__ */ new Date()).toISOString()}] ${t.map((n) => typeof n == "string" ? n : JSON.stringify(n)).join(" ")}
`;
  try {
    s.appendFileSync(D, e);
  } catch {
  }
}
function p() {
  return r.join(a.getPath("userData"), "signatures");
}
function w(t) {
  if (typeof t != "string" || !/^[A-Za-z0-9_-]{1,64}$/.test(t))
    throw new Error("Invalid signature id.");
  return r.join(p(), `${t}.json`);
}
const L = "bgmodel";
b.registerSchemesAsPrivileged([
  {
    scheme: L,
    privileges: { standard: !0, secure: !0, supportFetchAPI: !0 }
  }
]);
function E() {
  b.handle(L, async (t) => {
    const e = decodeURIComponent(new URL(t.url).pathname).replace(/^\/+/, "");
    if (!/^[A-Za-z0-9._-]+$/.test(e) || e.includes(".."))
      return new Response("Bad request", { status: 400 });
    try {
      const n = await s.promises.readFile(
        r.join(f, "..", "dist-renderer", "bg-removal", e)
      );
      return new Response(n, {
        headers: {
          "content-type": e.endsWith(".json") ? "application/json" : "application/octet-stream"
        }
      });
    } catch {
      return new Response("Not found", { status: 404 });
    }
  });
}
let i = null, g = null;
const S = a.requestSingleInstanceLock();
S || (a.quit(), process.exit(0));
a.on("second-instance", (t, e) => {
  l("second-instance fired, argv =", e, "win exists =", !!i), i && (i.isMinimized() && i.restore(), i.focus(), j(e));
});
function v() {
  i = new _({
    width: 1400,
    height: 900,
    minWidth: 1e3,
    minHeight: 700,
    title: "TooBee PDF Studio",
    icon: k,
    webPreferences: {
      preload: r.join(f, "preload.cjs"),
      contextIsolation: !0,
      nodeIntegration: !1
    }
  }), i.setMenuBarVisibility(!1), i.autoHideMenuBar = !1;
  const t = process.env.VITE_DEV_SERVER_URL;
  t ? (i.loadURL(t), process.env.DEVTOOLS && i.webContents.openDevTools()) : i.loadFile(r.join(f, "../dist-renderer/index.html")), i.webContents.on("before-input-event", (e, n) => {
    if (n.type !== "keyDown") return;
    (n.key === "F12" || n.control && n.shift && n.key.toLowerCase() === "i") && (i == null || i.webContents.toggleDevTools());
  }), i.webContents.on("will-navigate", (e, n) => {
    const o = new URL(n), m = new URL((i == null ? void 0 : i.webContents.getURL()) || "about:blank");
    (o.origin !== m.origin || o.pathname !== m.pathname) && (l("blocked navigation to", n), e.preventDefault());
  }), i.on("closed", () => {
    i = null;
  });
}
a.whenReady().then(() => {
  l("app ready, gotTheLock =", S, "process.argv =", process.argv), E(), v(), a.on("activate", () => {
    _.getAllWindows().length === 0 && v();
  }), c.handle("read-file", async (t, e) => {
    const n = await s.promises.readFile(e);
    return {
      name: r.basename(e),
      buffer: n,
      path: e
    };
  }), c.handle("get-pending-files", () => {
    const t = g;
    return l("get-pending-files invoked by renderer, returning", t), g = null, t;
  }), c.handle("app:getVersion", () => a.getVersion()), c.handle("signatures:list", async () => {
    const t = p();
    try {
      const e = await s.promises.readdir(t);
      return (await Promise.all(
        e.filter((o) => o.endsWith(".json")).map(async (o) => {
          try {
            return JSON.parse(await s.promises.readFile(r.join(t, o), "utf8"));
          } catch {
            return l("signatures: skipping unreadable record", o), null;
          }
        })
      )).filter(Boolean);
    } catch (e) {
      if ((e == null ? void 0 : e.code) === "ENOENT") return [];
      throw e;
    }
  }), c.handle("signatures:save", async (t, e) => {
    const n = w(e == null ? void 0 : e.id);
    await s.promises.mkdir(r.dirname(n), { recursive: !0 });
    const o = `${n}.tmp`;
    return await s.promises.writeFile(o, JSON.stringify(e), "utf8"), await s.promises.rename(o, n), !0;
  }), c.handle("signatures:delete", async (t, e) => {
    try {
      await s.promises.unlink(w(e));
    } catch (n) {
      if ((n == null ? void 0 : n.code) !== "ENOENT") throw n;
    }
    return !0;
  }), c.handle("signatures:reveal", async () => {
    const t = p();
    return await s.promises.mkdir(t, { recursive: !0 }), await F.openPath(t), t;
  }), j(process.argv);
});
a.on("window-all-closed", () => {
  process.platform !== "darwin" && a.quit();
});
let u = [], h = null, d = null;
const y = 400;
function j(t) {
  let e = null;
  const n = [];
  for (const o of t.slice(1)) {
    if (o.split("=")[0] === "--action") {
      e = o.split("=")[1] ?? null;
      continue;
    }
    if (!o.startsWith("--"))
      try {
        s.statSync(o).isFile() && n.push(o);
      } catch {
      }
  }
  if (l("handleArgv parsed", { argv: t, action: e, files: n }), !n.length) {
    l("handleArgv: no real files found in argv, ignoring.");
    return;
  }
  for (const o of n)
    u.includes(o) || u.push(o);
  e && (h = e), d && clearTimeout(d), d = setTimeout(A, y), l("queued into batch, now holding", u.length, "file(s); flushing in", y, "ms unless more arrive");
}
function A() {
  if (d = null, !u.length) return;
  const t = { files: u, action: h, argv: process.argv };
  u = [], h = null, i == null || i.webContents.send("open-files", t), l("flushed batch to renderer (best-effort) and queued as pendingFiles:", t), g = t;
}
