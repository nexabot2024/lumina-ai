@echo off
setlocal
title Iniciador de Lumina AI

REM Cierra solo instancias anteriores del propio sistema.
for /f "tokens=5" %%P in ('netstat -ano ^| findstr ":5000" ^| findstr "LISTENING"') do taskkill /F /PID %%P >nul 2>&1
for /f "tokens=5" %%P in ('netstat -ano ^| findstr ":5174" ^| findstr "LISTENING"') do taskkill /F /PID %%P >nul 2>&1

cd /d "%~dp0"
npm run dev

endlocal
