@echo off
setlocal
cd /d "%~dp0"
echo ==============================================================
echo       MTM2 Handball & Kinematics Studio - Windows Installer
echo ==============================================================
powershell -ExecutionPolicy Bypass -Command " = New-Object -ComObject WScript.Shell;  = .CreateShortcut([IO.Path]::Combine([Environment]::GetFolderPath('Desktop'), 'MTM2 Handball Studio.lnk')); .TargetPath = '%~dp0Start-MTM2.bat'; .WorkingDirectory = '%~dp0'; .IconLocation = '%~dp0icon.ico'; .Description = 'MTM2 ?????? ??????????? ? ???????? ??????'; .Save();"
echo [SUCCESS] Desktop shortcut 'MTM2 Handball Studio' created!
timeout /t 2 /nobreak >nul
start "" "%~dp0Start-MTM2.bat"
exit /b 0
