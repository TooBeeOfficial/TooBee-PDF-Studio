import { contextBridge as t, ipcRenderer as n } from "electron";
const d = {
  on(e, r) {
    const o = (p, ...i) => r(...i);
    return n.on(e, o), () => n.removeListener(e, o);
  },
  off(e, r) {
    n.removeListener(e, r);
  },
  send(e, ...r) {
    n.send(e, ...r);
  },
  invoke(e, ...r) {
    return n.invoke(e, ...r);
  }
};
t.exposeInMainWorld("ipcRenderer", d);
