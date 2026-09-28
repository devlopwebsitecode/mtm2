@echo off
title Stopping MTM2 Server...
for /f "tokens=5" %%a in ('netstat -aon ^| find ":3050" ^| find "LISTENING"') do (
    taskkill /f /pid %%a >nul 2>nul
)
echo MTM2 background server stopped.
timeout /t 1 /nobreak >nul
exit /b 0
