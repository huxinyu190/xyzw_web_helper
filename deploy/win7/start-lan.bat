@echo off
setlocal
cd /d "%~dp0"

if not exist "web\index.html" (
  echo [ERROR] web\index.html not found.
  pause
  exit /b 1
)
if not exist "node\node.exe" (
  echo [ERROR] node\node.exe not found.
  pause
  exit /b 1
)

echo ============================================
echo   XYZW Web Helper - LAN mode, port 8080
echo   Other devices: http://YOUR-PC-IP:8080/
echo   Keep this window open. Press Ctrl+C to stop.
echo ============================================
echo.

"node\node.exe" server.js --port 8080 --host 0.0.0.0

echo.
echo Server stopped.
pause
