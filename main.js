const path = require("node:path");
const {
  app,
  BrowserWindow,
  clipboard,
  globalShortcut,
  ipcMain,
  Menu,
  screen
} = require("electron");

let mainWindow;
const DEFAULT_TRANSLATE_SHORTCUT = "CommandOrControl+Shift+T";

function getVirtualDesktopBounds() {
  const displays = screen.getAllDisplays();
  if (!displays.length) {
    return screen.getPrimaryDisplay().bounds;
  }

  const minX = Math.min(...displays.map((display) => display.bounds.x));
  const minY = Math.min(...displays.map((display) => display.bounds.y));
  const maxX = Math.max(...displays.map((display) => display.bounds.x + display.bounds.width));
  const maxY = Math.max(...displays.map((display) => display.bounds.y + display.bounds.height));

  return {
    x: minX,
    y: minY,
    width: maxX - minX,
    height: maxY - minY
  };
}

function setWindowMouseIgnore(ignore) {
  if (!mainWindow || mainWindow.isDestroyed()) {
    return;
  }

  mainWindow.setIgnoreMouseEvents(Boolean(ignore), {
    forward: Boolean(ignore)
  });
}

function sendRendererEvent(channel, payload) {
  if (!mainWindow || mainWindow.isDestroyed()) {
    return;
  }

  mainWindow.webContents.send(channel, payload);
}

function notifyUser(message, level = "info") {
  sendRendererEvent("app:notice", { level, message });
}

function openTranslateInput(payload = {}) {
  const prefillText = typeof payload.prefillText === "string" ? payload.prefillText : "";
  sendRendererEvent("translate:open-input", {
    source: payload.source ?? "manual",
    prefillText,
    autoSubmit: Boolean(payload.autoSubmit)
  });
}

function readClipboardText() {
  try {
    return clipboard.readText().trim();
  } catch (error) {
    return "";
  }
}

function openTranslateInputFromShortcut() {
  const clipboardText = readClipboardText();
  openTranslateInput({
    source: "shortcut",
    prefillText: clipboardText,
    autoSubmit: clipboardText.length > 0
  });

  if (!clipboardText) {
    notifyUser("클립보드가 비어 있어 입력창만 열었습니다.", "warning");
  }
}

function registerTranslateShortcut() {
  const registered = globalShortcut.register(DEFAULT_TRANSLATE_SHORTCUT, openTranslateInputFromShortcut);
  if (!registered) {
    notifyUser("단축키 등록에 실패했습니다. 다른 앱에서 사용 중일 수 있습니다.", "error");
    return;
  }

  notifyUser(`단축키가 등록되었습니다: ${DEFAULT_TRANSLATE_SHORTCUT}`, "info");
}

function popupTranslateContextMenu(x, y) {
  if (!mainWindow || mainWindow.isDestroyed()) {
    return;
  }

  const menu = Menu.buildFromTemplate([
    {
      label: "번역 입력",
      click: () => openTranslateInput({ source: "context-menu", prefillText: "", autoSubmit: false })
    },
    {
      label: "클립보드 번역",
      click: () => {
        const clipboardText = readClipboardText();
        openTranslateInput({
          source: "context-menu-clipboard",
          prefillText: clipboardText,
          autoSubmit: clipboardText.length > 0
        });

        if (!clipboardText) {
          notifyUser("클립보드가 비어 있어 입력창만 열었습니다.", "warning");
        }
      }
    }
  ]);

  menu.popup({
    window: mainWindow,
    x,
    y
  });
}

function fitWindowToVirtualDesktop() {
  if (!mainWindow || mainWindow.isDestroyed()) {
    return;
  }

  const bounds = getVirtualDesktopBounds();
  mainWindow.setBounds(bounds, false);
}

function createMainWindow() {
  const { x, y, width, height } = getVirtualDesktopBounds();

  mainWindow = new BrowserWindow({
    x,
    y,
    width,
    height,
    frame: false,
    transparent: true,
    alwaysOnTop: true,
    resizable: false,
    hasShadow: false,
    skipTaskbar: true,
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true
    }
  });

  mainWindow.setAlwaysOnTop(true, "screen-saver");
  mainWindow.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
  mainWindow.loadFile("index.html");
  setWindowMouseIgnore(true);
}

app.whenReady().then(() => {
  ipcMain.handle("app:ping", () => "pong");
  ipcMain.handle("app:get-version", () => app.getVersion());
  ipcMain.handle("translate:validate-input", (event, payload) => {
    if (!mainWindow || event.sender !== mainWindow.webContents) {
      return { ok: false, reason: "forbidden", message: "요청 주체가 유효하지 않습니다." };
    }

    const maxLength = 2000;
    const text = typeof payload === "string" ? payload : "";
    const normalized = text.trim();
    if (!normalized) {
      return { ok: false, reason: "empty", message: "번역할 텍스트를 입력하세요." };
    }

    if (normalized.length > maxLength) {
      return {
        ok: false,
        reason: "too-long",
        message: `입력은 ${maxLength}자 이하로 제한됩니다.`
      };
    }

    return { ok: true, normalized };
  });

  ipcMain.on("window:set-ignore-mouse-events", (event, ignore) => {
    if (!mainWindow || event.sender !== mainWindow.webContents) {
      return;
    }

    setWindowMouseIgnore(ignore);
  });
  ipcMain.on("translate:show-context-menu", (event, rawPosition) => {
    if (!mainWindow || event.sender !== mainWindow.webContents) {
      return;
    }

    const x = Number.isFinite(rawPosition?.x) ? Math.max(0, Math.floor(rawPosition.x)) : 0;
    const y = Number.isFinite(rawPosition?.y) ? Math.max(0, Math.floor(rawPosition.y)) : 0;
    popupTranslateContextMenu(x, y);
  });
  ipcMain.on("translate:open-input", (event, payload) => {
    if (!mainWindow || event.sender !== mainWindow.webContents) {
      return;
    }

    const mode = payload?.mode === "clipboard" ? "clipboard" : "manual";
    if (mode === "clipboard") {
      const clipboardText = readClipboardText();
      openTranslateInput({
        source: payload?.source ?? "renderer-clipboard",
        prefillText: clipboardText,
        autoSubmit: clipboardText.length > 0
      });
      if (!clipboardText) {
        notifyUser("클립보드가 비어 있어 입력창만 열었습니다.", "warning");
      }
      return;
    }

    openTranslateInput({
      source: payload?.source ?? "renderer",
      prefillText: "",
      autoSubmit: false
    });
  });

  createMainWindow();
  fitWindowToVirtualDesktop();
  registerTranslateShortcut();

  screen.on("display-added", fitWindowToVirtualDesktop);
  screen.on("display-removed", fitWindowToVirtualDesktop);
  screen.on("display-metrics-changed", fitWindowToVirtualDesktop);

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createMainWindow();
      fitWindowToVirtualDesktop();
    }
  });
});

app.on("will-quit", () => {
  globalShortcut.unregisterAll();
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
  }
});
