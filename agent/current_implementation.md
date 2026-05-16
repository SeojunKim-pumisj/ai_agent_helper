# Current Implementation

검토일: 2026-05-16

대상 프로젝트: `translate-mate`

## 프로젝트 개요

현재 프로젝트는 Electron 기반 데스크톱 번역 펫 앱이다. 화면 위에 투명 오버레이 형태의 캐릭터를 띄우고, 단축키/컨텍스트 메뉴/입력창을 통해 Papago 번역 요청을 수행한다.

실행 진입점은 `package.json`의 `main.js`이며, 실행 스크립트는 다음과 같다.

```bash
npm start
npm run dev
```

## 주요 파일 역할

- `main.js`: Electron Main 프로세스, 창 생성, 트레이, 전역 단축키, IPC, Papago API 요청, 설정/비밀키 저장 담당
- `preload.js`: Renderer와 Main 사이에 제한된 IPC API를 노출하는 bridge
- `index.html`: 메인 오버레이 UI
- `renderer.js`: 캐릭터 상태 머신, 말풍선, 번역 입력창, 드래그/클릭/자동 행동 처리
- `style.css`: 메인 오버레이/캐릭터/말풍선/입력창 스타일
- `settings.html`: 설정 창 UI
- `settings.js`: 설정 폼 로딩/저장/닫기 처리
- `settings.css`: 설정 창 스타일
- `scripts/create-pr.ps1`: 현재 브랜치를 push하고 GitHub PR 생성을 돕는 PowerShell 스크립트
- `agent/security_review.md`: 보안 점검 및 보완점 문서

## Electron 창 구성

### 메인 창

`main.js`의 `createMainWindow()`에서 생성된다.

현재 설정:

- 전체 가상 데스크톱 크기로 생성
- `frame: false`
- `transparent: true`
- `alwaysOnTop: true`
- `resizable: false`
- `skipTaskbar: true`
- `preload: preload.js`
- `contextIsolation: true`
- `nodeIntegration: false`
- `sandbox: true`
- `index.html` 로드

메인 창은 기본적으로 마우스 이벤트를 무시하도록 설정되며, 캐릭터/말풍선/입력창 조작 시 Renderer 요청을 통해 마우스 이벤트 수신 상태가 바뀐다.

### 설정 창

`main.js`의 `createSettingsWindow()`에서 생성된다.

현재 설정:

- 크기: `460x620`
- 최소 크기: `430x580`
- `autoHideMenuBar: true`
- `preload: preload.js`
- `contextIsolation: true`
- `nodeIntegration: false`
- `sandbox: true`
- `settings.html` 로드
- 닫기 버튼을 누르면 기본 종료 대신 창을 숨김

## 트레이와 전역 단축키

트레이 아이콘은 `assets/icon.ico` 경로를 사용하도록 구현되어 있다.

트레이 메뉴 기능:

- 설정 열기
- 메인 창 표시/숨김 토글
- 앱 종료

전역 번역 단축키 기본값:

```text
CommandOrControl+Shift+T
```

단축키는 설정에서 변경 가능하며, 저장 시 기존 단축키 등록을 해제하고 새 단축키를 등록한다. 등록 실패 시 이전 단축키 복구를 시도한다.

## 번역 기능

Papago 번역 API endpoint:

```text
https://papago.apigw.ntruss.com/nmt/v1/translation
```

현재 번역 흐름:

1. 사용자가 단축키, 컨텍스트 메뉴, 입력창으로 번역을 시작한다.
2. Renderer가 입력값을 Main에 검증 요청한다.
3. Main이 입력 길이와 빈 값 여부를 검증한다.
4. Renderer가 `translate:request` IPC로 번역을 요청한다.
5. Main이 Papago API에 요청한다.
6. 결과를 Renderer가 말풍선에 출력한다.

현재 제한:

- 입력 최대 길이: `2000`
- 요청 timeout: `5000ms`
- 최대 retry: `1`
- 429 또는 5xx 응답에서 1회 재시도
- 인증 실패, 설정 누락, timeout, quota, network, server, unknown 오류를 분류

현재 클립보드 연동:

- 전역 단축키 실행 시 클립보드 텍스트를 읽는다.
- 기본값에서는 클립보드 텍스트를 입력창에 채우기만 하며, 사용자가 직접 제출해야 Papago API 요청이 발생한다.
- `clipboardAutoSubmit` 설정을 사용자가 켠 경우에만 민감 정보 패턴이 감지되지 않은 클립보드 텍스트를 자동 제출한다.
- 민감 정보 패턴이 감지되면 자동 제출을 차단하고, 컨텍스트 메뉴에서도 동일한 클립보드 입력 흐름을 사용한다.

## 설정 기능

기본 설정값:

```json
{
  "targetLang": "ko",
  "moveSpeed": 1,
  "soundEnabled": false,
  "translateShortcut": "CommandOrControl+Shift+T"
}
```

지원 대상 언어:

- `ko`
- `en`
- `ja`
- `zh-CN`
- `zh-TW`
- `es`
- `fr`
- `de`
- `ru`
- `vi`
- `th`
- `id`

설정 창에서 변경 가능한 항목:

- Papago Client ID
- Papago Client Secret
- 기본 번역 대상 언어
- 캐릭터 이동 속도
- 전역 번역 단축키
- 알림음 사용 여부

설정 저장 위치:

```text
app.getPath("userData")/settings.json
```

설정 파일은 임시 파일에 먼저 쓴 뒤 rename 하는 방식으로 저장한다.

## 비밀키 저장

Papago API 키는 Main 프로세스에서만 다룬다. Renderer로 평문 secret을 내려보내지 않는다.

현재 저장 우선순위:

1. `keytar` 사용 가능 시 OS credential store에 저장
2. `keytar` 사용 불가 시 Electron `safeStorage`로 암호화한 파일에 저장
3. 둘 다 없으면 저장 실패 처리

저장 계정명:

- service: `TranslateMate`
- client id account: `papago-client-id`
- client secret account: `papago-client-secret`

fallback 저장 위치:

```text
app.getPath("userData")/secrets.json
```

환경변수 fallback도 구현되어 있다. 다만 환경변수는 저장소 우선순위에 포함되는 persisted storage가 아니라 읽기 시점의 read-only fallback이다.
`getPapagoCredentials()`는 저장된 `secretState`가 있으면 이를 먼저 사용하고, 저장된 값이 없을 때만 아래 환경변수를 읽는다. 설정 화면의 삭제 기능은 OS credential store와 `secrets.json`만 삭제하며 환경변수는 삭제하거나 덮어쓰지 않는다.

```text
PAPAGO_CLIENT_ID
PAPAGO_CLIENT_SECRET
```

## IPC API

`preload.js`는 `window.api`와 `window.settingsApi`를 노출한다.

### `window.api`

- `ping()`
- `getVersion()`
- `getRuntimeSettings()`
- `validateTranslateInput(text)`
- `translateText(text, source, target)`
- `setIgnoreMouseEvents(ignore)`
- `openTranslateInput(mode, source)`
- `showTranslateContextMenu(x, y)`
- `openSettingsWindow()`
- `onTranslateOpenInput(callback)`
- `onAppNotice(callback)`
- `onSettingsUpdated(callback)`

### `window.settingsApi`

- `getSettings()`
- `saveSettings(payload)`
- `closeWindow()`
- `onSettingsUpdated(callback)`

Main 프로세스는 IPC 요청 sender를 확인한다.

- 일반 runtime/settings 조회는 메인 창 또는 설정 창 sender만 허용
- 설정 조회/저장은 설정 창 sender만 허용
- 번역 검증/요청은 메인 창 sender만 허용
- 설정 창 닫기는 설정 창 sender만 허용

## Renderer UI 동작

캐릭터 상태:

- `idle`
- `walk`
- `run`
- `think`
- `speak`
- `play`

구현된 동작:

- 캐릭터 자동 이동
- 벽 충돌 시 방향 반전
- idle 시간이 길어지면 자동 행동 실행
- reduced motion 설정 감지
- 캐릭터 드래그 이동
- 캐릭터 클릭/키보드 반응
- 말풍선 위치 자동 조정
- 긴 번역 결과 typing effect 출력
- 번역 입력창 열기/닫기
- Enter 제출, Esc 취소
- 번역 중 상태 표시
- 알림음 옵션
- 디버그 패널에 state/pos/vel 표시

## CSP와 기본 보안 설정

`index.html`과 `settings.html` 모두 CSP meta tag가 있다.

현재 `index.html` CSP:

```text
default-src 'none';
script-src 'self';
style-src 'self' 'unsafe-inline';
connect-src 'self' https:;
img-src 'self' data:;
font-src 'self';
base-uri 'none';
form-action 'none';
frame-ancestors 'none';
```

현재 `settings.html` CSP:

```text
default-src 'none';
script-src 'self';
style-src 'self' 'unsafe-inline';
img-src 'self' data:;
font-src 'self';
base-uri 'none';
form-action 'none';
frame-ancestors 'none';
```

확인된 기본 보안 구현:

- `contextIsolation: true`
- `nodeIntegration: false`
- `sandbox: true`
- preload API를 제한적으로 노출
- Renderer에서 번역 결과 출력 시 `textContent` 사용
- API secret은 Main 프로세스에서만 사용

## 의존성

`package.json` 기준:

- Electron: `^42.0.0`
- keytar: `^7.9.0` optional dependency

`npm.cmd audit --json` 실행 결과:

- critical: 0
- high: 0
- moderate: 0
- low: 0
- total: 0

## 현재 확인 필요 사항

아래 항목은 구현되어 있거나 코드에 경로가 있으나, 실제 실행 환경에서 추가 확인이 필요하다.

- `assets/icon.ico`가 실제로 존재해야 Tray 생성이 정상 동작한다.
- `keytar`는 optional dependency라 설치 실패 시 `safeStorage` fallback으로 동작한다.
- Papago Client ID/Secret이 없으면 번역은 설정 오류로 실패한다.
- PowerShell 실행 정책에 따라 `npm` 대신 `npm.cmd`를 사용해야 할 수 있다.
- 일부 한글 문자열은 현재 파일 인코딩/표시 환경에 따라 깨져 보일 수 있다.
