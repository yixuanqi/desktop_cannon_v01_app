@echo off
cd /d "%~dp0"
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\check_old_cannon.ps1"
if errorlevel 1 (
  echo [ERROR] Old Desktop Cannon process still running. Close it and retry.
  pause
  exit /b 7
)
if not exist node_modules call npm install
npm run dev
pause
