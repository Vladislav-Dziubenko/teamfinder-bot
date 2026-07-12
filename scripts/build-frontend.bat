@echo off
setlocal
cd /d "%~dp0..\web-src"

if not exist package.json (
  echo web-src not found
  exit /b 1
)

call npm ci
if errorlevel 1 exit /b 1

call npm run build
if errorlevel 1 exit /b 1

if not exist out (
  echo Next.js export folder "out" not found
  exit /b 1
)

robocopy out ..\webapp\static /MIR /NFL /NDL /NJH /NJS /nc /ns /np >nul
echo Frontend copied to webapp/static
exit /b 0
