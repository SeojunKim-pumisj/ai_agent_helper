const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("api", Object.freeze({
  ping: () => ipcRenderer.invoke("app:ping"),
  getVersion: () => ipcRenderer.invoke("app:get-version"),
  setIgnoreMouseEvents: (ignore) => {
    ipcRenderer.send("window:set-ignore-mouse-events", Boolean(ignore));
  }
}));
