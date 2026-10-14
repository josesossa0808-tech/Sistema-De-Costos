"""Órdenes de producción, hoja de costos y análisis de variaciones."""
from flask import Blueprint, jsonify, request

import bd
import calculos
import validaciones as val
from rutas.comun import datos, empresa_actual, periodo_de_empresa, verificar_periodo_abierto
from seguridad import registrar, requiere

bp = Blueprint("produccion", __name__)


def recalcular_periodo(periodo_id):
    for o in bd.consultar("SELECT id FROM ordenes_produccion WHERE periodo_id=%s", (periodo_id,)):
        calculos.guardar_orden(o["id"])


def _orden_de_empresa(oid, eid):
    o = bd.uno("SELECT * FROM ordenes_produccion WHERE id=%s AND empresa_id=%s", (oid, eid))
    if not o:
        raise val.ErrorValidacion("La orden de producción no existe.")
    return o


def _validar_orden(d, eid, oid=None):
    errores = {}
    try:
        periodo_id = val.numero(d.get("periodo_id"), "Periodo", 1, entero=True)
        producto_id = val.numero(d.get("producto_id"), "Producto", 1, entero=True)
        fecha = val.fecha(d.get("fecha"), "Fecha")
        term = val.numero(d.get("cantidad_terminada"), "Cantidad terminada") or 0
        proc = val.numero(d.get("cantidad_en_proceso"), "Cantidad en proceso") or 0
        av_mp = val.porcentaje(d.get("avance_materiales"), "% avance materiales")
        av_cv = val.porcentaje(d.get("avance_conversion"), "% avance conversión")
        hm = val.numero(d.get("horas_maquina_reales"), "Horas máquina reales") or 0
        centro = val.numero(d.get("centro_costo_id"), "Centro de costo", 1, entero=True)
        numero = val.texto(d.get("numero"), "Número", 20)
        obs = val.texto(d.get("observaciones"), "Observaciones", 300)
    except val.ErrorValidacion as e:
        raise e
    if not periodo_id:
        errores["Periodo"] = "Seleccione el periodo contable"
    if not producto_id:
        errores["Producto"] = "Seleccione el producto"
    if not fecha:
        errores["Fecha"] = "La fecha es obligatoria"
    if term + proc <= 0:
        errores["Cantidad"] = "Registre una cantidad terminada o en proceso mayor que cero"
    if errores:
        raise val.ErrorValidacion(errores)
    p = periodo_de_empresa(periodo_id, eid)
    verificar_periodo_abierto(periodo_id)
    if not (str(p["fecha_inicio"]) <= fecha <= str(p["fecha_fin"])):
        raise val.ErrorValidacion({"Fecha": "La fecha debe estar dentro del periodo %s (%s a %s)"
                                   % (p["nombre"], p["fecha_inicio"], p["fecha_fin"])})
    if not bd.uno("SELECT id FROM productos WHERE id=%s AND empresa_id=%s", (producto_id, eid)):
        raise val.ErrorValidacion({"Producto": "El producto no existe"})
    if centro and not bd.uno("SELECT id FROM centros_costo WHERE id=%s AND empresa_id=%s", (centro, eid)):
        raise val.ErrorValidacion({"Centro de costo": "El centro de costo no existe"})
    if not numero:
        n = bd.valor("SELECT COUNT(*) AS n FROM ordenes_produccion WHERE empresa_id=%s", (eid,)) + 1
        numero = "OP-%04d" % n
        while bd.uno("SELECT id FROM ordenes_produccion WHERE empresa_id=%s AND numero=%s", (eid, numero)):
            n += 1
            numero = "OP-%04d" % n
    dup = "SELECT id FROM ordenes_produccion WHERE empresa_id=%s AND numero=%s" + (" AND id<>%s" if oid else "")
    if bd.uno(dup, (eid, numero, oid) if oid else (eid, numero)):
        raise val.ErrorValidacion({"Número": "Ya existe una orden con el número %s" % numero})

    mats, mos = [], []
    for i, m in enumerate(d.get("materiales") or [], 1):
        mid = val.numero(m.get("materia_prima_id"), "Materia prima (línea %d)" % i, 1, entero=True)
        if not mid:
            continue
        mp = bd.uno("SELECT precio_estandar FROM materias_primas WHERE id=%s AND empresa_id=%s", (mid, eid))
        if not mp:
            raise val.ErrorValidacion({"Materiales": "La materia prima de la línea %d no existe" % i})
        q = val.numero(m.get("cantidad_real"), "Cantidad real (línea %d)" % i, 0, permitir_cero=False)
        if q is None:
            raise val.ErrorValidacion({"Materiales": "Ingrese la cantidad real en la línea %d" % i})
        pr = val.numero(m.get("precio_real"), "Precio real (línea %d)" % i)
        mats.append((mid, q, mp["precio_estandar"] if pr is None else pr))
    for i, m in enumerate(d.get("mano_obra") or [], 1):
        tid = val.numero(m.get("trabajador_id"), "Trabajador (línea %d)" % i, 1, entero=True)
        if not tid:
            continue
        if not bd.uno("SELECT id FROM trabajadores WHERE id=%s AND empresa_id=%s", (tid, eid)):
            raise val.ErrorValidacion({"Mano de obra": "El trabajador de la línea %d no existe" % i})
        h = val.numero(m.get("horas_reales"), "Horas reales (línea %d)" % i, 0, permitir_cero=False)
        if h is None:
            raise val.ErrorValidacion({"Mano de obra": "Ingrese las horas reales en la línea %d" % i})
        tr = val.numero(m.get("tarifa_real"), "Tarifa real (línea %d)" % i)
        mos.append((tid, h, calculos.tarifa_trabajador(tid) if tr is None else tr))
    estado = "Terminada" if proc == 0 else "En proceso"
    cab = dict(periodo_id=periodo_id, numero=numero, producto_id=producto_id, centro_costo_id=centro, fecha=fecha,
               cantidad_terminada=term, cantidad_en_proceso=proc,
               avance_materiales=100 if av_mp is None else av_mp, avance_conversion=50 if av_cv is None else av_cv,
               horas_maquina_reales=hm, estado=estado, observaciones=obs)
    return cab, mats, mos


def _guardar_lineas(oid, mats, mos):
    bd.ejecutar("DELETE FROM orden_materiales WHERE orden_id=%s", (oid,), confirmar=False)
    bd.ejecutar("DELETE FROM orden_mano_obra WHERE orden_id=%s", (oid,), confirmar=False)
    for mid, q, p in mats:
        bd.ejecutar("INSERT INTO orden_materiales (orden_id, materia_prima_id, cantidad_real, precio_real) VALUES (%s,%s,%s,%s)",
                    (oid, mid, q, p), confirmar=False)
    for tid, h, t in mos:
        bd.ejecutar("INSERT INTO orden_mano_obra (orden_id, trabajador_id, horas_reales, tarifa_real) VALUES (%s,%s,%s,%s)",
                    (oid, tid, h, t), confirmar=False)
    bd.confirmar()


@bp.get("/api/ordenes")
@requiere("produccion", "ver")
def listar():
    eid = empresa_actual()
    sql = ("SELECT o.*, p.codigo AS producto_codigo, p.nombre AS producto, pe.nombre AS periodo,"
           " ce.total AS costo_estandar, cr.total AS costo_real, cr.total_unitario AS costo_real_unitario,"
           " ce.total_unitario AS costo_estandar_unitario, (cr.total - ce.total) AS diferencia"
           " FROM ordenes_produccion o JOIN productos p ON p.id=o.producto_id JOIN periodos pe ON pe.id=o.periodo_id"
           " LEFT JOIN costos_estandar ce ON ce.orden_id=o.id LEFT JOIN costos_reales cr ON cr.orden_id=o.id"
           " WHERE o.empresa_id=%s")
    params = [eid]
    for k in ("periodo_id", "producto_id", "estado"):
        if request.args.get(k):
            sql += " AND o.%s=%%s" % k
            params.append(request.args[k])
    return jsonify(bd.consultar(sql + " ORDER BY o.fecha DESC, o.numero DESC", params))


@bp.get("/api/ordenes/<int:oid>")
@requiere("produccion", "ver")
def obtener(oid):
    o = _orden_de_empresa(oid, empresa_actual())
    o["materiales"] = bd.consultar(
        "SELECT om.*, m.codigo, m.descripcion FROM orden_materiales om JOIN materias_primas m ON m.id=om.materia_prima_id"
        " WHERE om.orden_id=%s ORDER BY om.id", (oid,))
    o["mano_obra"] = bd.consultar(
        "SELECT om.*, t.nombre AS trabajador, c.nombre AS cargo FROM orden_mano_obra om"
        " JOIN trabajadores t ON t.id=om.trabajador_id JOIN cargos c ON c.id=t.cargo_id WHERE om.orden_id=%s ORDER BY om.id",
        (oid,))
    return jsonify(o)


@bp.post("/api/ordenes")
@requiere("produccion", "crear")
def crear():
    eid = empresa_actual()
    cab, mats, mos = _validar_orden(datos(), eid)
    cab["empresa_id"] = eid
    cols = list(cab)
    oid = bd.ejecutar("INSERT INTO ordenes_produccion (%s) VALUES (%s)" % (", ".join(cols), ", ".join(["%s"] * len(cols))),
                      [cab[c] for c in cols])
    _guardar_lineas(oid, mats, mos)
    recalcular_periodo(cab["periodo_id"])
    registrar("crear", "produccion", "Orden %s" % cab["numero"])
    return jsonify(ok=True, id=oid, mensaje="Orden %s registrada" % cab["numero"])


@bp.put("/api/ordenes/<int:oid>")
@requiere("produccion", "editar")
def editar(oid):
    eid = empresa_actual()
    anterior = _orden_de_empresa(oid, eid)
    verificar_periodo_abierto(anterior["periodo_id"])
    cab, mats, mos = _validar_orden(datos(), eid, oid)
    bd.ejecutar("UPDATE ordenes_produccion SET %s WHERE id=%%s" % ", ".join("%s=%%s" % c for c in cab),
                list(cab.values()) + [oid])
    _guardar_lineas(oid, mats, mos)
    recalcular_periodo(cab["periodo_id"])
    if anterior["periodo_id"] != cab["periodo_id"]:
        recalcular_periodo(anterior["periodo_id"])
    registrar("editar", "produccion", "Orden %s" % cab["numero"])
    return jsonify(ok=True, mensaje="Orden actualizada")


@bp.delete("/api/ordenes/<int:oid>")
@requiere("produccion", "eliminar")
def eliminar(oid):
    eid = empresa_actual()
    o = _orden_de_empresa(oid, eid)
    verificar_periodo_abierto(o["periodo_id"])
    for t in ("orden_materiales", "orden_mano_obra", "costos_estandar", "costos_reales", "variaciones"):
        bd.ejecutar("DELETE FROM %s WHERE orden_id=%%s" % t, (oid,), confirmar=False)
    bd.ejecutar("DELETE FROM ordenes_produccion WHERE id=%s", (oid,), confirmar=False)
    bd.confirmar()
    recalcular_periodo(o["periodo_id"])
    registrar("eliminar", "produccion", "Orden %s" % o["numero"])
    return jsonify(ok=True, mensaje="Orden eliminada")


@bp.get("/api/ordenes/<int:oid>/hoja")
@requiere("hoja_costos", "ver")
def hoja(oid):
    _orden_de_empresa(oid, empresa_actual())
    return jsonify(calculos.guardar_orden(oid))


@bp.get("/api/estandar/<int:producto_id>")
@requiere("hoja_costos", "ver")
def estandar(producto_id):
    eid = empresa_actual()
    if not bd.uno("SELECT id FROM productos WHERE id=%s AND empresa_id=%s", (producto_id, eid)):
        raise val.ErrorValidacion("El producto no existe.")
    periodo = request.args.get("periodo_id")
    if periodo:
        periodo_de_empresa(periodo, eid)
    return jsonify(calculos.estandar_producto(producto_id, periodo))


@bp.get("/api/tarifa-trabajador/<int:tid>")
@requiere("produccion", "ver")
def tarifa(tid):
    if not bd.uno("SELECT id FROM trabajadores WHERE id=%s AND empresa_id=%s", (tid, empresa_actual())):
        raise val.ErrorValidacion("El trabajador no existe.")
    return jsonify(tarifa=calculos.tarifa_trabajador(tid))


@bp.get("/api/produccion/resumen")
@requiere("produccion", "ver")
def resumen():
    eid = empresa_actual()
    pid = request.args.get("periodo_id")
    if not pid:
        raise val.ErrorValidacion("Seleccione un periodo.")
    periodo_de_empresa(pid, eid)
    return jsonify(bd.consultar(
        "SELECT p.codigo, p.nombre AS producto, COUNT(o.id) AS ordenes,"
        " SUM(o.cantidad_terminada) AS terminadas, SUM(o.cantidad_en_proceso) AS en_proceso,"
        " SUM(ce.total_unitario*o.cantidad_terminada) AS costo_terminado_estandar,"
        " SUM(ce.total - ce.total_unitario*o.cantidad_terminada) AS costo_en_proceso_estandar"
        " FROM ordenes_produccion o JOIN productos p ON p.id=o.producto_id"
        " LEFT JOIN costos_estandar ce ON ce.orden_id=o.id"
        " WHERE o.empresa_id=%s AND o.periodo_id=%s GROUP BY p.codigo, p.nombre ORDER BY p.codigo", (eid, pid)))


@bp.get("/api/variaciones")
@requiere("variaciones", "ver")
def variaciones():
    eid = empresa_actual()
    pid = request.args.get("periodo_id")
    if not pid:
        raise val.ErrorValidacion("Seleccione un periodo.")
    periodo_de_empresa(pid, eid)
    recalcular_periodo(pid)
    return jsonify(calculos.variaciones_periodo(eid, pid, request.args.get("producto_id") or None))


@bp.post("/api/recalcular")
@requiere("produccion", "editar")
def recalcular():
    eid = empresa_actual()
    pid = datos().get("periodo_id")
    periodo_de_empresa(pid, eid)
    recalcular_periodo(pid)
    registrar("recalcular", "produccion", "Periodo %s" % pid)
    return jsonify(ok=True, mensaje="Costos y variaciones recalculados")
