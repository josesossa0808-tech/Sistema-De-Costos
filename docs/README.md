# Sistema de Costos

Sistema de **costeo estándar** de ejecución local: materias primas directas, mano de obra directa, costos indirectos de fabricación (CIF), órdenes de producción, hoja de costos, análisis de variaciones, dashboard y reportes en Excel y PDF.

- **Frontend:** HTML + CSS + JavaScript (sin frameworks, sin internet)
- **Backend:** Python (Flask) con API REST
- **Base de datos:** MySQL 8.4 local (la instala `instalador/INSTALAR_TODO.bat`); SQLite como respaldo automático y en macOS/Linux
- **Seguridad:** creación de cuenta, inicio y cierre de sesión, roles (administrador, usuario, estudiante), permisos por módulo y registro de actividades

## Instalación en cualquier computador

**Windows 10/11:** en la carpeta `instalador`, doble clic en **`INSTALAR_TODO.bat`** (crea el acceso directo *Sistema de Costos* en el escritorio). Instala Python, Visual C++, **MySQL Server 8.4** (como servicio propio del sistema), la base de datos, las librerías y los accesos directos. Si MySQL no se puede instalar en ese equipo, continúa automáticamente con SQLite.

**macOS / Linux:** `bash instalador/instalar.sh` y luego `./instalador/iniciar.sh`.

Ingrese con `admin` / `Admin123*` y cambie la contraseña.

Para generar el ejecutable y el instalador: `instalador\construir_exe.bat`. Al subir una etiqueta `v*` a GitHub, el flujo de *Actions* publica `Instalar_SistemaCostos.exe` en *Releases*.

## Acceso directo sin instalar

En la carpeta `instalador`, doble clic en **`CREAR_ACCESO_DIRECTO.bat`**: crea *Sistema de Costos* en el escritorio y en el menú Inicio. El acceso abre **`instalador/INICIAR_SISTEMA.bat`**, que usa la instalación si existe o, si no, el Python del equipo con la base SQLite incluida.

## Datos de Deligaby (importados del Excel)

La base `database/sistema_costos.db` ya trae cargada la plantilla **datos/Costeo_Deligaby.xlsx**: 14 insumos, 7 productos (tortas y cupcakes) con su receta, mano de obra estándar y los CIF de *Octubre 2026*.
Si el sistema usa MySQL, o la base está vacía, doble clic en **`herramientas/IMPORTAR_EXCEL.bat`** para cargarla. Para otro Excel con el mismo formato, arrástrelo sobre ese archivo.

## Estructura de carpetas

La carpeta principal contiene solo carpetas:


| Carpeta / archivo | Contenido |
|---|---|
| `backend/` | API y lógica de costeo (Python) y `requirements.txt` |
| `frontend/` | Pantallas (HTML, CSS, JavaScript) |
| `database/` | Esquema SQL y base de datos |
| `config/` | `config.ini`: parámetros del sistema |
| `datos/` | Excel de costeo para importar |
| `herramientas/` | Importador del Excel (`IMPORTAR_EXCEL.bat`) |
| `instalador/` | `INSTALAR_TODO.bat`, `INICIAR_SISTEMA.bat`, `CREAR_ACCESO_DIRECTO.bat`, EXE, ícono y scripts de macOS/Linux |
| `docs/` | Este README, manual técnico y manual de usuario |
| `tests/` | Pruebas automáticas |
| `logs/`, `reportes_generados/` | Registros y reportes exportados |

Detalle archivo por archivo en el [Manual técnico](MANUAL_TECNICO.md#2-estructura-de-carpetas).

## Documentación

- [Manual técnico](MANUAL_TECNICO.md): arquitectura, instalación, configuración, base de datos, API, fórmulas, pruebas y solución de problemas.
- [Manual de usuario](MANUAL_USUARIO.md): instrucciones de uso paso a paso (también dentro del sistema en *Ayuda*).

## Módulos

| Módulo | Contenido |
|---|---|
| Usuarios y seguridad | Crear cuenta, inicio/cierre de sesión, usuarios, roles, permisos, registro de actividades |
| Datos generales | Empresas (datos tributarios), periodos contables, unidades de medida, centros de costo, productos |
| Materias primas directas | Materiales, proveedores, cantidades y precios estándar, variación de precio y cantidad |
| Mano de obra directa | Cargos, salarios, prestaciones y cargas, tarifa estándar y real, variación de tarifa y eficiencia |
| CIF | CIF fijos y variables, base de aplicación, tasa predeterminada, presupuestado vs. real, variaciones |
| Producción | Órdenes con materia prima y horas reales, CIF aplicado, producción terminada y en proceso |
| Hoja de costos | Costo estándar unitario y total, costo real, diferencia y variaciones |
| Análisis de variaciones | Precio, cantidad, tarifa, eficiencia, presupuesto y volumen; favorables, desfavorables y total |
| Dashboard | Costo unitario de cada producto, consumo por unidad (materia prima, horas de mano de obra, horas máquina, CIF), total del producto elegido para la cantidad indicada, materia prima usada en producción e indicadores estándar vs. real |
| Reportes | Hoja de costos, materiales, MOD, CIF, producción, variaciones, estado de costos; Excel, PDF e impresión |

## Pruebas

```bash
python -m unittest discover -s tests -v
```
