$ErrorActionPreference = "Stop"
$serverRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
Set-Location $serverRoot

if (-not (Test-Path ".venv\Scripts\python.exe")) {
  python -m venv .venv
}

& ".venv\Scripts\python.exe" -m pip install -r requirements.txt
& ".venv\Scripts\python.exe" -m uvicorn app:app --host 0.0.0.0 --port 8765

