@echo off
setlocal
cd /d "%~dp0"

if not exist "server.pid" (
  echo Server is not running ^(no server.pid^).
  pause
  exit /b 0
)

set /p PID=<server.pid
echo Stopping PID %PID% ...
taskkill /PID %PID% /F >nul 2>&1
if exist server.pid del /q server.pid
echo Done.
pause
