const bubbleText = document.getElementById("bubble-text");
const characterElement = document.getElementById("character");
let currentIgnoreMouseEvents = true;

function setBubbleText(message) {
  if (bubbleText) {
    bubbleText.textContent = message;
  } else {
    console.error("Missing #bubble-text element:", message);
  }
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

  characterElement.addEventListener("click", () => {
    setBubbleText("캐릭터 클릭 감지");
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
  bindClickThroughControl();
}

bootstrap().catch((error) => {
  setBubbleText("초기화 실패: 콘솔 로그를 확인하세요.");
  console.error("Renderer bootstrap failed:", error);
});
