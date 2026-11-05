# Publishes release/md-reader-rtl.vsix to Open VSX, the registry Antigravity and Cursor read.
# Needs OVSX_PAT in the environment or in the file given by -EnvFile. The token is never printed.
param([string]$EnvFile = (Join-Path $PSScriptRoot '..\..\..\.env'))
$ErrorActionPreference = 'Stop'
$root = Split-Path $PSScriptRoot -Parent
Set-Location $root

$token = $env:OVSX_PAT
if (-not $token -and (Test-Path $EnvFile)) {
  $line = Select-String -Path $EnvFile -Pattern '^\s*OVSX_PAT\s*=\s*(.+?)\s*$' | Select-Object -First 1
  if ($line) { $token = $line.Matches[0].Groups[1].Value.Trim('"', "'") }
}
if (-not $token) { throw 'OVSX_PAT was not found. Add it to the .env file, then run this again.' }

$publisher = (Get-Content package.json -Raw | ConvertFrom-Json).publisher
$env:OVSX_PAT = $token

# Creating the namespace fails harmlessly when it already exists.
& npx ovsx create-namespace $publisher 2>&1 | ForEach-Object { "$_" }
& npx ovsx publish release\md-reader-rtl.vsix
if ($LASTEXITCODE -ne 0) { throw "ovsx publish failed with exit code $LASTEXITCODE" }
Write-Output "Published: https://open-vsx.org/extension/$publisher/md-reader-rtl"
