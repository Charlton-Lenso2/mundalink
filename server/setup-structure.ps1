<#
  Setup helper: creates the MundaLink server directory structure.
  Run from the repo root: C:\Users\CEO\MundaLink
#>
$root = $PSScriptRoot  # server/ directory
$dirs = @(
  "src",
  "src/modules",
  "src/middleware",
  "src/routes",
  "src/config",
  "src/types",
  "prisma",
  "tests",
  "docs",
  "scripts"
)
foreach ($d in $dirs) {
  $path = Join-Path $root $d
  if (-not (Test-Path $path)) {
    New-Item -ItemType Directory -Path $path -Force | Out-Null
    Write-Host "created: $path"
  }
}
Write-Host "Structure ready."

