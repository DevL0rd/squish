@echo off
cd /d "%~dp0"
where npm >nul 2>nul || (
  echo Node.js is not installed. Install version 22.18 or newer from https://nodejs.org and run this again.
  exit /b 1
)
call npm install || exit /b 1
echo Setup done. Run start.cmd to play.
