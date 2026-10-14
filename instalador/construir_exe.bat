@echo off
REM =====================================================================
REM  Genera SistemaCostos.exe con PyInstaller y, si Inno Setup está
REM  instalado, el instalador Instalar_SistemaCostos.exe
REM  Ejecutar en Windows después de instalar.bat
REM =====================================================================
chcp 65001 >nul
cd /d "%~dp0.."
if not exist ".venv\Scripts\python.exe" ( echo Primero ejecute instalador\instalar.bat & pause & exit /b 1 )
".venv\Scripts\python.exe" -m pip install pyinstaller
".venv\Scripts\python.exe" -m PyInstaller --noconfirm --clean instalador\SistemaCostos.spec
if errorlevel 1 ( echo ERROR generando el ejecutable & pause & exit /b 1 )

REM Copia la configuración y carpetas de trabajo junto al .exe
xcopy /E /I /Y config dist\SistemaCostos\config >nul
xcopy /E /I /Y docs dist\SistemaCostos\docs >nul
if not exist dist\SistemaCostos\logs mkdir dist\SistemaCostos\logs
if not exist dist\SistemaCostos\database mkdir dist\SistemaCostos\database
if not exist dist\SistemaCostos\reportes_generados mkdir dist\SistemaCostos\reportes_generados
echo.
echo  Ejecutable listo en: dist\SistemaCostos\SistemaCostos.exe

set ISCC="%ProgramFiles(x86)%\Inno Setup 6\ISCC.exe"
if exist %ISCC% (
  %ISCC% instalador\SistemaCostos.iss
  echo  Instalador listo en: instalador\Output\Instalar_SistemaCostos.exe
) else (
  echo  Inno Setup 6 no está instalado: se omitió el instalador. Descárguelo de jrsoftware.org
)
pause
