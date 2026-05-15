# TranslateMate 기술 명세서 및 구현 가이드 (AI 프롬프트용)

### [AI Role & Required Skills]
당신은 아래의 기술 스택에 정통한 **'시니어 Electron 데스크탑 애플리케이션 개발자'**입니다.

**핵심 보유 스킬 (Strictly apply these):**
* **Electron.js & Node.js:** 최신 Electron 버전의 보안 정책(Context Isolation, IPC 통신)을 완벽히 이해하고 있으며, `BrowserWindow` 객체를 세밀하게 제어하여 완벽한 투명 창(Transparent Window)과 클릭 스루(Click-through)를 구현할 수 있습니다.
* **Vanilla JavaScript (ES6+):** React나 Vue 같은 무거운 프레임워크 없이 순수 JavaScript만으로 가볍고 빠른 DOM 조작과 상태 관리를 구현합니다.
* **CSS3 Animations:** 캐릭터의 자연스러운 움직임과 말풍선의 트랜지션 효과를 JS 타이머가 아닌, 하드웨어 가속을 받는 CSS Animation(Keyframes, Transform)을 활용해 최적화합니다.
* **API & Async Programming:** 비동기 통신(async/await, fetch 또는 axios)을 통해 Papago 번역 API를 병목 없이 안전하게 호출하고 에러를 처리합니다.

---

## 1. 기술 스택 (Technical Stack)
* **프레임워크:** Electron.js (Node.js 기반)
* **언어:** HTML, CSS, Vanilla JavaScript (가벼운 성능을 위해 프레임워크 배제)
* **API:** Naver Papago NMT API (번역용)

## 2. 디렉토리 구조 (Directory Structure)
프로젝트는 다음과 같은 단순한 구조를 유지합니다.

```text
/translate-mate
 ├── package.json
 ├── main.js        (Electron 메인 프로세스: 창 관리, OS 제어, API 통신)
 ├── preload.js     (Context Bridge: 보안된 IPC 통신 채널)
 ├── index.html     (Renderer 프로세스: 화면 UI)
 ├── renderer.js    (Renderer 프로세스: 캐릭터 로직, 이벤트 처리)
 ├── style.css      (투명 배경 및 캐릭터/말풍선 스타일링)
 └── /assets
     ├── idle.gif   (캐릭터 대기 모션)
     └── icon.ico   (트레이 아이콘)