param(
  [string]$Base = "main"
)

$ErrorActionPreference = "Stop"

function Fail($Message) {
  Write-Error $Message
  exit 1
}

function Get-RemoteHttpsUrl {
  $remoteUrl = (git remote get-url origin).Trim()
  if (-not $remoteUrl) {
    Fail "origin remote URL을 찾을 수 없습니다."
  }
  return $remoteUrl
}

function Get-WebRepoUrl([string]$remoteUrl) {
  if ($remoteUrl -match "^https://github\.com/(?<owner>[^/]+)/(?<repo>[^/]+?)(?:\.git)?$") {
    return "https://github.com/$($Matches.owner)/$($Matches.repo)"
  }

  if ($remoteUrl -match "^git@github\.com:(?<owner>[^/]+)/(?<repo>[^/]+?)(?:\.git)?$") {
    return "https://github.com/$($Matches.owner)/$($Matches.repo)"
  }

  Fail "GitHub 저장소 URL 형식을 인식할 수 없습니다: $remoteUrl"
}

function Test-GhInstalled {
  $gh = Get-Command gh -ErrorAction SilentlyContinue
  if (-not $gh) {
    Write-Warning "gh CLI가 설치되어 있지 않습니다. 설치 후 다시 실행하세요."
    return $false
  }

  return $true
}

function Test-GhAuth {
  & gh auth status 1>$null 2>$null
  if ($LASTEXITCODE -ne 0) {
    Write-Warning "gh 인증이 필요합니다. 먼저 'gh auth login'을 실행하세요."
    return $false
  }

  return $true
}

$branch = (git branch --show-current).Trim()
if (-not $branch) {
  Fail "현재 브랜치를 확인할 수 없습니다."
}
if ($branch -eq $Base) {
  Fail "현재 브랜치가 '$Base'입니다. task 브랜치에서 실행하세요."
}

git push origin $branch
if ($LASTEXITCODE -ne 0) {
  Fail "브랜치 push에 실패했습니다."
}

$canUseGh = (Test-GhInstalled) -and (Test-GhAuth)

if ($canUseGh) {
  $viewOutput = & gh pr view --json number,url,headRefName 2>$null
  if ($LASTEXITCODE -eq 0 -and $viewOutput) {
    $existing = $viewOutput | ConvertFrom-Json
    if ($existing.url) {
      Write-Host "기존 PR이 있습니다: $($existing.url)"
      exit 0
    }
  }

  & gh pr create --base $Base --head $branch --fill
  if ($LASTEXITCODE -eq 0) {
    exit 0
  }
}

$repoUrl = Get-WebRepoUrl (Get-RemoteHttpsUrl)
Write-Warning "gh PR 생성 실패. 아래 링크에서 수동 생성하세요:"
Write-Host "$repoUrl/pull/new/$branch"
exit 1
