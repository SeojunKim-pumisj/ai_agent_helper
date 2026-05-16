# Git Convention

이 저장소의 모든 작업은 이슈 기반으로 진행합니다. 작업 하나는 이슈 하나, 브랜치 하나, PR 하나로 관리합니다.

## 고정 작업 순서

1. GitHub 이슈를 먼저 생성하거나 기존 이슈를 지정합니다.
2. 작업 시작 전 로컬 상태를 확인합니다.
`git status --porcelain=v1 -b`
3. 브랜치를 만들기 전에 `main`을 최신화합니다.
`git switch main`
`git pull --ff-only origin main`
4. `main`에서 직접 작업하지 않고 이슈 번호가 포함된 브랜치를 만듭니다.
`git switch -c task/<issue-number>-<short-title>`
5. 해당 브랜치에서만 구현합니다.
6. 작업 완료 후 검증을 실행합니다.
7. 변경 범위를 확인하고 커밋합니다.
8. 원격에 push합니다.
9. PR을 생성합니다.
10. 리뷰와 CI를 확인합니다.
11. 리뷰 코멘트를 반영하고 다시 검증합니다.
12. 리뷰 통과 후 머지합니다.
13. 머지 후 다음 작업은 새 이슈와 새 브랜치에서 시작합니다.

## 최신화 및 conflict 규칙

- 작업 브랜치 생성 전에는 반드시 `main`을 최신화합니다.
- 최신화 명령은 fast-forward만 허용합니다.

```bash
git switch main
git pull --ff-only origin main
```

- 로컬 변경 때문에 switch 또는 pull이 막히면 작업을 중단하고 상태를 보고합니다.
- pull 중 conflict가 발생하면 에이전트가 임의로 수정하지 않습니다.
- conflict 수정은 사용자가 직접 진행합니다.
- conflict 해결 후 사용자가 알려주면 그 다음 단계부터 이어서 진행합니다.

## 브랜치 규칙

- 기능 작업: `task/<issue-number>-<short-title>`
- 버그 수정: `fix/<issue-number>-<short-title>`
- 문서 작업: `docs/<issue-number>-<short-title>`
- 보안 작업: `security/<issue-number>-<short-title>`

예시:

```bash
git switch -c security/15-electron-hardening
```

## 커밋 전 검증

```bash
node --check main.js
node --check preload.js
node --check renderer.js
node --check settings.js
npm.cmd audit --audit-level=moderate
```

필요한 경우 앱 스모크 테스트도 실행합니다.

```bash
npm.cmd start
```

## PR Workflow (고정)

1. 로컬에서 작업 완료 후 브랜치 push:
`git push origin <task-branch>`

2. PR 생성은 반드시 스크립트 사용:
`powershell -ExecutionPolicy Bypass -File scripts/create-pr.ps1`

3. 사전 조건:
- GitHub CLI(`gh`) 설치
- `gh auth login` 완료(해당 저장소 PR 생성 권한 계정)

4. `gh` 인증/설치가 없으면 스크립트가 실패 처리하며, 수동 PR 링크를 출력한다.

## 리뷰 반영 규칙

- PR 생성 후 리뷰 코멘트와 CI 결과를 확인합니다.
- 리뷰가 변경을 요구하면 해당 브랜치에서 수정합니다.
- 수정 후 커밋하고 다시 push합니다.
- 리뷰 반영 후 검증 명령을 다시 실행합니다.
- 리뷰 통과 전에는 머지하지 않습니다.

## 금지 사항

- 이슈 없이 작업 시작 금지
- 원격 최신 변경 반영 없이 작업 브랜치 생성 금지
- `main` 브랜치에서 직접 구현 금지
- 사용자 또는 다른 작업자의 변경 파일 임의 되돌리기 금지
- conflict 임의 해결 금지
- 관련 없는 파일 포맷팅 금지
- PR 없이 main 반영 금지
- 리뷰 미반영 상태에서 머지 금지
