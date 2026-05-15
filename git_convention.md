# Git Convention

1. 모든 작업은 이슈에 맞는 브랜치를 먼저 만들고, 해당 브랜치에서만 작업할 것.
2. 모든 작업이 끝나면 반드시 원격에 push하고 PR을 올린 뒤 리뷰를 받고 반영할 것. (리뷰 반영까지는 약 5~6분 소요될 수 있음)
3. 리뷰 반영 후 머지하고, 그 다음 task용 브랜치를 새로 만들어 작업할 것.

## PR Workflow (고정)

1. 로컬에서 작업 완료 후 브랜치 push:
`git push origin <task-branch>`

2. PR 생성은 반드시 스크립트 사용:
`powershell -ExecutionPolicy Bypass -File scripts/create-pr.ps1`

3. 사전 조건:
- GitHub CLI(`gh`) 설치
- `gh auth login` 완료(해당 저장소 PR 생성 권한 계정)

4. `gh` 인증/설치가 없으면 스크립트가 실패 처리하며, 수동 PR 링크를 출력한다.
