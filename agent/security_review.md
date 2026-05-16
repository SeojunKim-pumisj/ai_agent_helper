# Security Review

검토일: 2026-05-16

범위: Electron 메인 프로세스, preload IPC 브리지, renderer/settings UI, Papago 번역 연동, 로컬 설정/비밀키 저장, 의존성 상태.

## 요약

현재 앱은 `contextIsolation: true`, `nodeIntegration: false`, `sandbox: true`, CSP 적용, Renderer에서 `textContent` 위주 출력 등 기본 방어는 비교적 잘 들어가 있다. `npm audit` 결과도 현재 취약점 0건이다.

다만 서비스 로직상 클립보드 자동 전송, 전체 화면 투명 오버레이 제어, IPC/네비게이션 경계, 비밀키 저장 fallback 정책은 실제 배포 전 보완이 필요하다.

## 주요 위험과 보완점

### 1. 클립보드 내용이 단축키로 외부 API에 자동 전송될 수 있음

- 위치: `main.js` `readClipboardText`, `openTranslateInputFromShortcut`, `translate:open-input`
- 근거: 전역 단축키 실행 시 `clipboard.readText()`로 현재 클립보드를 읽고, 내용이 있으면 `autoSubmit: true`로 Renderer에 전달한다. 이후 Renderer는 사용자의 추가 확인 없이 Papago 번역 요청을 실행한다.
- 영향: 사용자가 비밀번호, 토큰, 개인 문서, 사내 정보 등을 클립보드에 둔 상태에서 단축키를 누르면 외부 Papago API로 전송될 수 있다. 이는 기능 의도와 별개로 개인정보/영업비밀 유출 리스크가 크다.
- 보완:
  - 클립보드 단축키는 입력창에만 채우고 기본값은 수동 제출로 바꾼다.
  - 자동 제출은 별도 설정으로 opt-in 처리하고, 최초 사용 시 명시적 안내를 둔다.
  - 클립보드 원문 미리보기는 길이 제한과 마스킹을 적용한다.
  - 민감 패턴(API key, JWT, private key header, 긴 hex/base64 토큰 등)을 감지하면 자동 전송을 차단한다.

### 2. 전체 화면 투명 오버레이가 Renderer API로 마우스 이벤트를 받을 수 있음

- 위치: `main.js` `createMainWindow`, `setWindowMouseIgnore`; `preload.js` `setIgnoreMouseEvents`
- 근거: 메인 윈도우는 전체 가상 데스크톱 크기, always-on-top, transparent, frameless로 생성된다. Renderer는 preload API를 통해 `setIgnoreMouseEvents(false)`를 요청할 수 있다.
- 영향: 현재 로컬 HTML만 로드하므로 즉시 원격 공격면은 작지만, XSS나 잘못된 네비게이션이 생기면 화면 전체를 덮는 클릭 가로채기/피싱 UI로 악용될 수 있다.
- 보완:
  - Renderer가 직접 마우스 무시 상태를 임의 전환하지 못하게 하고, Main이 허용된 UI 상태(번역 입력창 열림, 캐릭터 드래그 시작 등)에서만 전환하도록 상태 머신을 둔다.
  - 가능한 경우 전체 화면 투명 창 대신 캐릭터/말풍선 주변으로 창 크기를 줄인다.
  - 입력창이 열릴 때만 포커스와 마우스 이벤트를 허용하고, 타임아웃/blur 시 자동으로 click-through로 복귀한다.

### 3. 외부 네비게이션과 새 창 차단 정책이 없음

- 위치: `main.js` `createMainWindow`, `createSettingsWindow`
- 근거: `loadFile()`로 로컬 HTML을 열지만 `will-navigate`, `setWindowOpenHandler`, permission request 차단이 없다.
- 영향: HTML에 링크가 추가되거나 XSS가 생기면 외부 페이지가 앱 창 안에서 열릴 수 있고, preload API가 의도치 않은 문서에 노출될 가능성이 생긴다.
- 보완:
  - 두 BrowserWindow 모두 생성 직후 `webContents.setWindowOpenHandler(() => ({ action: "deny" }))` 적용.
  - `will-navigate`에서 앱 내부 file URL 외 이동을 `event.preventDefault()`로 차단.
  - `will-attach-webview` 차단.
  - `session.setPermissionRequestHandler((webContents, permission, callback) => callback(false))`로 권한 요청 기본 거부.

### 4. 번역 요청 IPC에 서버 측 rate limit과 언어 allowlist가 부족함

- 위치: `main.js` `translate:request`
- 근거: 입력 길이는 2000자로 제한하지만, Renderer가 호출 빈도와 `source`/`target` 값을 자유롭게 보낼 수 있다. UI에는 중복 제출 방지가 있으나 Main 프로세스에는 호출 빈도 제한이 없다.
- 영향: Renderer가 오염되거나 자동화되면 Papago 과금/쿼터 소진, 비정상 요청 증가, 에러 로그 증가가 발생할 수 있다.
- 보완:
  - Main 프로세스에 짧은 token bucket 또는 per-window debounce를 둔다.
  - `target`은 `SUPPORTED_TARGET_LANGS`로 검증하고, `source`도 Papago 지원 언어/`auto`만 허용한다.
  - 실패 응답도 유형별로 카운트해서 일정 횟수 이상이면 잠시 차단한다.

### 5. 비밀키 저장 fallback 파일의 수명과 권한 관리가 부족함

- 위치: `main.js` `saveCredentialsToKeytar`, `saveCredentialsToEncryptedFile`, `loadStoredCredentials`
- 근거: `keytar`가 가능하면 OS credential store를 쓰고, 실패 시 `safeStorage` 암호화 파일을 쓴다. 하지만 기존 fallback 파일 삭제, 파일 권한 강화, 저장 방식 변경 시 마이그레이션 정리가 없다.
- 영향: `safeStorage` 자체는 OS 암호화를 사용하지만, 암호화된 `secrets.json`이 계속 남아 있으면 백업/동기화/로컬 악성코드 노출면이 커진다.
- 보완:
  - keytar 저장 성공 시 기존 `secrets.json`을 삭제한다.
  - 파일 fallback 저장 후 가능하면 사용자 전용 권한으로 제한한다.
  - 설정 화면에는 `safeStorage` fallback 사용 중임을 명확히 표시하고, 배포 빌드에서는 keytar 포함 여부를 검증한다.
  - API 키 교체/삭제 기능을 추가해 사용자가 저장된 키를 폐기할 수 있게 한다.

### 6. API 키 검증이 실제 번역 요청으로 수행됨

- 위치: `main.js` `settings:save`
- 근거: 새 Papago 키 저장 시 `"key validation"` 문자열을 실제 번역 API에 전송해 인증을 검증한다.
- 영향: 저장 시마다 외부 API 호출과 쿼터 사용이 발생한다. 검증 대상 텍스트는 고정 문자열이라 민감도는 낮지만, 설정 저장 동작이 외부 통신을 일으킨다는 점은 사용자에게 불투명하다.
- 보완:
  - 저장과 연결 테스트를 분리한다.
  - 연결 테스트 버튼을 명시적으로 제공하고, 테스트 호출에는 rate limit을 둔다.
  - Papago에 별도 인증 검증 엔드포인트가 없다면 UI 문구로 외부 호출을 명확히 알린다.

### 7. CSP의 `connect-src https:` 범위가 Renderer에 비해 넓음

- 위치: `index.html` CSP
- 근거: 실제 네트워크 요청은 Main 프로세스의 `fetch(PAPAGO_ENDPOINT)`가 담당한다. Renderer는 직접 외부 HTTPS 연결이 필요하지 않다.
- 영향: XSS가 생겼을 때 임의 HTTPS endpoint로 데이터를 내보낼 수 있는 여지가 커진다.
- 보완:
  - `index.html`의 `connect-src`를 `'self'`로 축소한다.
  - Renderer에서 직접 외부 요청이 필요한 기능이 생길 때만 endpoint 단위로 허용한다.

### 8. 공급망/배포 보안 자동화가 부족함

- 위치: `package.json`, CI/배포 구성 부재
- 근거: 현재 `npm audit`은 취약점 0건이지만, 감사가 자동화되어 있지 않고 Electron 보안 설정 회귀를 막는 테스트도 없다.
- 영향: 의존성 또는 Electron 설정 변경 시 보안 회귀를 놓칠 수 있다.
- 보완:
  - CI에서 `npm ci`와 `npm audit --audit-level=moderate`를 실행한다.
  - BrowserWindow 옵션(`contextIsolation`, `nodeIntegration`, `sandbox`)과 CSP 존재 여부를 확인하는 간단한 정적 테스트를 둔다.
  - 배포 전 `electron`/`keytar` 포함 상태와 native dependency 설치 실패를 검증한다.

## 우선순위 제안

1. 클립보드 자동 제출 제거 또는 opt-in화.
2. BrowserWindow 네비게이션/새 창/권한 요청 차단 추가.
3. `setIgnoreMouseEvents`를 Main 상태 기반 제어로 축소.
4. `translate:request` rate limit과 언어 allowlist 추가.
5. keytar/safeStorage 저장소 마이그레이션 정리와 삭제 기능 추가.

## 확인한 긍정 요소

- `contextIsolation: true`, `nodeIntegration: false`, `sandbox: true`가 적용되어 있다.
- Renderer 출력은 주로 `textContent`를 사용해 번역 결과 HTML 주입 위험이 낮다.
- API secret은 Renderer로 내려보내지 않고 Main 프로세스에서만 사용한다.
- CSP가 기본적으로 적용되어 있고 inline script는 허용하지 않는다.
- `npm audit --json` 기준 현재 의존성 취약점은 0건이다.
