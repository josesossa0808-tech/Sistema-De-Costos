/* Núcleo de la aplicación: sesión, menú por permisos, selección de empresa/periodo y navegación. */
const App = (() => {
  const estado = { usuario: null, meta: null, empresas: [], periodos: [], empresa: null, periodo: null };
  const paginas = {};

  // Estructura del menú. "sinEmpresa": la página funciona sin empresa seleccionada.
  const MENU = [
    { grupo: "Inicio" },
    { ruta: "dashboard", texto: "Dashboard", modulo: "dashboard" },
    { grupo: "Datos generales" },
    { ruta: "r/empresas", texto: "Empresas", modulo: "datos_generales", sinEmpresa: true },
    { ruta: "r/periodos", texto: "Periodos contables", modulo: "datos_generales" },
    { ruta: "r/unidades_medida", texto: "Unidades de medida", modulo: "datos_generales", sinEmpresa: true },
    { ruta: "r/centros_costo", texto: "Centros de costo", modulo: "datos_generales" },
    { ruta: "r/productos", texto: "Productos", modulo: "datos_generales" },
    { grupo: "Materias primas directas" },
    { ruta: "r/materias_primas", texto: "Materias primas", modulo: "materias_primas" },
    { ruta: "r/proveedores", texto: "Proveedores", modulo: "materias_primas" },
    { ruta: "r/estandar_materiales", texto: "Estándar de materiales", modulo: "materias_primas" },
    { grupo: "Mano de obra directa" },
    { ruta: "r/cargos", texto: "Cargos y tarifa estándar", modulo: "mano_obra" },
    { ruta: "r/prestaciones", texto: "Prestaciones y cargas", modulo: "mano_obra" },
    { ruta: "r/trabajadores", texto: "Trabajadores y salarios", modulo: "mano_obra" },
    { ruta: "r/estandar_mano_obra", texto: "Estándar de mano de obra", modulo: "mano_obra" },
    { grupo: "Costos indirectos (CIF)" },
    { ruta: "r/cif_parametros", texto: "Base y tasa predeterminada", modulo: "cif" },
    { ruta: "r/cif", texto: "Registro de CIF", modulo: "cif" },
    { grupo: "Producción" },
    { ruta: "ordenes", texto: "Órdenes de producción", modulo: "produccion" },
    { ruta: "produccion-resumen", texto: "Terminada y en proceso", modulo: "produccion" },
    { grupo: "Costos y variaciones" },
    { ruta: "hoja-estandar", texto: "Hoja de costo estándar", modulo: "hoja_costos" },
    { ruta: "hoja-costos", texto: "Hoja de costos por orden", modulo: "hoja_costos" },
    { ruta: "variaciones", texto: "Análisis de variaciones", modulo: "variaciones" },
    { ruta: "reportes", texto: "Reportes", modulo: "reportes" },
    { grupo: "Usuarios y seguridad" },
    { ruta: "usuarios", texto: "Usuarios", modulo: "usuarios", sinEmpresa: true },
    { ruta: "permisos", texto: "Roles y permisos", modulo: "usuarios", sinEmpresa: true },
    { ruta: "bitacora", texto: "Registro de actividades", modulo: "usuarios", sinEmpresa: true },
    { ruta: "respaldo", texto: "Copia de seguridad", modulo: "usuarios", sinEmpresa: true },
    { grupo: "Ayuda" },
    { ruta: "ayuda", texto: "Instrucciones de uso", sinEmpresa: true },
  ];

  const puede = (modulo, accion = "ver") => !modulo || !!estado.usuario?.permisos?.[modulo]?.[accion];
  const $ = (s) => document.querySelector(s);

  function pagina(ruta, fn) { paginas[ruta] = fn; }

  function dibujarMenu() {
    let html = "", pendiente = null;
    MENU.forEach((m) => {
      if (m.grupo) { pendiente = m.grupo; return; }
      if (!puede(m.modulo)) return;
      if (pendiente) { html += `<div class="grupo">${UI.esc(pendiente)}</div>`; pendiente = null; }
      html += `<a href="#/${m.ruta}" data-ruta="${m.ruta}">${UI.esc(m.texto)}</a>`;
    });
    $("#menu").innerHTML = html;
  }

  async function cargarEmpresas() {
    estado.empresas = puede("datos_generales") ? await API.get("/api/r/empresas") : [];
    let e = API.empresa();
    if (!estado.empresas.some((x) => String(x.id) === String(e))) e = estado.empresas[0]?.id || "";
    API.guardarEmpresa(e);
    estado.empresa = e ? Number(e) : null;
    $("#sel-empresa").innerHTML = estado.empresas.length
      ? estado.empresas.map((x) => `<option value="${x.id}" ${x.id === estado.empresa ? "selected" : ""}>${UI.esc(x.nombre_comercial || x.razon_social)}</option>`).join("")
      : `<option value="">(sin empresas)</option>`;
    actualizarMarca();
    await cargarPeriodos();
  }

  async function cargarPeriodos() {
    estado.periodos = estado.empresa ? await API.get("/api/r/periodos") : [];
    let guardado = null;
    try { guardado = localStorage.getItem("sc_periodo_" + estado.empresa); } catch (e) {}
    const p = estado.periodos.find((x) => String(x.id) === String(guardado)) ||
      estado.periodos.find((x) => x.estado === "Abierto") || estado.periodos[0];
    estado.periodo = p ? p.id : null;
    $("#sel-periodo").innerHTML = estado.periodos.length
      ? estado.periodos.map((x) => `<option value="${x.id}" ${x.id === estado.periodo ? "selected" : ""}>${UI.esc(x.nombre)}${x.estado === "Cerrado" ? " (cerrado)" : ""}</option>`).join("")
      : `<option value="">(sin periodos)</option>`;
  }

  // Nombre de la empresa activa (se muestra en el Dashboard)
  function emprendimiento() {
    const e = estado.empresas.find((x) => x.id === estado.empresa);
    return (e && (e.nombre_comercial || e.razon_social)) || "";
  }
  function actualizarMarca() {
    document.title = estado.conf?.nombre || "Kosto";
  }

  function periodoActual() { return estado.periodos.find((p) => p.id === estado.periodo) || null; }

  async function navegar() {
    const ruta = (location.hash.replace(/^#\//, "") || "dashboard").split("?")[0];
    document.querySelectorAll(".menu a").forEach((a) => a.classList.toggle("activo", a.dataset.ruta === ruta));
    $("#lateral").classList.remove("abierto");
    const item = MENU.find((m) => m.ruta === ruta);
    const cont = $("#contenido");
    if (item && !puede(item.modulo)) {
      cont.innerHTML = `<div class="panel"><h2>Acceso restringido</h2><p>Su rol no tiene permiso para ver este módulo.</p></div>`;
      return;
    }
    if (item && !item.sinEmpresa && !estado.empresa) {
      cont.innerHTML = `<div class="panel"><h2>Primero cree una empresa</h2>
        <p>Para trabajar en este módulo debe existir al menos una empresa. Vaya a
        <a href="#/r/empresas">Datos generales › Empresas</a>, regístrela y luego cree un periodo contable.</p>
        <p class="suave">Consulte <a href="#/ayuda">Instrucciones de uso</a> para ver el orden recomendado.</p></div>`;
      return;
    }
    // Cada vista recibe un contenedor nuevo para que no se acumulen manejadores de eventos.
    const vista = document.createElement("div");
    vista.innerHTML = `<div class="cargando">Cargando…</div>`;
    cont.replaceChildren(vista);
    try {
      if (ruta.startsWith("r/")) await Crud.mostrar(vista, ruta.slice(2));
      else if (paginas[ruta]) await paginas[ruta](vista);
      else vista.innerHTML = `<div class="panel"><h2>Página no encontrada</h2></div>`;
    } catch (e) {
      vista.innerHTML = `<div class="panel"><h2>No fue posible cargar</h2><p class="val-desf">${UI.esc(e.message)}</p></div>`;
    }
  }

  function cambiarContrasena() {
    const form = document.createElement("form");
    form.innerHTML = `<div class="errores-form"></div>
      <div class="campo" data-campo="actual"><label class="requerido">Contraseña actual</label><input type="password" name="actual" autocomplete="current-password"></div>
      <div class="campo" data-campo="nueva"><label class="requerido">Nueva contraseña</label><input type="password" name="nueva" autocomplete="new-password">
        <div class="ayuda">Mínimo 8 caracteres, con letras y números.</div></div>
      <div class="campo" data-campo="confirmar"><label class="requerido">Confirmar nueva contraseña</label><input type="password" name="confirmar" autocomplete="new-password"></div>`;
    UI.modal({
      titulo: "Cambiar contraseña", tamano: "chico", cuerpo: form,
      botones: [{ texto: "Cancelar" }, {
        texto: "Guardar", clase: "btn-primario", accion: async () => {
          const d = Object.fromEntries(new FormData(form).entries());
          try { const r = await API.post("/api/auth/cambiar-contrasena", d); UI.aviso(r.mensaje, "exito"); }
          catch (e) {
            UI.mostrarErrores(form, e.errores && Object.keys(e.errores).length ? e.errores : { _: e.message },
              [{ nombre: "actual", etiqueta: "Contraseña actual" }, { nombre: "nueva", etiqueta: "Nueva contraseña" }, { nombre: "confirmar", etiqueta: "Confirmar" }]);
            return false;
          }
        },
      }],
    });
  }

  async function iniciar() {
    if (!API.token()) { location.href = "index.html"; return; }
    try {
      estado.usuario = await API.get("/api/auth/yo");
      estado.meta = await API.get("/api/meta");
      estado.conf = await API.get("/api/config-publica");
      $("#nombre-sistema").textContent = estado.conf.nombre;
      actualizarMarca();
    } catch (e) { return; }
    $("#u-nombre").textContent = estado.usuario.nombre;
    $("#u-rol").textContent = estado.usuario.rol;
    dibujarMenu();
    try { await cargarEmpresas(); } catch (e) { UI.errorAPI(e); }

    $("#sel-empresa").addEventListener("change", async (ev) => {
      API.guardarEmpresa(ev.target.value);
      estado.empresa = ev.target.value ? Number(ev.target.value) : null;
      UI.limpiarCache();
      actualizarMarca();
      await cargarPeriodos();
      navegar();
    });
    $("#sel-periodo").addEventListener("change", (ev) => {
      estado.periodo = ev.target.value ? Number(ev.target.value) : null;
      try { localStorage.setItem("sc_periodo_" + estado.empresa, ev.target.value); } catch (e) {}
      navegar();
    });
    $("#btn-salir").addEventListener("click", async () => {
      try { await API.post("/api/auth/logout"); } catch (e) {}
      API.guardarToken(null);
      location.href = "index.html";
    });
    $("#btn-clave").addEventListener("click", cambiarContrasena);
    $("#btn-menu").addEventListener("click", () => $("#lateral").classList.toggle("abierto"));
    window.addEventListener("hashchange", navegar);
    navegar();
  }

  /* Llamado por los catálogos cuando cambian empresas o periodos. */
  async function refrescarContexto() { UI.limpiarCache(); await cargarEmpresas(); }

  return { estado, iniciar, pagina, puede, periodoActual, refrescarContexto, navegar, emprendimiento };
})();
