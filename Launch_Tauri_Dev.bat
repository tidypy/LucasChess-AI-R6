@echo off
cd /d "%~dp0"
set "PATH=C:\Users\Dev\.cargo\bin;C:\Program Files\nodejs;%PATH%"
echo ========================================
echo Launching DeepScout Chess (Tauri + React)
echo ========================================
npm run tauri dev
pause
