@echo off
REM =====================================================================
REM  SISTEMA DE COSTOS - Instalación desde código fuente (Windows)
REM  Requisito previo: Python 3.10+ instalado. La base de datos es SQLite (no requiere instalación).
REM =====================================================================
chcp 65001 >nul
setlocal
cd /d "%~dp0.."
title Instalación - Sistema de Costos

echo.
echo  [1/4] Verificando Python...
where python >nul 2>nul
if errorlevel 1 (
  echo  ERROR: No se encontró Python. Instálelo desde python.org marcando "Add Python to PATH".
  pause & exit /b 1
)
python --version

echo.
echo  [2/4] Creando entorno virtual (.venv)...
if not exist ".venv\Scripts\python.exe" python -m venv .venv
if errorlevel 1 ( echo  ERROR creando el entorno virtual. & pause & exit /b 1 )

echo.
echo  [3/4] Instalando dependencias...
".venv\Scripts\python.exe" -m pip install --upgrade pip
".venv\Scripts\python.exe" -m pip install -r backend\requirements.txt
if errorlevel 1 ( echo  ERROR instalando dependencias. Revise su conexión. & pause & exit /b 1 )

echo.
echo  [4/4] Creando la base de datos (database\sistema_costos.db)...
".venv\Scripts\python.exe" backend\app.py --init-bd
if errorlevel 1 (
  echo.
  echo  No se pudo crear la base de datos. Verifique que la carpeta database
  echo  permita escritura y revise logs\sistema.log. Luego ejecute de nuevo.
  pause & exit /b 1
)

echo.
echo  =====================================================
echo   Instalación terminada. Para abrir el sistema use:
echo     instalador\iniciar.bat
echo   Usuario inicial: admin  /  Contraseña: Admin123*
echo   (cámbiela al ingresar)
echo  =====================================================
pause
