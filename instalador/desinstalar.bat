@echo off
REM SISTEMA DE COSTOS - Desinstalacion (Windows)
net session >nul 2>&1
if %errorlevel% neq 0 (
  powershell -NoProfile -Command "Start-Process -FilePath '%~f0' -Verb RunAs"
  exit /b
)
cd /d "%~dp0.."
echo Se detendra y eliminara el servicio de base de datos del Sistema de Costos
echo y los accesos directos.
choice /M "Desea continuar"
if errorlevel 2 exit /b
sc stop SistemaCostosMySQL >nul 2>&1
timeout /t 3 >nul
sc delete SistemaCostosMySQL >nul 2>&1
del "%PUBLIC%\Desktop\Sistema de Costos.lnk" >nul 2>&1
rmdir /S /Q "%ProgramData%\Microsoft\Windows\Start Menu\Programs\Sistema de Costos" >nul 2>&1
echo.
choice /M "Desea BORRAR tambien todos los datos (base de datos, reportes) y la carpeta %CD%"
if errorlevel 2 (
  echo Los datos se conservaron en %CD%
  pause & exit /b
)
echo Borrando archivos... Sistema de Costos desinstalado.
timeout /t 2 >nul
cd /d "%TEMP%" & rmdir /S /Q "%~dp0.." & exit /b
