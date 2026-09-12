$ErrorActionPreference = "Stop"

$frontendDir = Split-Path -Parent $MyInvocation.MyCommand.Path
Set-Location -LiteralPath $frontendDir
$env:BROWSER = "none"

npm run web -- --host lan
