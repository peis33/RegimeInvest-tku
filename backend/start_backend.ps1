$ErrorActionPreference = "Stop"

$backendDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$pythonPath = Join-Path $backendDir ".python312embed\python.exe"

if (-not (Test-Path -LiteralPath $pythonPath -PathType Leaf)) {
    throw "找不到 StockApp 專用 Python 3.12：$pythonPath"
}

Set-Location -LiteralPath $backendDir
& $pythonPath -m uvicorn app.main:app --host 0.0.0.0 --port 8000
