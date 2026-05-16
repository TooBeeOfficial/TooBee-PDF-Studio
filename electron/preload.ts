import { contextBridge, ipcRenderer } from 'electron';

const api = {
  on(channel: string, listener: (...args: any[]) => void) {
    const wrapped = (_event: any, ...args: any[]) => listener(...args);
    ipcRenderer.on(channel, wrapped);
    return () => ipcRenderer.removeListener(channel, wrapped);
  },

  off(channel: string, listener: (...args: any[]) => void) {
    ipcRenderer.removeListener(channel, listener as any);
  },

  send(channel: string, ...args: any[]) {
    ipcRenderer.send(channel, ...args);
  },

  invoke(channel: string, ...args: any[]) {
    return ipcRenderer.invoke(channel, ...args);
  }
};

contextBridge.exposeInMainWorld('ipcRenderer', api);