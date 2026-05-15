const appShell = document.querySelector(".app-shell");
const bubbleText = document.getElementById("bubble-text");
const speechBubble = document.getElementById("speech-bubble");
const characterElement = document.getElementById("character");
const debugState = document.getElementById("debug-state");
const debugPos = document.getElementById("debug-pos");
const debugVel = document.getElementById("debug-vel");
const translatePrompt = document.getElementById("translate-prompt");
const translateForm = document.getElementById("translate-form");
const translateInput = document.getElementById("translate-input");
const translateError = document.getElementById("translate-error");
const translateCancelButton = document.getElementById("translate-cancel");
const reduceMotionQuery = window.matchMedia("(prefers-reduced-motion: reduce)");

const STATES = Object.freeze({
  IDLE: "idle",
  WALK: "walk",
  RUN: "run",
  THINK: "think",
  SPEAK: "speak",
  PLAY: "play"
});

const STATE_VISUALS = Object.freeze({
  [STATES.IDLE]: "state-idle",
  [STATES.WALK]: "state-walk",
  [STATES.RUN]: "state-run",
  [STATES.THINK]: "state-think",
  [STATES.SPEAK]: "state-speak",
  [STATES.PLAY]: "state-play"
});

const AUTONOMOUS_MESSAGES = Object.freeze({
  speak: [
    "작업 잘 하고 있어요.",
    "필요하면 바로 도와드릴게요.",
    "잠깐 쉬고 다시 집중해볼까요?"
  ],
  play: [
    "한 바퀴 산책 중!",
    "깡총 모드 발동!",
    "심심해서 놀고 있어요."
  ]
});

const CONFIG = Object.freeze({
  idleBeforeAutonomousMs: 5000,
  autonomousActionGapMs: 4200,
  walkSpeedPxPerSec: 88,
  runSpeedPxPerSec: 162,
  maxDeltaSec: 0.05
});
const INPUT_MAX_LENGTH = 2000;
const DEFAULT_TRANSLATION_TARGET = "ko";
const CLICK_REACTION_COOLDOWN_MS = 450;
const TYPING_EFFECT_THRESHOLD = 40;
const TYPING_EFFECT_INTERVAL_MS = 20;

const pet = {
  state: STATES.IDLE,
  x: 0,
  y: 0,
  vx: 0,
  vy: 0,
  stateUntil: 0
};

let currentIgnoreMouseEvents = true;
let lastFrameTs = performance.now();
let lastInteractionTs = performance.now();
let nextAutonomousTs = lastInteractionTs + CONFIG.idleBeforeAutonomousMs;
let prefersReducedMotion = reduceMotionQuery.matches;
let promptOpen = false;
let submittingInput = false;
let typingTimer = null;
let activeTypingToken = 0;
let dragState = null;
let pointerMovedDuringDrag = false;
let ignoreNextCharacterClick = false;
let lastCharacterReactionTs = 0;

function randomInRange(min, max) {
  return min + Math.random() * (max - min);
}

function pickRandom(items) {
  return items[Math.floor(Math.random() * items.length)];
}

function setBubbleText(message) {
  if (typingTimer) {
    clearInterval(typingTimer);
    typingTimer = null;
  }
  activeTypingToken += 1;

  if (bubbleText) {
    bubbleText.textContent = message;
    if (speechBubble) {
      speechBubble.scrollTop = 0;
    }
    requestAnimationFrame(positionSpeechBubble);
  } else {
    console.error("Missing #bubble-text element:", message);
  }
}

function setBubbleTextWithTyping(message) {
  if (!bubbleText) {
    return;
  }

  const text = `${message ?? ""}`;
  if (prefersReducedMotion || text.length < TYPING_EFFECT_THRESHOLD) {
    setBubbleText(text);
    return;
  }

  if (typingTimer) {
    clearInterval(typingTimer);
    typingTimer = null;
  }

  const token = activeTypingToken + 1;
  activeTypingToken = token;

  bubbleText.textContent = "";
  if (speechBubble) {
    speechBubble.scrollTop = 0;
  }
  requestAnimationFrame(positionSpeechBubble);

  let index = 0;
  typingTimer = setInterval(() => {
    if (!bubbleText || token !== activeTypingToken) {
      clearInterval(typingTimer);
      typingTimer = null;
      return;
    }

    index += 1;
    bubbleText.textContent = text.slice(0, index);
    if (speechBubble) {
      speechBubble.scrollTop = speechBubble.scrollHeight;
    }
    positionSpeechBubble();

    if (index >= text.length) {
      clearInterval(typingTimer);
      typingTimer = null;
      if (speechBubble) {
        speechBubble.scrollTop = 0;
      }
    }
  }, TYPING_EFFECT_INTERVAL_MS);
}

function positionSpeechBubble() {
  if (!speechBubble || !characterElement) {
    return;
  }

  const shellRect = appShell ? appShell.getBoundingClientRect() : null;
  const shellWidth = shellRect ? shellRect.width : window.innerWidth;
  const shellHeight = shellRect ? shellRect.height : window.innerHeight;
  const shellLeft = shellRect ? shellRect.left : 0;
  const shellTop = shellRect ? shellRect.top : 0;
  const characterRect = characterElement.getBoundingClientRect();
  const bubbleRect = speechBubble.getBoundingClientRect();
  const margin = 10;

  const characterX = characterRect.left - shellLeft;
  const characterY = characterRect.top - shellTop;
  const characterCenterX = characterX + characterRect.width / 2;

  let left = characterCenterX - bubbleRect.width / 2;
  let top = characterY - bubbleRect.height - 10;

  left = Math.max(margin, Math.min(left, shellWidth - bubbleRect.width - margin));

  if (top < margin) {
    top = characterY + characterRect.height + 8;
  }

  top = Math.max(margin, Math.min(top, shellHeight - bubbleRect.height - margin));

  speechBubble.style.left = `${Math.round(left)}px`;
  speechBubble.style.top = `${Math.round(top)}px`;
}

function setTranslateError(message = "") {
  if (!translateError) {
    return;
  }
  translateError.textContent = message;
}

function setPromptVisible(visible) {
  if (!translatePrompt) {
    return;
  }

  promptOpen = Boolean(visible);
  translatePrompt.classList.toggle("hidden", !promptOpen);
  translatePrompt.setAttribute("aria-hidden", String(!promptOpen));
}

function focusTranslateInput() {
  if (!translateInput) {
    return;
  }

  translateInput.focus();
  translateInput.selectionStart = translateInput.value.length;
  translateInput.selectionEnd = translateInput.value.length;
}

function closeTranslatePrompt(reason = "cancel") {
  if (!promptOpen) {
    return;
  }

  setPromptVisible(false);
  setIgnoreMouseEvents(true);
  setTranslateError("");
  submittingInput = false;

  if (reason === "cancel") {
    setBubbleText("입력이 취소되었습니다.");
  }
}

function previewText(text) {
  const oneLine = text.replace(/\s+/g, " ").trim();
  return oneLine.length > 52 ? `${oneLine.slice(0, 52)}...` : oneLine;
}

async function submitTranslateInput(source = "manual") {
  if (
    !window.api ||
    typeof window.api.validateTranslateInput !== "function" ||
    typeof window.api.translateText !== "function" ||
    !translateInput
  ) {
    setTranslateError("번역 API를 사용할 수 없습니다.");
    return;
  }

  if (submittingInput) {
    return;
  }

  submittingInput = true;
  setTranslateError("");

  try {
    const rawText = translateInput.value ?? "";
    const result = await window.api.validateTranslateInput(rawText);
    if (!result?.ok) {
      setTranslateError(result?.message ?? "입력을 확인해 주세요.");
      focusTranslateInput();
      return;
    }

    const normalized = result.normalized ?? "";
    closeTranslatePrompt("submit");
    markInteraction();
    setState(STATES.THINK, `translate-request-${source}`, 6000);
    setBubbleText(`번역 중... ${previewText(normalized)}`);

    const translated = await window.api.translateText(normalized, "auto", DEFAULT_TRANSLATION_TARGET);
    if (!translated?.ok) {
      const errorMessage = translated?.message ?? "번역 요청에 실패했습니다.";
      setState(STATES.SPEAK, `translate-failed-${source}`, 1800);
      setBubbleText(errorMessage);
      return;
    }

    const targetLabel = translated.targetLang ? `[${translated.targetLang}] ` : "";
    setState(STATES.SPEAK, `translate-success-${source}`, 2400);
    setBubbleTextWithTyping(`${targetLabel}${translated.translatedText}`);
  } catch (error) {
    setTranslateError("입력 처리 중 오류가 발생했습니다.");
    console.error("Failed to submit translate input:", error);
  } finally {
    submittingInput = false;
  }
}

function openTranslatePrompt(payload = {}) {
  if (!translateInput) {
    return;
  }

  markInteraction();
  const rawPrefill = typeof payload.prefillText === "string" ? payload.prefillText : "";
  const prefillText = rawPrefill.slice(0, INPUT_MAX_LENGTH);

  translateInput.value = prefillText;
  setTranslateError("");
  setPromptVisible(true);
  setIgnoreMouseEvents(false);
  focusTranslateInput();

  if (payload.autoSubmit && prefillText.trim()) {
    void submitTranslateInput(payload.source ?? "auto");
  }
}

function logStateTransition(prevState, nextState, reason) {
  console.info(`[state] ${prevState} -> ${nextState} (${reason})`);
}

function applyStateVisual(state) {
  if (!characterElement) {
    return;
  }

  for (const className of Object.values(STATE_VISUALS)) {
    characterElement.classList.remove(className);
  }

  characterElement.classList.add(STATE_VISUALS[state]);
}

function updateDebugPanel() {
  if (debugState) {
    debugState.textContent = pet.state;
  }

  if (debugPos) {
    debugPos.textContent = `${Math.round(pet.x)}, ${Math.round(pet.y)}`;
  }

  if (debugVel) {
    debugVel.textContent = `${Math.round(pet.vx)}, ${Math.round(pet.vy)}`;
  }
}

function setState(nextState, reason, durationMs = 0) {
  if (!Object.values(STATES).includes(nextState)) {
    return;
  }

  const prevState = pet.state;
  pet.state = nextState;
  pet.stateUntil = durationMs > 0 ? performance.now() + durationMs : 0;

  logStateTransition(prevState, nextState, reason);
  applyStateVisual(nextState);
  updateDebugPanel();
}

function setIgnoreMouseEvents(ignore) {
  if (!window.api || typeof window.api.setIgnoreMouseEvents !== "function") {
    return;
  }

  if (currentIgnoreMouseEvents === ignore) {
    return;
  }

  window.api.setIgnoreMouseEvents(ignore);
  currentIgnoreMouseEvents = ignore;
}

function markInteraction() {
  lastInteractionTs = performance.now();
  nextAutonomousTs = lastInteractionTs + CONFIG.idleBeforeAutonomousMs;
}

function randomizeVelocity(speedPxPerSec) {
  const angle = randomInRange(0, Math.PI * 2);
  pet.vx = Math.cos(angle) * speedPxPerSec;
  pet.vy = Math.sin(angle) * speedPxPerSec;
}

function startLocomotion(runMode, reason) {
  const speed = runMode ? CONFIG.runSpeedPxPerSec : CONFIG.walkSpeedPxPerSec;
  randomizeVelocity(speed);
  setState(runMode ? STATES.RUN : STATES.WALK, reason, runMode ? 1600 : 2600);
}

function triggerAutonomousAction() {
  if (prefersReducedMotion) {
    const motionSafeState = Math.random() < 0.5 ? STATES.SPEAK : STATES.PLAY;
    const motionSafeMessageKey = motionSafeState === STATES.SPEAK ? "speak" : "play";
    const motionSafeDuration = motionSafeState === STATES.SPEAK ? 2200 : 1800;

    setBubbleText(pickRandom(AUTONOMOUS_MESSAGES[motionSafeMessageKey]));
    setState(motionSafeState, "autonomous-motion-safe", motionSafeDuration);
    return;
  }

  const roll = Math.random();

  if (roll < 0.45) {
    startLocomotion(false, "autonomous-walk");
    return;
  }

  if (roll < 0.7) {
    startLocomotion(true, "autonomous-run");
    return;
  }

  if (roll < 0.85) {
    setBubbleText(pickRandom(AUTONOMOUS_MESSAGES.play));
    setState(STATES.PLAY, "autonomous-play", 1800);
    return;
  }

  setBubbleText(pickRandom(AUTONOMOUS_MESSAGES.speak));
  setState(STATES.SPEAK, "autonomous-speak", 2200);
}

function getMovementBounds() {
  const shellRect = appShell ? appShell.getBoundingClientRect() : null;
  const width = shellRect ? shellRect.width : window.innerWidth;
  const height = shellRect ? shellRect.height : window.innerHeight;
  const characterWidth = characterElement ? characterElement.offsetWidth : 130;
  const characterHeight = characterElement ? characterElement.offsetHeight : 130;

  return {
    minX: 0,
    minY: 0,
    maxX: Math.max(0, width - characterWidth),
    maxY: Math.max(0, height - characterHeight)
  };
}

function placePetInitialPosition() {
  const bounds = getMovementBounds();
  pet.x = Math.max(bounds.minX, bounds.maxX - 220);
  pet.y = Math.max(bounds.minY, bounds.maxY - 180);
  applyPosition();
}

function resolveBoundaryCollision(bounds) {
  let collided = false;

  if (pet.x < bounds.minX) {
    pet.x = bounds.minX;
    pet.vx = Math.abs(pet.vx);
    collided = true;
  } else if (pet.x > bounds.maxX) {
    pet.x = bounds.maxX;
    pet.vx = -Math.abs(pet.vx);
    collided = true;
  }

  if (pet.y < bounds.minY) {
    pet.y = bounds.minY;
    pet.vy = Math.abs(pet.vy);
    collided = true;
  } else if (pet.y > bounds.maxY) {
    pet.y = bounds.maxY;
    pet.vy = -Math.abs(pet.vy);
    collided = true;
  }

  if (collided && pet.state === STATES.IDLE) {
    setState(STATES.WALK, "collision-recovery", 900);
    randomizeVelocity(CONFIG.walkSpeedPxPerSec);
  }
}

function applyPosition() {
  if (!characterElement) {
    return;
  }

  characterElement.style.left = `${pet.x}px`;
  characterElement.style.top = `${pet.y}px`;
  positionSpeechBubble();
}

function clampPetToBounds() {
  const bounds = getMovementBounds();
  pet.x = Math.min(bounds.maxX, Math.max(bounds.minX, pet.x));
  pet.y = Math.min(bounds.maxY, Math.max(bounds.minY, pet.y));
}

function beginDrag(event) {
  if (!characterElement || event.button !== 0 || promptOpen) {
    return;
  }

  const characterRect = characterElement.getBoundingClientRect();
  dragState = {
    pointerId: event.pointerId,
    offsetX: event.clientX - characterRect.left,
    offsetY: event.clientY - characterRect.top
  };
  pointerMovedDuringDrag = false;
  ignoreNextCharacterClick = false;

  markInteraction();
  setIgnoreMouseEvents(false);
  pet.vx = 0;
  pet.vy = 0;
  setState(STATES.PLAY, "drag-start");
}

function updateDrag(event) {
  if (!dragState || event.pointerId !== dragState.pointerId) {
    return;
  }

  const prevX = pet.x;
  const prevY = pet.y;
  pet.x = event.clientX - dragState.offsetX;
  pet.y = event.clientY - dragState.offsetY;
  clampPetToBounds();
  applyPosition();

  if (!pointerMovedDuringDrag) {
    const distance = Math.hypot(pet.x - prevX, pet.y - prevY);
    if (distance > 2) {
      pointerMovedDuringDrag = true;
      ignoreNextCharacterClick = true;
    }
  }
}

function endDrag(event) {
  if (!dragState || event.pointerId !== dragState.pointerId) {
    return;
  }

  dragState = null;
  markInteraction();
  setState(STATES.IDLE, "drag-end", 250);
  if (!promptOpen) {
    setIgnoreMouseEvents(true);
  }
}

function updateMovement(deltaSec) {
  if (pet.state === STATES.WALK || pet.state === STATES.RUN) {
    pet.x += pet.vx * deltaSec;
    pet.y += pet.vy * deltaSec;
  } else {
    pet.vx *= 0.9;
    pet.vy *= 0.9;
  }

  const bounds = getMovementBounds();
  resolveBoundaryCollision(bounds);
  applyPosition();
}

function updateStateTimer(nowTs) {
  if (pet.stateUntil > 0 && nowTs >= pet.stateUntil) {
    pet.stateUntil = 0;
    if (pet.state !== STATES.IDLE) {
      setState(STATES.IDLE, "state-duration-ended");
    }
  }
}

function maybeTriggerAutonomous(nowTs) {
  if (prefersReducedMotion && (pet.state === STATES.WALK || pet.state === STATES.RUN)) {
    pet.vx = 0;
    pet.vy = 0;
    setState(STATES.IDLE, "reduce-motion-autonomous-guard");
  }

  if (nowTs - lastInteractionTs < CONFIG.idleBeforeAutonomousMs) {
    return;
  }

  if (nowTs < nextAutonomousTs) {
    return;
  }

  triggerAutonomousAction();
  nextAutonomousTs = nowTs + CONFIG.autonomousActionGapMs;
}

function tick(nowTs) {
  const deltaSec = Math.min((nowTs - lastFrameTs) / 1000, CONFIG.maxDeltaSec);
  lastFrameTs = nowTs;

  updateStateTimer(nowTs);
  maybeTriggerAutonomous(nowTs);
  updateMovement(deltaSec);
  updateDebugPanel();

  requestAnimationFrame(tick);
}

function bindClickThroughControl() {
  if (!characterElement || !window.api || typeof window.api.setIgnoreMouseEvents !== "function") {
    return;
  }

  window.api.setIgnoreMouseEvents(true);
  currentIgnoreMouseEvents = true;

  window.addEventListener("mousemove", (event) => {
    if (dragState) {
      setIgnoreMouseEvents(false);
      return;
    }

    if (promptOpen) {
      setIgnoreMouseEvents(false);
      return;
    }

    const target = document.elementFromPoint(event.clientX, event.clientY);
    const isOnCharacter = Boolean(target && characterElement.contains(target));
    setIgnoreMouseEvents(!isOnCharacter);
  });

  window.addEventListener("mouseleave", () => {
    if (promptOpen) {
      setIgnoreMouseEvents(false);
      return;
    }
    setIgnoreMouseEvents(true);
  });

  const triggerCharacterInteraction = (reason) => {
    const now = performance.now();
    if (now - lastCharacterReactionTs < CLICK_REACTION_COOLDOWN_MS) {
      return;
    }

    lastCharacterReactionTs = now;
    markInteraction();
    setBubbleText("클릭 반응: 상태 점검 완료!");
    setState(STATES.SPEAK, reason, 1000);
  };

  characterElement.addEventListener("pointerdown", (event) => {
    beginDrag(event);
  });

  window.addEventListener("pointermove", (event) => {
    updateDrag(event);
  });

  window.addEventListener("pointerup", (event) => {
    endDrag(event);
  });

  window.addEventListener("pointercancel", (event) => {
    endDrag(event);
  });

  characterElement.addEventListener("click", () => {
    if (ignoreNextCharacterClick) {
      ignoreNextCharacterClick = false;
      return;
    }

    triggerCharacterInteraction("character-click");
  });

  characterElement.addEventListener("keydown", (event) => {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      triggerCharacterInteraction("character-key");
    }
  });

  characterElement.addEventListener("contextmenu", (event) => {
    event.preventDefault();
    markInteraction();
    setIgnoreMouseEvents(false);
    window.api?.showTranslateContextMenu?.(event.clientX, event.clientY);
  });
}

function bindTranslatePrompt() {
  if (!translateForm || !translateInput || !translateCancelButton) {
    return;
  }

  translateForm.addEventListener("submit", (event) => {
    event.preventDefault();
    void submitTranslateInput("form-submit");
  });

  translateCancelButton.addEventListener("click", () => {
    closeTranslatePrompt("cancel");
  });

  translateInput.addEventListener("keydown", (event) => {
    if (event.key === "Escape") {
      event.preventDefault();
      closeTranslatePrompt("cancel");
      return;
    }

    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      void submitTranslateInput("enter");
    }
  });

  window.addEventListener("keydown", (event) => {
    if (!promptOpen) {
      return;
    }

    if (event.key === "Escape") {
      event.preventDefault();
      closeTranslatePrompt("cancel");
    }
  });

  if (window.api?.onTranslateOpenInput) {
    window.api.onTranslateOpenInput((payload) => {
      openTranslatePrompt(payload);
    });
  }

  if (window.api?.onAppNotice) {
    window.api.onAppNotice((payload) => {
      if (typeof payload?.message === "string" && payload.message.trim()) {
        setBubbleText(payload.message);
      }
    });
  }
}

function bindUserActivityTracking() {
  const events = ["pointerdown", "keydown", "wheel"];
  for (const eventName of events) {
    window.addEventListener(eventName, markInteraction, { passive: true });
  }

  reduceMotionQuery.addEventListener("change", (event) => {
    prefersReducedMotion = event.matches;
    if (prefersReducedMotion && (pet.state === STATES.WALK || pet.state === STATES.RUN)) {
      pet.vx = 0;
      pet.vy = 0;
      setState(STATES.IDLE, "reduce-motion-enabled");
    }
  });

  window.addEventListener("resize", () => {
    clampPetToBounds();
    applyPosition();
    positionSpeechBubble();
  });
}

async function bootstrap() {
  const hasPreloadApi = typeof window.api === "object" && window.api !== null;
  if (!hasPreloadApi) {
    setBubbleText("오류: preload API를 찾을 수 없습니다.");
    return;
  }

  const [ping, version] = await Promise.all([
    window.api.ping(),
    window.api.getVersion()
  ]);

  setBubbleText(`보안 셸 준비 완료 (${ping}) · v${version}`);
  setState(STATES.IDLE, "bootstrap");
  placePetInitialPosition();
  positionSpeechBubble();
  bindTranslatePrompt();
  bindClickThroughControl();
  bindUserActivityTracking();

  requestAnimationFrame(tick);
}

bootstrap().catch((error) => {
  setBubbleText("초기화 실패: 콘솔 로그를 확인하세요.");
  console.error("Renderer bootstrap failed:", error);
});
