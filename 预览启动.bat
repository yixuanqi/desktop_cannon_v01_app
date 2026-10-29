@echo off
cd /d "%~dp0"
start "" "http://127.0.0.1:1420/preview.html"
npm run preview
pause
