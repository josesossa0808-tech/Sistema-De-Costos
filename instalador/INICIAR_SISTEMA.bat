@echo off
REM SISTEMA DE COSTOS - Inicia el sistema desde esta carpeta (lo usa el acceso directo del escritorio)
chcp 65001 >nul
cd /d "%~dp0.."
title Sistema de Costos - no cierre esta ventana mientras usa el sistema

REM Instalado con instalador\INSTALAR_TODO.bat: usa su entorno de Python y su base MySQL
if exist ".venv\Scripts\python.exe" (
  call "instalador\iniciar.bat"
  exit /b
)

REM Sin instalar: usa el Python del equipo y la base SQLite incluida
where python >nul 2>&1
if errorlevel 1 (
  echo No se encontro Python en este equipo.
  echo Ejecute instalador\INSTALAR_TODO.bat para instalar todo automaticamente,
  echo o instale Python 3.10+ desde https://www.python.org marcando "Add Python to PATH".
  pause
  exit /b 1
)
python -c "import flask, waitress, openpyxl, reportlab" >nul 2>&1
if errorlevel 1 (
  echo Instalando librerias necesarias ^(solo la primera vez^)...
  python -m pip install -r backend\requirements.txt -q --disable-pip-version-check
)
python backend\app.py
pause
