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
const PAPAGO_ENDPOINT = "https://papago.apigw.ntruss.com/nmt/v1/translation";
const PAPAGO_TIMEOUT_MS = 5000;
const PAPAGO_MAX_RETRIES = 1;

function normalizeErrorCode(code) {
  if (code === "auth") {
    return {
      ok: false,
      code,
      message: "Papago 인증에 실패했습니다. Client ID/Secret을 확인하세요."
    };
  }

  if (code === "config") {
    return {
      ok: false,
      code,
      message: "Papago API 키가 설정되지 않았습니다. 환경변수를 확인하세요."
    };
  }

  if (code === "timeout") {
    return {
      ok: false,
      code,
      message: "번역 요청 시간이 초과되었습니다. 잠시 후 다시 시도해 주세요."
    };
  }

  if (code === "quota") {
    return {
      ok: false,
      code,
      message: "Papago 요청 한도에 도달했습니다. 잠시 후 다시 시도해 주세요."
    };
  }

  if (code === "network") {
    return {
      ok: false,
      code,
      message: "네트워크 오류로 번역에 실패했습니다. 연결 상태를 확인하세요."
    };
  }

  if (code === "server") {
    return {
      ok: false,
      code,
      message: "Papago 서버 오류가 발생했습니다. 잠시 후 다시 시도해 주세요."
    };
  }

  return {
    ok: false,
    code: "unknown",
    message: "번역 중 알 수 없는 오류가 발생했습니다."
  };
}

function getPapagoCredentials() {
  const clientId = (process.env.PAPAGO_CLIENT_ID ?? "").trim();
  const clientSecret = (process.env.PAPAGO_CLIENT_SECRET ?? "").trim();

  if (!clientId || !clientSecret) {
    return null;
  }

  return { clientId, clientSecret };
}

function delay(ms) {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

async function requestPapagoTranslation({ text, source, target }) {
  const credentials = getPapagoCredentials();
  if (!credentials) {
    return normalizeErrorCode("config");
  }

  const body = new URLSearchParams({
    source,
    target,
    text
  });

  for (let attempt = 0; attempt <= PAPAGO_MAX_RETRIES; attempt += 1) {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => {
      controller.abort();
    }, PAPAGO_TIMEOUT_MS);

    try {
      const response = await fetch(PAPAGO_ENDPOINT, {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8",
          "X-NCP-APIGW-API-KEY-ID": credentials.clientId,
          "X-NCP-APIGW-API-KEY": credentials.clientSecret
        },
        body,
        signal: controller.signal
      });

      let responseJson = null;
      try {
        responseJson = await response.json();
      } catch (error) {
        responseJson = null;
      }

      if (response.ok) {
        const translatedText = responseJson?.message?.result?.translatedText;
        if (typeof translatedText === "string" && translatedText.length > 0) {
          return {
            ok: true,
            translatedText,
            sourceLang: responseJson?.message?.result?.srcLangType ?? source,
            targetLang: responseJson?.message?.result?.tarLangType ?? target
          };
        }
      }

      if (response.status === 401 || response.status === 403) {
        return normalizeErrorCode("auth");
      }

      if (response.status === 429) {
        if (attempt < PAPAGO_MAX_RETRIES) {
          await delay(350);
          continue;
        }
        return normalizeErrorCode("quota");
      }

      if (response.status >= 500) {
        if (attempt < PAPAGO_MAX_RETRIES) {
          await delay(350);
          continue;
        }
        return normalizeErrorCode("server");
      }

      return normalizeErrorCode("unknown");
    } catch (error) {
      const isTimeout = error?.name === "AbortError";
      if (isTimeout) {
        return normalizeErrorCode("timeout");
      }

      if (attempt < PAPAGO_MAX_RETRIES) {
        await delay(250);
        continue;
      }

      return normalizeErrorCode("network");
    } finally {
      clearTimeout(timeoutId);
    }
  }

  return normalizeErrorCode("unknown");
}

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
    backgroundColor: "#00000000",
    thickFrame: false,
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
  ipcMain.handle("translate:request", async (event, payload) => {
    if (!mainWindow || event.sender !== mainWindow.webContents) {
      return {
        ok: false,
        code: "forbidden",
        message: "요청 주체가 유효하지 않습니다."
      };
    }

    const text = typeof payload?.text === "string" ? payload.text.trim() : "";
    if (!text) {
      return {
        ok: false,
        code: "empty",
        message: "번역할 텍스트를 입력하세요."
      };
    }

    const maxLength = 2000;
    if (text.length > maxLength) {
      return {
        ok: false,
        code: "too-long",
        message: `입력은 ${maxLength}자 이하로 제한됩니다.`
      };
    }

    const source = typeof payload?.source === "string" && payload.source.trim() ? payload.source.trim() : "auto";
    const target = typeof payload?.target === "string" && payload.target.trim() ? payload.target.trim() : "ko";

    return requestPapagoTranslation({
      text,
      source,
      target
    });
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
