# Agent Workflow

이 문서는 AI 에이전트가 TranslateMate 작업을 진행할 때 반드시 따르는 운영 절차입니다.

## 기본 원칙

- 작업 하나는 이슈 하나로 시작합니다.
- 작업 하나는 전용 브랜치 하나에서만 진행합니다.
- 작업 완료 후에는 반드시 PR을 올립니다.
- PR 리뷰를 확인하고, 요청된 변경을 반영한 뒤 다시 검증합니다.
- 리뷰 반영이 끝난 PR만 머지합니다.
- 머지 후 다음 작업은 새 이슈와 새 브랜치에서 시작합니다.
- 새 작업 브랜치를 만들기 전에는 반드시 원격 최신 변경을 반영합니다.
- pull/fetch 중 conflict가 발생하면 에이전트가 임의로 해결하지 않고 사용자에게 넘깁니다.

## 작업 순서

1. 이슈 확인 또는 생성
- 작업할 내용이 기존 이슈에 없으면 GitHub 이슈를 먼저 생성합니다.
- 이슈에는 목표, 수정 범위, 완료 조건을 적습니다.

2. 로컬 상태 확인
- `git status --porcelain=v1 -b`
- 기존 변경 파일이 있으면 사용자 변경인지 확인하고 되돌리지 않습니다.

3. 최신 변경 반영
- 작업 브랜치를 만들기 전에 `main`을 최신화합니다.
- 권장 순서:

```bash
git switch main
git pull --ff-only origin main
```

- 로컬 변경 때문에 switch/pull이 막히면 중단하고 사용자에게 상태를 보고합니다.
- pull 중 conflict가 발생하면 중단하고 사용자에게 conflict 파일 목록을 전달합니다. conflict 수정은 사용자가 직접 합니다.

4. 브랜치 생성
- 브랜치 이름은 이슈 번호를 포함합니다.
- 예시: `task/15-security-hardening`
- 예시: `fix/16-settings-validation`

5. 구현
- `agent/PRD.md`, `agent/guide.md`, `agent/security_review.md`를 먼저 확인합니다.
- 기존 구조와 Vanilla JavaScript/Electron 패턴을 유지합니다.
- Renderer에 secret, Node 권한, 파일 시스템 권한을 노출하지 않습니다.
- 보안 변경은 Main 프로세스 검증과 IPC sender 검사를 우선합니다.

6. 검증
- `node --check main.js`
- `node --check preload.js`
- `node --check renderer.js`
- `node --check settings.js`
- `npm.cmd audit --audit-level=moderate`
- 필요한 경우 `npm.cmd start`로 스모크 테스트합니다.

7. 커밋
- 변경 범위를 확인합니다.
- 관련 없는 파일은 커밋하지 않습니다.
- 커밋 메시지는 작업 목적이 드러나게 작성합니다.

8. Push
- `git push origin <task-branch>`

9. PR 생성
- PR 생성은 스크립트를 사용합니다.
- `powershell -ExecutionPolicy Bypass -File scripts/create-pr.ps1`

10. 리뷰 확인 및 반영
- GitHub 리뷰 코멘트와 CI 결과를 확인합니다.
- 요청된 변경을 반영합니다.
- 반영 후 검증 명령을 다시 실행합니다.
- 필요한 경우 리뷰 코멘트에 답변합니다.

11. 머지
- 리뷰가 통과하고 CI가 통과한 뒤 머지합니다.
- 머지 후 로컬 `main`을 최신화합니다.
- 다음 작업은 새 이슈와 새 브랜치에서 시작합니다.

## 금지 사항

- `main` 브랜치에서 직접 기능 작업 금지
- 사용자 변경 파일 임의 revert 금지
- `git reset --hard` 금지
- 이슈 없이 작업 시작 금지
- 원격 최신 변경 반영 없이 작업 브랜치 생성 금지
- PR 없이 main 반영 금지
- 리뷰 미확인 상태에서 머지 금지
- conflict 임의 해결 금지
- Renderer에 API secret 전달 금지
- Electron `nodeIntegration: true` 활성화 금지
