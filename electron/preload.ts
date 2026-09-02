import { contextBridge, ipcRenderer } from "electron";

const api = {
  on(channel: string, listener: (...args: any[]) => void) {
    const wrapped = (
      _event: Electron.IpcRendererEvent,
      ...args: any[]
    ) => {
      listener(...args);
    };

    ipcRenderer.on(channel, wrapped);

    return () => {
      ipcRenderer.removeListener(channel, wrapped);
    };
  },

  send(channel: string, ...args: any[]) {
    ipcRenderer.send(channel, ...args);
  },

  invoke(channel: string, ...args: any[]) {
    return ipcRenderer.invoke(channel, ...args);
  },

  getVersion() {
    return ipcRenderer.invoke("app:getVersion");
  },
};

contextBridge.exposeInMainWorld("ipcRenderer", api);