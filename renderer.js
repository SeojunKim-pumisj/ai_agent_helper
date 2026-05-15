const bubbleText = document.getElementById("bubble-text");

function setBubbleText(message) {
  if (bubbleText) {
    bubbleText.textContent = message;
  } else {
    console.error("Missing #bubble-text element:", message);
  }
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
}

bootstrap().catch((error) => {
  setBubbleText("초기화 실패: 콘솔 로그를 확인하세요.");
  console.error("Renderer bootstrap failed:", error);
});
