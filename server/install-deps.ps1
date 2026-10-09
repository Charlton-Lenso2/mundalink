<#
  Bounded npm install for MundaLink server dependencies.
  Uses cmd.exe to run npm with stdout+stderr redirected to one log file.
#>
$ErrorActionPreference = "Stop"
$root = $PSScriptRoot
$log = Join-Path $root "npm-install.log"
$status = Join-Path $root "npm-install-status.txt"
$cmd = "cd /d `"$root\server`" && npm install --no-audit --no-fund prisma @prisma/client firebase-admin > `"$log`" 2>&1"
$proc = Start-Process -FilePath "cmd.exe" -ArgumentList "/c $cmd" -NoNewWindow -PassThru
$proc.WaitForExit()
"$([DateTime]::UtcNow.ToString('o')) EXIT=$($proc.ExitCode)" | Out-File -FilePath $status -Encoding ascii
exit $proc.ExitCode
