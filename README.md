# Sistema de Costos Estándar

Sistema para costeo estándar: materias primas, mano de obra directa, CIF, producción y análisis de variaciones. Funciona **localmente, sin internet**.

## Tecnología
- **Frontend:** HTML, CSS y JavaScript (`frontend/`)
- **Backend:** Python + Flask, API REST (`backend/`)
- **Base de datos:** MySQL local (`database/schema.sql`)
- **Configuración:** `config/config.ini`

## Estructura
```
sistema-costos/
├── backend/        API en Python
├── frontend/       Pantallas (index.html = inicio de sesión)
├── database/       Script de creación de la base de datos
├── config/         Parámetros del sistema
├── docs/           Manual técnico e instrucciones de instalación
├── .github/        Construcción automática del .exe
└── iniciar.bat     Arranque desde el código
```

## ⬇️ Descargar e instalar (cualquier computador con Windows)
1. Instalar **MySQL Server 8** (una sola vez): https://dev.mysql.com/downloads/installer/ — anote la contraseña de `root`.
2. Ir a **[Releases](../../releases/latest)** y descargar **SistemaCostos-Windows.zip**.
3. Clic derecho → **Extraer todo**.
4. Doble clic en **SistemaCostos.exe**. La primera vez pide la contraseña de MySQL y crea la base de datos automáticamente.
5. Se abre el navegador. Entrar con **`admin` / `admin123`**.

No necesita instalar Python. No cierre la ventana negra mientras usa el sistema.
Si Windows muestra *"Windows protegió su PC"*: **Más información → Ejecutar de todas formas**.

## Ejecutar desde el código (desarrolladores)
1. Instalar **Python 3.10+** (marcar "Add Python to PATH") y **MySQL Server 8**.
2. Doble clic en **`iniciar.bat`** (instala dependencias, crea la base de datos y abre el navegador).

El instalable `.exe` se construye solo con GitHub Actions (`.github/workflows/construir-exe.yml`) cada vez que se suben cambios.

## Roles
| Rol | Permisos |
|---|---|
| Administrador | Todo, incluye usuarios, eliminar y registro de actividades |
| Usuario | Crear y editar información |
| Estudiante | Solo consulta |

## Estado
- [x] Inicio/cierre de sesión, roles, permisos, registro de actividades
- [x] Empresas (crear, editar, eliminar, datos tributarios)
- [x] Cálculo de variaciones (materiales, MOD, CIF presupuesto y volumen)
- [x] Base de datos completa de todos los módulos
- [ ] Pantallas: materias primas, mano de obra, CIF, producción, hoja de costos
- [x] Instalable .exe (crea la base de datos automáticamente)
