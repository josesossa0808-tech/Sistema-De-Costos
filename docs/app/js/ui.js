/* Utilidades de interfaz: formato, tablas, formularios, modales y avisos. */
const UI = (() => {
  const esc = (t) => (t === null || t === undefined ? "" : String(t)).replace(/[&<>"']/g,
    (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

  const nf = (d) => new Intl.NumberFormat("es-CO", { minimumFractionDigits: d, maximumFractionDigits: d });
  const fmt = {
    moneda: (v) => (v === null || v === undefined || v === "" ? "" : "$ " + nf(2).format(Number(v))),
    num: (v, d) => (v === null || v === undefined || v === "" ? "" :
      new Intl.NumberFormat("es-CO", { maximumFractionDigits: d === undefined ? 4 : d }).format(Number(v))),
    pct: (v) => (v === null || v === undefined ? "—" : nf(2).format(Number(v)) + " %"),
  };

  function naturaleza(n) {
    const c = n === "Favorable" ? "fav" : n === "Desfavorable" ? "desf" : "neutra";
    return `<span class="etiqueta ${c}">${esc(n)}</span>`;
  }
  function valorVariacion(v) {
    const c = v > 0.004 ? "val-desf" : v < -0.004 ? "val-fav" : "";
    return `<span class="${c}">${fmt.moneda(v)}</span>`;
  }

  // ------------------------------------------------------------------ Avisos
  function aviso(texto, tipo) {
    const el = document.createElement("div");
    el.className = "aviso " + (tipo || "");
    el.textContent = texto;
    document.getElementById("avisos").appendChild(el);
    setTimeout(() => el.remove(), tipo === "error" ? 6500 : 3500);
  }
  function errorAPI(e) { aviso(e.message || String(e), "error"); }

  // ------------------------------------------------------------------ Modales
  function modal({ titulo, cuerpo, botones, tamano }) {
    const fondo = document.createElement("div");
    fondo.className = "fondo-modal";
    fondo.innerHTML = `<div class="modal ${tamano || ""}" role="dialog" aria-modal="true">
      <div class="modal-cab"><h3>${esc(titulo)}</h3><button class="cerrar" type="button" aria-label="Cerrar">×</button></div>
      <div class="modal-cuerpo"></div><div class="modal-pie"></div></div>`;
    const c = fondo.querySelector(".modal-cuerpo");
    if (typeof cuerpo === "string") c.innerHTML = cuerpo; else if (cuerpo) c.appendChild(cuerpo);
    const pie = fondo.querySelector(".modal-pie");
    const cerrar = () => { fondo.remove(); document.removeEventListener("keydown", tecla); };
    const tecla = (ev) => { if (ev.key === "Escape") cerrar(); };
    document.addEventListener("keydown", tecla);
    fondo.querySelector(".cerrar").onclick = cerrar;
    (botones || [{ texto: "Cerrar" }]).forEach((b) => {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.textContent = b.texto;
      if (b.clase) btn.className = b.clase;
      btn.onclick = async () => {
        if (!b.accion) return cerrar();
        btn.disabled = true;
        try { const r = await b.accion(); if (r !== false) cerrar(); }
        finally { btn.disabled = false; }
      };
      pie.appendChild(btn);
    });
    document.body.appendChild(fondo);
    const primero = c.querySelector("input,select,textarea");
    if (primero) primero.focus();
    return { el: fondo, cuerpo: c, cerrar };
  }

  function confirmar(texto, { titulo = "Confirmar", boton = "Eliminar", peligro = true } = {}) {
    return new Promise((ok) => {
      const m = modal({
        titulo, tamano: "chico", cuerpo: `<p>${texto}</p>`,
        botones: [{ texto: "Cancelar", accion: () => ok(false) },
          { texto: boton, clase: peligro ? "btn-peligro" : "btn-primario", accion: () => ok(true) }],
      });
      m.el.querySelector(".cerrar").addEventListener("click", () => ok(false));
    });
  }

  // ------------------------------------------------------------------ Tablas
  function celda(col, fila) {
    const v = fila[col.clave];
    if (col.render) return col.render(v, fila);
    switch (col.tipo) {
      case "moneda": return fmt.moneda(v);
      case "numero": case "porcentaje": return fmt.num(v);
      case "bool": return v ? "Sí" : "No";
      case "variacion": return valorVariacion(v);
      case "naturaleza": return naturaleza(v);
      default: return esc(v);
    }
  }
  const esNum = (t) => ["moneda", "numero", "porcentaje", "variacion"].includes(t);

  function tabla({ columnas, filas, acciones, totales, vacio }) {
    const cab = columnas.map((c) => `<th class="${esNum(c.tipo) ? "num" : ""}">${esc(c.titulo)}</th>`).join("") +
      (acciones ? "<th></th>" : "");
    const cuerpo = filas.length ? filas.map((f, i) => "<tr>" + columnas.map((c) =>
      `<td class="${esNum(c.tipo) ? "num" : ""}">${celda(c, f)}</td>`).join("") +
      (acciones ? `<td class="acc">${acciones(f, i)}</td>` : "") + "</tr>").join("")
      : `<tr><td class="vacio" colspan="${columnas.length + (acciones ? 1 : 0)}">${esc(vacio || "No hay registros todavía.")}</td></tr>`;
    const pie = totales ? "<tfoot><tr>" + columnas.map((c) =>
      `<td class="${esNum(c.tipo) ? "num" : ""}">${totales[c.clave] !== undefined ? celda(c, totales) : ""}</td>`).join("") +
      (acciones ? "<td></td>" : "") + "</tr></tfoot>" : "";
    return `<div class="tabla-cont"><table><thead><tr>${cab}</tr></thead><tbody>${cuerpo}</tbody>${pie}</table></div>`;
  }

  // ------------------------------------------------------------------ Formularios
  const cacheRef = {};
  async function opcionesRef(ref, forzar) {
    if (!cacheRef[ref] || forzar) cacheRef[ref] = await API.get("/api/r/" + ref);
    return cacheRef[ref];
  }
  function limpiarCache() { Object.keys(cacheRef).forEach((k) => delete cacheRef[k]); }

  function control(c, v, refs) {
    const id = "f-" + c.nombre;
    const req = c.requerido ? "required" : "";
    const val = v === null || v === undefined ? (c.defecto !== undefined ? c.defecto : "") : v;
    switch (c.tipo) {
      case "lista":
        return `<select id="${id}" name="${c.nombre}" ${req}><option value="">— Seleccione —</option>` +
          c.opciones.map((o) => {
            const [valor, texto] = Array.isArray(o) ? o : [o, o];
            return `<option value="${esc(valor)}" ${String(val) === String(valor) ? "selected" : ""}>${esc(texto)}</option>`;
          }).join("") + "</select>";
      case "ref":
        return `<select id="${id}" name="${c.nombre}" ${req}><option value="">— Seleccione —</option>` +
          (refs[c.ref] || []).map((o) => `<option value="${o.id}" ${String(val) === String(o.id) ? "selected" : ""}>` +
            esc((o.codigo && c.etiqueta_ref !== "codigo" ? o.codigo + " · " : "") + o[c.etiqueta_ref]) + "</option>").join("") + "</select>";
      case "bool":
        return `<label style="display:flex;gap:8px;align-items:center;font-weight:500"><input type="checkbox" id="${id}" name="${c.nombre}" ${val ? "checked" : ""}> Sí</label>`;
      case "fecha":
        return `<input type="date" id="${id}" name="${c.nombre}" value="${esc(val)}" ${req}>`;
      case "numero": case "moneda": case "porcentaje":
        return `<input type="number" step="any" min="0" ${c.tipo === "porcentaje" ? 'max="100"' : ""} id="${id}" name="${c.nombre}" value="${esc(val)}" ${req}>`;
      case "correo":
        return `<input type="email" id="${id}" name="${c.nombre}" value="${esc(val)}" maxlength="${c.largo || 120}" ${req}>`;
      case "texto_largo":
        return `<textarea id="${id}" name="${c.nombre}" maxlength="${c.largo || 300}">${esc(val)}</textarea>`;
      default:
        return `<input id="${id}" name="${c.nombre}" value="${esc(val)}" maxlength="${c.largo || 200}" ${req}>`;
    }
  }

  async function formulario(campos, valores) {
    const refs = {};
    for (const c of campos.filter((c) => c.tipo === "ref")) refs[c.ref] = await opcionesRef(c.ref);
    const form = document.createElement("form");
    form.noValidate = true;
    form.innerHTML = `<div class="errores-form"></div><div class="rejilla">` + campos.map((c) => `
      <div class="campo" data-campo="${c.nombre}" style="${c.tipo === "texto_largo" ? "grid-column:1/-1" : ""}">
        <label for="f-${c.nombre}" class="${c.requerido ? "requerido" : ""}">${esc(c.etiqueta)}</label>
        ${control(c, (valores || {})[c.nombre], refs)}
        ${c.ayuda ? `<div class="ayuda">${esc(c.ayuda)}</div>` : ""}
      </div>`).join("") + "</div>";
    const sinRefs = campos.filter((c) => c.tipo === "ref" && c.requerido && !(refs[c.ref] || []).length);
    if (sinRefs.length) {
      form.querySelector(".errores-form").innerHTML = `<div class="mensaje error">Primero debe registrar: ${sinRefs.map((c) => esc(c.etiqueta)).join(", ")}.</div>`;
    }
    form.addEventListener("submit", (e) => e.preventDefault());
    return form;
  }

  /* Validación en el navegador (la API vuelve a validar todo). */
  function leer(form, campos) {
    const datos = {}, errores = {};
    campos.forEach((c) => {
      const el = form.elements[c.nombre];
      let v = c.tipo === "bool" ? (el.checked ? 1 : 0) : el.value.trim();
      if (c.tipo !== "bool" && v === "") {
        if (c.requerido) errores[c.nombre] = `El campo «${c.etiqueta}» es obligatorio`;
        datos[c.nombre] = null;
        return;
      }
      if (["numero", "moneda", "porcentaje"].includes(c.tipo)) {
        const n = Number(v);
        if (Number.isNaN(n)) errores[c.nombre] = `«${c.etiqueta}» debe ser un número`;
        else if (n < 0) errores[c.nombre] = `«${c.etiqueta}» no puede ser negativo`;
        else if (c.positivo && n === 0) errores[c.nombre] = `«${c.etiqueta}» debe ser mayor que cero`;
        else if (c.tipo === "porcentaje" && n > 100) errores[c.nombre] = `«${c.etiqueta}» no puede superar 100`;
      }
      if (c.tipo === "correo" && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(v)) errores[c.nombre] = `«${c.etiqueta}» no es un correo válido`;
      if (c.tipo === "fecha" && !/^\d{4}-\d{2}-\d{2}$/.test(v)) errores[c.nombre] = `«${c.etiqueta}» no es una fecha válida`;
      datos[c.nombre] = v;
    });
    return { datos, errores };
  }

  function mostrarErrores(form, errores, campos) {
    form.querySelectorAll(".campo").forEach((d) => { d.classList.remove("con-error"); d.querySelector(".error-campo")?.remove(); });
    const generales = [];
    Object.entries(errores || {}).forEach(([k, msg]) => {
      const campo = (campos || []).find((c) => c.nombre === k || c.etiqueta === k);
      const div = campo && form.querySelector(`.campo[data-campo="${campo.nombre}"]`);
      if (div) {
        div.classList.add("con-error");
        div.insertAdjacentHTML("beforeend", `<div class="error-campo">${esc(msg)}</div>`);
      } else generales.push(msg);
    });
    const caja = form.querySelector(".errores-form");
    if (caja) caja.innerHTML = generales.length ? `<ul class="lista-errores">${generales.map((g) => `<li>${esc(g)}</li>`).join("")}</ul>` : "";
    const primero = form.querySelector(".con-error input, .con-error select");
    if (primero) primero.focus();
  }

  function selectHTML(id, opciones, valor, vacio) {
    return `<select id="${id}">${vacio !== undefined ? `<option value="">${esc(vacio)}</option>` : ""}` +
      opciones.map((o) => `<option value="${esc(o.id)}" ${String(o.id) === String(valor) ? "selected" : ""}>${esc(o.texto)}</option>`).join("") + "</select>";
  }

  return { esc, fmt, naturaleza, valorVariacion, aviso, errorAPI, modal, confirmar, tabla, formulario, leer,
    mostrarErrores, opcionesRef, limpiarCache, selectHTML };
})();
