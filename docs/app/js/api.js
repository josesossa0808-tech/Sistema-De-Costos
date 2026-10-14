/* Comunicación con la API REST del backend. */
const API = (() => {
  const CLAVE_TOKEN = "sc_token";
  const CLAVE_EMPRESA = "sc_empresa";

  function token() { try { return sessionStorage.getItem(CLAVE_TOKEN); } catch (e) { return null; } }
  function guardarToken(t) { try { t ? sessionStorage.setItem(CLAVE_TOKEN, t) : sessionStorage.removeItem(CLAVE_TOKEN); } catch (e) {} }
  function empresa() { try { return localStorage.getItem(CLAVE_EMPRESA); } catch (e) { return null; } }
  function guardarEmpresa(id) { try { id ? localStorage.setItem(CLAVE_EMPRESA, id) : localStorage.removeItem(CLAVE_EMPRESA); } catch (e) {} }

  class ErrorAPI extends Error {
    constructor(mensaje, estado, errores) { super(mensaje); this.estado = estado; this.errores = errores || {}; }
  }

  async function pedir(metodo, url, datos) {
    const cab = { "Accept": "application/json" };
    const t = token();
    if (t) cab["Authorization"] = "Bearer " + t;
    const e = empresa();
    if (e) cab["X-Empresa"] = e;
    const op = { method: metodo, headers: cab };
    if (datos !== undefined) { cab["Content-Type"] = "application/json"; op.body = JSON.stringify(datos); }
    let r;
    try { r = await fetch(url, op); }
    catch (err) { throw new ErrorAPI("No hay conexión con el servidor. Verifique que el Sistema de Costos esté en ejecución.", 0); }
    let cuerpo = null;
    try { cuerpo = await r.json(); } catch (err) { cuerpo = null; }
    if (r.status === 401 && !url.includes("/api/auth/login")) {
      guardarToken(null);
      if (!location.pathname.endsWith("index.html") && location.pathname !== "/") {
        location.href = "index.html?expirada=1";
      }
    }
    if (!r.ok) throw new ErrorAPI((cuerpo && cuerpo.error) || "Error " + r.status, r.status, cuerpo && cuerpo.errores);
    return cuerpo;
  }

  /* Descarga un archivo (Excel/PDF) enviando el token en la cabecera, no en la URL. */
  async function descargar(url) {
    const r = await fetch(url, { headers: { "Authorization": "Bearer " + (token() || ""), "X-Empresa": empresa() || "" } });
    if (!r.ok) {
      let msg = "No fue posible generar el archivo";
      try { msg = (await r.json()).error || msg; } catch (e) {}
      throw new ErrorAPI(msg, r.status);
    }
    const disp = r.headers.get("Content-Disposition") || "";
    const m = /filename\*?=(?:UTF-8'')?"?([^";]+)"?/i.exec(disp);
    const nombre = m ? decodeURIComponent(m[1]) : "reporte";
    const blob = await r.blob();
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = nombre;
    document.body.appendChild(a);
    a.click();
    setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
    return nombre;
  }

  return {
    get: (u) => pedir("GET", u), post: (u, d) => pedir("POST", u, d || {}),
    put: (u, d) => pedir("PUT", u, d || {}), del: (u) => pedir("DELETE", u),
    token, guardarToken, empresa, guardarEmpresa, descargar, ErrorAPI,
  };
})();
