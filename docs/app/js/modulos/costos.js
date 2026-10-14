/* Hoja de costo estándar, hoja de costos por orden y análisis de variaciones. */
const BASES = { horas_mod: "Horas de mano de obra directa", horas_maquina: "Horas máquina", unidades: "Unidades producidas" };

function botonesExportar(tipo, params) {
  return `<div class="acciones no-imprimir">
    <button data-exp="xlsx" data-tipo="${tipo}" data-params="${UI.esc(params)}">Exportar Excel</button>
    <button data-exp="pdf" data-tipo="${tipo}" data-params="${UI.esc(params)}">Exportar PDF</button>
    <button data-imprimir="1">Imprimir</button></div>`;
}
function activarExportar(vista) {
  vista.addEventListener("click", async (ev) => {
    const b = ev.target.closest("button");
    if (!b) return;
    if (b.dataset.imprimir) return window.print();
    if (b.dataset.exp) {
      b.disabled = true;
      try {
        const n = await API.descargar(`/api/reportes/${b.dataset.tipo}?${b.dataset.params}&formato=${b.dataset.exp}`);
        UI.aviso("Descargado: " + n, "exito");
      } catch (e) { UI.errorAPI(e); } finally { b.disabled = false; }
    }
  });
}

// ---------------------------------------------------------------------- Hoja de costo estándar (por producto)
App.pagina("hoja-estandar", async (vista) => {
  const per = App.periodoActual();
  const productos = await UI.opcionesRef("productos", true);
  vista.innerHTML = `<div class="encabezado"><div><h1>Hoja de costo estándar</h1>
      <p>Costo estándar de UNA unidad de producto${per ? " con la tasa de CIF del periodo " + UI.esc(per.nombre) : ""}.</p></div>
      <div class="acciones">${UI.selectHTML("he-prod", productos.map((p) => ({ id: p.id, texto: p.codigo + " · " + p.nombre })), "", "Seleccione un producto")}
      <button data-imprimir="1">Imprimir</button></div></div><div id="he-cuerpo"></div>`;
  const cuerpo = vista.querySelector("#he-cuerpo");
  if (!productos.length) { cuerpo.innerHTML = `<div class="panel"><p>No hay productos. Créelos en <a href="#/r/productos">Productos</a>.</p></div>`; return; }
  async function cargar() {
    const pid = vista.querySelector("#he-prod").value;
    if (!pid) { cuerpo.innerHTML = `<div class="panel suave">Seleccione un producto.</div>`; return; }
    const h = await API.get(`/api/estandar/${pid}${per ? "?periodo_id=" + per.id : ""}`);
    cuerpo.innerHTML = `
      <div class="kpis">
        <div class="kpi"><div class="t">Materia prima</div><div class="v">${UI.fmt.moneda(h.mp_unitario)}</div></div>
        <div class="kpi"><div class="t">Mano de obra</div><div class="v">${UI.fmt.moneda(h.mod_unitario)}</div></div>
        <div class="kpi"><div class="t">CIF</div><div class="v">${UI.fmt.moneda(h.cif_unitario)}</div></div>
        <div class="kpi ambar"><div class="t">Costo estándar unitario</div><div class="v">${UI.fmt.moneda(h.total_unitario)}</div></div>
      </div>
      <div class="panel"><h3>Materiales directos</h3>${UI.tabla({
        columnas: [{ titulo: "Código", clave: "codigo" }, { titulo: "Materia prima", clave: "descripcion" }, { titulo: "Unidad", clave: "unidad" },
          { titulo: "Cantidad estándar", clave: "cantidad_estandar", tipo: "numero" }, { titulo: "Precio estándar", clave: "precio_estandar", tipo: "moneda" },
          { titulo: "Costo", clave: "costo", tipo: "moneda" }],
        filas: h.materiales, totales: { codigo: "TOTAL", costo: h.mp_unitario }, vacio: "Sin estándar de materiales." })}</div>
      <div class="panel"><h3>Mano de obra directa</h3>${UI.tabla({
        columnas: [{ titulo: "Cargo", clave: "cargo" }, { titulo: "Horas estándar", clave: "horas_estandar", tipo: "numero" },
          { titulo: "Tarifa estándar", clave: "tarifa_estandar", tipo: "moneda" }, { titulo: "Costo", clave: "costo", tipo: "moneda" }],
        filas: h.mano_obra, totales: { cargo: "TOTAL", horas_estandar: h.horas_mod_unitarias, costo: h.mod_unitario }, vacio: "Sin estándar de mano de obra." })}</div>
      <div class="panel"><h3>Costos indirectos de fabricación</h3>
        ${per ? `<p>Base: <b>${UI.esc(BASES[h.base_aplicacion])}</b> · Base por unidad: <b>${UI.fmt.num(h.base_unitaria)}</b> ·
        Tasa fija ${UI.fmt.moneda(h.tasa_fija)} + tasa variable ${UI.fmt.moneda(h.tasa_variable)} = tasa predeterminada <b>${UI.fmt.moneda(h.tasa_cif)}</b></p>
        <div class="formula">CIF estándar unitario = ${UI.fmt.num(h.base_unitaria)} × ${UI.fmt.moneda(h.tasa_cif)} = ${UI.fmt.moneda(h.cif_unitario)}</div>
        ${h.tasa_cif ? "" : `<p class="val-desf">El periodo no tiene base de aplicación o CIF presupuestados. Regístrelos en <a href="#/r/cif_parametros">Base y tasa predeterminada</a>.</p>`}`
        : `<p>Cree un periodo para calcular la tasa de CIF.</p>`}</div>`;
  }
  vista.querySelector("#he-prod").addEventListener("change", () => cargar().catch(UI.errorAPI));
  vista.addEventListener("click", (ev) => { if (ev.target.closest("[data-imprimir]")) window.print(); });
  await cargar();
});

// ---------------------------------------------------------------------- Hoja de costos por orden
App.pagina("hoja-costos", async (vista) => {
  const per = App.periodoActual();
  if (!per) { vista.innerHTML = `<div class="panel"><p>Cree primero un <a href="#/r/periodos">periodo contable</a>.</p></div>`; return; }
  const ordenes = await API.get("/api/ordenes?periodo_id=" + per.id);
  const sel = new URLSearchParams(location.hash.split("?")[1] || "").get("orden") || ordenes[0]?.id || "";
  vista.innerHTML = `<div class="encabezado"><div><h1>Hoja de costos</h1><p>Costo estándar unitario y total, costo real, diferencias y variaciones por orden.</p></div>
    <div class="acciones">${UI.selectHTML("hc-orden", ordenes.map((o) => ({ id: o.id, texto: o.numero + " · " + o.producto })), sel, ordenes.length ? undefined : "Sin órdenes")}</div></div>
    <div id="hc-cuerpo"></div>`;
  activarExportar(vista);
  const cuerpo = vista.querySelector("#hc-cuerpo");
  if (!ordenes.length) { cuerpo.innerHTML = `<div class="panel"><p>No hay órdenes en el periodo ${UI.esc(per.nombre)}. Regístrelas en <a href="#/ordenes">Órdenes de producción</a>.</p></div>`; return; }

  async function cargar() {
    const oid = vista.querySelector("#hc-orden").value;
    const h = await API.get(`/api/ordenes/${oid}/hoja`);
    const o = h.orden, c = h.cif;
    cuerpo.innerHTML = `
      <div class="panel">
        <div class="encabezado" style="margin-bottom:6px"><div>
          <h2>Orden ${UI.esc(o.numero)} · ${UI.esc(o.producto_codigo)} ${UI.esc(o.producto)}</h2>
          <p>Fecha ${UI.esc(o.fecha)} · ${UI.esc(o.estado)} · ${UI.fmt.num(o.cantidad_terminada)} terminadas, ${UI.fmt.num(o.cantidad_en_proceso)} en proceso
          (avance MP ${UI.fmt.num(o.avance_materiales)} %, conversión ${UI.fmt.num(o.avance_conversion)} %) ·
          Unidades equivalentes: MP ${UI.fmt.num(h.unidades_equiv_mp)}, conversión ${UI.fmt.num(h.unidades_equiv_conv)}</p></div>
          ${botonesExportar("hoja_costos", "periodo_id=" + per.id + "&orden_id=" + oid)}</div>
        ${UI.tabla({
          columnas: [{ titulo: "Elemento", clave: "elemento" }, { titulo: "Estándar unitario", clave: "estandar_unitario", tipo: "moneda" },
            { titulo: "Estándar total", clave: "estandar_total", tipo: "moneda" }, { titulo: "Real unitario", clave: "real_unitario", tipo: "moneda" },
            { titulo: "Real total", clave: "real_total", tipo: "moneda" }, { titulo: "Diferencia", clave: "diferencia", tipo: "variacion" }],
          filas: h.resumen,
          totales: { elemento: "TOTAL", estandar_unitario: h.total_estandar_unitario, estandar_total: h.total_estandar,
            real_unitario: h.total_real_unitario, real_total: h.total_real, diferencia: h.diferencia_total } })}
        <p>Diferencia porcentual: <b class="${h.diferencia_porcentual > 0 ? "val-desf" : "val-fav"}">${UI.fmt.pct(h.diferencia_porcentual)}</b> ·
          Producción terminada a estándar: <b>${UI.fmt.moneda(h.costo_terminado_estandar)}</b> · Producción en proceso a estándar: <b>${UI.fmt.moneda(h.costo_en_proceso_estandar)}</b></p>
      </div>
      <div class="panel"><h3>Materiales: variación de precio y de cantidad</h3>${UI.tabla({
        columnas: [{ titulo: "Materia prima", clave: "materia_prima" }, { titulo: "Cant. estándar", clave: "cantidad_estandar", tipo: "numero" },
          { titulo: "Precio est.", clave: "precio_estandar", tipo: "moneda" }, { titulo: "Cant. real", clave: "cantidad_real", tipo: "numero" },
          { titulo: "Precio real", clave: "precio_real", tipo: "moneda" }, { titulo: "Var. precio", clave: "variacion_precio", tipo: "variacion" },
          { titulo: "Var. cantidad", clave: "variacion_cantidad", tipo: "variacion" }],
        filas: h.materiales, vacio: "Sin materiales.",
        totales: { materia_prima: "TOTAL", variacion_precio: h.materiales.reduce((s, x) => s + x.variacion_precio, 0), variacion_cantidad: h.materiales.reduce((s, x) => s + x.variacion_cantidad, 0) } })}</div>
      <div class="panel"><h3>Mano de obra: variación de tarifa y de eficiencia</h3>${UI.tabla({
        columnas: [{ titulo: "Cargo", clave: "cargo" }, { titulo: "Horas estándar", clave: "horas_estandar", tipo: "numero" },
          { titulo: "Tarifa est.", clave: "tarifa_estandar", tipo: "moneda" }, { titulo: "Horas reales", clave: "horas_reales", tipo: "numero" },
          { titulo: "Tarifa real", clave: "tarifa_real", tipo: "moneda" }, { titulo: "Var. tarifa", clave: "variacion_tarifa", tipo: "variacion" },
          { titulo: "Var. eficiencia", clave: "variacion_eficiencia", tipo: "variacion" }],
        filas: h.mano_obra, vacio: "Sin mano de obra.",
        totales: { cargo: "TOTAL", variacion_tarifa: h.mano_obra.reduce((s, x) => s + x.variacion_tarifa, 0), variacion_eficiencia: h.mano_obra.reduce((s, x) => s + x.variacion_eficiencia, 0) } })}</div>
      <div class="panel"><h3>CIF aplicado</h3>
        ${c.configurado ? "" : `<p class="val-desf">El periodo no tiene base de aplicación configurada; el CIF aplicado es cero.</p>`}
        <p>Base: <b>${UI.esc(BASES[c.base_aplicacion])}</b> · Tasa predeterminada <b>${UI.fmt.moneda(c.tasa_total)}</b>
          (fija ${UI.fmt.moneda(c.tasa_fija)} + variable ${UI.fmt.moneda(c.tasa_variable)})</p>
        <div class="formula">CIF aplicado = base estándar permitida ${UI.fmt.num(c.base_estandar_permitida)} × ${UI.fmt.moneda(c.tasa_total)} = ${UI.fmt.moneda(c.cif_aplicado)}</div>
        <div class="formula">CIF real asignado = CIF real del periodo × (base real de la orden ${UI.fmt.num(c.base_real)} / base real del periodo) = ${UI.fmt.moneda(c.cif_real_prorrateado)}</div>
        <p class="suave peq">Las variaciones de presupuesto y de volumen de CIF se analizan para todo el periodo en «Análisis de variaciones».</p></div>`;
  }
  vista.querySelector("#hc-orden").addEventListener("change", () => cargar().catch(UI.errorAPI));
  await cargar();
});

// ---------------------------------------------------------------------- Análisis de variaciones
App.pagina("variaciones", async (vista) => {
  const per = App.periodoActual();
  if (!per) { vista.innerHTML = `<div class="panel"><p>Cree primero un <a href="#/r/periodos">periodo contable</a>.</p></div>`; return; }
  const productos = await UI.opcionesRef("productos", true);
  vista.innerHTML = `<div class="encabezado"><div><h1>Análisis de variaciones</h1><p>Periodo ${UI.esc(per.nombre)} · positivo = desfavorable, negativo = favorable</p></div>
    <div class="acciones">${UI.selectHTML("v-prod", productos.map((p) => ({ id: p.id, texto: p.codigo + " · " + p.nombre })), "", "Todos los productos")}</div></div>
    <div id="v-cuerpo"><div class="cargando">Calculando…</div></div>`;
  activarExportar(vista);
  async function cargar() {
    const prod = vista.querySelector("#v-prod").value;
    const v = await API.get(`/api/variaciones?periodo_id=${per.id}${prod ? "&producto_id=" + prod : ""}`);
    const c = v.cif;
    const params = "periodo_id=" + per.id + (prod ? "&producto_id=" + prod : "");
    vista.querySelector("#v-cuerpo").innerHTML = `
      <div class="kpis">
        <div class="kpi ${v.variacion_total > 0 ? "desf" : "fav"}"><div class="t">Variación total</div><div class="v">${UI.fmt.moneda(v.variacion_total)}</div><div class="s">${UI.naturaleza(v.naturaleza_total)}</div></div>
        <div class="kpi fav"><div class="t">Total favorables</div><div class="v">${UI.fmt.moneda(v.total_favorable)}</div></div>
        <div class="kpi desf"><div class="t">Total desfavorables</div><div class="v">${UI.fmt.moneda(v.total_desfavorable)}</div></div>
      </div>
      <div class="dos-col">
        <div class="panel"><div class="encabezado" style="margin:0 0 8px"><h3 style="margin:0">Resumen</h3>${botonesExportar("variaciones", params)}</div>
          ${UI.tabla({ columnas: [{ titulo: "Elemento", clave: "elemento" }, { titulo: "Variación", clave: "tipo" },
            { titulo: "Valor", clave: "valor", tipo: "variacion" }, { titulo: "Naturaleza", clave: "naturaleza", tipo: "naturaleza" }],
            filas: v.variaciones, totales: { elemento: "TOTAL", valor: v.variacion_total, naturaleza: v.naturaleza_total } })}</div>
        <div class="panel grafico"><h3>Gráfico de variaciones</h3><div id="v-graf"></div></div>
      </div>
      <div class="panel"><h3>Análisis de CIF (dos variaciones)</h3>
        <div class="rejilla">
          <div><div class="formula">Tasa fija = ${UI.fmt.moneda(c.cif_fijo_presupuestado)} / ${UI.fmt.num(c.nivel_normal)} = ${UI.fmt.moneda(c.tasa_fija)}</div>
            <div class="formula">Tasa variable = ${UI.fmt.moneda(c.cif_variable_presupuestado)} / ${UI.fmt.num(c.nivel_normal)} = ${UI.fmt.moneda(c.tasa_variable)}</div>
            <div class="formula">CIF aplicado = ${UI.fmt.num(c.base_estandar_permitida)} × ${UI.fmt.moneda(c.tasa_total)} = ${UI.fmt.moneda(c.cif_aplicado)}</div></div>
          <div><div class="formula">Presupuesto flexible = ${UI.fmt.moneda(c.cif_fijo_presupuestado)} + ${UI.fmt.moneda(c.tasa_variable)} × ${UI.fmt.num(c.base_estandar_permitida)} = ${UI.fmt.moneda(c.presupuesto_flexible)}</div>
            <div class="formula">Var. presupuesto = CIF real ${UI.fmt.moneda(c.cif_real)} − flexible = ${UI.fmt.moneda(c.cif_real - c.presupuesto_flexible)}</div>
            <div class="formula">Var. volumen = flexible − aplicado = ${UI.fmt.moneda(c.presupuesto_flexible - c.cif_aplicado)}</div></div>
        </div><p class="suave peq">${UI.esc(v.nota_cif)} Base: ${UI.esc(BASES[c.base_aplicacion])}.</p></div>
      <div class="panel"><h3>Detalle por orden</h3>${UI.tabla({
        columnas: [{ titulo: "Orden", clave: "numero" }, { titulo: "Producto", clave: "producto" }, { titulo: "Costo estándar", clave: "total_estandar", tipo: "moneda" },
          { titulo: "Costo real", clave: "total_real", tipo: "moneda" }, { titulo: "Diferencia", clave: "diferencia", tipo: "variacion" }],
        filas: v.ordenes, vacio: "No hay órdenes en el periodo.", acciones: (o) => `<a class="btn btn-chico" href="#/hoja-costos?orden=${o.id}">Ver hoja</a>` })}</div>`;
    Graficos.variaciones(vista.querySelector("#v-graf"), v.variaciones.map((x) => ({ etiqueta: x.tipo.replace("Variación de ", ""), valor: x.valor })));
  }
  vista.querySelector("#v-prod").addEventListener("change", () => cargar().catch(UI.errorAPI));
  await cargar();
});
