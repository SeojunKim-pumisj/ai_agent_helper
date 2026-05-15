# Task 1. 프로젝트 스캐폴딩 및 Electron 보안 기반 구축

## 목표
PRD/가이드 기준의 기본 프로젝트 구조를 만들고, Electron 보안 정책(Context Isolation + 최소 권한 IPC)을 적용한 실행 가능한 뼈대를 완성한다.

## 범위
- `package.json` 초기화 및 실행 스크립트 정의 (`start`, `dev`).
- 기본 파일 생성: `main.js`, `preload.js`, `index.html`, `renderer.js`, `style.css`, `assets/`.
- `BrowserWindow` 생성 시 보안 옵션 적용:
  - `contextIsolation: true`
  - `nodeIntegration: false`
  - `sandbox: true`(가능 시)
- Renderer가 직접 Node API에 접근하지 못하도록 차단.
- `preload.js`의 `contextBridge`를 통한 최소 IPC 채널만 노출.

## 산출물
- 실행 시 빈 캐릭터 셸 UI가 표시되는 앱.
- 보안 기본 설정이 반영된 메인/프리로드 코드.

## 완료 기준 (DoD)
- 앱이 `npm start`로 정상 실행된다.
- DevTools 콘솔에서 `require('fs')` 같은 직접 Node 접근이 실패한다.
- Renderer에서 `window.api` 등 preload로 노출한 API만 접근 가능하다.

## 의존성
- 선행 작업 없음.
- 후속 작업(Task 2~8)의 기반.
