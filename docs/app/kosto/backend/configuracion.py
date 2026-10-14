"""Lectura del archivo de configuración config/config.ini.

Funciona igual ejecutando desde código fuente o desde el EXE generado con
PyInstaller: la configuración, logs y reportes viven junto al ejecutable,
mientras que el frontend y el esquema SQL viajan empaquetados dentro del EXE.
"""
import configparser
import os
import sys

if getattr(sys, "frozen", False):
    # Ejecutable: la carpeta de instalación es donde está el .exe
    DIR_BASE = os.path.dirname(sys.executable)
    DIR_RECURSOS = getattr(sys, "_MEIPASS", DIR_BASE)
else:
    DIR_BASE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    DIR_RECURSOS = DIR_BASE

RUTA_CONFIG = os.environ.get("SC_CONFIG", os.path.join(DIR_BASE, "config", "config.ini"))
DIR_FRONTEND = os.path.join(DIR_RECURSOS, "frontend")
RUTA_ESQUEMA = os.path.join(DIR_RECURSOS, "database", "schema.sql")

_cfg = configparser.ConfigParser(interpolation=None)
_cfg.read(RUTA_CONFIG, encoding="utf-8")


def obtener(seccion, clave, defecto=None):
    try:
        valor = _cfg.get(seccion, clave)
    except (configparser.NoSectionError, configparser.NoOptionError):
        return defecto
    return valor.strip()


def entero(seccion, clave, defecto=0):
    try:
        return int(obtener(seccion, clave, defecto))
    except (TypeError, ValueError):
        return defecto


def booleano(seccion, clave, defecto=False):
    valor = obtener(seccion, clave)
    if valor is None:
        return defecto
    return valor.lower() in ("si", "sí", "true", "1", "yes")


def ruta(seccion, clave, defecto):
    """Ruta relativa a la carpeta de instalación (crea la carpeta si no existe)."""
    valor = obtener(seccion, clave, defecto)
    absoluta = valor if os.path.isabs(valor) else os.path.join(DIR_BASE, valor)
    return absoluta


def recargar():
    _cfg.read(RUTA_CONFIG, encoding="utf-8")
