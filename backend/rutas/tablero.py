"""Dashboard de indicadores y descarga de reportes."""
import os
import re
import unicodedata

from flask import Blueprint, jsonify, request, send_file

import bd
import calculos
import configuracion as cfg
import reportes
import validaciones as val
from rutas.comun import empresa_actual, periodo_de_empresa
from seguridad import registrar, requiere

bp = Blueprint("tablero", __name__)


@bp.get("/api/dashboard")
@requiere("dashboard", "ver")
def dashboard():
    eid = empresa_actual()
    pid = request.args.get("periodo_id")
    prod = request.args.get("producto_id") or None
    if not pid:
        raise val.ErrorValidacion("Seleccione un periodo.")
    periodo_de_empresa(pid, eid)
    sql = "SELECT id FROM ordenes_produccion WHERE empresa_id=%s AND periodo_id=%s"
    params = [eid, pid]
    if prod:
        sql += " AND producto_id=%s"
        params.append(prod)
    ords = [calculos.calcular_orden(f["id"]) for f in bd.consultar(sql, params)]
    var = calculos.variaciones_periodo(eid, pid, prod)

    ue = sum(h["unidades_equiv_conv"] for h in ords)
    std = sum(h["total_estandar"] for h in ords)
    real = sum(h["total_real"] for h in ords)
    elementos = [{"elemento": ["Materiales", "Mano de obra", "CIF"][i],
                  "estandar": calculos.r2(sum(h["resumen"][i]["estandar_total"] for h in ords)),
                  "real": calculos.r2(sum(h["resumen"][i]["real_total"] for h in ords))} for i in range(3)]

    por_producto = {}
    for h in ords:
        o = h["orden"]
        d = por_producto.setdefault(o["producto_id"], {"producto": o["producto"], "ue": 0, "std": 0, "real": 0,
                                                     "terminadas": 0, "en_proceso": 0})
        d["ue"] += h["unidades_equiv_conv"]
        d["std"] += h["total_estandar"]
        d["real"] += h["total_real"]
        d["terminadas"] += float(o["cantidad_terminada"])
        d["en_proceso"] += float(o["cantidad_en_proceso"])
    productos = []
    ingresos = costo_vendible = 0
    for pid_, d in por_producto.items():
        precio = float(bd.valor("SELECT precio_venta FROM productos WHERE id=%s", (pid_,)))
        cu_std = d["std"] / d["ue"] if d["ue"] else 0
        cu_real = d["real"] / d["ue"] if d["ue"] else 0
        margen = (precio - cu_real) / precio * 100 if precio else None
        ingresos += precio * d["terminadas"]
        costo_vendible += cu_real * d["terminadas"]
        productos.append({"producto": d["producto"], "terminadas": d["terminadas"], "en_proceso": d["en_proceso"],
                          "costo_estandar_unitario": round(cu_std, 2), "costo_real_unitario": round(cu_real, 2),
                          "precio_venta": precio, "margen": None if margen is None else round(margen, 2),
                          "diferencia_porcentual": round((cu_real - cu_std) / cu_std * 100, 2) if cu_std else 0})
    productos.sort(key=lambda x: x["producto"])

    # Tendencia: últimos 6 periodos de la empresa
    tendencia = []
    for p in reversed(bd.consultar("SELECT id, nombre FROM periodos WHERE empresa_id=%s ORDER BY fecha_inicio DESC LIMIT 6", (eid,))):
        ce = bd.uno("SELECT COALESCE(SUM(ce.total),0) AS std, COALESCE(SUM(cr.total),0) AS real FROM ordenes_produccion o"
                    " LEFT JOIN costos_estandar ce ON ce.orden_id=o.id LEFT JOIN costos_reales cr ON cr.orden_id=o.id"
                    " WHERE o.periodo_id=%s" + (" AND o.producto_id=%s" if prod else ""), (p["id"], prod) if prod else (p["id"],))
        tendencia.append({"periodo": p["nombre"], "estandar": ce["std"], "real": ce["real"]})

    return jsonify({
        "kpis": {
            "costo_estandar_unitario": round(std / ue, 2) if ue else 0,
            "costo_real_unitario": round(real / ue, 2) if ue else 0,
            "diferencia_porcentual": round((real - std) / std * 100, 2) if std else 0,
            "costo_total_produccion": calculos.r2(real),
            "costo_total_estandar": calculos.r2(std),
            "variacion_materiales": var["por_elemento"]["MP"],
            "variacion_mano_obra": var["por_elemento"]["MOD"],
            "variacion_cif": var["por_elemento"]["CIF"],
            "variacion_total": var["variacion_total"],
            "margen": round((ingresos - costo_vendible) / ingresos * 100, 2) if ingresos else None,
            "unidades_terminadas": sum(p["terminadas"] for p in productos),
            "unidades_en_proceso": sum(p["en_proceso"] for p in productos),
            "ordenes": len(ords),
        },
        "elementos": elementos,
        "productos": productos,
        "variaciones": var["variaciones"],
        "tendencia": tendencia,
    })


@bp.get("/api/dashboard/productos")
@requiere("dashboard", "ver")
def dashboard_productos():
    """Costo unitario estándar de cada producto, sus consumos por unidad y lo consumido en producción."""
    eid = empresa_actual()
    pid = request.args.get("periodo_id") or None
    if pid:
        periodo_de_empresa(pid, eid)
    elegido = request.args.get("producto_id") or None

    productos, detalle = [], None
    for p in bd.consultar("SELECT * FROM productos WHERE empresa_id=%s ORDER BY codigo", (eid,)):
        e = calculos.estandar_producto(p["id"], pid)
        precio = float(p["precio_venta"] or 0)
        costo = e["total_unitario"]
        lote = re.search(r"[Ll]ote de (\d+)", p.get("descripcion") or "")
        fila = {
            "id": p["id"], "codigo": p["codigo"], "producto": p["nombre"], "precio_venta": precio,
            "mp_unitario": e["mp_unitario"], "mod_unitario": e["mod_unitario"], "cif_unitario": e["cif_unitario"],
            "costo_unitario": costo, "utilidad_unitaria": round(precio - costo, 2),
            "margen": round((precio - costo) / precio * 100, 2) if precio else None,
            "horas_mod": round(e["horas_mod_unitarias"], 6),
            "horas_maquina": round(e["base_unitaria_todas"]["horas_maquina"], 6),
            "insumos": len(e["materiales"]),
            "unidades_lote": int(lote.group(1)) if lote else 1,
        }
        productos.append(fila)
        if elegido and str(p["id"]) == str(elegido):
            detalle = dict(fila, materiales=e["materiales"], mano_obra=e["mano_obra"],
                           base_aplicacion=e["base_aplicacion"], tasa_cif=e["tasa_cif"])

    # Lo realmente consumido en las órdenes de producción del periodo
    filtro, params = "o.empresa_id=%s", [eid]
    if pid:
        filtro += " AND o.periodo_id=%s"
        params.append(pid)
    if elegido:
        filtro += " AND o.producto_id=%s"
        params.append(elegido)
    materiales = bd.consultar(
        "SELECT m.codigo, m.descripcion, u.codigo AS unidad, SUM(om.cantidad_real) AS cantidad,"
        " SUM(om.cantidad_real*om.precio_real) AS costo FROM orden_materiales om"
        " JOIN ordenes_produccion o ON o.id=om.orden_id JOIN materias_primas m ON m.id=om.materia_prima_id"
        " JOIN unidades_medida u ON u.id=m.unidad_id WHERE " + filtro +
        " GROUP BY m.codigo, m.descripcion, u.codigo ORDER BY m.codigo", params)
    mano_obra = bd.uno(
        "SELECT COALESCE(SUM(om.horas_reales),0) AS horas, COALESCE(SUM(om.horas_reales*om.tarifa_real),0) AS costo"
        " FROM orden_mano_obra om JOIN ordenes_produccion o ON o.id=om.orden_id WHERE " + filtro, params)
    ordenes = bd.uno(
        "SELECT COUNT(*) AS ordenes, COALESCE(SUM(o.horas_maquina_reales),0) AS horas_maquina,"
        " COALESCE(SUM(o.cantidad_terminada),0) AS terminadas, COALESCE(SUM(o.cantidad_en_proceso),0) AS en_proceso"
        " FROM ordenes_produccion o WHERE " + filtro, params)
    # CIF: presupuestado y real registrados del periodo, y aplicado / real asignado a la producción
    cif = None
    if pid:
        pc = calculos.parametros_cif(pid)
        aplicado = real_asignado = 0.0
        for o in bd.consultar("SELECT o.id FROM ordenes_produccion o WHERE " + filtro, params):
            r = calculos.calcular_orden(o["id"])["resumen"][2]
            aplicado += r["estandar_total"]
            real_asignado += r["real_total"]
        nombres_base = {"horas_mod": "horas de mano de obra", "horas_maquina": "horas máquina (horneadas)",
                        "unidades": "unidades producidas"}
        cif = {
            "configurado": pc["configurado"], "base": nombres_base.get(pc["base_aplicacion"], pc["base_aplicacion"]),
            "nivel_normal": pc["nivel_normal"], "tasa": pc["tasa_total"], "tasa_fija": pc["tasa_fija"],
            "tasa_variable": pc["tasa_variable"], "presupuestado": pc["cif_presupuestado"], "real": pc["cif_real"],
            "aplicado": calculos.r2(aplicado), "real_asignado": calculos.r2(real_asignado),
            "diferencia": calculos.r2(real_asignado - aplicado),
            "conceptos": bd.consultar("SELECT codigo, concepto, comportamiento, valor_presupuestado, valor_real FROM cif"
                                      " WHERE periodo_id=%s ORDER BY codigo", (pid,)),
        }

    return jsonify({
        "productos": productos,
        "detalle": detalle,
        "cif": cif,
        "consumo": {
            "ordenes": ordenes["ordenes"], "terminadas": ordenes["terminadas"], "en_proceso": ordenes["en_proceso"],
            "horas_maquina": ordenes["horas_maquina"], "horas_mod": mano_obra["horas"], "costo_mod": mano_obra["costo"],
            "costo_materiales": round(sum(m["costo"] or 0 for m in materiales), 2), "materiales": materiales,
        },
    })


@bp.get("/api/reportes/<tipo>")
@requiere("reportes", "ver")
def reporte(tipo):
    eid = empresa_actual()
    pid = request.args.get("periodo_id") or None
    if pid:
        periodo_de_empresa(pid, eid)
    oid = request.args.get("orden_id") or None
    if tipo == "hoja_costos":
        if not oid or not bd.uno("SELECT id FROM ordenes_produccion WHERE id=%s AND empresa_id=%s", (oid, eid)):
            raise val.ErrorValidacion("Seleccione una orden de producción para la hoja de costos.")
    try:
        rep = reportes.construir(tipo, eid, pid, request.args.get("producto_id") or None, oid)
    except ValueError as e:
        raise val.ErrorValidacion(str(e))
    formato = request.args.get("formato", "json")
    if formato == "json":
        return jsonify(rep)
    base = unicodedata.normalize("NFKD", "%s_%s" % (rep["titulo"], rep.get("periodo") or "")).encode("ascii", "ignore").decode()
    nombre = re.sub(r"[^A-Za-z0-9_-]+", "_", base).strip("_")
    if formato == "xlsx":
        buf, mime, ext = reportes.a_excel(rep), "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", "xlsx"
    elif formato == "pdf":
        buf, mime, ext = reportes.a_pdf(rep), "application/pdf", "pdf"
    else:
        raise val.ErrorValidacion("Formato no soportado")
    # Copia en la carpeta de reportes configurada
    try:
        carpeta = cfg.ruta("sistema", "carpeta_reportes", "reportes_generados")
        os.makedirs(carpeta, exist_ok=True)
        with open(os.path.join(carpeta, "%s.%s" % (nombre, ext)), "wb") as f:
            f.write(buf.getvalue())
    except OSError:
        pass
    registrar("exportar", "reportes", "%s (%s)" % (rep["titulo"], ext))
    return send_file(buf, mimetype=mime, as_attachment=True, download_name="%s.%s" % (nombre, ext))
