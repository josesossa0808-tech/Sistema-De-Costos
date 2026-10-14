"""Motor de costeo estándar.

Convención de signos de las variaciones:
    valor > 0  -> DESFAVORABLE (el costo real superó al estándar)
    valor < 0  -> FAVORABLE    (el costo real fue menor que el estándar)

Fórmulas:
  Materiales
    Variación de precio     = (Precio real - Precio estándar) x Cantidad real
    Variación de cantidad   = (Cantidad real - Cantidad estándar permitida) x Precio estándar
  Mano de obra directa
    Variación de tarifa     = (Tarifa real - Tarifa estándar) x Horas reales
    Variación de eficiencia = (Horas reales - Horas estándar permitidas) x Tarifa estándar
  CIF (análisis de dos variaciones, por periodo)
    Tasa fija      = CIF fijo presupuestado / Nivel normal
    Tasa variable  = CIF variable presupuestado / Nivel normal
    CIF aplicado   = (Tasa fija + Tasa variable) x Base estándar permitida
    Presupuesto flexible = CIF fijo presupuestado + Tasa variable x Base estándar permitida
    Variación de presupuesto = CIF real - Presupuesto flexible
    Variación de volumen     = Presupuesto flexible - CIF aplicado
  Unidades equivalentes
    UE materiales = Terminadas + En proceso x %avance materiales
    UE conversión = Terminadas + En proceso x %avance conversión (MOD y CIF)
"""
import bd

TOLERANCIA = 0.005


def naturaleza(valor):
    if abs(valor) < TOLERANCIA:
        return "Neutra"
    return "Desfavorable" if valor > 0 else "Favorable"


def r2(x):
    return round(float(x or 0) + 0.0, 2)


# ---------------------------------------------------------------------
# Mano de obra: factor prestacional y tarifa real
# ---------------------------------------------------------------------
def factores_prestacionales(empresa_id):
    filas = bd.consultar("SELECT tipo, porcentaje FROM prestaciones WHERE empresa_id=%s", (empresa_id,))
    sobre_total = sum(f["porcentaje"] for f in filas if f["tipo"] == "Prestación social")
    sobre_salario = sum(f["porcentaje"] for f in filas if f["tipo"] != "Prestación social")
    return float(sobre_total), float(sobre_salario)


def costo_trabajador(t, factores):
    """Prestaciones sociales se liquidan sobre salario + auxilio de transporte;
    seguridad social y parafiscales sobre el salario."""
    pres, seg = factores
    salario = float(t["salario_mensual"] or 0)
    aux = float(t.get("auxilio_transporte") or 0)
    costo = salario + aux + (salario + aux) * pres / 100 + salario * seg / 100
    horas = float(t["horas_mes"] or 0) or 1
    return {
        "factor_prestacional": round(pres + seg, 4),
        "costo_mensual_total": r2(costo),
        "tarifa_real_hora": round(costo / horas, 4),
    }


def tarifa_trabajador(trabajador_id):
    t = bd.uno("SELECT * FROM trabajadores WHERE id=%s", (trabajador_id,))
    if not t:
        return 0
    return costo_trabajador(t, factores_prestacionales(t["empresa_id"]))["tarifa_real_hora"]


# ---------------------------------------------------------------------
# CIF: tasas predeterminadas
# ---------------------------------------------------------------------
def parametros_cif(periodo_id):
    p = bd.uno("SELECT * FROM cif_parametros WHERE periodo_id=%s", (periodo_id,))
    fijo = float(bd.valor("SELECT COALESCE(SUM(valor_presupuestado),0) AS v FROM cif WHERE periodo_id=%s AND comportamiento='Fijo'", (periodo_id,)))
    variable = float(bd.valor("SELECT COALESCE(SUM(valor_presupuestado),0) AS v FROM cif WHERE periodo_id=%s AND comportamiento='Variable'", (periodo_id,)))
    real = float(bd.valor("SELECT COALESCE(SUM(valor_real),0) AS v FROM cif WHERE periodo_id=%s", (periodo_id,)))
    real_fijo = float(bd.valor("SELECT COALESCE(SUM(valor_real),0) AS v FROM cif WHERE periodo_id=%s AND comportamiento='Fijo'", (periodo_id,)))
    nivel = float(p["nivel_normal"]) if p else 0
    tf = fijo / nivel if nivel else 0
    tv = variable / nivel if nivel else 0
    return {
        "configurado": bool(p),
        "base_aplicacion": p["base_aplicacion"] if p else "horas_mod",
        "nivel_normal": nivel,
        "cif_fijo_presupuestado": r2(fijo),
        "cif_variable_presupuestado": r2(variable),
        "cif_presupuestado": r2(fijo + variable),
        "cif_real": r2(real),
        "cif_real_fijo": r2(real_fijo),
        "cif_real_variable": r2(real - real_fijo),
        "tasa_fija": round(tf, 6),
        "tasa_variable": round(tv, 6),
        "tasa_total": round(tf + tv, 6),
    }


# ---------------------------------------------------------------------
# Hoja de costo estándar por producto (por unidad)
# ---------------------------------------------------------------------
def estandar_producto(producto_id, periodo_id=None):
    mp = bd.consultar(
        "SELECT e.materia_prima_id, m.codigo, m.descripcion, u.codigo AS unidad, e.cantidad_estandar, e.precio_estandar"
        " FROM estandar_materiales e JOIN materias_primas m ON m.id=e.materia_prima_id"
        " JOIN unidades_medida u ON u.id=m.unidad_id WHERE e.producto_id=%s ORDER BY m.codigo", (producto_id,))
    for f in mp:
        f["costo"] = round(f["cantidad_estandar"] * f["precio_estandar"], 4)
    mo = bd.consultar(
        "SELECT e.cargo_id, c.nombre AS cargo, e.horas_estandar, e.tarifa_estandar"
        " FROM estandar_mano_obra e JOIN cargos c ON c.id=e.cargo_id WHERE e.producto_id=%s ORDER BY c.nombre",
        (producto_id,))
    for f in mo:
        f["costo"] = round(f["horas_estandar"] * f["tarifa_estandar"], 4)
    prod = bd.uno("SELECT * FROM productos WHERE id=%s", (producto_id,))
    horas_mod = sum(f["horas_estandar"] for f in mo)
    base_unit = {"horas_mod": horas_mod,
                 "horas_maquina": float(prod["horas_maquina_estandar"] or 0) if prod else 0,
                 "unidades": 1.0}
    cif = parametros_cif(periodo_id) if periodo_id else None
    base = cif["base_aplicacion"] if cif else "horas_mod"
    tasa = cif["tasa_total"] if cif else 0
    cif_unit = base_unit[base] * tasa
    mp_unit = sum(f["costo"] for f in mp)
    mo_unit = sum(f["costo"] for f in mo)
    return {
        "producto": prod,
        "materiales": mp, "mano_obra": mo,
        "base_aplicacion": base, "base_unitaria": base_unit[base], "base_unitaria_todas": base_unit,
        "tasa_cif": tasa,
        "tasa_fija": cif["tasa_fija"] if cif else 0,
        "tasa_variable": cif["tasa_variable"] if cif else 0,
        "mp_unitario": round(mp_unit, 4), "mod_unitario": round(mo_unit, 4), "cif_unitario": round(cif_unit, 4),
        "total_unitario": round(mp_unit + mo_unit + cif_unit, 4),
        "horas_mod_unitarias": horas_mod,
    }


# ---------------------------------------------------------------------
# Cálculo de una orden de producción
# ---------------------------------------------------------------------
def _base_real_orden(orden, base, horas_reales):
    if base == "horas_mod":
        return horas_reales
    if base == "horas_maquina":
        return float(orden["horas_maquina_reales"] or 0)
    return float(orden["cantidad_terminada"] or 0) + float(orden["cantidad_en_proceso"] or 0) * float(orden["avance_conversion"] or 0) / 100


def base_real_periodo(periodo_id, base):
    total = 0.0
    for o in bd.consultar("SELECT * FROM ordenes_produccion WHERE periodo_id=%s", (periodo_id,)):
        horas = float(bd.valor("SELECT COALESCE(SUM(horas_reales),0) AS v FROM orden_mano_obra WHERE orden_id=%s", (o["id"],)))
        total += _base_real_orden(o, base, horas)
    return total


def calcular_orden(orden_id):
    """Calcula costo estándar, costo real y variaciones de una orden."""
    o = bd.uno("SELECT o.*, p.nombre AS producto, p.codigo AS producto_codigo, pe.nombre AS periodo"
               " FROM ordenes_produccion o JOIN productos p ON p.id=o.producto_id"
               " JOIN periodos pe ON pe.id=o.periodo_id WHERE o.id=%s", (orden_id,))
    if not o:
        return None
    est = estandar_producto(o["producto_id"], o["periodo_id"])
    term = float(o["cantidad_terminada"] or 0)
    proc = float(o["cantidad_en_proceso"] or 0)
    ue_mp = term + proc * float(o["avance_materiales"] or 0) / 100
    ue_cv = term + proc * float(o["avance_conversion"] or 0) / 100

    variaciones = []

    # ---------------- Materiales
    reales_mp = bd.consultar(
        "SELECT om.materia_prima_id, m.codigo, m.descripcion, SUM(om.cantidad_real) AS cantidad_real,"
        " SUM(om.cantidad_real*om.precio_real) AS costo_real"
        " FROM orden_materiales om JOIN materias_primas m ON m.id=om.materia_prima_id"
        " WHERE om.orden_id=%s GROUP BY om.materia_prima_id, m.codigo, m.descripcion", (orden_id,))
    reales_por_mp = {f["materia_prima_id"]: f for f in reales_mp}
    detalle_mp = []
    ids_mp = [f["materia_prima_id"] for f in est["materiales"]] + \
             [k for k in reales_por_mp if k not in {f["materia_prima_id"] for f in est["materiales"]}]
    std_por_mp = {f["materia_prima_id"]: f for f in est["materiales"]}
    for mid in ids_mp:
        s = std_por_mp.get(mid)
        r = reales_por_mp.get(mid)
        if s:
            pe = float(s["precio_estandar"])
            qe = float(s["cantidad_estandar"]) * ue_mp
            nombre = "%s %s" % (s["codigo"], s["descripcion"])
        else:
            pe = float(bd.valor("SELECT precio_estandar FROM materias_primas WHERE id=%s", (mid,)))
            qe = 0.0
            nombre = "%s %s (no está en el estándar)" % (r["codigo"], r["descripcion"])
        qr = float(r["cantidad_real"]) if r else 0.0
        cr = float(r["costo_real"]) if r else 0.0
        pr = cr / qr if qr else pe
        v_precio = (pr - pe) * qr
        v_cant = (qr - qe) * pe
        detalle_mp.append({
            "materia_prima_id": mid, "materia_prima": nombre,
            "cantidad_estandar": round(qe, 4), "precio_estandar": pe, "costo_estandar": r2(qe * pe),
            "cantidad_real": round(qr, 4), "precio_real": round(pr, 4), "costo_real": r2(cr),
            "variacion_precio": r2(v_precio), "variacion_cantidad": r2(v_cant),
        })
        variaciones.append(("MP", "Precio de materiales", nombre, v_precio))
        variaciones.append(("MP", "Cantidad de materiales", nombre, v_cant))

    # ---------------- Mano de obra
    reales_mo = bd.consultar(
        "SELECT t.cargo_id, c.nombre AS cargo, SUM(om.horas_reales) AS horas_reales,"
        " SUM(om.horas_reales*om.tarifa_real) AS costo_real"
        " FROM orden_mano_obra om JOIN trabajadores t ON t.id=om.trabajador_id JOIN cargos c ON c.id=t.cargo_id"
        " WHERE om.orden_id=%s GROUP BY t.cargo_id, c.nombre", (orden_id,))
    reales_por_cargo = {f["cargo_id"]: f for f in reales_mo}
    std_por_cargo = {f["cargo_id"]: f for f in est["mano_obra"]}
    detalle_mo = []
    for cid in list(std_por_cargo) + [k for k in reales_por_cargo if k not in std_por_cargo]:
        s = std_por_cargo.get(cid)
        r = reales_por_cargo.get(cid)
        if s:
            te = float(s["tarifa_estandar"])
            he = float(s["horas_estandar"]) * ue_cv
            nombre = s["cargo"]
        else:
            te = float(bd.valor("SELECT tarifa_estandar_hora FROM cargos WHERE id=%s", (cid,)))
            he = 0.0
            nombre = "%s (no está en el estándar)" % r["cargo"]
        hr = float(r["horas_reales"]) if r else 0.0
        cr = float(r["costo_real"]) if r else 0.0
        tr = cr / hr if hr else te
        v_tarifa = (tr - te) * hr
        v_efic = (hr - he) * te
        detalle_mo.append({
            "cargo_id": cid, "cargo": nombre,
            "horas_estandar": round(he, 4), "tarifa_estandar": te, "costo_estandar": r2(he * te),
            "horas_reales": round(hr, 4), "tarifa_real": round(tr, 4), "costo_real": r2(cr),
            "variacion_tarifa": r2(v_tarifa), "variacion_eficiencia": r2(v_efic),
        })
        variaciones.append(("MOD", "Tarifa de mano de obra", nombre, v_tarifa))
        variaciones.append(("MOD", "Eficiencia de mano de obra", nombre, v_efic))

    horas_reales = sum(d["horas_reales"] for d in detalle_mo)

    # ---------------- CIF (aplicado a la orden y real prorrateado)
    pc = parametros_cif(o["periodo_id"])
    base = pc["base_aplicacion"]
    base_std = est["base_unitaria_todas"][base] * ue_cv
    cif_aplicado = base_std * pc["tasa_total"]
    base_real = _base_real_orden(o, base, horas_reales)
    base_real_total = base_real_periodo(o["periodo_id"], base)
    cif_real = pc["cif_real"] * (base_real / base_real_total) if base_real_total else 0.0

    mp_std = sum(d["costo_estandar"] for d in detalle_mp)
    mo_std = sum(d["costo_estandar"] for d in detalle_mo)
    mp_real = sum(d["costo_real"] for d in detalle_mp)
    mo_real = sum(d["costo_real"] for d in detalle_mo)
    total_std = mp_std + mo_std + cif_aplicado
    total_real = mp_real + mo_real + cif_real
    unidades = ue_cv or 1

    resultado = {
        "orden": o,
        "estandar_unitario": est,
        "unidades_equiv_mp": round(ue_mp, 4), "unidades_equiv_conv": round(ue_cv, 4),
        "materiales": detalle_mp, "mano_obra": detalle_mo,
        "cif": {
            "base_aplicacion": base, "tasa_fija": pc["tasa_fija"], "tasa_variable": pc["tasa_variable"],
            "tasa_total": pc["tasa_total"], "base_estandar_permitida": round(base_std, 4),
            "base_real": round(base_real, 4), "cif_aplicado": r2(cif_aplicado),
            "cif_real_prorrateado": r2(cif_real), "diferencia": r2(cif_real - cif_aplicado),
            "configurado": pc["configurado"],
        },
        "resumen": [
            {"elemento": "Materia prima directa", "estandar_unitario": est["mp_unitario"],
             "estandar_total": r2(mp_std), "real_total": r2(mp_real), "real_unitario": round(mp_real / (ue_mp or 1), 4),
             "diferencia": r2(mp_real - mp_std)},
            {"elemento": "Mano de obra directa", "estandar_unitario": est["mod_unitario"],
             "estandar_total": r2(mo_std), "real_total": r2(mo_real), "real_unitario": round(mo_real / unidades, 4),
             "diferencia": r2(mo_real - mo_std)},
            {"elemento": "Costos indirectos de fabricación", "estandar_unitario": est["cif_unitario"],
             "estandar_total": r2(cif_aplicado), "real_total": r2(cif_real), "real_unitario": round(cif_real / unidades, 4),
             "diferencia": r2(cif_real - cif_aplicado)},
        ],
        "total_estandar": r2(total_std), "total_real": r2(total_real),
        "total_estandar_unitario": est["total_unitario"],
        "total_real_unitario": round(total_real / unidades, 4),
        "diferencia_total": r2(total_real - total_std),
        "costo_terminado_estandar": r2(est["total_unitario"] * term),
        "costo_en_proceso_estandar": r2(total_std - est["total_unitario"] * term),
        "variaciones": [{"elemento": e, "tipo": t, "referencia": ref, "valor": r2(v), "naturaleza": naturaleza(v)}
                        for e, t, ref, v in variaciones],
    }
    resultado["diferencia_porcentual"] = round((total_real - total_std) / total_std * 100, 2) if total_std else 0
    return resultado


def guardar_orden(orden_id):
    """Calcula y persiste costos_estandar, costos_reales y variaciones de la orden."""
    res = calcular_orden(orden_id)
    if not res:
        return None
    o = res["orden"]
    est = res["estandar_unitario"]
    t = bd.ahora()
    bd.ejecutar("DELETE FROM costos_estandar WHERE orden_id=%s", (orden_id,), confirmar=False)
    bd.ejecutar("DELETE FROM costos_reales WHERE orden_id=%s", (orden_id,), confirmar=False)
    bd.ejecutar("DELETE FROM variaciones WHERE orden_id=%s", (orden_id,), confirmar=False)
    bd.ejecutar(
        "INSERT INTO costos_estandar (orden_id, unidades_equiv_mp, unidades_equiv_conv, mp_unitario, mod_unitario,"
        " cif_unitario, total_unitario, mp_total, mod_total, cif_aplicado, total, calculado_en)"
        " VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s)",
        (orden_id, res["unidades_equiv_mp"], res["unidades_equiv_conv"], est["mp_unitario"], est["mod_unitario"],
         est["cif_unitario"], est["total_unitario"], res["resumen"][0]["estandar_total"],
         res["resumen"][1]["estandar_total"], res["cif"]["cif_aplicado"], res["total_estandar"], t), confirmar=False)
    bd.ejecutar(
        "INSERT INTO costos_reales (orden_id, mp_total, mod_total, cif_total, total, total_unitario, calculado_en)"
        " VALUES (%s,%s,%s,%s,%s,%s,%s)",
        (orden_id, res["resumen"][0]["real_total"], res["resumen"][1]["real_total"], res["resumen"][2]["real_total"],
         res["total_real"], res["total_real_unitario"], t), confirmar=False)
    for v in res["variaciones"]:
        bd.ejecutar(
            "INSERT INTO variaciones (empresa_id, periodo_id, orden_id, elemento, tipo, referencia, valor, naturaleza, calculado_en)"
            " VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s)",
            (o["empresa_id"], o["periodo_id"], orden_id, v["elemento"], v["tipo"], v["referencia"][:150],
             v["valor"], v["naturaleza"], t), confirmar=False)
    bd.confirmar()
    return res


# ---------------------------------------------------------------------
# Análisis de variaciones del periodo
# ---------------------------------------------------------------------
def variaciones_periodo(empresa_id, periodo_id, producto_id=None):
    sql = "SELECT id FROM ordenes_produccion WHERE empresa_id=%s AND periodo_id=%s"
    params = [empresa_id, periodo_id]
    if producto_id:
        sql += " AND producto_id=%s"
        params.append(producto_id)
    ordenes = [calcular_orden(f["id"]) for f in bd.consultar(sql + " ORDER BY numero", params)]

    def suma(tipo):
        return r2(sum(v["valor"] for o in ordenes for v in o["variaciones"] if v["tipo"] == tipo))

    pc = parametros_cif(periodo_id)
    # Base estándar permitida del periodo (todas las órdenes; el CIF se analiza por periodo)
    todas = ordenes if not producto_id else [
        calcular_orden(f["id"]) for f in
        bd.consultar("SELECT id FROM ordenes_produccion WHERE empresa_id=%s AND periodo_id=%s", (empresa_id, periodo_id))]
    base_std = sum(o["cif"]["base_estandar_permitida"] for o in todas)
    aplicado = base_std * pc["tasa_total"]
    flexible = pc["cif_fijo_presupuestado"] + pc["tasa_variable"] * base_std
    v_presupuesto = pc["cif_real"] - flexible
    v_volumen = flexible - aplicado

    filas = [
        {"elemento": "MP", "tipo": "Variación de precio de materiales", "valor": suma("Precio de materiales")},
        {"elemento": "MP", "tipo": "Variación de cantidad de materiales", "valor": suma("Cantidad de materiales")},
        {"elemento": "MOD", "tipo": "Variación de tarifa de mano de obra", "valor": suma("Tarifa de mano de obra")},
        {"elemento": "MOD", "tipo": "Variación de eficiencia de mano de obra", "valor": suma("Eficiencia de mano de obra")},
        {"elemento": "CIF", "tipo": "Variación de presupuesto de CIF", "valor": r2(v_presupuesto)},
        {"elemento": "CIF", "tipo": "Variación de volumen de CIF", "valor": r2(v_volumen)},
    ]
    for f in filas:
        f["naturaleza"] = naturaleza(f["valor"])
    total = r2(sum(f["valor"] for f in filas))
    fav = r2(sum(f["valor"] for f in filas if f["valor"] < 0))
    desf = r2(sum(f["valor"] for f in filas if f["valor"] > 0))
    return {
        "variaciones": filas,
        "por_elemento": {
            "MP": r2(filas[0]["valor"] + filas[1]["valor"]),
            "MOD": r2(filas[2]["valor"] + filas[3]["valor"]),
            "CIF": r2(filas[4]["valor"] + filas[5]["valor"]),
        },
        "variacion_total": total, "naturaleza_total": naturaleza(total),
        "total_favorable": fav, "total_desfavorable": desf,
        "cif": {**pc, "base_estandar_permitida": round(base_std, 4), "cif_aplicado": r2(aplicado),
                "presupuesto_flexible": r2(flexible), "variacion_total_cif": r2(pc["cif_real"] - aplicado)},
        "ordenes": [{"id": o["orden"]["id"], "numero": o["orden"]["numero"], "producto": o["orden"]["producto"],
                     "total_estandar": o["total_estandar"], "total_real": o["total_real"],
                     "diferencia": o["diferencia_total"],
                     "variaciones": o["variaciones"]} for o in ordenes],
        "nota_cif": ("Las variaciones de CIF se analizan para todo el periodo"
                     + (" (no se filtran por producto)." if producto_id else ".")),
    }
