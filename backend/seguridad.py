"""Usuarios, sesiones, roles, control de permisos y registro de actividades."""
import re
import secrets
from datetime import datetime, timedelta
from functools import wraps

from flask import g, jsonify, request
from werkzeug.security import check_password_hash, generate_password_hash

import bd
import configuracion as cfg

# Módulos sobre los que se controlan permisos (clave -> nombre visible)
MODULOS = {
    "dashboard": "Dashboard",
    "datos_generales": "Datos generales",
    "materias_primas": "Materias primas directas",
    "mano_obra": "Mano de obra directa",
    "cif": "Costos indirectos de fabricación",
    "produccion": "Producción",
    "hoja_costos": "Hoja de costos",
    "variaciones": "Análisis de variaciones",
    "reportes": "Reportes",
    "usuarios": "Usuarios y seguridad",
}
ACCIONES = ("ver", "crear", "editar", "eliminar")

ROLES = {
    "administrador": "Acceso total al sistema, usuarios y permisos",
    "usuario": "Opera todos los módulos de costos; no administra usuarios",
    "estudiante": "Consulta todo y registra estándares, CIF y producción; no elimina",
}


def _permisos_por_defecto(rol):
    todos = (1, 1, 1, 1)
    if rol == "administrador":
        return {m: todos for m in MODULOS}
    if rol == "usuario":
        p = {m: todos for m in MODULOS}
        p["usuarios"] = (0, 0, 0, 0)
        return p
    # estudiante
    p = {m: (1, 0, 0, 0) for m in MODULOS}
    for m in ("materias_primas", "mano_obra", "cif", "produccion"):
        p[m] = (1, 1, 1, 0)
    p["usuarios"] = (0, 0, 0, 0)
    return p


# ---------------------------------------------------------------------
# Contraseñas
# ---------------------------------------------------------------------
def validar_contrasena(clave):
    minimo = cfg.entero("seguridad", "longitud_minima_contrasena", 8)
    if not clave or len(clave) < minimo:
        return "La contraseña debe tener al menos %d caracteres" % minimo
    if not re.search(r"[A-Za-z]", clave) or not re.search(r"\d", clave):
        return "La contraseña debe combinar letras y números"
    return None


def cifrar(clave):
    return generate_password_hash(clave, method="pbkdf2:sha256:600000")


# ---------------------------------------------------------------------
# Datos iniciales
# ---------------------------------------------------------------------
def sembrar_datos_iniciales():
    """Solo lo indispensable para operar: roles, permisos y el administrador inicial.
    No se cargan datos de negocio (empresas, productos, unidades, etc.)."""
    for nombre, desc in ROLES.items():
        if not bd.uno("SELECT id FROM roles WHERE nombre=%s", (nombre,)):
            bd.ejecutar("INSERT INTO roles (nombre, descripcion) VALUES (%s,%s)", (nombre, desc))
    for rol in bd.consultar("SELECT id, nombre FROM roles"):
        for modulo, p in _permisos_por_defecto(rol["nombre"]).items():
            if not bd.uno("SELECT id FROM rol_permisos WHERE rol_id=%s AND modulo=%s", (rol["id"], modulo)):
                bd.ejecutar(
                    "INSERT INTO rol_permisos (rol_id, modulo, puede_ver, puede_crear, puede_editar, puede_eliminar)"
                    " VALUES (%s,%s,%s,%s,%s,%s)", (rol["id"], modulo) + p)
    if not bd.valor("SELECT COUNT(*) AS n FROM usuarios"):
        rol_admin = bd.valor("SELECT id FROM roles WHERE nombre='administrador'")
        bd.ejecutar(
            "INSERT INTO usuarios (nombre, usuario, correo, password_hash, rol_id, activo, creado_en)"
            " VALUES (%s,%s,%s,%s,%s,1,%s)",
            (cfg.obtener("administrador_inicial", "nombre", "Administrador"),
             cfg.obtener("administrador_inicial", "usuario", "admin"),
             cfg.obtener("administrador_inicial", "correo", "admin@sistemacostos.local"),
             cifrar(cfg.obtener("administrador_inicial", "contrasena", "Admin123*")),
             rol_admin, bd.ahora()))


# ---------------------------------------------------------------------
# Bitácora
# ---------------------------------------------------------------------
def registrar(accion, modulo=None, detalle=None, usuario=None):
    u = usuario or getattr(g, "usuario", None) or {}
    try:
        bd.ejecutar(
            "INSERT INTO bitacora (usuario_id, usuario, accion, modulo, detalle, ip, fecha) VALUES (%s,%s,%s,%s,%s,%s,%s)",
            (u.get("id"), u.get("usuario"), accion, modulo, (detalle or "")[:500],
             request.remote_addr if request else None, bd.ahora()))
    except Exception:
        pass  # la bitácora nunca debe interrumpir la operación


# ---------------------------------------------------------------------
# Sesiones
# ---------------------------------------------------------------------
def crear_sesion(usuario_id):
    token = secrets.token_urlsafe(40)
    minutos = cfg.entero("seguridad", "duracion_sesion_min", 480)
    ahora = datetime.now()
    bd.ejecutar("INSERT INTO sesiones (token, usuario_id, creado_en, expira_en, activa) VALUES (%s,%s,%s,%s,1)",
                (token, usuario_id, ahora.strftime("%Y-%m-%d %H:%M:%S"),
                 (ahora + timedelta(minutes=minutos)).strftime("%Y-%m-%d %H:%M:%S")))
    return token


def cerrar_sesion(token):
    bd.ejecutar("UPDATE sesiones SET activa=0 WHERE token=%s", (token,))


def permisos_de_rol(rol_id):
    filas = bd.consultar("SELECT * FROM rol_permisos WHERE rol_id=%s", (rol_id,))
    return {f["modulo"]: {a: bool(f["puede_" + a]) for a in ACCIONES} for f in filas}


def usuario_por_token(token):
    if not token:
        return None
    fila = bd.uno(
        "SELECT u.id, u.nombre, u.usuario, u.correo, u.rol_id, r.nombre AS rol, u.activo, s.expira_en"
        " FROM sesiones s JOIN usuarios u ON u.id=s.usuario_id JOIN roles r ON r.id=u.rol_id"
        " WHERE s.token=%s AND s.activa=1", (token,))
    if not fila or not fila["activo"]:
        return None
    if str(fila["expira_en"]) < bd.ahora():
        cerrar_sesion(token)
        return None
    fila["permisos"] = permisos_de_rol(fila["rol_id"])
    return fila


def _token_peticion():
    cab = request.headers.get("Authorization", "")
    if cab.startswith("Bearer "):
        return cab[7:]
    return None


def requiere(modulo=None, accion="ver"):
    """Decorador: exige sesión válida y, opcionalmente, permiso sobre un módulo."""
    def deco(fn):
        @wraps(fn)
        def envoltura(*a, **kw):
            u = usuario_por_token(_token_peticion())
            if not u:
                return jsonify(error="Su sesión expiró o no ha iniciado sesión. Ingrese nuevamente."), 401
            g.usuario = u
            g.token = _token_peticion()
            if modulo and not u["permisos"].get(modulo, {}).get(accion):
                return jsonify(error="No tiene permiso para %s en el módulo %s." %
                               (accion, MODULOS.get(modulo, modulo))), 403
            return fn(*a, **kw)
        return envoltura
    return deco


def puede(modulo, accion):
    return bool(getattr(g, "usuario", {}).get("permisos", {}).get(modulo, {}).get(accion))
