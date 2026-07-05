@echo off
setlocal

cd /d "%~dp0"

where node >nul 2>nul
if errorlevel 1 (
  echo Node.js was not found.
  echo.
  echo Patchwright API mode needs Node.js.
  echo Install the LTS version from https://nodejs.org/
  echo.
  pause
  exit /b 1
)

set PORT=8787

echo Starting Patchwright...
echo URL: http://127.0.0.1:%PORT%
echo.

if not "%PATCHWRIGHT_NO_BROWSER%"=="1" start "" "http://127.0.0.1:%PORT%"

node server.js

echo.
echo Patchwright stopped.
pause
