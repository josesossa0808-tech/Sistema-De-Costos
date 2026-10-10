# Manual técnico

## Arquitectura
Navegador (frontend HTML/JS) → API REST Flask (`backend/app.py`, puerto 5000) → MySQL local.

## Endpoints de la API
| Método | Ruta | Descripción | Rol |
|---|---|---|---|
| POST | /api/login | Iniciar sesión | Todos |
| POST | /api/logout | Cerrar sesión | Todos |
| GET | /api/sesion | Datos del usuario | Autenticado |
| GET/POST | /api/usuarios | Listar / crear usuarios | Administrador |
| GET | /api/bitacora | Registro de actividades | Administrador |
| GET/POST | /api/empresas | Listar / crear empresas | Autenticado / Admin, Usuario |
| PUT/DELETE | /api/empresas/{id} | Editar / eliminar | Admin, Usuario / Admin |
| POST | /api/variaciones/calcular | Variaciones estándar | Autenticado |

## Fórmulas de variaciones
Valor positivo = desfavorable, negativo = favorable.
- Precio de materiales = (PR − PE) × CR
- Cantidad de materiales = (CR − CE) × PE
- Tarifa MOD = (TR − TE) × HR
- Eficiencia MOD = (HR − HE) × TE
- Tasa predeterminada CIF = CIF presupuestado / capacidad normal
- Presupuesto CIF = CIF real − (CIF fijo + tasa variable × base estándar)
- Volumen CIF = presupuesto flexible − CIF aplicado

## Ejecución manual
```
cd backend
pip install -r requirements.txt
python app.py
```
