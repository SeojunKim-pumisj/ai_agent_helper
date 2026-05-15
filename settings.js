const form = document.getElementById("settings-form");
const clientIdInput = document.getElementById("papago-client-id");
const clientSecretInput = document.getElementById("papago-client-secret");
const targetLangSelect = document.getElementById("target-lang");
const moveSpeedInput = document.getElementById("move-speed");
const moveSpeedValue = document.getElementById("move-speed-value");
const shortcutInput = document.getElementById("translate-shortcut");
const soundEnabledInput = document.getElementById("sound-enabled");
const saveMessage = document.getElementById("save-message");
const closeButton = document.getElementById("close-button");
const credentialState = document.getElementById("credential-state");

function setMessage(message = "", tone = "") {
  if (!saveMessage) {
    return;
  }

  saveMessage.textContent = message;
  saveMessage.classList.remove("error", "success");
  if (tone) {
    saveMessage.classList.add(tone);
  }
}

function updateMoveSpeedLabel() {
  if (!moveSpeedInput || !moveSpeedValue) {
    return;
  }

  moveSpeedValue.textContent = `${Number(moveSpeedInput.value).toFixed(1)}x`;
}

function applySettingsToForm(payload) {
  const settings = payload?.settings ?? {};

  if (targetLangSelect && typeof settings.targetLang === "string") {
    targetLangSelect.value = settings.targetLang;
  }

  if (moveSpeedInput && Number.isFinite(Number(settings.moveSpeed))) {
    moveSpeedInput.value = String(settings.moveSpeed);
  }

  if (shortcutInput && typeof settings.translateShortcut === "string") {
    shortcutInput.value = settings.translateShortcut;
  }

  if (soundEnabledInput) {
    soundEnabledInput.checked = Boolean(settings.soundEnabled);
  }

  if (credentialState) {
    const hasCredentials = Boolean(payload?.hasCredentials);
    const storage = payload?.credentialStorage ?? "none";
    credentialState.textContent = hasCredentials
      ? `저장 상태: 설정됨 (${storage})`
      : "저장 상태: 미설정";
  }

  updateMoveSpeedLabel();
}

async function loadSettings() {
  if (!window.settingsApi || typeof window.settingsApi.getSettings !== "function") {
    setMessage("설정 API를 사용할 수 없습니다.", "error");
    return;
  }

  const response = await window.settingsApi.getSettings();
  if (!response?.ok) {
    setMessage(response?.message ?? "설정을 불러오지 못했습니다.", "error");
    return;
  }

  applySettingsToForm(response);
}

async function saveSettings(event) {
  event.preventDefault();

  if (!window.settingsApi || typeof window.settingsApi.saveSettings !== "function") {
    setMessage("설정 저장 API를 사용할 수 없습니다.", "error");
    return;
  }

  const payload = {
    clientId: clientIdInput?.value ?? "",
    clientSecret: clientSecretInput?.value ?? "",
    targetLang: targetLangSelect?.value ?? "ko",
    moveSpeed: Number(moveSpeedInput?.value ?? 1),
    translateShortcut: shortcutInput?.value ?? "",
    soundEnabled: Boolean(soundEnabledInput?.checked)
  };

  setMessage("저장 중...", "");

  const response = await window.settingsApi.saveSettings(payload);
  if (!response?.ok) {
    setMessage(response?.message ?? "설정 저장에 실패했습니다.", "error");
    return;
  }

  if (clientIdInput) {
    clientIdInput.value = "";
  }

  if (clientSecretInput) {
    clientSecretInput.value = "";
  }

  applySettingsToForm(response);
  setMessage("설정을 저장했습니다.", "success");
}

function closeWindow() {
  if (window.settingsApi?.closeWindow) {
    window.settingsApi.closeWindow();
    return;
  }

  window.close();
}

function bindEvents() {
  form?.addEventListener("submit", (event) => {
    void saveSettings(event);
  });

  closeButton?.addEventListener("click", () => {
    closeWindow();
  });

  moveSpeedInput?.addEventListener("input", () => {
    updateMoveSpeedLabel();
  });

  window.settingsApi?.onSettingsUpdated?.((payload) => {
    applySettingsToForm(payload);
  });
}

async function bootstrap() {
  bindEvents();
  await loadSettings();
}

bootstrap().catch((error) => {
  console.error("Settings bootstrap failed:", error);
  setMessage("설정 화면 초기화 중 오류가 발생했습니다.", "error");
});
