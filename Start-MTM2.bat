@echo off
setlocal enabledelayedexpansion
title MTM2 Handball & Kinematics Studio
cd /d "%~dp0"

set "NODE_CMD="
if exist "%~dp0runtime\node.exe" (
    set "NODE_CMD=%~dp0runtime\node.exe"
) else (
    where node >nul 2>nul
    if !errorlevel! equ 0 (
        set "NODE_CMD=node"
    )
)

if "%NODE_CMD%"=="" (
    echo [ERROR] Node.js runtime not found!
    pause
    exit /b 1
)

start "MTM2-Server" /min "%NODE_CMD%" "%~dp0server.js"
timeout /t 2 /nobreak >nul

set "APP_URL=http://localhost:3050"

if exist "%ProgramFiles(x86)%\Microsoft\Edge\Application\msedge.exe" (
    start "" "%ProgramFiles(x86)%\Microsoft\Edge\Application\msedge.exe" --app="%APP_URL%" --window-size=1280,820
    exit /b 0
)

if exist "%ProgramFiles%\Microsoft\Edge\Application\msedge.exe" (
    start "" "%ProgramFiles%\Microsoft\Edge\Application\msedge.exe" --app="%APP_URL%" --window-size=1280,820
    exit /b 0
)

start "" "%APP_URL%"
exit /b 0
