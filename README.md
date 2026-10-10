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
├── docs/           Manual técnico
└── iniciar.bat     Arranque en Windows
```

## Instalación
1. Instalar **Python 3.10+** (marcar "Add Python to PATH"): https://www.python.org
2. Instalar **MySQL Server 8** y MySQL Workbench.
3. En MySQL Workbench abrir y ejecutar `database/schema.sql`.
4. Abrir `config/config.ini` y poner la contraseña de MySQL en `password`.
5. Doble clic en **`iniciar.bat`**. Se abre el navegador en http://127.0.0.1:5000

**Usuario inicial:** `admin` / `admin123` (cámbielo en `config.ini` antes del primer arranque).

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
- [ ] Instalador .exe
