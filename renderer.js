const appShell = document.querySelector(".app-shell");
const bubbleText = document.getElementById("bubble-text");
const characterElement = document.getElementById("character");
const debugState = document.getElementById("debug-state");
const debugPos = document.getElementById("debug-pos");
const debugVel = document.getElementById("debug-vel");
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

const pet = {
  state: STATES.IDLE,
  x: 120,
  y: 220,
  vx: 0,
  vy: 0,
  stateUntil: 0
};

let currentIgnoreMouseEvents = true;
let lastFrameTs = performance.now();
let lastInteractionTs = performance.now();
let nextAutonomousTs = lastInteractionTs + CONFIG.idleBeforeAutonomousMs;
let prefersReducedMotion = reduceMotionQuery.matches;

function randomInRange(min, max) {
  return min + Math.random() * (max - min);
}

function pickRandom(items) {
  return items[Math.floor(Math.random() * items.length)];
}

function setBubbleText(message) {
  if (bubbleText) {
    bubbleText.textContent = message;
  } else {
    console.error("Missing #bubble-text element:", message);
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
    minY: 96,
    maxX: Math.max(0, width - characterWidth),
    maxY: Math.max(96, height - characterHeight)
  };
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
    const target = document.elementFromPoint(event.clientX, event.clientY);
    const isOnCharacter = Boolean(target && characterElement.contains(target));
    setIgnoreMouseEvents(!isOnCharacter);
  });

  window.addEventListener("mouseleave", () => {
    setIgnoreMouseEvents(true);
  });

  const triggerCharacterInteraction = (reason) => {
    markInteraction();
    setBubbleText("클릭 반응: 상태 점검 완료!");
    setState(STATES.SPEAK, reason, 1000);
  };

  characterElement.addEventListener("click", () => {
    triggerCharacterInteraction("character-click");
  });

  characterElement.addEventListener("keydown", (event) => {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      triggerCharacterInteraction("character-key");
    }
  });
}

function bindUserActivityTracking() {
  const events = ["mousemove", "pointerdown", "keydown", "wheel"];
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
  applyPosition();
  bindClickThroughControl();
  bindUserActivityTracking();

  requestAnimationFrame(tick);
}

bootstrap().catch((error) => {
  setBubbleText("초기화 실패: 콘솔 로그를 확인하세요.");
  console.error("Renderer bootstrap failed:", error);
});
