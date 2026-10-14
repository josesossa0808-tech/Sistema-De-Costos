/* Producción: órdenes de producción (con materiales y horas reales) y resumen terminada / en proceso. */
App.pagina("ordenes", async (vista) => {
  const per = App.periodoActual();
  if (!per) { vista.innerHTML = `<div class="panel"><h2>Órdenes de producción</h2><p>Cree primero un <a href="#/r/periodos">periodo contable</a>.</p></div>`; return; }
  const crear = App.puede("produccion", "crear"), editar = App.puede("produccion", "editar"), eliminar = App.puede("produccion", "eliminar");
  const [productos, materias, trabajadores, centros] = await Promise.all([
    UI.opcionesRef("productos", true), UI.opcionesRef("materias_primas", true), UI.opcionesRef("trabajadores", true), UI.opcionesRef("centros_costo", true)]);

  vista.innerHTML = `
    <div class="encabezado">
      <div><h1>Órdenes de producción</h1><p>Periodo ${UI.esc(per.nombre)}${per.estado === "Cerrado" ? " · <b>cerrado</b> (solo consulta)" : ""}</p></div>
      <div class="acciones">
        ${UI.selectHTML("o-estado", [{ id: "En proceso", texto: "En proceso" }, { id: "Terminada", texto: "Terminada" }], "", "Todos los estados")}
        ${editar ? `<button id="o-recalcular" title="Recalcula costos y variaciones de todas las órdenes del periodo">Recalcular</button>` : ""}
        ${crear && per.estado !== "Cerrado" ? `<button class="btn-primario" id="o-nueva">+ Nueva orden</button>` : ""}
      </div>
    </div>
    <div class="panel" id="o-tabla"></div>`;

  let filas = [];
  async function cargar() {
    const est = vista.querySelector("#o-estado").value;
    filas = await API.get(`/api/ordenes?periodo_id=${per.id}${est ? "&estado=" + encodeURIComponent(est) : ""}`);
    vista.querySelector("#o-tabla").innerHTML = UI.tabla({
      columnas: [
        { titulo: "Orden", clave: "numero" }, { titulo: "Fecha", clave: "fecha" }, { titulo: "Producto", clave: "producto" },
        { titulo: "Terminadas", clave: "cantidad_terminada", tipo: "numero" }, { titulo: "En proceso", clave: "cantidad_en_proceso", tipo: "numero" },
        { titulo: "Estado", clave: "estado", render: (v) => `<span class="etiqueta ${v === "Terminada" ? "fav" : "info"}">${UI.esc(v)}</span>` },
        { titulo: "Costo estándar", clave: "costo_estandar", tipo: "moneda" }, { titulo: "Costo real", clave: "costo_real", tipo: "moneda" },
        { titulo: "Diferencia", clave: "diferencia", tipo: "variacion" }],
      filas, vacio: "No hay órdenes en este periodo.",
      acciones: (f) => `<a class="btn btn-chico" href="#/hoja-costos?orden=${f.id}">Hoja</a> ` +
        (editar && per.estado !== "Cerrado" ? `<button class="btn-chico" data-ed="${f.id}">Editar</button> ` : "") +
        (eliminar && per.estado !== "Cerrado" ? `<button class="btn-chico btn-peligro" data-el="${f.id}">Eliminar</button>` : ""),
    });
  }

  const opt = (lista, val, texto) => `<option value="">— Seleccione —</option>` +
    lista.map((o) => `<option value="${o.id}" ${String(o.id) === String(val) ? "selected" : ""}>${UI.esc(texto(o))}</option>`).join("");

  function lineaMP(l = {}) {
    return `<tr><td><select name="mp">${opt(materias, l.materia_prima_id, (m) => m.codigo + " · " + m.descripcion)}</select></td>
      <td><input name="mp_cant" type="number" step="any" min="0" value="${l.cantidad_real ?? ""}"></td>
      <td><input name="mp_precio" type="number" step="any" min="0" value="${l.precio_real ?? ""}" placeholder="estándar"></td>
      <td><button type="button" class="btn-chico btn-peligro quitar" aria-label="Quitar">×</button></td></tr>`;
  }
  function lineaMO(l = {}) {
    return `<tr><td><select name="mo">${opt(trabajadores.filter((t) => t.activo || t.id === l.trabajador_id), l.trabajador_id, (t) => t.nombre + " · " + t.cargo_id_texto)}</select></td>
      <td><input name="mo_horas" type="number" step="any" min="0" value="${l.horas_reales ?? ""}"></td>
      <td><input name="mo_tarifa" type="number" step="any" min="0" value="${l.tarifa_real ?? ""}" placeholder="tarifa real calculada"></td>
      <td><button type="button" class="btn-chico btn-peligro quitar" aria-label="Quitar">×</button></td></tr>`;
  }

  async function abrir(id) {
    const o = id ? await API.get("/api/ordenes/" + id) : { fecha: per.fecha_inicio, avance_materiales: 100, avance_conversion: 50, materiales: [], mano_obra: [] };
    const form = document.createElement("form");
    form.noValidate = true;
    form.innerHTML = `<div class="errores-form"></div>
      <div class="seccion-form">Datos de la orden</div>
      <div class="rejilla">
        <div class="campo"><label>Número</label><input name="numero" maxlength="20" value="${UI.esc(o.numero || "")}" placeholder="Automático (OP-0001)"></div>
        <div class="campo"><label class="requerido">Producto</label><select name="producto_id">${opt(productos, o.producto_id, (p) => p.codigo + " · " + p.nombre)}</select></div>
        <div class="campo"><label class="requerido">Fecha</label><input type="date" name="fecha" value="${UI.esc(o.fecha || "")}" min="${per.fecha_inicio}" max="${per.fecha_fin}"></div>
        <div class="campo"><label>Centro de costo</label><select name="centro_costo_id">${opt(centros, o.centro_costo_id, (c) => c.codigo + " · " + c.nombre)}</select></div>
        <div class="campo"><label>Cantidad terminada</label><input type="number" step="any" min="0" name="cantidad_terminada" value="${o.cantidad_terminada ?? ""}"></div>
        <div class="campo"><label>Cantidad en proceso</label><input type="number" step="any" min="0" name="cantidad_en_proceso" value="${o.cantidad_en_proceso ?? ""}"></div>
        <div class="campo"><label>% avance materiales (en proceso)</label><input type="number" step="any" min="0" max="100" name="avance_materiales" value="${o.avance_materiales ?? 100}"></div>
        <div class="campo"><label>% avance conversión (en proceso)</label><input type="number" step="any" min="0" max="100" name="avance_conversion" value="${o.avance_conversion ?? 50}"></div>
        <div class="campo"><label>Horas máquina reales</label><input type="number" step="any" min="0" name="horas_maquina_reales" value="${o.horas_maquina_reales ?? 0}"></div>
        <div class="campo" style="grid-column:1/-1"><label>Observaciones</label><input name="observaciones" maxlength="300" value="${UI.esc(o.observaciones || "")}"></div>
      </div>
      <div class="seccion-form">Materia prima utilizada (real)</div>
      <table class="lineas"><thead><tr><th>Materia prima</th><th>Cantidad real</th><th>Precio real unitario</th><th></th></tr></thead>
        <tbody id="l-mp">${(o.materiales || []).map(lineaMP).join("")}</tbody></table>
      <p><button type="button" class="btn-chico" id="add-mp">+ Agregar material</button>
        <button type="button" class="btn-chico" id="std-mp" title="Llena las cantidades estándar según las unidades a producir">Cargar desde el estándar</button></p>
      <div class="seccion-form">Horas de trabajo (reales)</div>
      <table class="lineas"><thead><tr><th>Trabajador</th><th>Horas reales</th><th>Tarifa real por hora</th><th></th></tr></thead>
        <tbody id="l-mo">${(o.mano_obra || []).map(lineaMO).join("")}</tbody></table>
      <p><button type="button" class="btn-chico" id="add-mo">+ Agregar trabajador</button></p>
      <p class="suave peq">Si deja el precio o la tarifa vacíos, se toma el precio estándar del material y la tarifa real calculada del trabajador (salario + prestaciones / horas al mes). El CIF se aplica automáticamente con la tasa predeterminada del periodo.</p>`;
    if (!productos.length) form.querySelector(".errores-form").innerHTML = `<div class="mensaje error">Primero registre productos y sus estándares.</div>`;

    form.addEventListener("click", async (ev) => {
      const b = ev.target.closest("button");
      if (!b) return;
      if (b.classList.contains("quitar")) b.closest("tr").remove();
      if (b.id === "add-mp") form.querySelector("#l-mp").insertAdjacentHTML("beforeend", lineaMP());
      if (b.id === "add-mo") form.querySelector("#l-mo").insertAdjacentHTML("beforeend", lineaMO());
      if (b.id === "std-mp") {
        const pid = form.producto_id.value;
        if (!pid) return UI.aviso("Seleccione primero el producto", "error");
        const est = await API.get(`/api/estandar/${pid}?periodo_id=${per.id}`);
        const t = Number(form.cantidad_terminada.value || 0), p = Number(form.cantidad_en_proceso.value || 0);
        const ue = t + p * Number(form.avance_materiales.value || 0) / 100;
        form.querySelector("#l-mp").innerHTML = est.materiales.map((m) => lineaMP({ materia_prima_id: m.materia_prima_id, cantidad_real: +(m.cantidad_estandar * ue).toFixed(4) })).join("");
        if (!est.materiales.length) UI.aviso("Este producto no tiene estándar de materiales", "error");
      }
    });

    UI.modal({
      titulo: id ? "Editar orden " + o.numero : "Nueva orden de producción", cuerpo: form, tamano: "ancho",
      botones: [{ texto: "Cancelar" }, {
        texto: "Guardar orden", clase: "btn-primario", accion: async () => {
          const f = form.elements;
          const datos = {
            periodo_id: per.id, numero: f.numero.value.trim(), producto_id: f.producto_id.value, fecha: f.fecha.value,
            centro_costo_id: f.centro_costo_id.value, cantidad_terminada: f.cantidad_terminada.value, cantidad_en_proceso: f.cantidad_en_proceso.value,
            avance_materiales: f.avance_materiales.value, avance_conversion: f.avance_conversion.value,
            horas_maquina_reales: f.horas_maquina_reales.value, observaciones: f.observaciones.value,
            materiales: [...form.querySelectorAll("#l-mp tr")].map((tr) => ({ materia_prima_id: tr.querySelector("[name=mp]").value, cantidad_real: tr.querySelector("[name=mp_cant]").value, precio_real: tr.querySelector("[name=mp_precio]").value })),
            mano_obra: [...form.querySelectorAll("#l-mo tr")].map((tr) => ({ trabajador_id: tr.querySelector("[name=mo]").value, horas_reales: tr.querySelector("[name=mo_horas]").value, tarifa_real: tr.querySelector("[name=mo_tarifa]").value })),
          };
          const err = {};
          if (!datos.producto_id) err.producto = "Seleccione el producto";
          if (!datos.fecha) err.fecha = "La fecha es obligatoria";
          else if (datos.fecha < per.fecha_inicio || datos.fecha > per.fecha_fin) err.fecha = `La fecha debe estar entre ${per.fecha_inicio} y ${per.fecha_fin}`;
          ["cantidad_terminada", "cantidad_en_proceso", "horas_maquina_reales"].forEach((k) => { if (Number(datos[k]) < 0) err[k] = "Las cantidades no pueden ser negativas"; });
          ["avance_materiales", "avance_conversion"].forEach((k) => { const v = Number(datos[k]); if (v < 0 || v > 100) err[k] = "Los porcentajes de avance deben estar entre 0 y 100"; });
          if (Number(datos.cantidad_terminada || 0) + Number(datos.cantidad_en_proceso || 0) <= 0) err.cant = "Registre una cantidad terminada o en proceso mayor que cero";
          datos.materiales.forEach((l, i) => { if (l.materia_prima_id && !(Number(l.cantidad_real) > 0)) err["mp" + i] = `Material línea ${i + 1}: la cantidad real debe ser mayor que cero`; if (Number(l.precio_real) < 0) err["mpp" + i] = `Material línea ${i + 1}: el precio no puede ser negativo`; });
          datos.mano_obra.forEach((l, i) => { if (l.trabajador_id && !(Number(l.horas_reales) > 0)) err["mo" + i] = `Trabajador línea ${i + 1}: las horas reales deben ser mayores que cero`; if (Number(l.tarifa_real) < 0) err["mot" + i] = `Trabajador línea ${i + 1}: la tarifa no puede ser negativa`; });
          if (Object.keys(err).length) { UI.mostrarErrores(form, err, []); return false; }
          try {
            const r = id ? await API.put("/api/ordenes/" + id, datos) : await API.post("/api/ordenes", datos);
            UI.aviso(r.mensaje, "exito");
          } catch (e) { UI.mostrarErrores(form, Object.keys(e.errores || {}).length ? e.errores : { _: e.message }, []); return false; }
          await cargar();
        },
      }],
    });
  }

  vista.addEventListener("click", async (ev) => {
    const b = ev.target.closest("button");
    if (!b) return;
    if (b.id === "o-nueva") return abrir(null);
    if (b.id === "o-recalcular") {
      try { const r = await API.post("/api/recalcular", { periodo_id: per.id }); UI.aviso(r.mensaje, "exito"); await cargar(); } catch (e) { UI.errorAPI(e); }
    }
    if (b.dataset.ed) return abrir(b.dataset.ed);
    if (b.dataset.el) {
      const f = filas.find((x) => String(x.id) === b.dataset.el);
      if (!(await UI.confirmar(`¿Eliminar la orden ${UI.esc(f.numero)} con sus consumos y variaciones? Esta acción no se puede deshacer.`))) return;
      try { const r = await API.del("/api/ordenes/" + f.id); UI.aviso(r.mensaje, "exito"); await cargar(); } catch (e) { UI.errorAPI(e); }
    }
  });
  vista.querySelector("#o-estado").addEventListener("change", () => cargar().catch(UI.errorAPI));
  await cargar();
});

App.pagina("produccion-resumen", async (vista) => {
  const per = App.periodoActual();
  if (!per) { vista.innerHTML = `<div class="panel"><p>Cree primero un <a href="#/r/periodos">periodo contable</a>.</p></div>`; return; }
  const filas = await API.get("/api/produccion/resumen?periodo_id=" + per.id);
  const tot = (k) => filas.reduce((s, f) => s + (f[k] || 0), 0);
  vista.innerHTML = `<div class="encabezado"><div><h1>Producción terminada y en proceso</h1><p>Periodo ${UI.esc(per.nombre)} · valorizada a costo estándar</p></div></div>
    <div class="panel">${UI.tabla({
      columnas: [{ titulo: "Código", clave: "codigo" }, { titulo: "Producto", clave: "producto" }, { titulo: "Órdenes", clave: "ordenes", tipo: "numero" },
        { titulo: "Unidades terminadas", clave: "terminadas", tipo: "numero" }, { titulo: "Unidades en proceso", clave: "en_proceso", tipo: "numero" },
        { titulo: "Producción terminada", clave: "costo_terminado_estandar", tipo: "moneda" }, { titulo: "Producción en proceso", clave: "costo_en_proceso_estandar", tipo: "moneda" }],
      filas, vacio: "No hay producción registrada en este periodo.",
      totales: filas.length ? { codigo: "TOTAL", ordenes: tot("ordenes"), terminadas: tot("terminadas"), en_proceso: tot("en_proceso"),
        costo_terminado_estandar: tot("costo_terminado_estandar"), costo_en_proceso_estandar: tot("costo_en_proceso_estandar") } : null,
    })}</div>`;
});
