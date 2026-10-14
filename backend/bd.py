"""Capa de acceso a datos.

Motor predeterminado: SQLite (archivo local incluido en Python, sin instalación).
Opcional: MySQL 8 (motor = mysql en config.ini). Todas las consultas del sistema se
escriben con marcadores %s; para SQLite se traducen automáticamente.
"""
import os
import re
import sqlite3
from datetime import date, datetime
from decimal import Decimal

from flask import g, has_app_context

import configuracion as cfg

MOTOR = (cfg.obtener("base_datos", "motor", "sqlite") or "sqlite").lower()


class ErrorBD(Exception):
    pass


class ErrorIntegridad(ErrorBD):
    pass


# ---------------------------------------------------------------------
# Conexión
# ---------------------------------------------------------------------
def _conectar_mysql(con_bd=True):
    try:
        import pymysql
    except ImportError as e:  # pragma: no cover
        raise ErrorBD("Falta la librería PyMySQL. Ejecute: pip install -r backend/requirements.txt") from e
    params = dict(
        host=cfg.obtener("base_datos", "host", "127.0.0.1"),
        port=cfg.entero("base_datos", "puerto", 3306),
        user=cfg.obtener("base_datos", "usuario", "root"),
        password=cfg.obtener("base_datos", "contrasena", ""),
        charset="utf8mb4",
        cursorclass=pymysql.cursors.DictCursor,
        autocommit=False,
    )
    if con_bd:
        params["database"] = cfg.obtener("base_datos", "nombre_bd", "sistema_costos")
    try:
        return pymysql.connect(**params)
    except pymysql.err.OperationalError as e:
        raise ErrorBD(
            "No fue posible conectar con MySQL. Verifique que el servicio esté iniciado y "
            "que el usuario/contraseña de config/config.ini sean correctos. Detalle: %s" % e
        ) from e


def _ruta_sqlite():
    return cfg.ruta("base_datos", "archivo_sqlite", "database/sistema_costos.db")


def _conectar_sqlite():
    con = sqlite3.connect(_ruta_sqlite(), timeout=15)
    con.row_factory = lambda c, r: {d[0]: r[i] for i, d in enumerate(c.description)}
    con.execute("PRAGMA foreign_keys = ON")
    con.execute("PRAGMA busy_timeout = 15000")
    return con


def nueva_conexion():
    return _conectar_sqlite() if MOTOR == "sqlite" else _conectar_mysql()


def conexion():
    """Conexión reutilizada durante la petición HTTP actual."""
    if has_app_context():
        if "bd" not in g:
            g.bd = nueva_conexion()
        return g.bd
    return nueva_conexion()


def cerrar(_exc=None):
    con = g.pop("bd", None)
    if con is not None:
        try:
            con.close()
        except Exception:
            pass


# ---------------------------------------------------------------------
# Consultas
# ---------------------------------------------------------------------
def _adaptar(sql):
    if MOTOR == "sqlite":
        return sql.replace("%s", "?")
    return sql


def _normalizar(fila):
    if fila is None:
        return None
    salida = {}
    for k, v in fila.items():
        if isinstance(v, Decimal):
            v = float(v)
        elif isinstance(v, datetime):
            v = v.strftime("%Y-%m-%d %H:%M:%S")
        elif isinstance(v, date):
            v = v.isoformat()
        salida[k] = v
    return salida


def _ejecutar_cursor(sql, params):
    con = conexion()
    cur = con.cursor()
    try:
        cur.execute(_adaptar(sql), tuple(params or ()))
    except sqlite3.IntegrityError as e:
        con.rollback()
        raise ErrorIntegridad(str(e)) from e
    except Exception as e:
        con.rollback()
        nombre = type(e).__name__
        if nombre == "IntegrityError":
            raise ErrorIntegridad(str(e)) from e
        raise
    return con, cur


def consultar(sql, params=None):
    _, cur = _ejecutar_cursor(sql, params)
    return [_normalizar(f) for f in cur.fetchall()]


def uno(sql, params=None):
    _, cur = _ejecutar_cursor(sql, params)
    return _normalizar(cur.fetchone())


def valor(sql, params=None, defecto=0):
    fila = uno(sql, params)
    if not fila:
        return defecto
    v = list(fila.values())[0]
    return defecto if v is None else v


def ejecutar(sql, params=None, confirmar=True):
    con, cur = _ejecutar_cursor(sql, params)
    if confirmar:
        con.commit()
    return cur.lastrowid


def confirmar():
    conexion().commit()


def revertir():
    conexion().rollback()


def ahora():
    return datetime.now().strftime("%Y-%m-%d %H:%M:%S")


# ---------------------------------------------------------------------
# Creación de la base de datos
# ---------------------------------------------------------------------
def _sentencias_esquema():
    with open(cfg.RUTA_ESQUEMA, encoding="utf-8") as f:
        texto = f.read()
    texto = re.sub(r"--[^\n]*", "", texto)
    return [s.strip() for s in texto.split(";") if s.strip()]


def _a_sqlite(sentencia):
    s = sentencia
    s = re.sub(r"INT AUTO_INCREMENT PRIMARY KEY", "INTEGER PRIMARY KEY AUTOINCREMENT", s)
    s = re.sub(r"\)\s*ENGINE=InnoDB[^;]*$", ")", s)
    return s


def crear_esquema():
    sentencias = _sentencias_esquema()
    if MOTOR == "sqlite":
        os.makedirs(os.path.dirname(_ruta_sqlite()), exist_ok=True)
        con = _conectar_sqlite()
        con.execute("PRAGMA journal_mode = WAL")  # lecturas y escrituras simultáneas más seguras
        for s in sentencias:
            con.execute(_a_sqlite(s))
        con.commit()
        con.close()
        return
    nombre = cfg.obtener("base_datos", "nombre_bd", "sistema_costos")
    if not re.fullmatch(r"[A-Za-z0-9_]+", nombre):
        raise ErrorBD("El nombre de la base de datos solo admite letras, números y guion bajo")
    con = _conectar_mysql(con_bd=False)
    with con.cursor() as cur:
        cur.execute(
            "CREATE DATABASE IF NOT EXISTS `%s` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci" % nombre
        )
    con.commit()
    con.close()
    con = _conectar_mysql()
    with con.cursor() as cur:
        for s in sentencias:
            cur.execute(s)
    con.commit()
    con.close()
