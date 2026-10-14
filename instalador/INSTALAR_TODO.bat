@echo off
REM =====================================================================
REM  SISTEMA DE COSTOS - Instalacion completa (Windows 10/11)
REM  Doble clic aqui. Instala Python, MySQL, la base de datos y el sistema.
REM =====================================================================
net session >nul 2>&1
if %errorlevel% neq 0 (
  echo Solicitando permisos de administrador...
  powershell -NoProfile -Command "Start-Process -FilePath '%~f0' -Verb RunAs"
  exit /b
)
cd /d "%~dp0.."
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0instalar_todo.ps1"
