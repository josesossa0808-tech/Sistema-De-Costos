/* Usuarios y seguridad: administración de usuarios, permisos por rol y registro de actividades. */
App.pagina("usuarios", async (vista) => {
  const crear = App.puede("usuarios", "crear"), editar = App.puede("usuarios", "editar"), eliminar = App.puede("usuarios", "eliminar");
  const roles = await API.get("/api/roles");
  vista.innerHTML = `<div class="encabezado"><div><h1>Usuarios</h1><p>Cuentas de acceso, roles (administrador, usuario, estudiante) y estado.</p></div>
    <div class="acciones"><input class="buscador" id="u-buscar" placeholder="Buscar…">${crear ? `<button class="btn-primario" id="u-nuevo">+ Nuevo usuario</button>` : ""}</div></div>
    <div class="panel" id="u-tabla"></div>`;
  let filas = [];
  const campos = [{ nombre: "nombre", etiqueta: "Nombre" }, { nombre: "usuario", etiqueta: "Usuario" }, { nombre: "correo", etiqueta: "Correo" },
    { nombre: "rol_id", etiqueta: "Rol" }, { nombre: "contrasena", etiqueta: "Contraseña" }];
  async function cargar() {
    filas = await API.get("/api/usuarios");
    dibujar();
  }
  function dibujar() {
    const q = vista.querySelector("#u-buscar").value.toLowerCase();
    const vis = filas.filter((f) => !q || [f.nombre, f.usuario, f.correo, f.rol].join(" ").toLowerCase().includes(q));
    vista.querySelector("#u-tabla").innerHTML = UI.tabla({
      columnas: [{ titulo: "Nombre", clave: "nombre" }, { titulo: "Usuario", clave: "usuario" }, { titulo: "Correo", clave: "correo" },
        { titulo: "Rol", clave: "rol", render: (v) => `<span class="etiqueta info">${UI.esc(v)}</span>` },
        { titulo: "Estado", clave: "activo", render: (v) => (v ? `<span class="etiqueta fav">Activo</span>` : `<span class="etiqueta desf">Inactivo</span>`) },
        { titulo: "Último acceso", clave: "ultimo_acceso" }],
      filas: vis,
      acciones: (f) => (editar ? `<button class="btn-chico" data-ed="${f.id}">Editar</button> ` : "") +
        (eliminar && f.id !== App.estado.usuario.id ? `<button class="btn-chico btn-peligro" data-el="${f.id}">Eliminar</button>` : ""),
    });
  }
  function abrir(u) {
    const form = document.createElement("form");
    form.noValidate = true;
    form.innerHTML = `<div class="errores-form"></div><div class="rejilla">
      <div class="campo" data-campo="nombre"><label class="requerido">Nombre</label><input name="nombre" maxlength="120" value="${UI.esc(u?.nombre || "")}"></div>
      <div class="campo" data-campo="usuario"><label class="requerido">Usuario</label><input name="usuario" maxlength="40" value="${UI.esc(u?.usuario || "")}"></div>
      <div class="campo" data-campo="correo"><label class="requerido">Correo</label><input name="correo" type="email" value="${UI.esc(u?.correo || "")}"></div>
      <div class="campo" data-campo="rol_id"><label class="requerido">Rol</label><select name="rol_id">${roles.map((r) => `<option value="${r.id}" ${u?.rol_id === r.id ? "selected" : ""}>${UI.esc(r.nombre)}</option>`).join("")}</select></div>
      <div class="campo" data-campo="contrasena"><label class="${u ? "" : "requerido"}">${u ? "Nueva contraseña (opcional)" : "Contraseña"}</label><input name="contrasena" type="password" autocomplete="new-password">
        <div class="ayuda">Mínimo 8 caracteres, con letras y números.${u ? " Déjela vacía para no cambiarla." : ""}</div></div>
      <div class="campo"><label>Estado</label><label style="display:flex;gap:8px;font-weight:500"><input type="checkbox" name="activo" ${!u || u.activo ? "checked" : ""}> Activo</label></div>
    </div>`;
    UI.modal({
      titulo: u ? "Editar usuario" : "Nuevo usuario", cuerpo: form,
      botones: [{ texto: "Cancelar" }, {
        texto: "Guardar", clase: "btn-primario", accion: async () => {
          const d = Object.fromEntries(new FormData(form).entries());
          d.activo = form.activo.checked;
          d.rol_id = Number(d.rol_id);
          try {
            const r = u ? await API.put("/api/usuarios/" + u.id, d) : await API.post("/api/usuarios", d);
            UI.aviso(r.mensaje, "exito");
          } catch (e) { UI.mostrarErrores(form, Object.keys(e.errores || {}).length ? e.errores : { _: e.message }, campos); return false; }
          await cargar();
        },
      }],
    });
  }
  vista.addEventListener("click", async (ev) => {
    const b = ev.target.closest("button");
    if (!b) return;
    if (b.id === "u-nuevo") abrir(null);
    if (b.dataset.ed) abrir(filas.find((f) => String(f.id) === b.dataset.ed));
    if (b.dataset.el) {
      const f = filas.find((x) => String(x.id) === b.dataset.el);
      if (!(await UI.confirmar(`¿Eliminar el usuario «${UI.esc(f.usuario)}»? Si solo quiere impedir su acceso, es mejor desactivarlo.`))) return;
      try { const r = await API.del("/api/usuarios/" + f.id); UI.aviso(r.mensaje, "exito"); await cargar(); } catch (e) { UI.errorAPI(e); }
    }
  });
  vista.querySelector("#u-buscar").addEventListener("input", dibujar);
  await cargar();
});

App.pagina("permisos", async (vista) => {
  const d = await API.get("/api/permisos");
  const editar = App.puede("usuarios", "editar");
  const ACC = { ver: "Ver", crear: "Crear", editar: "Editar", eliminar: "Eliminar" };
  vista.innerHTML = `<div class="encabezado"><div><h1>Roles y permisos</h1><p>Defina qué puede hacer cada rol en cada módulo. Los cambios aplican de inmediato.</p></div>
    ${editar ? `<div class="acciones"><button class="btn-primario" id="p-guardar">Guardar permisos</button></div>` : ""}</div>` +
    d.roles.map((r) => `<div class="panel"><h3>${UI.esc(r.rol)} <span class="suave peq" style="font-weight:400">· ${UI.esc(r.descripcion || "")}</span></h3>
      <div class="tabla-cont"><table class="matriz"><thead><tr><th>Módulo</th>${d.acciones.map((a) => `<th>${ACC[a]}</th>`).join("")}</tr></thead><tbody>
      ${Object.entries(d.modulos).map(([m, nombre]) => `<tr><td>${UI.esc(nombre)}</td>${d.acciones.map((a) => {
        const bloqueado = !editar || (r.rol === "administrador" && m === "usuarios");
        return `<td><input type="checkbox" data-rol="${r.rol_id}" data-mod="${m}" data-acc="${a}" ${r.permisos[m][a] ? "checked" : ""} ${bloqueado ? "disabled" : ""} aria-label="${UI.esc(nombre)} ${a}"></td>`;
      }).join("")}</tr>`).join("")}</tbody></table></div></div>`).join("") +
    `<p class="suave peq">El rol administrador conserva siempre el acceso a «Usuarios y seguridad» para que el sistema no quede sin administración.</p>`;
  const btn = vista.querySelector("#p-guardar");
  if (btn) btn.addEventListener("click", async () => {
    const roles = d.roles.map((r) => {
      const permisos = {};
      Object.keys(d.modulos).forEach((m) => {
        permisos[m] = {};
        d.acciones.forEach((a) => { permisos[m][a] = vista.querySelector(`input[data-rol="${r.rol_id}"][data-mod="${m}"][data-acc="${a}"]`).checked; });
      });
      return { rol_id: r.rol_id, permisos };
    });
    try { const r = await API.put("/api/permisos", { roles }); UI.aviso(r.mensaje, "exito"); } catch (e) { UI.errorAPI(e); }
  });
});

App.pagina("respaldo", async (vista) => {
  vista.innerHTML = `<div class="encabezado"><div><h1>Copia de seguridad</h1>
    <p>Descarga una copia completa de la base de datos del sistema.</p></div></div>
    <div class="panel"><h3>Descargar copia</h3>
      <p>Descarga una copia completa de la base de datos. Guárdela en una memoria USB o en la nube periódicamente (por ejemplo, al cerrar cada periodo).</p>
      ${App.puede("usuarios", "editar") ? `<button class="btn-primario" id="r-descargar">Descargar copia de seguridad</button>` : `<p class="suave">Solo un administrador puede descargar copias.</p>`}</div>
    <div class="panel"><h3>Restaurar una copia</h3>
      <p><b>Si el respaldo es un archivo .sql (MySQL, instalación completa):</b></p>
      <ol><li>Cierre el sistema.</li>
      <li>Abra una ventana de comandos en <code>C:\\SistemaCostos\\mysql\\bin</code>.</li>
      <li>Ejecute <code>mysql -h 127.0.0.1 -P PUERTO -u costos -p &lt; ruta\\respaldo.sql</code> (el puerto y la contraseña están en <code>config\\config.ini</code>).</li>
      <li>Abra de nuevo el sistema.</li></ol>
      <p><b>Si el respaldo es un archivo .db (SQLite):</b> cierre el sistema, renombre <code>database\\sistema_costos.db</code>, copie el respaldo con ese nombre y abra el sistema.</p></div>`;
  const b = vista.querySelector("#r-descargar");
  if (b) b.addEventListener("click", async () => {
    b.disabled = true;
    try { UI.aviso("Descargado: " + (await API.descargar("/api/respaldo")), "exito"); } catch (e) { UI.errorAPI(e); } finally { b.disabled = false; }
  });
});

App.pagina("bitacora", async (vista) => {
  vista.innerHTML = `<div class="encabezado"><div><h1>Registro de actividades</h1><p>Inicios y cierres de sesión, intentos fallidos, creación, edición, eliminación y exportaciones (últimos 500).</p></div>
    <div class="acciones"><input id="b-usuario" placeholder="Usuario" style="width:140px">
      ${UI.selectHTML("b-accion", ["inicio_sesion", "cierre_sesion", "login_fallido", "crear_cuenta", "crear", "editar", "eliminar", "exportar", "cambio_contrasena", "recalcular", "respaldo"].map((a) => ({ id: a, texto: a.replace(/_/g, " ") })), "", "Todas las acciones")}
      <input type="date" id="b-desde" aria-label="Desde" style="width:150px"><input type="date" id="b-hasta" aria-label="Hasta" style="width:150px">
      <button id="b-filtrar">Filtrar</button></div></div><div class="panel" id="b-tabla"></div>`;
  async function cargar() {
    const p = new URLSearchParams();
    [["usuario", "#b-usuario"], ["accion", "#b-accion"], ["desde", "#b-desde"], ["hasta", "#b-hasta"]].forEach(([k, s]) => { const v = vista.querySelector(s).value; if (v) p.set(k, v); });
    const filas = await API.get("/api/bitacora?" + p);
    vista.querySelector("#b-tabla").innerHTML = UI.tabla({
      columnas: [{ titulo: "Fecha", clave: "fecha" }, { titulo: "Usuario", clave: "usuario" },
        { titulo: "Acción", clave: "accion", render: (v) => `<span class="etiqueta ${v === "login_fallido" ? "desf" : v === "eliminar" ? "info" : "neutra"}">${UI.esc(String(v).replace(/_/g, " "))}</span>` },
        { titulo: "Módulo", clave: "modulo" }, { titulo: "Detalle", clave: "detalle" }, { titulo: "IP", clave: "ip" }],
      filas, vacio: "Sin actividades para los filtros seleccionados." });
  }
  vista.querySelector("#b-filtrar").addEventListener("click", () => cargar().catch(UI.errorAPI));
  await cargar();
});
