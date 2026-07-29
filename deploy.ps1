# deploy.ps1 — roda no PowerShell para commitar e pushear frontend + backend
# Uso: .\deploy.ps1 "mensagem do commit"
# Exemplo: .\deploy.ps1 "feat: nova funcionalidade"

param(
    [string]$Mensagem = "chore: atualizacao"
)

$ErrorActionPreference = "Stop"
$Root = Split-Path -Parent $MyInvocation.MyCommand.Path

function Push-Repo {
    param([string]$Pasta, [string]$Nome)

    Write-Host ""
    Write-Host "=== $Nome ===" -ForegroundColor Cyan
    Set-Location "$Root\$Pasta"

    # Remover lock file se existir
    $lockFile = ".git\index.lock"
    if (Test-Path $lockFile) {
        Remove-Item $lockFile -Force
        Write-Host "  [ok] index.lock removido" -ForegroundColor Yellow
    }

    # Verificar se há algo para commitar
    $status = git status --porcelain 2>&1
    if (-not $status) {
        Write-Host "  Nada para commitar em $Nome" -ForegroundColor Gray
        return
    }

    Write-Host "  Arquivos alterados:" -ForegroundColor Gray
    $status | ForEach-Object { Write-Host "    $_" -ForegroundColor Gray }

    git add -A
    if ($LASTEXITCODE -ne 0) { throw "Erro no git add ($Nome)" }

    git commit -m $Mensagem
    if ($LASTEXITCODE -ne 0) { throw "Erro no git commit ($Nome)" }

    Write-Host "  Fazendo push..." -ForegroundColor Gray
    git push
    if ($LASTEXITCODE -ne 0) { throw "Erro no git push ($Nome)" }

    Write-Host "  [ok] Push concluido!" -ForegroundColor Green
}

try {
    Push-Repo "frontend" "FRONTEND  →  Vercel"
    Push-Repo "backend"  "BACKEND   →  Railway"

    Write-Host ""
    Write-Host "Deploy finalizado!" -ForegroundColor Green
    Write-Host "Vercel e Railway vao fazer o deploy automaticamente." -ForegroundColor Gray
}
catch {
    Write-Host ""
    Write-Host "ERRO: $_" -ForegroundColor Red
    exit 1
}
