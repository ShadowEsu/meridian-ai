# Publish Meridian 2.0 to your GitHub (one-time setup)
#
# Prerequisites:
#   1. GitHub account logged in:  gh auth login
#   2. On branch main with latest commits
#
# Run from repo root:
#   powershell -ExecutionPolicy Bypass -File scripts/publish-github.ps1

$ErrorActionPreference = "Stop"
Set-Location (Split-Path $PSScriptRoot -Parent)

Write-Host "`n=== Meridian 2.0 → GitHub ===" -ForegroundColor Cyan

# Ensure gh is authenticated
$ghOk = $false
try {
  gh auth status 2>$null | Out-Null
  $ghOk = $LASTEXITCODE -eq 0
} catch {}

if (-not $ghOk) {
  Write-Host "`nGitHub CLI is not logged in." -ForegroundColor Yellow
  Write-Host "Run this first, then re-run this script:`n"
  Write-Host "  gh auth login`n" -ForegroundColor White
  exit 1
}

$username = (gh api user -q .login)
Write-Host "Logged in as: $username"

# Create public repo (skip if exists)
$repoName = "Meridian2.0"
$exists = gh repo view "$username/$repoName" 2>$null
if ($LASTEXITCODE -ne 0) {
  Write-Host "Creating public repo $username/$repoName ..."
  gh repo create $repoName --public --description "Meridian 2.0 - AI cost intelligence dashboard" --source=. --remote=origin-new
} else {
  Write-Host "Repo $username/$repoName already exists."
  git remote remove origin-new 2>$null
  git remote add origin-new "https://github.com/$username/$repoName.git"
}

# Push main branch
git checkout main
git push -u origin-new main --force

Write-Host "`nDone!" -ForegroundColor Green
Write-Host "Repo: https://github.com/$username/$repoName"
Write-Host "`nNext: Render → New Blueprint → connect $username/$repoName → branch main"
Write-Host "See docs/WEB_PUBLISH.md for env vars and Google OAuth.`n"
