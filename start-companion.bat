@echo off
rem DS5 Dongle BL618 companion app launcher
setlocal
cd /d "%~dp0companion"

rem ---- locate Node.js even if explorer's PATH is stale (fresh installs) ----
set "NODE_DIR="
if exist "C:\Program Files\nodejs\npm.cmd" set "NODE_DIR=C:\Program Files\nodejs"
if "%NODE_DIR%"=="" if exist "%ProgramFiles(x86)%\nodejs\npm.cmd" set "NODE_DIR=%ProgramFiles(x86)%\nodejs"
if "%NODE_DIR%"=="" if exist "%LOCALAPPDATA%\Programs\nodejs\npm.cmd" set "NODE_DIR=%LOCALAPPDATA%\Programs\nodejs"
if not "%NODE_DIR%"=="" set "PATH=%NODE_DIR%;%PATH%"

where npm >nul 2>nul
if errorlevel 1 (
    echo.
    echo [start] Node.js not found. Install it from https://nodejs.org
    echo         then close this window and double-click the launcher again.
    echo.
    pause
    exit /b 1
)

if not exist "node_modules\node-hid" (
    echo [start] Installing dependencies (first run only, may take a while)...
    call npm install --no-audit --no-fund
    if errorlevel 1 goto :error
    rem npm 11 blocks postinstall scripts (electron/esbuild/node-hid binaries)
    call npm approve-scripts --all >nul 2>nul
    call npm rebuild
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
