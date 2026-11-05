# Runs test/integration in Antigravity IDE with a throwaway profile. The normal profile is not touched.
param([string]$Out = (Join-Path $env:TEMP 'md-reader-test-result.json'))
$root = Split-Path $PSScriptRoot -Parent
$profileDir = Join-Path $env:TEMP "md-reader-test-profile-$(Get-Random)"
$exe = Join-Path $env:LOCALAPPDATA 'Programs\Antigravity IDE\Antigravity IDE.exe'
if (Test-Path $Out) { Remove-Item $Out }
$env:HIT_TEST_OUT = $Out
# Set when this script starts from an editor terminal or agent; it would make the exe run as plain node.
Remove-Item Env:ELECTRON_RUN_AS_NODE -ErrorAction SilentlyContinue
$arguments = @(
  "--user-data-dir=`"$profileDir\data`"",
  "--extensions-dir=`"$profileDir\ext`"",
  '--new-window', '--disable-workspace-trust', '--skip-welcome', '--skip-release-notes',
  "--extensionDevelopmentPath=`"$root`"",
  "--extensionTestsPath=`"$root\test\integration\index.js`""
)
$process = Start-Process -FilePath $exe -ArgumentList $arguments -PassThru
if (-not $process.WaitForExit(120000)) { Write-Output 'timed out after 120 s'; $process.Kill() }
if (Test-Path $Out) { Get-Content $Out -Raw -Encoding UTF8 } else { Write-Output 'no result file' }
Remove-Item $profileDir -Recurse -Force -ErrorAction SilentlyContinue
