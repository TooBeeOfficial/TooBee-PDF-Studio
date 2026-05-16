var t = (r, e) => () => (e || r((e = { exports: {} }).exports, e), e.exports);
import { contextBridge as d, ipcRenderer as n } from "electron";
var s = t(() => {
  const p = {
    on(r, e) {
      const o = (v, ...i) => e(...i);
      return n.on(r, o), () => n.removeListener(r, o);
    },
    off(r, e) {
      n.removeListener(r, e);
    },
    send(r, ...e) {
      n.send(r, ...e);
    },
    invoke(r, ...e) {
      return n.invoke(r, ...e);
    }
  };
  d.exposeInMainWorld("ipcRenderer", p);
});
export default s();
