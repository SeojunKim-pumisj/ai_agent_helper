# TranslateMate 작업 히스토리

## 기간: 2026-05-15 ~ 2026-05-16

### 2026-05-15 - Task 1. 프로젝트 스캐폴딩 및 Electron 보안 기반 구축
- `package.json` 초기화 및 실행 스크립트 구성 (`start`, `dev`).
- 기본 파일 구성 완료: `main.js`, `preload.js`, `index.html`, `renderer.js`, `style.css`.
- Electron 보안 기본값 적용:
  - `contextIsolation: true`
  - `nodeIntegration: false`
  - `sandbox: true`
- `preload.js`에서 `contextBridge` 기반 최소 API(`ping`, `getVersion`, `setIgnoreMouseEvents`)만 노출.
- 관련 커밋:
  - `6b9f5a8` (feat: scaffold electron app with secure preload bridge)
  - `2c9151e` (fix: address PR review feedback for security and accessibility)

### 2026-05-15 - Task 2. 투명 창/항상 위/클릭 스루 윈도우 제어 구현
- `BrowserWindow`를 프레임리스 + 투명 창으로 구성.
- `alwaysOnTop` 및 워크스페이스 가시성 설정으로 상시 노출 구조 반영.
- `setIgnoreMouseEvents(true, { forward: true })` 기반 클릭 스루 토글 파이프라인 구축:
  - Renderer에서 캐릭터 히트 여부를 계산
  - Main 프로세스에서 마우스 이벤트 무시 상태를 적용
- 관련 커밋:
  - `a4550c5` (feat: implement task2 click-through window control)

### 2026-05-15 - Task 3. 캐릭터 상태 머신 및 이동/애니메이션 시스템
- 상태 머신 도입: `idle`, `walk`, `run`, `think`, `speak`, `play`.
- 자율 행동 타이머 및 상태 전환 로직 구현.
- 화면 경계 충돌 처리(반사/복귀) 및 이동 벡터 업데이트 구현.
- CSS 애니메이션 키프레임을 상태별로 매핑하여 렌더링.
- 디버그 패널로 상태/좌표/속도 확인 가능하도록 구성.
- 관련 커밋:
  - `2b85ddd` (feat: implement task3 state machine and autonomous movement)
  - `ca20a59` (fix: address PR review feedback for task3)
  - `d25d2da` (feat: Task 3 character state machine and autonomous movement)

### 2026-05-16 - 멀티모니터 전체 이동 범위 확장 및 창 범위 보강
- 단일 모니터 기준 창 크기 제한을 제거하고, 가상 데스크톱 전체를 커버하도록 변경:
  - `screen.getAllDisplays()`로 모든 디스플레이 경계 합집합 계산
  - 투명 오버레이 창을 해당 전체 경계로 생성/재조정
- 디스플레이 변경 이벤트 대응 추가:
  - `display-added`, `display-removed`, `display-metrics-changed`에서 창 bounds 재적용
- 캐릭터 이동 경계를 오버레이 전체 기준으로 유지:
  - `renderer.js`에서 상하단 제한값을 전체 창 기준으로 정렬
  - 초기 위치 및 리사이즈 시 좌표 클램프 로직 반영

### 2026-05-16 - Task 4. 번역 입력 UX(단축키/우클릭/클립보드) 구현 착수
- 글로벌 단축키 등록:
  - 기본값 `CommandOrControl+Shift+T` 등록
  - 단축키 트리거 시 클립보드 텍스트를 우선 로드하고, 값이 있으면 자동 제출 흐름으로 입력창 호출
  - 등록 실패 시 렌더러 알림 메시지로 안내
- 캐릭터 우클릭 컨텍스트 메뉴 추가:
  - "번역 입력", "클립보드 번역" 액션 제공
  - 클립보드가 비어 있으면 입력창만 열고 경고 메시지 안내
- 입력 팝업 UI 추가:
  - `index.html`에 입력 패널/폼/텍스트 영역/에러 영역/취소/확인 액션 반영
  - `style.css`에 프롬프트 레이아웃 및 접근성 포커스 스타일 반영
- 입력 검증 체계 반영:
  - Main IPC에서 공백 입력 및 2000자 초과 제한 검증
  - Renderer에서 Enter 제출(Shift+Enter 줄바꿈), Esc 취소, 검증 에러 메시지 표시
- 클릭 스루와 입력 UX 충돌 방지:
  - 프롬프트가 열린 동안은 창이 마우스 이벤트를 수신하도록 전환
  - 프롬프트 닫힘 시 다시 클릭 스루 상태로 복귀

### 2026-05-16 - Task 5. Papago API 연동 및 IPC 번역 파이프라인 구현
- Main 프로세스에 `translate:request` IPC 핸들러 추가:
  - Renderer 입력 텍스트 검증(공백/길이) 후 Main에서만 외부 API 호출
  - 기본 소스 언어 `auto`, 기본 타겟 언어 `ko`
- Papago REST 호출 로직 추가:
  - 엔드포인트: `https://papago.apigw.ntruss.com/nmt/v1/translation`
  - `AbortController` 기반 5초 타임아웃 처리
  - 일시 오류(429/5xx/네트워크)에 대한 제한적 재시도(최대 1회)
- 오류 매핑 정규화:
  - 인증 오류(`auth`)
  - 설정 누락(`config`)
  - 타임아웃(`timeout`)
  - 할당량(`quota`)
  - 네트워크(`network`)
  - 서버 오류(`server`)
- `preload.js`에 `translateText()` 브리지 API 노출.
- `renderer.js` 제출 플로우를 실제 번역 호출로 전환:
  - 번역중 상태(`THINK`) 표시
  - 성공 시 번역 결과를 말풍선 출력
  - 실패 시 사용자 친화 메시지 출력

### 2026-05-16 - UI 보정: 말풍선 추적 배치 및 자율 이동 트리거 수정
- 말풍선을 화면 상단 고정 방식에서 캐릭터 추적 방식으로 전환:
  - 캐릭터 중심 좌표 기준으로 말풍선 위치를 동적으로 계산
  - 화면 경계 클램프(상단 공간 부족 시 캐릭터 아래 배치) 적용
  - 텍스트 변경/캐릭터 이동/리사이즈 시 위치 재계산
- 전체 화면 오버레이 환경에서 자율 이동이 억제되던 문제 수정:
  - 사용자 상호작용 추적 이벤트에서 `mousemove`를 제외
  - 상시 마우스 이동으로 인해 idle 타이머가 리셋되던 현상 제거

### 2026-05-16 - 품질 게이트 반영: 스모크 테스트 절차 명문화 및 실행
- `agent/guide.md`에 작업 완료 절차(정적 검증 -> 스모크 테스트 -> 프로세스 정리)를 필수 단계로 문서화.
- 현재 브랜치 변경사항에 대해 다음 검증 실행:
  - `node --check main.js`
  - `node --check preload.js`
  - `node --check renderer.js`
  - `npm start` 앱 기동 확인(명령 타임아웃 시점까지 프로세스 유지)
- 테스트 후 남은 `electron` 프로세스 정리 완료.

### 2026-05-16 - PR 리뷰 반영: deprecated CSS 속성 교체
- CodeRabbit 리뷰 코멘트 반영:
  - `style.css`의 `word-break: break-word` 제거
  - `overflow-wrap: anywhere` + `word-break: normal` 조합으로 변경
- 스타일 린트 경고(deprecated keyword) 해소 목적의 최소 수정으로 반영.

### 2026-05-16 - Task 6 진행: 말풍선 출력 UX/상호작용 보강 (진행중)
- 말풍선 출력 UX 개선:
  - 말풍선 컨테이너에 `max-height`와 `overflow-y: auto` 적용
  - 긴 문장 출력 시 스크롤 가능한 레이아웃으로 동작
  - 번역 결과 출력에 타이핑 효과 적용(`setBubbleTextWithTyping`)
- 클릭 반응 중복 방지:
  - 캐릭터 반응에 쿨다운(`CLICK_REACTION_COOLDOWN_MS`) 적용
  - 드래그 직후 발생하는 클릭 이벤트 무시 처리
- 드래그 앤 드롭 이동 구현:
  - `pointerdown`/`pointermove`/`pointerup` 기반 드래그 이동
  - 드래그 중 클릭스루 비활성화, 드롭 후 상태 복귀
  - 화면 경계 클램프 유지
- 검증:
  - `node --check main.js`, `node --check preload.js`, `node --check renderer.js`
  - `npm start` 스모크 실행 후 `electron` 프로세스 정리 완료

### 2026-05-16 - UI 버그 수정: 클릭 후 흰색 불투명 헤더 노출 이슈 대응
- 투명 오버레이 창 설정 보강:
  - `main.js`의 `BrowserWindow` 옵션에 `backgroundColor: "#00000000"` 추가
  - Windows 프레임 스타일 주입 방지를 위해 `thickFrame: false` 적용
- Electron 버전 업그레이드:
  - `package.json` devDependency를 `electron@^42.0.0`으로 상향
  - 설치 결과 로컬 버전 `42.1.0`으로 반영
- PR 리뷰 반영(코드 리뷰 댓글 2건):
  - `renderer.js` 타이핑 인터벌 정리 로직을 로컬 `intervalId` 기준으로 수정하여 타이머 경합 방지
  - 말풍선 스크롤 가능하도록 `.bubble`을 인터랙티브 영역으로 전환(`pointer-events: auto`)
  - 말풍선 접근성 보강: `index.html` 말풍선에 `tabindex="0"` 및 `aria-label` 추가
  - 클릭스루 제어에 말풍선 히트체크(`isPointOnBubble`)를 추가해 말풍선 영역에서 마우스 이벤트 수신 유지
