@echo off
REM SISTEMA DE COSTOS - Importa la plantilla de costeo en Excel (datos\Costeo_Deligaby.xlsx)
REM Uso: doble clic. Para otro archivo con el mismo formato, arrastrelo sobre este .bat
chcp 65001 >nul
cd /d "%~dp0.."
set PY=python
if exist ".venv\Scripts\python.exe" set PY=.venv\Scripts\python.exe
if "%~1"=="" (
  "%PY%" herramientas\importar_excel.py
) else (
  "%PY%" herramientas\importar_excel.py "%~1"
)
if errorlevel 1 (
  echo.
  echo Si la empresa ya existe y quiere cargarla de nuevo, ejecute:
  echo   "%PY%" herramientas\importar_excel.py --reemplazar
)
echo.
pause
