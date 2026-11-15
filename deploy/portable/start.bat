@echo off
setlocal
cd /d "%~dp0"

if not exist "web\index.html" (
  echo [ERROR] web\index.html not found.
  echo         Copy the built dist files into the "web" folder first.
  pause
  exit /b 1
)
if not exist "node\node.exe" (
  echo [ERROR] node\node.exe not found.
  echo         Put the portable Node.js files into the "node" folder.
  echo         (the zip should already contain them)
  pause
  exit /b 1
)

echo ============================================
echo   XYZW Web Helper - starting on port 8080
echo   Tip: run.vbs starts silently and opens the browser.
echo   Keep this window open. Press Ctrl+C to stop.
echo ============================================
echo.

"node\node.exe" server.js --port 8080

echo.
echo Server stopped.
pause
