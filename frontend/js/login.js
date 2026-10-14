/* Pantalla de inicio de sesión y creación de cuenta. */
(function () {
  const $ = (s) => document.querySelector(s);
  const msg = $("#mensaje");

  function mostrar(texto, tipo, errores) {
    let html = texto ? `<div class="mensaje ${tipo}">${esc(texto)}` : "";
    if (errores && Object.keys(errores).length) {
      html += "<ul style='margin:6px 0 0;padding-left:18px'>" +
        Object.values(errores).map((e) => `<li>${esc(e)}</li>`).join("") + "</ul>";
    }
    msg.innerHTML = html ? html + "</div>" : "";
  }
  function esc(t) { return String(t).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c])); }

  function pestana(nombre) {
    document.querySelectorAll(".login-pestanas button").forEach((b) => b.classList.toggle("activa", b.dataset.pestana === nombre));
    $("#form-ingresar").classList.toggle("oculto", nombre !== "ingresar");
    $("#form-registro").classList.toggle("oculto", nombre !== "registro");
    mostrar("");
  }
  document.querySelectorAll(".login-pestanas button").forEach((b) => b.addEventListener("click", () => pestana(b.dataset.pestana)));

  if (API.token()) { API.get("/api/auth/yo").then(() => (location.href = "app.html")).catch(() => {}); }
  if (new URLSearchParams(location.search).get("expirada")) mostrar("Su sesión finalizó. Ingrese nuevamente.", "error");

  API.get("/api/config-publica").then((c) => {
    $("#titulo-login").textContent = c.nombre;
    document.title = c.nombre + " · Ingreso";
    $("#ayuda-clave").textContent = `Mínimo ${c.longitud_minima} caracteres, con letras y números.`;
    const rol = c.rol_registro ? c.rol_registro.charAt(0).toUpperCase() + c.rol_registro.slice(1) : "Usuario";
    $("#nota-roles").textContent = `Las cuentas nuevas quedan con rol ${rol}. El administrador puede cambiar los roles.`;
    if (!c.permitir_registro) {
      $("#tab-registro").remove();
      document.querySelector(".login-pestanas").classList.add("oculto");
      $("#nota-roles").classList.add("oculto");
    }
  }).catch((e) => mostrar(e.message, "error"));

  $("#form-ingresar").addEventListener("submit", async (ev) => {
    ev.preventDefault();
    const f = ev.target;
    const datos = { usuario: f.usuario.value.trim(), contrasena: f.contrasena.value };
    if (!datos.usuario || !datos.contrasena) return mostrar("Ingrese usuario y contraseña.", "error");
    const btn = f.querySelector("button[type=submit]");
    btn.disabled = true;
    try {
      const r = await API.post("/api/auth/login", datos);
      API.guardarToken(r.token);
      location.href = "app.html";
    } catch (e) { mostrar(e.message, "error"); }
    finally { btn.disabled = false; }
  });

  $("#form-registro").addEventListener("submit", async (ev) => {
    ev.preventDefault();
    const f = ev.target;
    const d = Object.fromEntries(new FormData(f).entries());
    const err = {};
    if (!d.nombre.trim()) err.nombre = "El nombre es obligatorio";
    if (!/^[A-Za-z0-9_.-]{3,40}$/.test(d.usuario.trim())) err.usuario = "Usuario inválido (3 a 40 caracteres: letras, números, punto o guion)";
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(d.correo.trim())) err.correo = "Correo electrónico inválido";
    if (d.contrasena.length < 8 || !/[A-Za-z]/.test(d.contrasena) || !/\d/.test(d.contrasena)) err.clave = "La contraseña debe tener mínimo 8 caracteres con letras y números";
    if (d.contrasena !== d.confirmar) err.confirmar = "Las contraseñas no coinciden";
    if (Object.keys(err).length) return mostrar("Revise los datos:", "error", err);
    const btn = f.querySelector("button[type=submit]");
    btn.disabled = true;
    try {
      const r = await API.post("/api/auth/registro", d);
      f.reset();
      pestana("ingresar");
      $("#l-usuario").value = d.usuario.trim().toLowerCase();
      mostrar(r.mensaje, "exito");
      $("#l-clave").focus();
    } catch (e) { mostrar(e.message, "error", e.errores); }
    finally { btn.disabled = false; }
  });
})();
