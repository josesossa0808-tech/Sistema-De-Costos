# =====================================================================
#  SISTEMA DE COSTOS - Instalador completo para Windows 10/11
#  Instala y deja funcionando: Python, MySQL Server 8.4 (instancia propia
#  del sistema como servicio de Windows), base de datos, dependencias,
#  accesos directos y arranque del sistema.
#
#  Uso: doble clic en instalador\INSTALAR_TODO.bat (pide permisos de administrador).
#  Requiere internet SOLO durante la instalacion (descarga Python y MySQL).
#  Para instalar sin internet, copie en la carpeta "instalador" el archivo
#  mysql-8.4.x-winx64.zip y el instalador python-3.12.x-amd64.exe.
# =====================================================================
param(
    [string]$Destino = "C:\SistemaCostos",
    [int]$PuertoMySQL = 3307
)

$ErrorActionPreference = "Stop"
$ProgressPreference = "SilentlyContinue"   # descargas mucho mas rapidas
[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12

$Origen      = Split-Path -Parent $PSScriptRoot
$Servicio    = "SistemaCostosMySQL"
$VersionesMySQL = @("8.4.11","8.4.12","8.4.13","8.4.14","8.4.15","8.4.10","8.4.9")
$PythonURL   = "https://www.python.org/ftp/python/3.12.10/python-3.12.10-amd64.exe"
$VCRedistURL = "https://aka.ms/vs/17/release/vc_redist.x64.exe"
$Log         = Join-Path $env:TEMP "instalacion_sistema_costos.log"

function Paso($n, $texto) { Write-Host ""; Write-Host "[$n/10] $texto" -ForegroundColor Cyan; Add-Content $Log "[$n] $texto" }
function Ok($texto)       { Write-Host "      OK  $texto" -ForegroundColor Green; Add-Content $Log "OK $texto" }
function Aviso($texto)    { Write-Host "      !   $texto" -ForegroundColor Yellow; Add-Content $Log "AVISO $texto" }
function Fallo($texto) {
    Write-Host ""; Write-Host "  ERROR: $texto" -ForegroundColor Red
    Write-Host "  Detalle en: $Log" -ForegroundColor Red
    Add-Content $Log "ERROR $texto"
    Read-Host "Presione Enter para cerrar"
    exit 1
}
function Descargar($url, $archivo) {
    Add-Content $Log "Descargando $url"
    Invoke-WebRequest -Uri $url -OutFile $archivo -UseBasicParsing -MaximumRedirection 10
}
function Existe-URL($url) {
    try { $r = Invoke-WebRequest -Uri $url -Method Head -UseBasicParsing -MaximumRedirection 10 -TimeoutSec 20; return ($r.StatusCode -eq 200) }
    catch { return $false }
}
function Nueva-Clave([int]$largo = 20) {
    $chars = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789".ToCharArray()
    $bytes = New-Object byte[] $largo
    [Security.Cryptography.RandomNumberGenerator]::Create().GetBytes($bytes)
    return -join ($bytes | ForEach-Object { $chars[$_ % $chars.Length] })
}
# Ejecuta un programa externo sin que sus mensajes en stderr detengan el script
# (en Windows PowerShell 5.1 con ErrorActionPreference=Stop, stderr se vuelve error).
# Guarda la salida en el log y devuelve el codigo de salida.
function Nativo {
    param([string]$Exe, [string[]]$Argumentos, [string]$Entrada = $null)
    $anterior = $ErrorActionPreference; $ErrorActionPreference = "Continue"
    try {
        if ($Entrada) { $salida = $Entrada | & $Exe @Argumentos 2>&1 } else { $salida = & $Exe @Argumentos 2>&1 }
        $codigo = $LASTEXITCODE
        $script:UltimaSalida = ($salida | ForEach-Object { "$_" }) -join "`n"
        Add-Content $Log $script:UltimaSalida
        return $codigo
    } catch { Add-Content $Log "$_"; $script:UltimaSalida = "$_"; return 1 }
    finally { $ErrorActionPreference = $anterior }
}

Clear-Host
Write-Host "=============================================================" -ForegroundColor White
Write-Host "   SISTEMA DE COSTOS - Instalacion completa" -ForegroundColor White
Write-Host "   Destino: $Destino" -ForegroundColor White
Write-Host "=============================================================" -ForegroundColor White
"Instalacion iniciada $(Get-Date)" | Set-Content $Log

# ---------------------------------------------------------------------
Paso 1 "Verificando permisos de administrador"
$admin = ([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
if (-not $admin) { Fallo "Ejecute instalador\INSTALAR_TODO.bat (se abre como administrador)." }
Ok "Permisos de administrador"

# ---------------------------------------------------------------------
Paso 2 "Copiando el sistema a $Destino"
if ((Resolve-Path $Origen).Path.TrimEnd('\') -ne $Destino.TrimEnd('\')) {
    New-Item -ItemType Directory -Force -Path $Destino | Out-Null
    $excluir = @(".venv", "mysql", "dist", "build", ".git")
    Get-ChildItem -Path $Origen -Force | Where-Object { $excluir -notcontains $_.Name } | ForEach-Object {
        Copy-Item -Path $_.FullName -Destination $Destino -Recurse -Force
    }
}
foreach ($d in "logs","reportes_generados","database") { New-Item -ItemType Directory -Force -Path (Join-Path $Destino $d) | Out-Null }
Ok "Archivos copiados"

# ---------------------------------------------------------------------
Paso 3 "Python 3.10 o superior"
function Buscar-Python {
    foreach ($cand in @("py -3", "python")) {
        try {
            $partes = @($cand.Split(" "))
            $argsPy = @()
            if ($partes.Count -gt 1) { $argsPy += $partes[1..($partes.Count-1)] }
            $argsPy += @("-c", "import sys;print('%d.%d|%s'%(sys.version_info[0],sys.version_info[1],sys.executable))")
            if (-not (Get-Command $partes[0] -ErrorAction SilentlyContinue)) { continue }
            $c = Nativo $partes[0] $argsPy
            $v = ($script:UltimaSalida -split "`n" | Where-Object { $_ -match "^\d+\.\d+\|" } | Select-Object -First 1)
            if ($c -eq 0 -and $v) {
                $ver, $exe = $v.Trim().Split("|")
                $mayor, $menor = $ver.Split(".")
                if ([int]$mayor -eq 3 -and [int]$menor -ge 10 -and $exe -notlike "*WindowsApps*") { return $exe }
            }
        } catch {}
    }
    foreach ($p in @("$env:ProgramFiles\Python312\python.exe", "$env:LOCALAPPDATA\Programs\Python\Python312\python.exe",
                     "$env:ProgramFiles\Python313\python.exe", "$env:ProgramFiles\Python311\python.exe")) {
        if (Test-Path $p) { return $p }
    }
    return $null
}
$python = Buscar-Python
if (-not $python) {
    $local = Get-ChildItem -Path $PSScriptRoot -Filter "python-3*-amd64.exe" -ErrorAction SilentlyContinue | Select-Object -First 1
    $inst = Join-Path $env:TEMP "python-instalador.exe"
    if ($local) { Copy-Item $local.FullName $inst -Force; Ok "Usando instalador local de Python" }
    else {
        Write-Host "      Descargando Python 3.12 ..."
        try { Descargar $PythonURL $inst } catch { Fallo "No se pudo descargar Python. Revise la conexion a internet." }
    }
    $p = Start-Process -FilePath $inst -ArgumentList "/quiet InstallAllUsers=1 PrependPath=1 Include_test=0 Include_launcher=1" -Wait -PassThru
    if ($p.ExitCode -ne 0) { Fallo "La instalacion de Python termino con codigo $($p.ExitCode)." }
    $env:Path = [Environment]::GetEnvironmentVariable("Path","Machine") + ";" + [Environment]::GetEnvironmentVariable("Path","User")
    $python = Buscar-Python
    if (-not $python) { Fallo "Python se instalo pero no se encontro. Reinicie el equipo y ejecute de nuevo." }
}
Ok "Python: $python"

# ---------------------------------------------------------------------
Paso 4 "Entorno de Python y dependencias"
$venvPy = Join-Path $Destino ".venv\Scripts\python.exe"
if (-not (Test-Path $venvPy)) {
    if ((Nativo $python @("-m","venv",(Join-Path $Destino ".venv"))) -ne 0) { Fallo "No se pudo crear el entorno virtual." }
}
Nativo $venvPy @("-m","pip","install","--upgrade","pip","--disable-pip-version-check","-q") | Out-Null
if ((Nativo $venvPy @("-m","pip","install","-r",(Join-Path $Destino "backend\requirements.txt"),"--disable-pip-version-check","-q")) -ne 0) {
    Fallo "No se pudieron instalar las dependencias de Python (revise internet)."
}
Ok "Flask, PyMySQL, waitress, openpyxl, reportlab instalados"

$usarSQLite = $false
$cfg = Join-Path $Destino "config\config.ini"
try {
# ---------------------------------------------------------------------
Paso 5 "Microsoft Visual C++ (requerido por MySQL)"
$vc = Get-ItemProperty "HKLM:\SOFTWARE\Microsoft\VisualStudio\14.0\VC\Runtimes\x64" -ErrorAction SilentlyContinue
if ($vc -and $vc.Installed -eq 1 -and [int]$vc.Major -ge 14 -and [int]$vc.Minor -ge 30) { Ok "Ya instalado ($($vc.Version))" }
else {
    $vcExe = Join-Path $env:TEMP "vc_redist.x64.exe"
    $local = Join-Path $PSScriptRoot "vc_redist.x64.exe"
    try { if (Test-Path $local) { Copy-Item $local $vcExe -Force } else { Descargar $VCRedistURL $vcExe } }
    catch { throw "No se pudo descargar Visual C++ Redistributable." }
    $p = Start-Process -FilePath $vcExe -ArgumentList "/install /quiet /norestart" -Wait -PassThru
    if ($p.ExitCode -notin 0, 1638, 3010) { throw "Visual C++ termino con codigo $($p.ExitCode)." }
    Ok "Visual C++ instalado"
}

# ---------------------------------------------------------------------
Paso 6 "MySQL Server 8.4 (instancia propia del Sistema de Costos)"
$mysqlDir = Join-Path $Destino "mysql"
$mysqld   = Join-Path $mysqlDir "bin\mysqld.exe"
if (-not (Test-Path $mysqld)) {
    $zip = Join-Path $env:TEMP "mysql-winx64.zip"
    $local = Get-ChildItem -Path $PSScriptRoot -Filter "mysql-8*-winx64.zip" -ErrorAction SilentlyContinue | Select-Object -First 1
    if ($local) { Copy-Item $local.FullName $zip -Force; Ok "Usando $($local.Name) local" }
    else {
        $url = $null
        foreach ($v in $VersionesMySQL) {
            foreach ($base in @("https://dev.mysql.com/get/Downloads/MySQL-8.4", "https://cdn.mysql.com/Downloads/MySQL-8.4",
                                "https://downloads.mysql.com/archives/get/p/23/file")) {
                $u = "$base/mysql-$v-winx64.zip"
                if (Existe-URL $u) { $url = $u; break }
            }
            if ($url) { break }
        }
        if (-not $url) { throw "No se encontro la descarga de MySQL. Descargue 'Windows (x86, 64-bit), ZIP Archive' de https://dev.mysql.com/downloads/mysql/ y copielo en la carpeta instalador." }
        Write-Host "      Descargando MySQL (unos 270 MB, puede tardar varios minutos) ..."
        try { Descargar $url $zip } catch { throw "No se pudo descargar MySQL: $($_.Exception.Message)" }
    }
    Write-Host "      Descomprimiendo MySQL ..."
    $tmp = Join-Path $env:TEMP "mysql-extraido"
    if (Test-Path $tmp) { Remove-Item $tmp -Recurse -Force }
    Expand-Archive -Path $zip -DestinationPath $tmp -Force
    $interno = Get-ChildItem $tmp -Directory | Select-Object -First 1
    if (Test-Path $mysqlDir) { Remove-Item $mysqlDir -Recurse -Force }
    Move-Item $interno.FullName $mysqlDir
    Remove-Item $tmp -Recurse -Force -ErrorAction SilentlyContinue
}
Ok "MySQL en $mysqlDir"

# ---------------------------------------------------------------------
Paso 7 "Configurando el servicio de MySQL"
$datos = Join-Path $mysqlDir "data"
$ini   = Join-Path $mysqlDir "my.ini"
$svc = Get-Service -Name $Servicio -ErrorAction SilentlyContinue
if ($svc) {
    # reinstalacion: se conserva la instancia y su puerto
    $linea = Select-String -Path $ini -Pattern "^port=(\d+)" -ErrorAction SilentlyContinue | Select-Object -First 1
    if ($linea) { $PuertoMySQL = [int]$linea.Matches[0].Groups[1].Value }
} else {
    while ((Get-NetTCPConnection -LocalPort $PuertoMySQL -State Listen -ErrorAction SilentlyContinue)) { $PuertoMySQL++ }
    $baseFwd = $mysqlDir.Replace("\","/"); $datosFwd = $datos.Replace("\","/")
@"
[mysqld]
basedir=$baseFwd
datadir=$datosFwd
port=$PuertoMySQL
bind-address=127.0.0.1
character-set-server=utf8mb4
collation-server=utf8mb4_unicode_ci
default-time-zone=SYSTEM
max_connections=100
[client]
port=$PuertoMySQL
default-character-set=utf8mb4
"@ | Out-File -FilePath $ini -Encoding ascii
    if (-not (Test-Path (Join-Path $datos "mysql"))) {
        if ((Nativo $mysqld @("--defaults-file=$ini","--initialize-insecure","--console")) -ne 0) { throw "No se pudo inicializar MySQL." }
    }
    if ((Nativo $mysqld @("--install",$Servicio,"--defaults-file=$ini")) -ne 0) { throw "No se pudo registrar el servicio $Servicio." }
    Set-Service -Name $Servicio -StartupType Automatic
}
Start-Service -Name $Servicio -ErrorAction SilentlyContinue
$mysql = Join-Path $mysqlDir "bin\mysql.exe"
$listo = $false
for ($i = 0; $i -lt 30; $i++) {
    $c = Nativo (Join-Path $mysqlDir "bin\mysqladmin.exe") @("--port=$PuertoMySQL","-h","127.0.0.1","-u","root","ping")
    # si root ya tiene clave (reinstalacion) responde "Access denied", pero el servidor esta activo
    if ($c -eq 0 -or $script:UltimaSalida -match "Access denied|is alive") { $listo = $true; break }
    Start-Sleep -Seconds 2
}
if (-not $listo) { throw "El servicio MySQL no respondio en el puerto $PuertoMySQL." }
Ok "Servicio $Servicio activo en el puerto $PuertoMySQL (inicio automatico)"

# ---------------------------------------------------------------------
Paso 8 "Base de datos y usuario del sistema"
$cfg = Join-Path $Destino "config\config.ini"
$texto = Get-Content $cfg -Raw -Encoding UTF8
$claveActual = ([regex]::Match($texto, "(?m)^\[base_datos\][\s\S]*?^contrasena\s*=[ \t]*(.*)$")).Groups[1].Value.Trim()
$usuarioActual = ([regex]::Match($texto, "(?m)^\[base_datos\][\s\S]*?^usuario\s*=[ \t]*(.*)$")).Groups[1].Value.Trim()
$yaConfigurado = ($usuarioActual -eq "costos" -and $claveActual -ne "")
if (-not $yaConfigurado) {
    $claveApp  = Nueva-Clave
    $claveRoot = Nueva-Clave
    $sql = @"
CREATE DATABASE IF NOT EXISTS sistema_costos CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
CREATE USER IF NOT EXISTS 'costos'@'localhost' IDENTIFIED BY '$claveApp';
CREATE USER IF NOT EXISTS 'costos'@'127.0.0.1' IDENTIFIED BY '$claveApp';
ALTER USER 'costos'@'localhost' IDENTIFIED BY '$claveApp';
ALTER USER 'costos'@'127.0.0.1' IDENTIFIED BY '$claveApp';
GRANT ALL PRIVILEGES ON sistema_costos.* TO 'costos'@'localhost';
GRANT ALL PRIVILEGES ON sistema_costos.* TO 'costos'@'127.0.0.1';
ALTER USER 'root'@'localhost' IDENTIFIED BY '$claveRoot';
FLUSH PRIVILEGES;
"@
    if ((Nativo $mysql @("--port=$PuertoMySQL","-h","127.0.0.1","-u","root") $sql) -ne 0) { throw "No se pudo crear la base de datos/usuario en MySQL." }
    # Clave de root guardada solo para el administrador del equipo
    $notaRoot = Join-Path $mysqlDir "CLAVE_ROOT_MYSQL.txt"
    "Usuario: root`r`nContrasena: $claveRoot`r`nPuerto: $PuertoMySQL`r`n(Guarde este archivo en un lugar seguro.)" | Out-File $notaRoot -Encoding ascii
    Nativo "icacls.exe" @($notaRoot,"/inheritance:r","/grant:r","*S-1-5-32-544:F","*S-1-5-18:F") | Out-Null
    # Actualizar config.ini
    $texto = [regex]::Replace($texto, "(?m)^motor\s*=.*$", "motor = mysql")
    $texto = [regex]::Replace($texto, "(?m)^puerto\s*=\s*33\d\d\s*$", "puerto = $PuertoMySQL")
    $texto = [regex]::Replace($texto, "(?m)^(\[base_datos\][\s\S]*?)^usuario\s*=.*$", "`${1}usuario = costos")
    $texto = [regex]::Replace($texto, "(?m)^(\[base_datos\][\s\S]*?)^contrasena\s*=.*$", "`${1}contrasena = $claveApp")
    $texto = [regex]::Replace($texto, "(?m)^carpeta_mysql_bin\s*=.*$", "carpeta_mysql_bin = mysql/bin")
    [IO.File]::WriteAllText($cfg, $texto, (New-Object Text.UTF8Encoding($false)))
    Ok "Base 'sistema_costos' y usuario 'costos' creados; config.ini actualizado"
} else { Ok "Ya estaba configurada (se conserva)" }

} catch {
    $usarSQLite = $true
    Aviso "No fue posible dejar MySQL funcionando en este equipo: $($_.Exception.Message)"
    Aviso "El sistema se instalara con la base de datos local SQLite (funciona igual, sin servidor)."
    $texto = Get-Content $cfg -Raw -Encoding UTF8
    $texto = [regex]::Replace($texto, "(?m)^motor\s*=.*$", "motor = sqlite")
    [IO.File]::WriteAllText($cfg, $texto, (New-Object Text.UTF8Encoding($false)))
}

if ((Nativo $venvPy @((Join-Path $Destino "backend\app.py"),"--init-bd")) -ne 0) { Fallo "No se pudieron crear las tablas. Revise $Destino\logs\sistema.log" }
Ok "Tablas creadas, roles y administrador inicial listos"

# ---------------------------------------------------------------------
Paso 9 "Accesos directos"
$shell = New-Object -ComObject WScript.Shell
$iniciar = Join-Path $Destino "instalador\iniciar.bat"
$icono = Join-Path $Destino "instalador\icono.ico"
if (-not (Test-Path $icono)) { $icono = "$env:SystemRoot\System32\imageres.dll,109" }
foreach ($ruta in @([Environment]::GetFolderPath("CommonDesktopDirectory"), (Join-Path ([Environment]::GetFolderPath("CommonPrograms")) "Sistema de Costos"))) {
    New-Item -ItemType Directory -Force -Path $ruta | Out-Null
    $l = $shell.CreateShortcut((Join-Path $ruta "Sistema de Costos.lnk"))
    $l.TargetPath = $iniciar; $l.WorkingDirectory = $Destino; $l.IconLocation = $icono; $l.Save()
}
$menu = Join-Path ([Environment]::GetFolderPath("CommonPrograms")) "Sistema de Costos"
foreach ($m in @(@("Manual de usuario","docs\MANUAL_USUARIO.pdf"), @("Manual tecnico","docs\MANUAL_TECNICO.pdf"),
                 @("Configuracion","config\config.ini"), @("Desinstalar","instalador\desinstalar.bat"))) {
    $l = $shell.CreateShortcut((Join-Path $menu ($m[0] + ".lnk"))); $l.TargetPath = (Join-Path $Destino $m[1]); $l.Save()
}
# Permitir que los usuarios del equipo escriban logs, reportes y configuracion
foreach ($d in "logs","reportes_generados","config","database") { Nativo "icacls.exe" @((Join-Path $Destino $d),"/grant","*S-1-5-32-545:(OI)(CI)M") | Out-Null }
Ok "Escritorio y menu Inicio"

# ---------------------------------------------------------------------
Paso 10 "Iniciando el Sistema de Costos"
Start-Process -FilePath $iniciar -WorkingDirectory $Destino
Write-Host ""
Write-Host "=============================================================" -ForegroundColor Green
Write-Host "  INSTALACION TERMINADA" -ForegroundColor Green
Write-Host "  Se abrira el navegador en http://127.0.0.1:5000" -ForegroundColor Green
if ($usarSQLite) { Write-Host "  Base de datos: SQLite (MySQL no se pudo instalar en este equipo)" -ForegroundColor Yellow } else { Write-Host "  Base de datos: MySQL 8.4 (servicio $Servicio, puerto $PuertoMySQL)" -ForegroundColor Green }
Write-Host "  Usuario: admin    Contrasena: Admin123*  (cambiela al entrar)" -ForegroundColor Green
Write-Host "  Acceso directo: 'Sistema de Costos' en el escritorio" -ForegroundColor Green
Write-Host "=============================================================" -ForegroundColor Green
Read-Host "Presione Enter para cerrar esta ventana"
