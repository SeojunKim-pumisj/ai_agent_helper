const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("api", Object.freeze({
  ping: () => ipcRenderer.invoke("app:ping"),
  getVersion: () => ipcRenderer.invoke("app:get-version")
}));
