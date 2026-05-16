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

현재 구현은 **Electron + Vanilla JavaScript**로 고정합니다. React, Vue, Tauri, Python GUI 등 다른 스택은 별도 이슈와 PRD 변경 없이 도입하지 않습니다.

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
 ├── settings.html  (설정 창 UI)
 ├── settings.js    (설정 창 이벤트 및 저장 처리)
 ├── settings.css   (설정 창 스타일)
 ├── scripts/
 │   └── create-pr.ps1 (PR 생성 보조 스크립트)
 ├── agent/
 │   ├── PRD.md
 │   ├── guide.md
 │   ├── git_convention.md
 │   └── agent_workflow.md
 └── /assets
     ├── .gitkeep
     └── icon.ico   (트레이 아이콘, 현재 저장소에는 미포함. 배포 전 실제 아이콘 추가 또는 fallback 구현 필요)
```

## 3. 작업 완료 절차 (필수)
모든 기능 작업이 끝나면 커밋/PR 전에 아래 순서를 반드시 수행합니다.

1. 정적 검증
- `node --check main.js`
- `node --check preload.js`
- `node --check renderer.js`
- `node --check settings.js`
- `npm audit --audit-level=moderate`

2. 스모크 테스트
- Windows PowerShell 실행 정책 때문에 `npm`이 막히면 `npm.cmd audit --audit-level=moderate`, `npm.cmd start`처럼 `.cmd` 실행 파일을 사용합니다.
- 앱을 실제 실행해 기본 기동 여부를 확인합니다.
- 최소 확인 항목:
  - 앱 크래시 없이 기동
  - 캐릭터 렌더링/이동
  - 말풍선 출력
  - 입력 팝업 열기/닫기
  - 설정 창 열기/닫기
  - 기존 API 키가 Renderer로 노출되지 않음

3. 종료 정리
- 테스트로 실행된 `electron` 프로세스를 정리합니다.
- 이상이 없으면 `agent/git_convention.md`와 `agent/agent_workflow.md`의 순서대로 이슈, 브랜치, 커밋, push, PR, 리뷰 반영, 머지를 진행합니다.

## 4. 에이전트 작업 원칙

- 작업 시작 전 반드시 `git status --porcelain=v1 -b`로 현재 브랜치와 변경 파일을 확인합니다.
- 새 작업 브랜치를 만들기 전 반드시 `main`으로 전환해 `git pull --ff-only origin main`으로 최신 변경을 반영합니다.
- pull/switch 중 conflict가 발생하면 임의로 해결하지 않고 사용자에게 맡깁니다.
- 사용자가 만든 기존 변경은 되돌리지 않습니다.
- 관련 없는 리팩터링, 포맷팅, 의존성 변경은 하지 않습니다.
- 보안 관련 코드는 Main/Preload/Renderer 경계를 먼저 확인하고, Renderer에 Node 권한이나 secret을 노출하지 않습니다.
- 작업 하나는 이슈 하나, 브랜치 하나, PR 하나로 관리합니다.
