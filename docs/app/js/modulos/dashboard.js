/* Dashboard (pantalla principal): costo unitario de cada producto, consumos por unidad
   (materia prima, mano de obra, horas máquina, CIF), total del producto elegido y análisis
   de la producción real del periodo. */
App.pagina("dashboard", async (vista) => {
  const per = App.periodoActual();
  if (!per) {
    vista.innerHTML = `<div class="panel"><h2>Dashboard</h2><p>Cree un <a href="#/r/periodos">periodo contable</a> para ver los indicadores.</p></div>`;
    return;
  }
  const productos = await UI.opcionesRef("productos", true);
  const emp = App.emprendimiento();
  vista.innerHTML = `
    <div class="encabezado">
      <div><h1>Dashboard</h1><p>${emp ? "Empresa " + UI.esc(emp) + " · " : ""}Periodo ${UI.esc(per.nombre)} · costo unitario, consumos y costos reales</p></div>
      <div class="acciones">
        <label for="d-prod" style="margin:0">Producto</label>
        ${UI.selectHTML("d-prod", productos.map((p) => ({ id: p.id, texto: p.codigo + " · " + p.nombre })), "", "Todos los productos")}
        <label for="d-cant" class="d-cant oculto" style="margin:0">Cantidad</label>
        <input id="d-cant" class="d-cant oculto" type="number" min="1" step="1" value="1" style="width:90px">
        <button id="d-imprimir">Imprimir</button>
      </div>
    </div>
    <div id="d-cuerpo"><div class="cargando">Calculando…</div></div>`;

  const $v = (s) => vista.querySelector(s);
  const m = UI.fmt.moneda, n = (v, d) => UI.fmt.num(v, d === undefined ? 2 : d);
  const kpi = (t, v, s, c) => `<div class="kpi ${c || ""}"><div class="t">${t}</div><div class="v">${v}</div><div class="s">${s || ""}</div></div>`;
  const margenTxt = (v) => (v === null || v === undefined ? "—" : `<span class="${v < 0 ? "val-desf" : "val-fav"}">${UI.fmt.pct(v)}</span>`);
  let datos = null;

  // ------------------------------------------------------------ Todos los productos
  function resumen(cuerpo) {
    const c = datos.consumo, ps = datos.productos;
    cuerpo.innerHTML = `
      <div class="kpis">
        ${kpi("Productos", n(ps.length, 0), "con costo estándar calculado")}
        ${kpi("Materia prima usada", m(c.costo_materiales), c.ordenes ? c.materiales.length + " insumos en " + c.ordenes + " órdenes" : "sin órdenes en el periodo", "ambar")}
        ${kpi("Horas de mano de obra", n(c.horas_mod), c.ordenes ? "costo " + m(c.costo_mod) : "reales del periodo")}
        ${kpi("Horas máquina", n(c.horas_maquina), "reales del periodo (horneadas)")}
        ${kpi("Unidades producidas", n(c.terminadas, 2), n(c.en_proceso, 2) + " en proceso")}
      </div>
      <div class="panel"><h3>Costo unitario de cada producto</h3>
        <p class="suave">Costo estándar de una unidad con la tasa de CIF de ${UI.esc(per.nombre)}. Haga clic en un producto para ver su detalle y su total.</p>
        <div id="t-costos"></div></div>
      <div class="panel"><h3>Consumo por unidad de producto</h3><div id="t-consumo"></div></div>
      <div class="panel" id="p-cif"></div>
      <div class="panel"><h3>Materia prima usada en producción · ${UI.esc(per.nombre)}</h3><div id="t-usada"></div></div>
      <div id="d-reales"></div>`;
    cuerpo.querySelector("#t-costos").innerHTML = UI.tabla({
      columnas: [{ titulo: "Código", clave: "codigo" }, { titulo: "Producto", clave: "producto" },
        { titulo: "Materia prima", clave: "mp_unitario", tipo: "moneda" }, { titulo: "Mano de obra", clave: "mod_unitario", tipo: "moneda" },
        { titulo: "CIF", clave: "cif_unitario", tipo: "moneda" },
        { titulo: "Costo unitario", clave: "costo_unitario", tipo: "moneda", render: (v) => `<strong>${m(v)}</strong>` },
        { titulo: "Precio de venta", clave: "precio_venta", tipo: "moneda" },
        { titulo: "Utilidad / und", clave: "utilidad_unitaria", tipo: "moneda", render: (v) => `<span class="${v < 0 ? "val-desf" : "val-fav"}">${m(v)}</span>` },
        { titulo: "Margen", clave: "margen", tipo: "numero", render: margenTxt }],
      filas: ps, vacio: "No hay productos registrados.",
    });
    cuerpo.querySelector("#t-consumo").innerHTML = UI.tabla({
      columnas: [{ titulo: "Producto", clave: "producto" }, { titulo: "Insumos en la receta", clave: "insumos", tipo: "numero" },
        { titulo: "Materia prima", clave: "mp_unitario", tipo: "moneda" },
        { titulo: "Horas de mano de obra", clave: "horas_mod", tipo: "numero", render: (v) => n(v, 4) },
        { titulo: "Horas máquina", clave: "horas_maquina", tipo: "numero", render: (v) => n(v, 4) },
        { titulo: "CIF aplicado", clave: "cif_unitario", tipo: "moneda" }],
      filas: ps, vacio: "No hay productos registrados.",
    });
    usada(cuerpo.querySelector("#t-usada"), c);
    panelCif(cuerpo.querySelector("#p-cif"), null);
    cuerpo.querySelectorAll("#t-costos tbody tr").forEach((tr, i) => {
      if (!ps[i]) return;
      tr.style.cursor = "pointer";
      tr.title = "Ver el detalle de " + ps[i].producto;
      tr.addEventListener("click", () => { $v("#d-prod").value = ps[i].id; cambiarProducto(); });
    });
  }

  function usada(cont, c) {
    cont.innerHTML = c.ordenes ? UI.tabla({
      columnas: [{ titulo: "Código", clave: "codigo" }, { titulo: "Materia prima", clave: "descripcion" }, { titulo: "Unidad", clave: "unidad" },
        { titulo: "Cantidad usada", clave: "cantidad", tipo: "numero", render: (v) => n(v, 4) }, { titulo: "Costo real", clave: "costo", tipo: "moneda" }],
      filas: c.materiales, totales: { descripcion: "Total", costo: c.costo_materiales },
    }) : `<p class="suave">Todavía no hay órdenes de producción en este periodo. Cuando registre una en
      <a href="#/ordenes">Producción › Órdenes de producción</a>, aquí aparecerán la materia prima usada, las horas de
      mano de obra y las horas máquina reales.</p>`;
  }

  // ------------------------------------------------------------ Un producto elegido
  function detalleProducto(cuerpo) {
    const d = datos.detalle;
    if (!d) { cuerpo.innerHTML = `<div class="panel"><p>No se encontró el producto.</p></div>`; return; }
    const q = Math.max(Number($v("#d-cant").value) || 1, 0);
    const mats = d.materiales.map((x) => ({ ...x, cantidad_total: x.cantidad_estandar * q, costo_total: x.costo * q }));
    const mo = d.mano_obra.map((x) => ({ ...x, horas_total: x.horas_estandar * q, costo_total: x.costo * q }));
    const costoTotal = d.costo_unitario * q, venta = d.precio_venta * q;
    cuerpo.innerHTML = `
      <div class="kpis">
        ${kpi("Costo unitario", m(d.costo_unitario), "materia prima + mano de obra + CIF")}
        ${kpi("Precio de venta", m(d.precio_venta), "por unidad", "ambar")}
        ${kpi("Utilidad por unidad", m(d.utilidad_unitaria), "precio − costo", d.utilidad_unitaria < 0 ? "desf" : "fav")}
        ${kpi("Margen", d.margen === null ? "—" : UI.fmt.pct(d.margen), "sobre el precio de venta", d.margen !== null && d.margen < 0 ? "desf" : "fav")}
      </div>
      <div class="panel"><h3>Total del producto · ${n(q, 2)} ${q === 1 ? "unidad" : "unidades"}</h3>
        <p class="suave">Cambie la <strong>Cantidad</strong> en la parte superior para recalcular${d.unidades_lote > 1 ? ` (este producto se hace en lotes de ${d.unidades_lote})` : ""}.</p>
        <div class="kpis">
          ${kpi("Materia prima", m(d.mp_unitario * q), d.insumos + " insumos")}
          ${kpi("Mano de obra", m(d.mod_unitario * q), n(d.horas_mod * q, 4) + " horas")}
          ${kpi("Horas máquina", n(d.horas_maquina * q, 4), "horneadas")}
          ${kpi("CIF", m(d.cif_unitario * q), "tasa " + m(d.tasa_cif))}
          ${kpi("Costo total", m(costoTotal), "", "ambar")}
          ${kpi("Venta total", m(venta), "")}
          ${kpi("Utilidad total", m(venta - costoTotal), "", venta - costoTotal < 0 ? "desf" : "fav")}
        </div></div>
      <div class="panel"><h3>Materia prima a usar</h3><div id="t-mat"></div></div>
      <div class="panel"><h3>Mano de obra</h3><div id="t-mo"></div></div>
      <div class="panel" id="p-cif"></div>
      <div class="panel"><h3>Materia prima usada en producción · ${UI.esc(per.nombre)}</h3><div id="t-usada"></div></div>
      <div id="d-reales"></div>`;
    cuerpo.querySelector("#t-mat").innerHTML = UI.tabla({
      columnas: [{ titulo: "Código", clave: "codigo" }, { titulo: "Materia prima", clave: "descripcion" }, { titulo: "Unidad", clave: "unidad" },
        { titulo: "Cantidad por unidad", clave: "cantidad_estandar", tipo: "numero", render: (v) => n(v, 4) },
        { titulo: "Cantidad total", clave: "cantidad_total", tipo: "numero", render: (v) => n(v, 2) },
        { titulo: "Precio estándar", clave: "precio_estandar", tipo: "moneda" },
        { titulo: "Costo total", clave: "costo_total", tipo: "moneda" }],
      filas: mats, totales: { descripcion: "Total", costo_total: d.mp_unitario * q }, vacio: "Este producto no tiene receta.",
    });
    cuerpo.querySelector("#t-mo").innerHTML = UI.tabla({
      columnas: [{ titulo: "Cargo", clave: "cargo" }, { titulo: "Horas por unidad", clave: "horas_estandar", tipo: "numero", render: (v) => n(v, 4) },
        { titulo: "Horas totales", clave: "horas_total", tipo: "numero", render: (v) => n(v, 4) },
        { titulo: "Tarifa por hora", clave: "tarifa_estandar", tipo: "moneda" }, { titulo: "Costo total", clave: "costo_total", tipo: "moneda" }],
      filas: mo, totales: { cargo: "Total", costo_total: d.mod_unitario * q }, vacio: "Sin estándar de mano de obra.",
    });
    usada(cuerpo.querySelector("#t-usada"), datos.consumo);
    panelCif(cuerpo.querySelector("#p-cif"), d);
  }

  // ------------------------------------------------------------ CIF aplicado y real
  function panelCif(cont, prod) {
    const f = datos.cif;
    if (!f || !f.configurado) {
      cont.innerHTML = `<h3>Costos indirectos de fabricación (CIF)</h3><p class="suave">Configure la base de aplicación en
        <a href="#/r/cif_parametros">CIF › Base y tasa predeterminada</a> y registre los CIF en <a href="#/r/cif">CIF › Registro de CIF</a>.</p>`;
      return;
    }
    const dif = f.diferencia, hayOrdenes = datos.consumo.ordenes > 0;
    const estado = Math.abs(dif) < 0.005 ? "Sin diferencia" : dif > 0 ? "Subaplicado (desfavorable)" : "Sobreaplicado (favorable)";
    const totP = f.conceptos.reduce((s, x) => s + Number(x.valor_presupuestado || 0), 0);
    const totR = f.conceptos.reduce((s, x) => s + Number(x.valor_real || 0), 0);
    cont.innerHTML = `
      <h3>Costos indirectos de fabricación (CIF)${prod ? " · " + UI.esc(prod.producto) : ""} · ${UI.esc(per.nombre)}</h3>
      <p class="suave">Base de aplicación: <strong>${UI.esc(f.base)}</strong> · nivel normal ${n(f.nivel_normal)} ·
        tasa predeterminada <strong>${m(f.tasa)}</strong> (fija ${m(f.tasa_fija)} + variable ${m(f.tasa_variable)})${prod ? ` · CIF estándar por unidad <strong>${m(prod.cif_unitario)}</strong>` : ""}</p>
      <div class="kpis">
        ${kpi("CIF presupuestado", m(f.presupuestado), "total del periodo")}
        ${kpi("CIF real", m(f.real), f.real ? "registrado en el periodo" : "aún sin registrar", "ambar")}
        ${kpi("CIF aplicado", m(f.aplicado), (prod ? "a este producto" : "a la producción") + " · tasa × base estándar")}
        ${kpi("CIF real asignado", m(f.real_asignado), (prod ? "a este producto" : "a la producción") + " · prorrateado")}
        ${kpi("Diferencia", m(Math.abs(dif)), hayOrdenes ? estado : "sin órdenes en el periodo", hayOrdenes ? (dif > 0.005 ? "desf" : dif < -0.005 ? "fav" : "") : "")}
      </div>
      <div id="t-cif"></div>
      ${!hayOrdenes ? `<p class="suave">El CIF aplicado y el real asignado se calculan cuando se registran órdenes de producción.</p>` : ""}
      ${!f.real ? `<p class="suave">Para comparar, registre el valor real de cada concepto en <a href="#/r/cif">CIF › Registro de CIF</a>.</p>` : ""}`;
    cont.querySelector("#t-cif").innerHTML = UI.tabla({
      columnas: [{ titulo: "Código", clave: "codigo" }, { titulo: "Concepto", clave: "concepto" }, { titulo: "Comportamiento", clave: "comportamiento" },
        { titulo: "Presupuestado", clave: "valor_presupuestado", tipo: "moneda" }, { titulo: "Real", clave: "valor_real", tipo: "moneda" }],
      filas: f.conceptos, totales: { concepto: "Total", valor_presupuestado: totP, valor_real: totR }, vacio: "No hay CIF registrados en el periodo.",
    });
  }

  // ------------------------------------------------------------ Producción real (órdenes)
  async function analisisReal(cont, prod) {
    const d = await API.get(`/api/dashboard?periodo_id=${per.id}${prod ? "&producto_id=" + prod : ""}`);
    const k = d.kpis;
    if (!k.ordenes) { cont.innerHTML = ""; return; }
    const clase = (v) => (v > 0.004 ? "desf" : v < -0.004 ? "fav" : "");
    const nat = (v) => (v > 0.004 ? "Desfavorable" : v < -0.004 ? "Favorable" : "Sin variación");
    cont.innerHTML = `
      <h2 style="margin:8px 0 12px">Producción real del periodo: estándar vs. real</h2>
      <div class="kpis">
        ${kpi("Costo estándar unitario", m(k.costo_estandar_unitario), "promedio ponderado por unidad equivalente")}
        ${kpi("Costo real unitario", m(k.costo_real_unitario), "promedio ponderado por unidad equivalente", "ambar")}
        ${kpi("Diferencia porcentual", UI.fmt.pct(k.diferencia_porcentual), "real vs. estándar", clase(k.diferencia_porcentual))}
        ${kpi("Costo total de producción", m(k.costo_total_produccion), "estándar " + m(k.costo_total_estandar))}
        ${kpi("Margen", k.margen === null ? "—" : UI.fmt.pct(k.margen), "sobre unidades terminadas", k.margen !== null && k.margen < 0 ? "desf" : "fav")}
        ${kpi("Variación de materiales", m(k.variacion_materiales), nat(k.variacion_materiales), clase(k.variacion_materiales))}
        ${kpi("Variación de mano de obra", m(k.variacion_mano_obra), nat(k.variacion_mano_obra), clase(k.variacion_mano_obra))}
        ${kpi("Variación de CIF", m(k.variacion_cif), nat(k.variacion_cif) + " · todo el periodo", clase(k.variacion_cif))}
        ${kpi("Variación total", m(k.variacion_total), nat(k.variacion_total), clase(k.variacion_total))}
      </div>
      <div class="dos-col">
        <div class="panel grafico"><h3>Estándar vs. real por elemento</h3><div id="g-elem"></div></div>
        <div class="panel grafico"><h3>Variaciones</h3><div id="g-var"></div></div>
      </div>
      <div class="dos-col">
        <div class="panel grafico"><h3>Evolución por periodo</h3><div id="g-tend"></div></div>
        <div class="panel"><h3>Costo real unitario y margen por producto</h3><div id="t-prod"></div></div>
      </div>`;
    Graficos.barras(cont.querySelector("#g-elem"), {
      categorias: d.elementos.map((e) => e.elemento),
      series: [{ nombre: "Estándar", color: Graficos.COLORES.estandar, valores: d.elementos.map((e) => e.estandar) },
        { nombre: "Real", color: Graficos.COLORES.real, valores: d.elementos.map((e) => e.real) }],
    });
    Graficos.variaciones(cont.querySelector("#g-var"), d.variaciones.map((v) => ({
      etiqueta: v.tipo.replace("Variación de ", "").replace(" de mano de obra", " MOD").replace(" de materiales", " MP"), valor: v.valor })));
    Graficos.lineas(cont.querySelector("#g-tend"), {
      categorias: d.tendencia.map((t) => t.periodo),
      series: [{ nombre: "Estándar", color: Graficos.COLORES.estandar, valores: d.tendencia.map((t) => t.estandar) },
        { nombre: "Real", color: Graficos.COLORES.real, valores: d.tendencia.map((t) => t.real) }],
    });
    cont.querySelector("#t-prod").innerHTML = UI.tabla({
      columnas: [{ titulo: "Producto", clave: "producto" }, { titulo: "Estándar", clave: "costo_estandar_unitario", tipo: "moneda" },
        { titulo: "Real", clave: "costo_real_unitario", tipo: "moneda" },
        { titulo: "Dif. %", clave: "diferencia_porcentual", tipo: "numero", render: (v) => `<span class="${v > 0 ? "val-desf" : v < 0 ? "val-fav" : ""}">${UI.fmt.pct(v)}</span>` },
        { titulo: "Precio", clave: "precio_venta", tipo: "moneda" }, { titulo: "Margen", clave: "margen", tipo: "numero", render: (v) => UI.fmt.pct(v) }],
      filas: d.productos,
    });
  }

  function dibujar() {
    const prod = $v("#d-prod").value, cuerpo = $v("#d-cuerpo");
    vista.querySelectorAll(".d-cant").forEach((x) => x.classList.toggle("oculto", !prod));
    if (prod) detalleProducto(cuerpo); else resumen(cuerpo);
  }

  async function cargar() {
    const prod = $v("#d-prod").value;
    datos = await API.get(`/api/dashboard/productos?periodo_id=${per.id}${prod ? "&producto_id=" + prod : ""}`);
    if (prod && datos.detalle) $v("#d-cant").value = datos.detalle.unidades_lote || 1;
    dibujar();
    await analisisReal($v("#d-reales"), prod);
  }
  function cambiarProducto() { cargar().catch(UI.errorAPI); window.scrollTo(0, 0); }

  $v("#d-prod").addEventListener("change", cambiarProducto);
  $v("#d-cant").addEventListener("input", () => { if (datos && datos.detalle) { const r = $v("#d-reales").innerHTML; dibujar(); $v("#d-reales").innerHTML = r; } });
  $v("#d-imprimir").addEventListener("click", () => window.print());
  await cargar();
});
