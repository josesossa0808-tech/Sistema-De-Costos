; =====================================================================
;  SISTEMA DE COSTOS - Script de Inno Setup 6
;  Genera instalador\Output\Instalar_SistemaCostos.exe
;  Compilar: ISCC.exe instalador\SistemaCostos.iss  (después de construir_exe.bat)
; =====================================================================
#define Nombre "Sistema de Costos"
#define Version "1.0.0"

[Setup]
AppId={{6E2B1C55-4C1F-4C8E-9F3B-5A1D2C3B4A10}
AppName={#Nombre}
AppVersion={#Version}
AppPublisher=Sistema de Costos
DefaultDirName={sd}\SistemaCostos
DefaultGroupName={#Nombre}
OutputDir=Output
OutputBaseFilename=Instalar_SistemaCostos
Compression=lzma2
SolidCompression=yes
WizardStyle=modern
PrivilegesRequired=admin
UninstallDisplayName={#Nombre}
SetupIconFile=icono.ico
UninstallDisplayIcon={app}\SistemaCostos.exe

[Languages]
Name: "es"; MessagesFile: "compiler:Languages\Spanish.isl"

[Tasks]
Name: "escritorio"; Description: "Crear acceso directo en el escritorio"; GroupDescription: "Accesos directos:"

[Files]
Source: "..\dist\SistemaCostos\*"; DestDir: "{app}"; Excludes: "config\*,docs\*,database\*"; Flags: ignoreversion recursesubdirs createallsubdirs
; La configuración no se sobrescribe al actualizar
Source: "..\config\config.ini"; DestDir: "{app}\config"; Flags: onlyifdoesntexist uninsneveruninstall
; Base de datos con los datos de Deligaby (no se sobrescribe al actualizar)
Source: "..\database\sistema_costos.db"; DestDir: "{app}\database"; Flags: onlyifdoesntexist uninsneveruninstall
Source: "..\docs\*"; DestDir: "{app}\docs"; Flags: ignoreversion recursesubdirs

[Dirs]
Name: "{app}\config"; Permissions: users-modify
Name: "{app}\database"; Permissions: users-modify; Flags: uninsneveruninstall
Name: "{app}\logs"; Permissions: users-modify
Name: "{app}\reportes_generados"; Permissions: users-modify

[Icons]
Name: "{group}\{#Nombre}"; Filename: "{app}\SistemaCostos.exe"; WorkingDir: "{app}"
Name: "{group}\Configuración (config.ini)"; Filename: "notepad.exe"; Parameters: """{app}\config\config.ini"""
Name: "{group}\Manual técnico"; Filename: "{app}\docs\MANUAL_TECNICO.pdf"
Name: "{group}\Manual de usuario"; Filename: "{app}\docs\MANUAL_USUARIO.pdf"
Name: "{group}\Desinstalar"; Filename: "{uninstallexe}"
Name: "{autodesktop}\{#Nombre}"; Filename: "{app}\SistemaCostos.exe"; WorkingDir: "{app}"; Tasks: escritorio

[Run]
Filename: "{app}\SistemaCostos.exe"; Description: "Iniciar {#Nombre}"; Flags: postinstall nowait skipifsilent

[Messages]
es.WelcomeLabel2=Este asistente instalará [name/ver] en su equipo.%n%nNo requiere instalar nada más: incluye la base de datos con la información de la empresa Deligaby. Usuario: admin  Contraseña: Admin123*
