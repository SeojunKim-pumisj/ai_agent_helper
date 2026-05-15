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
