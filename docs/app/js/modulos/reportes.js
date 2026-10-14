/* Reportes: vista previa, exportación a Excel y PDF e impresión. */
App.pagina("reportes", async (vista) => {
  const per = App.periodoActual();
  if (!per) { vista.innerHTML = `<div class="panel"><p>Cree primero un <a href="#/r/periodos">periodo contable</a>.</p></div>`; return; }
  const TIPOS = [
    ["hoja_costos", "Hoja de costos (por orden)"], ["materiales", "Reporte de materiales"], ["mano_obra", "Reporte de mano de obra"],
    ["cif", "Reporte de CIF"], ["produccion", "Reporte de producción"], ["variaciones", "Reporte de variaciones"],
    ["estado_costos", "Estado de costos de producción"]];
  const [productos, ordenes] = await Promise.all([UI.opcionesRef("productos", true), API.get("/api/ordenes?periodo_id=" + per.id)]);
  vista.innerHTML = `<div class="encabezado"><div><h1>Reportes</h1><p>Periodo ${UI.esc(per.nombre)}</p></div></div>
    <div class="panel no-imprimir"><div class="rejilla">
      <div class="campo"><label for="rp-tipo">Reporte</label>${UI.selectHTML("rp-tipo", TIPOS.map(([id, t]) => ({ id, texto: t })), "variaciones")}</div>
      <div class="campo" id="c-prod"><label for="rp-prod">Producto</label>${UI.selectHTML("rp-prod", productos.map((p) => ({ id: p.id, texto: p.codigo + " · " + p.nombre })), "", "Todos")}</div>
      <div class="campo oculto" id="c-orden"><label for="rp-orden">Orden de producción</label>${UI.selectHTML("rp-orden", ordenes.map((o) => ({ id: o.id, texto: o.numero + " · " + o.producto })), "", "Seleccione")}</div>
    </div>
    <div class="acciones"><button class="btn-primario" id="rp-ver">Ver reporte</button>
      <button data-f="xlsx">Exportar a Excel</button><button data-f="pdf">Exportar a PDF</button><button id="rp-imp">Imprimir</button></div></div>
    <div id="rp-salida"></div>`;
  const $ = (s) => vista.querySelector(s);
  const params = () => {
    const t = $("#rp-tipo").value;
    let q = "periodo_id=" + per.id;
    if (t === "hoja_costos") q += "&orden_id=" + $("#rp-orden").value;
    else if ($("#rp-prod").value && !["cif"].includes(t)) q += "&producto_id=" + $("#rp-prod").value;
    return q;
  };
  const validar = () => {
    if ($("#rp-tipo").value === "hoja_costos" && !$("#rp-orden").value) { UI.aviso("Seleccione la orden de producción", "error"); return false; }
    return true;
  };
  function actualizar() {
    const t = $("#rp-tipo").value;
    $("#c-orden").classList.toggle("oculto", t !== "hoja_costos");
    $("#c-prod").classList.toggle("oculto", t === "hoja_costos" || t === "cif");
  }
  const TIPO_COL = { moneda: "moneda", numero: "numero", porcentaje: "numero", texto: "texto" };
  async function ver() {
    if (!validar()) return;
    const r = await API.get(`/api/reportes/${$("#rp-tipo").value}?${params()}`);
    $("#rp-salida").innerHTML = `<div class="panel">
      <div class="solo-impresion"><b>${UI.esc(r.empresa)}</b> · NIT ${UI.esc(r.nit)}</div>
      <h2>${UI.esc(r.titulo)}</h2><p class="suave">${UI.esc(r.subtitulo || "")} · Generado ${UI.esc(r.generado)}</p>
      ${r.secciones.map((s) => `<h3 style="margin-top:18px">${UI.esc(s.titulo)}</h3>` + UI.tabla({
        columnas: s.columnas.map((c) => ({ titulo: c.titulo, clave: c.clave, tipo: TIPO_COL[c.tipo],
          render: c.tipo === "numero" ? (v) => (typeof v === "number" ? UI.fmt.num(v) : UI.esc(v)) : undefined })),
        filas: s.filas, totales: s.totales, vacio: "Sin datos para este reporte." })).join("")}
      ${r.nota ? `<p class="suave peq">Nota: ${UI.esc(r.nota)}</p>` : ""}</div>`;
  }
  $("#rp-tipo").addEventListener("change", actualizar);
  vista.addEventListener("click", async (ev) => {
    const b = ev.target.closest("button");
    if (!b) return;
    try {
      if (b.id === "rp-ver") await ver();
      if (b.id === "rp-imp") { await ver(); window.print(); }
      if (b.dataset.f) {
        if (!validar()) return;
        b.disabled = true;
        const n = await API.descargar(`/api/reportes/${$("#rp-tipo").value}?${params()}&formato=${b.dataset.f}`);
        UI.aviso("Descargado: " + n, "exito");
      }
    } catch (e) { UI.errorAPI(e); } finally { b.disabled = false; }
  });
  actualizar();
});
