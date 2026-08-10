@echo off
rem DS5 Dongle BL618 companion app launcher
cd /d "%~dp0companion"

if not exist "node_modules\node-hid" (
    echo [start] Installing dependencies (first run only)...
    call npm install --no-audit --no-fund
    if errorlevel 1 goto :error
)

echo [start] Building app...
call npm run build
if errorlevel 1 goto :error

echo [start] Launching DS5 Dongle Config...
call npm run dev
goto :eof

:error
echo.
echo [start] Something failed. See the messages above.
pause
