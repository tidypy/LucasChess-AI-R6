@echo off
cd /d "%~dp0"
set "PATH=C:\Users\Dev\.cargo\bin;C:\Program Files\nodejs;%PATH%"

echo ===================================================
echo   Starting DeepScout Chess (FastAPI + Tauri Desktop)
echo ===================================================

:: 1. Start FastAPI Sidecar in background window
start "DeepScout Python Sidecar" cmd /k ".\.venv\Scripts\python.exe -m uvicorn core.api.main:app --port 8000 --reload"

:: 2. Launch Tauri Desktop Application
npm run tauri dev

pause
