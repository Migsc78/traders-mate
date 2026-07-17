# Restore local dump → Railway Postgres, then point local .env at Railway.
# Usage (PowerShell):
#   $env:RAILWAY_DATABASE_URL = "postgresql://..."   # from Railway Postgres Variables
#   .\scripts\migrate-local-to-railway.ps1

$ErrorActionPreference = "Stop"
$root = Split-Path -Parent $PSScriptRoot
$dump = Join-Path $root ".tmp\tradersmate.dump"

if (-not $env:RAILWAY_DATABASE_URL) {
  Write-Error "Set RAILWAY_DATABASE_URL to your Railway Postgres URL first."
}

if (-not (Test-Path $dump)) {
  Write-Error "Missing dump at $dump — create it with pg_dump first."
}

# Prefer public URL; strip prisma query params if present
$url = $env:RAILWAY_DATABASE_URL -replace '\?schema=public$', ''

Write-Host "Restoring dump into Railway..."
docker run --rm -v "${root}/.tmp:/dump" postgres:16-alpine `
  pg_restore --clean --if-exists --no-owner --no-acl -d $url /dump/tradersmate.dump

Write-Host "Done. Update server/.env DATABASE_URL to the same Railway URL, then stop using local Docker for TradiesMate."
