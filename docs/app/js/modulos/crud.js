/* Pantallas genéricas de registro (crear, consultar, editar, eliminar) a partir de los metadatos de la API. */
const Crud = (() => {
  const DESCRIPCION = {
    empresas: "Datos de identificación y tributarios de cada empresa. Toda la información de costos se registra por empresa.",
    periodos: "Periodos contables (normalmente mensuales). Un periodo cerrado no admite cambios en CIF ni en producción.",
    unidades_medida: "Unidades usadas por productos y materias primas (kg, litro, unidad…).",
    centros_costo: "Áreas a las que se asignan materiales, trabajadores y CIF.",
    productos: "Productos que fabrica la empresa. El precio de venta se usa para calcular el margen.",
    materias_primas: "Materiales directos con su código, unidad, precio estándar, proveedor y centro de costo.",
    proveedores: "Proveedores de materias primas.",
    estandar_materiales: "Cantidad y precio estándar de cada material por UNA unidad de producto (receta o lista de materiales).",
    cargos: "Cargos de mano de obra directa y su tarifa estándar por hora.",
    prestaciones: "Porcentajes de prestaciones sociales, seguridad social y parafiscales. Determinan el factor prestacional y la tarifa real por hora de cada trabajador.",
    trabajadores: "Trabajadores de producción, salario y horas laborales. El sistema calcula su costo mensual total y su tarifa real por hora.",
    estandar_mano_obra: "Horas estándar por UNA unidad de producto, por cargo, y su tarifa estándar.",
    cif_parametros: "Base de aplicación de los CIF y nivel normal de actividad del periodo. Con el CIF presupuestado se obtiene la tasa predeterminada.",
    cif: "CIF fijos y variables del periodo: valor presupuestado y valor real.",
  };
  const CALCULADOS = {
    factor_prestacional: ["Factor prest. %", "numero"], costo_mensual_total: ["Costo mensual", "moneda"],
    tarifa_real_hora: ["Tarifa real/hora", "moneda"], cif_fijo_presupuestado: ["CIF fijo presup.", "moneda"],
    cif_variable_presupuestado: ["CIF variable presup.", "moneda"], tasa_fija: ["Tasa fija", "moneda"],
    tasa_variable: ["Tasa variable", "moneda"], tasa_total: ["Tasa predeterminada", "moneda"],
  };
  const POR_PERIODO = ["cif"];
  const POR_PRODUCTO = ["estandar_materiales", "estandar_mano_obra"];

  async function mostrar(cont, recurso) {
    const def = App.estado.meta.recursos[recurso];
    if (!def) { cont.innerHTML = "<div class='panel'>Recurso desconocido</div>"; return; }
    const crear = App.puede(def.modulo, "crear"), editar = App.puede(def.modulo, "editar"), eliminar = App.puede(def.modulo, "eliminar");
    let filtroProducto = "";
    let productos = [];
    if (POR_PRODUCTO.includes(recurso)) productos = await UI.opcionesRef("productos", true);

    cont.innerHTML = `
      <div class="encabezado">
        <div><h1>${UI.esc(def.titulo)}</h1><p>${UI.esc(DESCRIPCION[recurso] || "")}</p></div>
        <div class="acciones">
          ${POR_PRODUCTO.includes(recurso) ? UI.selectHTML("filtro-prod", productos.map((p) => ({ id: p.id, texto: p.codigo + " · " + p.nombre })), "", "Todos los productos") : ""}
          <input class="buscador" id="buscar" placeholder="Buscar…" aria-label="Buscar">
          ${crear ? `<button class="btn-primario" id="nuevo">+ Nuevo</button>` : ""}
        </div>
      </div>
      ${POR_PERIODO.includes(recurso) ? `<p class="suave" id="aviso-periodo"></p>` : ""}
      <div class="panel" id="tabla"></div>`;

    const columnas = def.campos.filter((c) => c.en_tabla !== false).map((c) => ({
      titulo: c.etiqueta, clave: c.tipo === "ref" ? c.nombre + "_texto" : c.nombre,
      tipo: c.tipo === "lista" ? "lista" : c.tipo,
      render: c.tipo === "lista" && Array.isArray(c.opciones[0]) ? (v) => UI.esc((c.opciones.find((o) => o[0] === v) || [v, v])[1]) : undefined,
    }));
    (def.calculados || []).forEach((k) => columnas.push({ titulo: CALCULADOS[k][0], clave: k, tipo: CALCULADOS[k][1] }));

    let filas = [];
    async function cargar() {
      const params = new URLSearchParams();
      if (POR_PERIODO.includes(recurso)) {
        const p = App.periodoActual();
        if (!p) { document.getElementById("tabla").innerHTML = `<p>Cree primero un <a href="#/r/periodos">periodo contable</a>.</p>`; return; }
        params.set("periodo_id", p.id);
        document.getElementById("aviso-periodo").textContent = "Mostrando el periodo " + p.nombre + " (cámbielo en la parte superior).";
      }
      if (filtroProducto) params.set("producto_id", filtroProducto);
      filas = await API.get(`/api/r/${recurso}${params.toString() ? "?" + params : ""}`);
      dibujar();
    }
    function dibujar() {
      const q = (document.getElementById("buscar").value || "").toLowerCase();
      const visibles = q ? filas.filter((f) => Object.values(f).some((v) => String(v ?? "").toLowerCase().includes(q))) : filas;
      let totales = null;
      if (recurso === "cif") {
        totales = { codigo: "TOTAL", valor_presupuestado: visibles.reduce((s, f) => s + f.valor_presupuestado, 0), valor_real: visibles.reduce((s, f) => s + f.valor_real, 0) };
      } else if (recurso === "prestaciones") {
        totales = { concepto: "Factor prestacional total", porcentaje: visibles.reduce((s, f) => s + f.porcentaje, 0) };
      }
      document.getElementById("tabla").innerHTML = UI.tabla({
        columnas, filas: visibles, totales,
        vacio: crear ? "No hay registros. Use «+ Nuevo» para crear el primero." : "No hay registros.",
        acciones: editar || eliminar ? (f) =>
          (editar ? `<button class="btn-chico" data-ed="${f.id}">Editar</button> ` : "") +
          (eliminar ? `<button class="btn-chico btn-peligro" data-el="${f.id}">Eliminar</button>` : "") : null,
      });
    }

    async function abrir(registro) {
      const valores = registro ? { ...registro } : {};
      if (!registro && def.campos.some((c) => c.nombre === "periodo_id") && App.estado.periodo) valores.periodo_id = App.estado.periodo;
      if (!registro && filtroProducto && def.campos.some((c) => c.nombre === "producto_id")) valores.producto_id = filtroProducto;
      const form = await UI.formulario(def.campos, valores);
      UI.modal({
        titulo: (registro ? "Editar · " : "Nuevo · ") + def.titulo, cuerpo: form,
        botones: [{ texto: "Cancelar" }, {
          texto: "Guardar", clase: "btn-primario", accion: async () => {
            const { datos, errores } = UI.leer(form, def.campos);
            if (Object.keys(errores).length) { UI.mostrarErrores(form, errores, def.campos); return false; }
            try {
              const r = registro ? await API.put(`/api/r/${recurso}/${registro.id}`, datos) : await API.post(`/api/r/${recurso}`, datos);
              UI.aviso(r.mensaje || "Guardado", "exito");
            } catch (e) {
              UI.mostrarErrores(form, Object.keys(e.errores || {}).length ? e.errores : { _: e.message }, def.campos);
              return false;
            }
            UI.limpiarCache();
            if (["empresas", "periodos"].includes(recurso)) await App.refrescarContexto();
            await cargar();
          },
        }],
      });
    }

    cont.addEventListener("click", async (ev) => {
      const b = ev.target.closest("button");
      if (!b) return;
      if (b.id === "nuevo") return abrir(null);
      if (b.dataset.ed) return abrir(filas.find((f) => String(f.id) === b.dataset.ed));
      if (b.dataset.el) {
        const f = filas.find((x) => String(x.id) === b.dataset.el);
        const nombre = f.razon_social || f.nombre || f.descripcion || f.concepto || f.codigo || f.producto_id_texto || ("#" + f.id);
        const extra = recurso === "empresas" ? "<br><br><b>Atención:</b> se eliminará también TODA la información de costos de esta empresa (periodos, productos, órdenes, variaciones…)." : "";
        if (!(await UI.confirmar(`¿Está seguro de eliminar «${UI.esc(nombre)}»? Esta acción no se puede deshacer.${extra}`))) return;
        try {
          const r = await API.del(`/api/r/${recurso}/${f.id}`);
          UI.aviso(r.mensaje, "exito");
          UI.limpiarCache();
          if (["empresas", "periodos"].includes(recurso)) await App.refrescarContexto();
          await cargar();
        } catch (e) { UI.errorAPI(e); }
      }
    });
    document.getElementById("buscar").addEventListener("input", dibujar);
    const fp = document.getElementById("filtro-prod");
    if (fp) fp.addEventListener("change", () => { filtroProducto = fp.value; cargar(); });
    await cargar();
  }

  return { mostrar };
})();
