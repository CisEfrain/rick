# Rick Voice Agent — Dev launcher (PowerShell)
# Starts bridge + node-client together

$ErrorActionPreference = "Stop"

$root = Split-Path -Parent (Split-Path -Parent $PSScriptRoot)

Write-Host "Starting Rick Voice Agent dev environment..." -ForegroundColor Cyan
Write-Host "  Server: apps/bridge" -ForegroundColor Gray
Write-Host "  Client: apps/node-client" -ForegroundColor Gray
Write-Host ""

Set-Location $root
npm run dev
