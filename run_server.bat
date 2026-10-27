@echo off
title Steady Rabbit Console Server
cd /d "%~dp0"
echo ===================================================
echo   Steady Rabbit Console
echo   Running at: http://localhost:5000
echo ===================================================
node server.js
pause
