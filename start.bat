@echo off
chcp 65001 >nul
title Music Game - Launcher

echo.
echo  Building client...
echo.

set PATH=C:\Program Files\nodejs;%PATH%

:: Kill any existing node process on port 3000
for /f "tokens=5" %%a in ('netstat -aon 2^>nul ^| findstr ":3000 "') do (
    taskkill /PID %%a /F >nul 2>&1
)
timeout /t 1 /nobreak >nul

:: Build client
cd /d "%~dp0client"
call npm run build
if errorlevel 1 (
    echo.
    echo  BUILD FAILED!
    pause
    exit /b 1
)

:: Open server in its own window
start "Music Game Server" "%~dp0run-server.bat"

timeout /t 4 /nobreak >nul
echo.
echo  Server is running!
timeout /t 3 /nobreak >nul
