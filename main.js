const fs = require("node:fs/promises");
const path = require("node:path");
const {
  app,
  BrowserWindow,
  clipboard,
  globalShortcut,
  ipcMain,
  Menu,
  screen,
  Tray,
  safeStorage
} = require("electron");

let mainWindow;
let settingsWindow;
let tray;

const DEFAULT_TRANSLATE_SHORTCUT = "CommandOrControl+Shift+T";
const PAPAGO_ENDPOINT = "https://papago.apigw.ntruss.com/nmt/v1/translation";
const PAPAGO_TIMEOUT_MS = 5000;
const PAPAGO_MAX_RETRIES = 1;

const SETTINGS_FILE_NAME = "settings.json";
const SECRETS_FILE_NAME = "secrets.json";
const KEYTAR_SERVICE_NAME = "TranslateMate";
const KEYTAR_ACCOUNT_ID = "papago-client-id";
const KEYTAR_ACCOUNT_SECRET = "papago-client-secret";

const DEFAULT_SETTINGS = Object.freeze({
  targetLang: "ko",
  moveSpeed: 1,
  soundEnabled: false,
  translateShortcut: DEFAULT_TRANSLATE_SHORTCUT
});

const SUPPORTED_TARGET_LANGS = new Set([
  "ko",
  "en",
  "ja",
  "zh-CN",
  "zh-TW",
  "es",
  "fr",
  "de",
  "ru",
  "vi",
  "th",
  "id"
]);

let runtimeSettings = { ...DEFAULT_SETTINGS };
let currentShortcut = DEFAULT_TRANSLATE_SHORTCUT;
let secretState = {
  clientId: "",
  clientSecret: "",
  storage: "none"
};

function getSettingsFilePath() {
  return path.join(app.getPath("userData"), SETTINGS_FILE_NAME);
}

function getSecretsFilePath() {
  return path.join(app.getPath("userData"), SECRETS_FILE_NAME);
}

async function readJsonFileSafe(filePath) {
  try {
    const raw = await fs.readFile(filePath, "utf8");
    const parsed = JSON.parse(raw);
    return typeof parsed === "object" && parsed !== null ? parsed : null;
  } catch (error) {
    if (error?.code === "ENOENT") {
      return null;
    }
    return null;
  }
}

async function writeJsonFileAtomic(filePath, payload) {
  const directory = path.dirname(filePath);
  await fs.mkdir(directory, { recursive: true });
  const tempPath = `${filePath}.tmp`;
  await fs.writeFile(tempPath, JSON.stringify(payload, null, 2), "utf8");
  await fs.rename(tempPath, filePath);
}

function normalizeErrorCode(code) {
  if (code === "auth") {
    return {
      ok: false,
      code,
      message: "Papago 인증에 실패했습니다. Client ID/Secret을 확인해 주세요."
    };
  }

  if (code === "config") {
    return {
      ok: false,
      code,
      message: "Papago API 키가 설정되지 않았습니다. 설정 창에서 API 키를 입력해 주세요."
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
      message: "네트워크 오류로 번역에 실패했습니다. 연결 상태를 확인해 주세요."
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
  if (secretState.clientId && secretState.clientSecret) {
    return {
      clientId: secretState.clientId,
      clientSecret: secretState.clientSecret
    };
  }

  const envClientId = (process.env.PAPAGO_CLIENT_ID ?? "").trim();
  const envClientSecret = (process.env.PAPAGO_CLIENT_SECRET ?? "").trim();
  if (envClientId && envClientSecret) {
    return {
      clientId: envClientId,
      clientSecret: envClientSecret
    };
  }

  return null;
}

function delay(ms) {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

async function requestPapagoTranslation({ text, source, target, credentialsOverride = null }) {
  const credentials = credentialsOverride ?? getPapagoCredentials();
  if (!credentials) {
    return normalizeErrorCode("config");
  }

  const body = new URLSearchParams({ source, target, text });

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
      } catch {
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
      if (error?.name === "AbortError") {
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

function sendMainRendererEvent(channel, payload) {
  if (!mainWindow || mainWindow.isDestroyed()) {
    return;
  }

  mainWindow.webContents.send(channel, payload);
}

function sendSettingsRendererEvent(channel, payload) {
  if (!settingsWindow || settingsWindow.isDestroyed()) {
    return;
  }

  settingsWindow.webContents.send(channel, payload);
}

function notifyUser(message, level = "info") {
  sendMainRendererEvent("app:notice", { level, message });
}

function openTranslateInput(payload = {}) {
  const prefillText = typeof payload.prefillText === "string" ? payload.prefillText : "";
  sendMainRendererEvent("translate:open-input", {
    source: payload.source ?? "manual",
    prefillText,
    autoSubmit: Boolean(payload.autoSubmit)
  });
}

function readClipboardText() {
  try {
    return clipboard.readText().trim();
  } catch {
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

function applyTranslateShortcut(nextShortcut, { silent = false } = {}) {
  const candidate = (typeof nextShortcut === "string" ? nextShortcut.trim() : "") || DEFAULT_TRANSLATE_SHORTCUT;

  if (candidate === currentShortcut && globalShortcut.isRegistered(candidate)) {
    return { ok: true, shortcut: candidate };
  }

  const previousShortcut = currentShortcut;
  const hadPreviousRegistration = previousShortcut && globalShortcut.isRegistered(previousShortcut);

  if (hadPreviousRegistration) {
    globalShortcut.unregister(previousShortcut);
  }

  const registered = globalShortcut.register(candidate, openTranslateInputFromShortcut);
  if (!registered) {
    if (hadPreviousRegistration) {
      globalShortcut.register(previousShortcut, openTranslateInputFromShortcut);
    }
    return {
      ok: false,
      message: "단축키 등록에 실패했습니다. 이미 다른 앱에서 사용 중일 수 있습니다."
    };
  }

  currentShortcut = candidate;
  if (!silent) {
    notifyUser(`단축키가 적용되었습니다: ${candidate}`, "info");
  }

  return { ok: true, shortcut: candidate };
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
    },
    { type: "separator" },
    {
      label: "설정",
      click: () => {
        openSettingsWindow();
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

  mainWindow.on("show", () => updateTrayMenu());
  mainWindow.on("hide", () => updateTrayMenu());
}

function createSettingsWindow() {
  settingsWindow = new BrowserWindow({
    width: 460,
    height: 620,
    minWidth: 430,
    minHeight: 580,
    show: false,
    autoHideMenuBar: true,
    backgroundColor: "#f7f9fc",
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true
    }
  });

  settingsWindow.loadFile("settings.html");

  settingsWindow.on("close", (event) => {
    if (!app.isQuiting) {
      event.preventDefault();
      settingsWindow.hide();
    }
  });

  settingsWindow.on("closed", () => {
    settingsWindow = null;
  });
}

function openSettingsWindow() {
  if (!settingsWindow || settingsWindow.isDestroyed()) {
    createSettingsWindow();
  }

  settingsWindow.show();
  settingsWindow.focus();
}

function toggleMainWindowVisibility() {
  if (!mainWindow || mainWindow.isDestroyed()) {
    return;
  }

  if (mainWindow.isVisible()) {
    mainWindow.hide();
  } else {
    mainWindow.show();
    mainWindow.focus();
  }
}

function updateTrayMenu() {
  if (!tray) {
    return;
  }

  const isVisible = Boolean(mainWindow && !mainWindow.isDestroyed() && mainWindow.isVisible());
  const visibilityLabel = isVisible ? "앱 숨기기" : "앱 표시";

  const menu = Menu.buildFromTemplate([
    {
      label: "설정 열기",
      click: () => openSettingsWindow()
    },
    {
      label: visibilityLabel,
      click: () => toggleMainWindowVisibility()
    },
    { type: "separator" },
    {
      label: "종료",
      click: () => {
        app.isQuiting = true;
        app.quit();
      }
    }
  ]);

  tray.setContextMenu(menu);
}

function createTray() {
  const trayIconPath = path.join(__dirname, "assets", "icon.ico");
  tray = new Tray(trayIconPath);
  tray.setToolTip("TranslateMate");
  tray.on("click", () => toggleMainWindowVisibility());
  updateTrayMenu();
}

function normalizeSettingsInput(input) {
  const raw = typeof input === "object" && input !== null ? input : {};

  const targetLang = typeof raw.targetLang === "string" ? raw.targetLang.trim() : "";
  const moveSpeedRaw = Number(raw.moveSpeed);
  const moveSpeed = Number.isFinite(moveSpeedRaw) ? moveSpeedRaw : NaN;
  const soundEnabled = Boolean(raw.soundEnabled);
  const translateShortcut = typeof raw.translateShortcut === "string" ? raw.translateShortcut.trim() : "";

  if (!SUPPORTED_TARGET_LANGS.has(targetLang)) {
    return { ok: false, field: "targetLang", message: "지원하지 않는 번역 언어입니다." };
  }

  if (!Number.isFinite(moveSpeed) || moveSpeed < 0.5 || moveSpeed > 2.5) {
    return { ok: false, field: "moveSpeed", message: "이동 속도는 0.5~2.5 범위여야 합니다." };
  }

  if (!translateShortcut) {
    return { ok: false, field: "translateShortcut", message: "단축키를 입력해 주세요." };
  }

  const normalizedSettings = {
    targetLang,
    moveSpeed: Math.round(moveSpeed * 100) / 100,
    soundEnabled,
    translateShortcut
  };

  const clientId = typeof raw.clientId === "string" ? raw.clientId.trim() : "";
  const clientSecret = typeof raw.clientSecret === "string" ? raw.clientSecret.trim() : "";

  const wantsCredentialUpdate = clientId.length > 0 || clientSecret.length > 0;
  if (wantsCredentialUpdate && (!clientId || !clientSecret)) {
    return {
      ok: false,
      field: "credentials",
      message: "Client ID와 Client Secret은 함께 입력해야 합니다."
    };
  }

  return {
    ok: true,
    settings: normalizedSettings,
    credentialsInput: wantsCredentialUpdate ? { clientId, clientSecret } : null
  };
}

async function loadSettingsFromDisk() {
  const raw = await readJsonFileSafe(getSettingsFilePath());
  if (!raw) {
    runtimeSettings = { ...DEFAULT_SETTINGS };
    return;
  }

  const merged = {
    targetLang: typeof raw.targetLang === "string" ? raw.targetLang : DEFAULT_SETTINGS.targetLang,
    moveSpeed: Number.isFinite(Number(raw.moveSpeed)) ? Number(raw.moveSpeed) : DEFAULT_SETTINGS.moveSpeed,
    soundEnabled: Boolean(raw.soundEnabled),
    translateShortcut: typeof raw.translateShortcut === "string" ? raw.translateShortcut : DEFAULT_SETTINGS.translateShortcut
  };

  const normalized = normalizeSettingsInput(merged);
  runtimeSettings = normalized.ok ? normalized.settings : { ...DEFAULT_SETTINGS };
}

async function saveSettingsToDisk(settings) {
  await writeJsonFileAtomic(getSettingsFilePath(), settings);
}

function loadKeytarModule() {
  try {
    // Prefer keytar when it is available in the runtime.
    // Fallback path is handled when require fails.
    // eslint-disable-next-line global-require
    return require("keytar");
  } catch {
    return null;
  }
}

async function loadCredentialsFromKeytar() {
  const keytar = loadKeytarModule();
  if (!keytar) {
    return null;
  }

  const clientId = (await keytar.getPassword(KEYTAR_SERVICE_NAME, KEYTAR_ACCOUNT_ID)) ?? "";
  const clientSecret = (await keytar.getPassword(KEYTAR_SERVICE_NAME, KEYTAR_ACCOUNT_SECRET)) ?? "";

  if (!clientId || !clientSecret) {
    return null;
  }

  return {
    clientId,
    clientSecret,
    storage: "keytar"
  };
}

async function saveCredentialsToKeytar(clientId, clientSecret) {
  const keytar = loadKeytarModule();
  if (!keytar) {
    return false;
  }

  await keytar.setPassword(KEYTAR_SERVICE_NAME, KEYTAR_ACCOUNT_ID, clientId);
  await keytar.setPassword(KEYTAR_SERVICE_NAME, KEYTAR_ACCOUNT_SECRET, clientSecret);
  return true;
}

async function loadCredentialsFromEncryptedFile() {
  const raw = await readJsonFileSafe(getSecretsFilePath());
  if (!raw || typeof raw.clientId !== "string" || typeof raw.clientSecret !== "string") {
    return null;
  }

  if (!safeStorage.isEncryptionAvailable()) {
    return null;
  }

  try {
    const clientId = safeStorage.decryptString(Buffer.from(raw.clientId, "base64"));
    const clientSecret = safeStorage.decryptString(Buffer.from(raw.clientSecret, "base64"));

    if (!clientId || !clientSecret) {
      return null;
    }

    return {
      clientId,
      clientSecret,
      storage: "safeStorage"
    };
  } catch {
    return null;
  }
}

async function saveCredentialsToEncryptedFile(clientId, clientSecret) {
  if (!safeStorage.isEncryptionAvailable()) {
    throw new Error("safeStorage-unavailable");
  }

  const payload = {
    clientId: safeStorage.encryptString(clientId).toString("base64"),
    clientSecret: safeStorage.encryptString(clientSecret).toString("base64"),
    updatedAt: new Date().toISOString()
  };

  await writeJsonFileAtomic(getSecretsFilePath(), payload);
}

async function loadStoredCredentials() {
  const fromKeytar = await loadCredentialsFromKeytar();
  if (fromKeytar) {
    secretState = fromKeytar;
    return;
  }

  const fromEncryptedFile = await loadCredentialsFromEncryptedFile();
  if (fromEncryptedFile) {
    secretState = fromEncryptedFile;
    return;
  }

  secretState = {
    clientId: "",
    clientSecret: "",
    storage: "none"
  };
}

async function saveStoredCredentials(clientId, clientSecret) {
  const savedInKeytar = await saveCredentialsToKeytar(clientId, clientSecret);
  if (savedInKeytar) {
    secretState = {
      clientId,
      clientSecret,
      storage: "keytar"
    };
    return;
  }

  await saveCredentialsToEncryptedFile(clientId, clientSecret);
  secretState = {
    clientId,
    clientSecret,
    storage: "safeStorage"
  };
}

function getSettingsSnapshot() {
  return {
    settings: { ...runtimeSettings },
    hasCredentials: Boolean(getPapagoCredentials()),
    credentialStorage: secretState.storage
  };
}

function broadcastSettingsUpdated() {
  const payload = getSettingsSnapshot();
  sendMainRendererEvent("settings:updated", payload);
  sendSettingsRendererEvent("settings:updated", payload);
}

function isAllowedIpcSender(event) {
  const sender = event?.sender;
  if (!sender) {
    return false;
  }

  const fromMain = Boolean(mainWindow && !mainWindow.isDestroyed() && sender === mainWindow.webContents);
  const fromSettings = Boolean(settingsWindow && !settingsWindow.isDestroyed() && sender === settingsWindow.webContents);
  return fromMain || fromSettings;
}

function isSettingsWindowSender(event) {
  const sender = event?.sender;
  if (!sender || !settingsWindow || settingsWindow.isDestroyed()) {
    return false;
  }

  return sender === settingsWindow.webContents;
}

function registerIpcHandlers() {
  ipcMain.handle("app:ping", () => "pong");
  ipcMain.handle("app:get-version", () => app.getVersion());

  ipcMain.handle("settings:get-runtime", (event) => {
    if (!isAllowedIpcSender(event)) {
      return { ok: false, message: "허용되지 않은 요청입니다." };
    }

    return {
      ok: true,
      ...getSettingsSnapshot()
    };
  });

  ipcMain.handle("settings:get", (event) => {
    if (!isSettingsWindowSender(event)) {
      return { ok: false, message: "허용되지 않은 요청입니다." };
    }

    return {
      ok: true,
      ...getSettingsSnapshot()
    };
  });

  ipcMain.handle("settings:save", async (event, payload) => {
    if (!isSettingsWindowSender(event)) {
      return { ok: false, message: "허용되지 않은 요청입니다." };
    }

    const normalized = normalizeSettingsInput(payload);
    if (!normalized.ok) {
      return normalized;
    }

    const previousSettings = { ...runtimeSettings };
    const previousShortcut = currentShortcut;

    if (normalized.credentialsInput) {
      const testResult = await requestPapagoTranslation({
        text: "key validation",
        source: "en",
        target: normalized.settings.targetLang,
        credentialsOverride: normalized.credentialsInput
      });

      if (!testResult.ok) {
        return {
          ok: false,
          field: "credentials",
          message: testResult.message
        };
      }

      try {
        await saveStoredCredentials(normalized.credentialsInput.clientId, normalized.credentialsInput.clientSecret);
      } catch {
        return {
          ok: false,
          field: "credentials",
          message: "API 키를 안전하게 저장하지 못했습니다."
        };
      }
    }

    const shortcutResult = applyTranslateShortcut(normalized.settings.translateShortcut, { silent: true });
    if (!shortcutResult.ok) {
      return {
        ok: false,
        field: "translateShortcut",
        message: shortcutResult.message
      };
    }

    runtimeSettings = normalized.settings;

    try {
      await saveSettingsToDisk(runtimeSettings);
    } catch {
      runtimeSettings = previousSettings;
      if (currentShortcut !== previousShortcut) {
        applyTranslateShortcut(previousShortcut, { silent: true });
      }

      return {
        ok: false,
        field: "general",
        message: "설정을 저장하지 못했습니다. 다시 시도해 주세요."
      };
    }

    broadcastSettingsUpdated();
    notifyUser("설정이 저장되었습니다.", "info");

    return {
      ok: true,
      ...getSettingsSnapshot()
    };
  });

  ipcMain.handle("translate:validate-input", (event, payload) => {
    if (!mainWindow || event.sender !== mainWindow.webContents) {
      return { ok: false, reason: "forbidden", message: "요청 주체가 유효하지 않습니다." };
    }

    const maxLength = 2000;
    const text = typeof payload === "string" ? payload : "";
    const normalized = text.trim();
    if (!normalized) {
      return { ok: false, reason: "empty", message: "번역할 텍스트를 입력해 주세요." };
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
        message: "번역할 텍스트를 입력해 주세요."
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
    const target = typeof payload?.target === "string" && payload.target.trim() ? payload.target.trim() : runtimeSettings.targetLang;

    return requestPapagoTranslation({ text, source, target });
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

  ipcMain.on("settings:open", () => {
    openSettingsWindow();
  });

  ipcMain.on("settings:close", (event) => {
    if (!isSettingsWindowSender(event)) {
      return;
    }

    if (settingsWindow && !settingsWindow.isDestroyed()) {
      settingsWindow.hide();
    }
  });
}

async function bootstrapApp() {
  await loadSettingsFromDisk();
  await loadStoredCredentials();

  registerIpcHandlers();
  createMainWindow();
  fitWindowToVirtualDesktop();
  createTray();

  const shortcutResult = applyTranslateShortcut(runtimeSettings.translateShortcut, { silent: true });
  if (!shortcutResult.ok) {
    applyTranslateShortcut(DEFAULT_TRANSLATE_SHORTCUT, { silent: true });
    notifyUser("설정된 단축키를 등록하지 못해 기본 단축키로 복구했습니다.", "warning");
  }

  screen.on("display-added", fitWindowToVirtualDesktop);
  screen.on("display-removed", fitWindowToVirtualDesktop);
  screen.on("display-metrics-changed", fitWindowToVirtualDesktop);

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createMainWindow();
      fitWindowToVirtualDesktop();
      updateTrayMenu();
    }

    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.show();
    }
  });
}

app.whenReady().then(() => {
  void bootstrapApp();
});

app.on("will-quit", () => {
  app.isQuiting = true;
  globalShortcut.unregisterAll();
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
  }
});
