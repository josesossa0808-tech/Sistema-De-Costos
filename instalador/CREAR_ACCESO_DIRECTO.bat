@echo off
REM SISTEMA DE COSTOS - Crea el acceso directo "Sistema de Costos" en el escritorio y en el menu Inicio
chcp 65001 >nul
cd /d "%~dp0.."
powershell -NoProfile -ExecutionPolicy Bypass -Command ^
  "$s = New-Object -ComObject WScript.Shell;" ^
  "$dir = (Get-Location).Path;" ^
  "$destinos = @([Environment]::GetFolderPath('Desktop'), [Environment]::GetFolderPath('Programs'));" ^
  "foreach ($d in $destinos) {" ^
  "  $l = $s.CreateShortcut((Join-Path $d 'Sistema de Costos.lnk'));" ^
  "  $l.TargetPath = (Join-Path $dir 'instalador\INICIAR_SISTEMA.bat');" ^
  "  $l.WorkingDirectory = $dir;" ^
  "  $l.IconLocation = (Join-Path $dir 'instalador\icono.ico');" ^
  "  $l.Description = 'Sistema de Costos';" ^
  "  $l.Save() }"
if errorlevel 1 (
  echo No se pudo crear el acceso directo.
) else (
  echo Listo: ya tiene el acceso directo "Sistema de Costos" en el escritorio y en el menu Inicio.
)
pause
