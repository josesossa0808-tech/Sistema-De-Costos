@echo off
REM SISTEMA DE COSTOS - Inicia el sistema (use el acceso directo del escritorio)
chcp 65001 >nul
cd /d "%~dp0.."
title Sistema de Costos - no cierre esta ventana mientras usa el sistema
if not exist ".venv\Scripts\python.exe" (
  echo El sistema no esta instalado. Ejecute instalador\INSTALAR_TODO.bat
  pause & exit /b 1
)
findstr /R /C:"^motor *= *mysql" config\config.ini >nul
if %errorlevel%==0 (
  sc query SistemaCostosMySQL | find "RUNNING" >nul
  if errorlevel 1 (
    echo Iniciando la base de datos MySQL...
    net start SistemaCostosMySQL >nul 2>&1
    if errorlevel 1 (
      echo No se pudo iniciar el servicio MySQL. Abra este acceso como administrador
      echo o inicie el servicio "SistemaCostosMySQL" desde services.msc
      pause & exit /b 1
    )
  )
)
".venv\Scripts\python.exe" backend\app.py
pause
