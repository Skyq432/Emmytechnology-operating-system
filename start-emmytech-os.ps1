$ErrorActionPreference = "Stop"
Write-Host "Starting EmmyTech OS..." -ForegroundColor Blue

if (-not (Test-Path "node_modules")) {
    Write-Host "Installing packages for the first run..." -ForegroundColor Yellow
    npm install
}

if (Get-Command code -ErrorAction SilentlyContinue) {
    code EmmyTech-OS.code-workspace
} else {
    Write-Host "VS Code 'code' command was not found. Open this folder manually in VS Code." -ForegroundColor Yellow
}

Write-Host "Opening EmmyTech OS at http://localhost:3000" -ForegroundColor Green
Start-Process "http://localhost:3000"
npm run dev
