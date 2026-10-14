"""Utilidades compartidas por las rutas de la API."""
from flask import jsonify, request

import bd
from validaciones import ErrorValidacion


def empresa_actual(obligatoria=True):
    valor = request.headers.get("X-Empresa") or request.args.get("empresa")
    if not valor:
        if obligatoria:
            raise ErrorValidacion("Seleccione una empresa en la parte superior antes de continuar.")
        return None
    try:
        eid = int(valor)
    except ValueError:
        raise ErrorValidacion("Empresa no válida.")
    if not bd.uno("SELECT id FROM empresas WHERE id=%s", (eid,)):
        raise ErrorValidacion("La empresa seleccionada no existe. Seleccione otra.")
    return eid


def periodo_de_empresa(periodo_id, empresa_id):
    p = bd.uno("SELECT * FROM periodos WHERE id=%s AND empresa_id=%s", (periodo_id, empresa_id))
    if not p:
        raise ErrorValidacion("El periodo seleccionado no pertenece a la empresa.")
    return p


def verificar_periodo_abierto(periodo_id):
    p = bd.uno("SELECT estado, nombre FROM periodos WHERE id=%s", (periodo_id,))
    if p and p["estado"] == "Cerrado":
        raise ErrorValidacion("El periodo %s está cerrado; no se permiten cambios." % p["nombre"])


def datos():
    return request.get_json(silent=True) or {}


def ok(**kw):
    return jsonify(ok=True, **kw)
