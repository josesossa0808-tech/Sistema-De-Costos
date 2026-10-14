"""API CRUD genérica para los recursos declarados en recursos.py.

GET    /api/r/<recurso>            lista (con filtros ?campo=valor)
GET    /api/r/<recurso>/<id>       un registro
POST   /api/r/<recurso>            crear
PUT    /api/r/<recurso>/<id>       editar
DELETE /api/r/<recurso>/<id>       eliminar
"""
from flask import Blueprint, abort, jsonify, request

import bd
import calculos
import configuracion as cfg
import validaciones as val
from recursos import RECURSOS
from rutas.comun import datos, empresa_actual, verificar_periodo_abierto
from seguridad import puede, registrar, requiere

bp = Blueprint("catalogos", __name__)


def _def(recurso):
    d = RECURSOS.get(recurso)
    if not d:
        abort(404)
    return d


def _verificar_permiso(d, accion):
    if not puede(d["modulo"], accion):
        raise val.ErrorValidacion("No tiene permiso para %s registros de %s." % (accion, d["titulo"].lower()))


def _select(recurso, d):
    cols = ["t.*"]
    joins = []
    for i, c in enumerate(d["campos"]):
        if c["tipo"] == "ref":
            alias = "r%d" % i
            joins.append("LEFT JOIN %s %s ON %s.id = t.%s" % (c["ref"], alias, alias, c["nombre"]))
            cols.append("%s.%s AS %s_texto" % (alias, c["etiqueta_ref"], c["nombre"]))
    return "SELECT %s FROM %s t %s" % (", ".join(cols), recurso, " ".join(joins))


def _agregar_calculados(recurso, filas, empresa_id):
    if recurso == "trabajadores" and filas:
        f = calculos.factores_prestacionales(empresa_id)
        for t in filas:
            t.update(calculos.costo_trabajador(t, f))
    elif recurso == "cif_parametros":
        for p in filas:
            pc = calculos.parametros_cif(p["periodo_id"])
            for k in ("cif_fijo_presupuestado", "cif_variable_presupuestado", "tasa_fija", "tasa_variable", "tasa_total"):
                p[k] = pc[k]
    return filas


def _limpiar(d, entrada, empresa_id, registro_id=None):
    """Valida y normaliza los datos de entrada según la definición del recurso."""
    salida, errores = {}, {}
    for c in d["campos"]:
        n, et, tipo = c["nombre"], c["etiqueta"], c["tipo"]
        crudo = entrada.get(n)
        try:
            if tipo in ("numero", "moneda"):
                v = val.numero(crudo, et, 0, permitir_cero=not c.get("positivo"))
            elif tipo == "porcentaje":
                v = val.porcentaje(crudo, et)
            elif tipo == "fecha":
                v = val.fecha(crudo, et)
            elif tipo == "correo":
                v = val.correo(crudo, et)
            elif tipo == "bool":
                if crudo is None or crudo == "":
                    v = c.get("defecto", 0)
                else:
                    v = 1 if str(crudo).lower() in ("1", "true", "si", "sí", "on") else 0
            elif tipo == "ref":
                v = val.numero(crudo, et, 1, entero=True)
                if v is not None:
                    tabla = c["ref"]
                    sql = "SELECT id FROM %s WHERE id=%%s" % tabla
                    params = [v]
                    if RECURSOS.get(tabla, {}).get("por_empresa", True) and tabla != "unidades_medida":
                        sql += " AND empresa_id=%s"
                        params.append(empresa_id)
                    if not bd.uno(sql, params):
                        raise val.ErrorValidacion({et: "El valor seleccionado en «%s» no existe" % et})
            elif tipo == "lista":
                v = val.texto(crudo, et)
                opciones = [o[0] if isinstance(o, list) else o for o in c["opciones"]]
                if v is not None and v not in opciones:
                    raise val.ErrorValidacion({et: "«%s» debe ser una de: %s" % (et, ", ".join(opciones))})
            else:
                v = val.texto(crudo, et, c.get("largo"))
            if v is None:
                if "defecto" in c:
                    v = c["defecto"]
                elif c.get("defecto_cfg"):
                    v = cfg.entero("sistema", c["defecto_cfg"], 192)
            if v is None and c.get("requerido"):
                raise val.ErrorValidacion({et: "El campo «%s» es obligatorio" % et})
            salida[n] = v
        except val.ErrorValidacion as e:
            errores.update(e.errores)
    if errores:
        raise val.ErrorValidacion(errores)

    # Duplicidad de códigos
    alcance = " AND empresa_id=%s" if d.get("por_empresa", True) else ""
    for c in d["campos"]:
        if c.get("unico") and salida.get(c["nombre"]) is not None:
            sql = "SELECT id FROM %s WHERE %s=%%s%s" % (d["_tabla"], c["nombre"], alcance)
            params = [salida[c["nombre"]]] + ([empresa_id] if alcance else [])
            if registro_id:
                sql += " AND id<>%s"
                params.append(registro_id)
            if bd.uno(sql, params):
                errores[c["etiqueta"]] = "Ya existe un registro con %s «%s»" % (c["etiqueta"].lower(), salida[c["nombre"]])
    for a, b, msg in d.get("unico_compuesto", []):
        sql = "SELECT id FROM %s WHERE %s=%%s AND %s=%%s" % (d["_tabla"], a, b)
        params = [salida[a], salida[b]]
        if registro_id:
            sql += " AND id<>%s"
            params.append(registro_id)
        if bd.uno(sql, params):
            errores["_"] = msg
    if errores:
        raise val.ErrorValidacion(errores)
    _reglas_especiales(d["_tabla"], salida)
    return salida


def _reglas_especiales(tabla, s):
    if tabla == "periodos" and s.get("fecha_inicio") and s.get("fecha_fin") and s["fecha_fin"] < s["fecha_inicio"]:
        raise val.ErrorValidacion({"Fecha final": "La fecha final no puede ser anterior a la fecha inicial"})
    if tabla == "estandar_materiales" and s.get("precio_estandar") is None:
        s["precio_estandar"] = bd.valor("SELECT precio_estandar FROM materias_primas WHERE id=%s", (s["materia_prima_id"],))
    if tabla == "estandar_mano_obra" and s.get("tarifa_estandar") is None:
        s["tarifa_estandar"] = bd.valor("SELECT tarifa_estandar_hora FROM cargos WHERE id=%s", (s["cargo_id"],))
    if tabla in ("cif", "cif_parametros") and s.get("periodo_id"):
        verificar_periodo_abierto(s["periodo_id"])


def _eliminar_empresa(eid):
    """Borra la empresa y toda su información en el orden correcto de dependencias."""
    ordenes = "SELECT id FROM ordenes_produccion WHERE empresa_id=%s"
    for tabla in ("orden_materiales", "orden_mano_obra", "costos_estandar", "costos_reales"):
        bd.ejecutar("DELETE FROM %s WHERE orden_id IN (%s)" % (tabla, ordenes), (eid,), confirmar=False)
    for tabla in ("variaciones", "ordenes_produccion", "cif", "cif_parametros", "estandar_mano_obra",
                  "estandar_materiales", "trabajadores", "prestaciones", "cargos", "materias_primas",
                  "productos", "proveedores", "centros_costo", "periodos"):
        bd.ejecutar("DELETE FROM %s WHERE empresa_id=%%s" % tabla, (eid,), confirmar=False)
    bd.ejecutar("DELETE FROM empresas WHERE id=%s", (eid,), confirmar=False)
    bd.confirmar()


for _k, _v in RECURSOS.items():
    _v["_tabla"] = _k


@bp.get("/api/r/<recurso>")
@requiere()
def listar(recurso):
    d = _def(recurso)
    _verificar_permiso(d, "ver")
    por_empresa = d.get("por_empresa", True)
    eid = empresa_actual() if por_empresa else empresa_actual(obligatoria=False)
    sql = _select(recurso, d)
    where, params = [], []
    if por_empresa:
        where.append("t.empresa_id=%s")
        params.append(eid)
    nombres = {c["nombre"] for c in d["campos"]}
    for k, v in request.args.items():
        if k in nombres and v != "":
            where.append("t.%s=%%s" % k)
            params.append(v)
    if where:
        sql += " WHERE " + " AND ".join(where)
    sql += " ORDER BY t.%s" % d.get("orden", "id")
    return jsonify(_agregar_calculados(recurso, bd.consultar(sql, params), eid))


@bp.get("/api/r/<recurso>/<int:rid>")
@requiere()
def obtener(recurso, rid):
    d = _def(recurso)
    _verificar_permiso(d, "ver")
    fila = bd.uno(_select(recurso, d) + " WHERE t.id=%s", (rid,))
    if not fila:
        return jsonify(error="Registro no encontrado"), 404
    return jsonify(fila)


@bp.post("/api/r/<recurso>")
@requiere()
def crear(recurso):
    d = _def(recurso)
    _verificar_permiso(d, "crear")
    eid = empresa_actual() if d.get("por_empresa", True) else None
    s = _limpiar(d, datos(), eid)
    if eid:
        s["empresa_id"] = eid
    cols = list(s.keys())
    rid = bd.ejecutar("INSERT INTO %s (%s) VALUES (%s)" % (recurso, ", ".join(cols), ", ".join(["%s"] * len(cols))),
                      [s[c] for c in cols])
    registrar("crear", d["modulo"], "%s #%s" % (d["titulo"], rid))
    return jsonify(ok=True, id=rid, mensaje="Registro creado correctamente")


@bp.put("/api/r/<recurso>/<int:rid>")
@requiere()
def editar(recurso, rid):
    d = _def(recurso)
    _verificar_permiso(d, "editar")
    eid = empresa_actual() if d.get("por_empresa", True) else None
    actual = bd.uno("SELECT * FROM %s WHERE id=%%s" % recurso, (rid,))
    if not actual or (eid and actual.get("empresa_id") != eid):
        return jsonify(error="Registro no encontrado"), 404
    if actual.get("periodo_id") and recurso in ("cif", "cif_parametros"):
        verificar_periodo_abierto(actual["periodo_id"])
    s = _limpiar(d, datos(), eid, rid)
    bd.ejecutar("UPDATE %s SET %s WHERE id=%%s" % (recurso, ", ".join("%s=%%s" % c for c in s)),
                list(s.values()) + [rid])
    registrar("editar", d["modulo"], "%s #%s" % (d["titulo"], rid))
    return jsonify(ok=True, mensaje="Cambios guardados")


@bp.delete("/api/r/<recurso>/<int:rid>")
@requiere()
def eliminar(recurso, rid):
    d = _def(recurso)
    _verificar_permiso(d, "eliminar")
    eid = empresa_actual() if d.get("por_empresa", True) else None
    actual = bd.uno("SELECT * FROM %s WHERE id=%%s" % recurso, (rid,))
    if not actual or (eid and actual.get("empresa_id") != eid):
        return jsonify(error="Registro no encontrado"), 404
    if actual.get("periodo_id") and recurso in ("cif", "cif_parametros"):
        verificar_periodo_abierto(actual["periodo_id"])
    try:
        if recurso == "empresas":
            _eliminar_empresa(rid)
        else:
            bd.ejecutar("DELETE FROM %s WHERE id=%%s" % recurso, (rid,))
    except bd.ErrorIntegridad:
        return jsonify(error="No se puede eliminar: el registro está siendo usado en otros módulos "
                             "(por ejemplo en estándares u órdenes de producción)."), 409
    registrar("eliminar", d["modulo"], "%s #%s" % (d["titulo"], rid))
    return jsonify(ok=True, mensaje="Registro eliminado")
