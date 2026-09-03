$ErrorActionPreference = "Stop"
$projectRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
Set-Location $projectRoot

$healthUrl = "http://127.0.0.1:8765/api/health"
$engineReady = $false
try {
  $health = Invoke-RestMethod -Uri $healthUrl -TimeoutSec 2
  $engineReady = [bool]$health.ok
} catch {
  $engineReady = $false
}

if (-not $engineReady) {
  $serverScript = Join-Path $projectRoot "server\start.ps1"
  Start-Process -FilePath "powershell.exe" `
    -ArgumentList @("-NoProfile", "-ExecutionPolicy", "Bypass", "-File", "`"$serverScript`"") `
    -WorkingDirectory (Join-Path $projectRoot "server") `
    -WindowStyle Hidden

  Write-Host "Iniciando o motor de reconstrução..."
  for ($attempt = 0; $attempt -lt 60; $attempt++) {
    Start-Sleep -Milliseconds 500
    try {
      $health = Invoke-RestMethod -Uri $healthUrl -TimeoutSec 2
      if ($health.ok) {
        $engineReady = $true
        break
      }
    } catch {
      # O ambiente Python pode estar sendo preparado na primeira execução.
    }
  }
}

if (-not $engineReady) {
  throw "O motor 3D não iniciou. Execute .\server\start.ps1 para ver o diagnóstico."
}

Write-Host "Motor 3D pronto. Abrindo o aplicativo em http://localhost:3000"
npm run dev

