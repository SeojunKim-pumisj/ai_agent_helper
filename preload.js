const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("api", Object.freeze({
  ping: () => ipcRenderer.invoke("app:ping"),
  getVersion: () => ipcRenderer.invoke("app:get-version"),
  getRuntimeSettings: () => ipcRenderer.invoke("settings:get-runtime"),
  validateTranslateInput: (text) => ipcRenderer.invoke("translate:validate-input", text),
  translateText: (text, source = "auto", target = "ko") => {
    return ipcRenderer.invoke("translate:request", { text, source, target });
  },
  setIgnoreMouseEvents: (ignore) => {
    ipcRenderer.send("window:set-ignore-mouse-events", Boolean(ignore));
  },
  openTranslateInput: (mode = "manual", source = "renderer") => {
    ipcRenderer.send("translate:open-input", { mode, source });
  },
  showTranslateContextMenu: (x, y) => {
    ipcRenderer.send("translate:show-context-menu", {
      x: Number(x),
      y: Number(y)
    });
  },
  openSettingsWindow: () => {
    ipcRenderer.send("settings:open");
  },
  onTranslateOpenInput: (callback) => {
    const listener = (_event, payload) => callback(payload ?? {});
    ipcRenderer.on("translate:open-input", listener);
    return () => ipcRenderer.removeListener("translate:open-input", listener);
  },
  onAppNotice: (callback) => {
    const listener = (_event, payload) => callback(payload ?? {});
    ipcRenderer.on("app:notice", listener);
    return () => ipcRenderer.removeListener("app:notice", listener);
  },
  onSettingsUpdated: (callback) => {
    const listener = (_event, payload) => callback(payload ?? {});
    ipcRenderer.on("settings:updated", listener);
    return () => ipcRenderer.removeListener("settings:updated", listener);
  }
}));

contextBridge.exposeInMainWorld("settingsApi", Object.freeze({
  getSettings: () => ipcRenderer.invoke("settings:get"),
  saveSettings: (payload) => ipcRenderer.invoke("settings:save", payload ?? {}),
  closeWindow: () => ipcRenderer.send("settings:close"),
  onSettingsUpdated: (callback) => {
    const listener = (_event, payload) => callback(payload ?? {});
    ipcRenderer.on("settings:updated", listener);
    return () => ipcRenderer.removeListener("settings:updated", listener);
  }
}));
