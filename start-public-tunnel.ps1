$ErrorActionPreference = "Stop"
$projectRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
$cloudflared = Join-Path $projectRoot ".tools\cloudflared.exe"

if (-not (Test-Path -LiteralPath $cloudflared)) {
  throw "Cloudflare Tunnel nao encontrado. Execute a instalacao do projeto novamente."
}

try {
  $health = Invoke-RestMethod -Uri "http://127.0.0.1:8765/api/health" -TimeoutSec 5
  if (-not $health.ok) { throw "Motor incompleto." }
} catch {
  throw "Inicie primeiro o motor com npm run dev:full."
}

Write-Host "Abrindo um endereco HTTPS publico para o motor 3D..."
Write-Host "Mantenha esta janela aberta. O endereco muda quando o tunel reinicia."
& $cloudflared tunnel --no-autoupdate --url http://127.0.0.1:8765
