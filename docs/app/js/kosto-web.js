/* Kosto en el navegador.
 * Ejecuta el mismo backend de Python (Flask + SQLite) dentro del navegador con Pyodide,
 * así el sistema funciona desde una página web sin instalar nada.
 * Las llamadas a /api/... se atienden localmente; los datos se guardan en el navegador (IndexedDB).
 */
(function () {
  "use strict";
  var PYODIDE = "https://cdn.jsdelivr.net/pyodide/v0.27.7/full/";
  var RAIZ = new URL("../", document.currentScript.src).href; // carpeta de la app
  var RAIZ_KOSTO = RAIZ + "kosto/";
  var CLAVE_CACHE = "kosto_web_listo";

  /* ---------- Pantalla de carga ---------- */
  var capa = document.createElement("div");
  capa.id = "kosto-cargando";
  capa.innerHTML =
    '<div style="text-align:center;max-width:340px;padding:24px">' +
    '<div style="width:46px;height:46px;margin:0 auto 18px;border:4px solid #cfe0ff;border-top-color:#1f6fff;border-radius:50%;animation:kgiro 0.9s linear infinite"></div>' +
    '<div style="font:700 1.15rem system-ui,sans-serif;color:#0a1a3f">Iniciando Kosto…</div>' +
    '<div id="kosto-paso" style="font:0.9rem system-ui,sans-serif;color:#5a6b8c;margin-top:8px">Preparando el sistema</div>' +
    '<div id="kosto-nota" style="font:0.8rem system-ui,sans-serif;color:#8a99b8;margin-top:14px"></div></div>' +
    "<style>@keyframes kgiro{to{transform:rotate(360deg)}}</style>";
  capa.setAttribute("style", "position:fixed;inset:0;z-index:99999;background:#f4f8ff;display:flex;align-items:center;justify-content:center");
  function montarCapa() { if (!capa.isConnected) document.body.appendChild(capa); }
  if (document.body) montarCapa(); else document.addEventListener("DOMContentLoaded", montarCapa);
  var primeraVez = true;
  try { primeraVez = !localStorage.getItem(CLAVE_CACHE); } catch (e) {}
  function paso(t) {
    var p = document.getElementById("kosto-paso"); if (p) p.textContent = t;
    var n = document.getElementById("kosto-nota");
    if (n && primeraVez) n.textContent = "La primera vez tarda un poco más mientras se descarga el sistema.";
  }

  function cargarScript(src) {
    return new Promise(function (ok, mal) {
      var s = document.createElement("script");
      s.src = src; s.onload = ok; s.onerror = function () { mal(new Error("No se pudo descargar " + src)); };
      document.head.appendChild(s);
    });
  }

  var py = null, atender = null;

  function sincronizar(cargar) {
    return new Promise(function (ok) { py.FS.syncfs(!!cargar, function () { ok(); }); });
  }

  var listo = (async function () {
    paso("Descargando el motor de Kosto…");
    await cargarScript(PYODIDE + "pyodide.js");
    py = await loadPyodide({ indexURL: PYODIDE });

    paso("Cargando componentes…");
    await py.loadPackage(["micropip", "sqlite3", "hashlib", "openpyxl"]);
    var micropip = py.pyimport("micropip");
    await micropip.install("flask");
    try { await micropip.install("reportlab"); } catch (e) { console.warn("PDF no disponible en la versión web", e); }

    paso("Cargando el sistema…");
    var archivos = await fetch(RAIZ_KOSTO + "manifest.json", { cache: "no-cache" }).then(function (r) { return r.json(); });
    await Promise.all(archivos.map(async function (rel) {
      var datos = new Uint8Array(await fetch(RAIZ_KOSTO + rel, { cache: "no-cache" }).then(function (r) {
        if (!r.ok) throw new Error("Falta el archivo " + rel);
        return r.arrayBuffer();
      }));
      var ruta = "/kosto/" + rel;
      py.FS.mkdirTree(ruta.substring(0, ruta.lastIndexOf("/")));
      py.FS.writeFile(ruta, datos);
    }));

    // Datos persistentes en el navegador
    py.FS.mkdirTree("/kosto/datos");
    py.FS.mount(py.FS.filesystems.IDBFS, {}, "/kosto/datos");
    await sincronizar(true);
    var existe = true;
    try { py.FS.stat("/kosto/datos/sistema_costos.db"); } catch (e) { existe = false; }
    if (!existe) {
      py.FS.writeFile("/kosto/datos/sistema_costos.db", py.FS.readFile("/kosto/database/sistema_costos.db"));
      await sincronizar(false);
    }

    paso("Abriendo Kosto…");
    py.runPython([
      "import os, sys, json, base64",
      "os.environ['SC_CONFIG'] = '/kosto/config/config.ini'",
      "os.chdir('/kosto')",
      "sys.path.insert(0, '/kosto/backend')",
      "import app as _kapp",
      "_app = _kapp.inicializar_bd()",
      "_cliente = _app.test_client()",
      "def _atender(metodo, ruta, cabeceras, cuerpo):",
      "    datos = base64.b64decode(cuerpo) if cuerpo else None",
      "    r = _cliente.open(ruta, method=metodo, headers=json.loads(cabeceras), data=datos)",
      "    salida = json.dumps([r.status_code, list(r.headers.items()), base64.b64encode(r.get_data()).decode()])",
      "    r.close()",
      "    return salida",
    ].join("\n"));
    atender = py.globals.get("_atender");
    try { localStorage.setItem(CLAVE_CACHE, "1"); } catch (e) {}
    capa.remove();
  })().catch(function (e) {
    console.error(e);
    paso("No fue posible iniciar Kosto: " + e.message);
    var n = document.getElementById("kosto-nota");
    if (n) n.textContent = "Revise su conexión a internet y recargue la página. Use Google Chrome o Edge actualizados.";
    throw e;
  });

  function aBase64(bytes) {
    var s = ""; for (var i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
    return btoa(s);
  }
  function deBase64(b64) {
    var s = atob(b64), a = new Uint8Array(s.length);
    for (var i = 0; i < s.length; i++) a[i] = s.charCodeAt(i);
    return a;
  }

  var fetchOriginal = window.fetch.bind(window);
  var cola = Promise.resolve();

  window.fetch = function (entrada, opciones) {
    var url = typeof entrada === "string" ? entrada : (entrada && entrada.url) || String(entrada);
    var u = new URL(url, location.href);
    var i = u.pathname.indexOf("/api/");
    if (u.origin !== location.origin || i < 0) return fetchOriginal(entrada, opciones);
    opciones = opciones || {};
    var ruta = u.pathname.slice(i) + u.search;
    var metodo = (opciones.method || "GET").toUpperCase();
    var cab = {};
    new Headers(opciones.headers || {}).forEach(function (v, k) { cab[k] = v; });
    // Las peticiones se atienden una por una (SQLite en el navegador)
    var tarea = cola.then(async function () {
      await listo;
      var cuerpo = "";
      if (opciones.body != null) {
        var b = opciones.body;
        var bytes = typeof b === "string" ? new TextEncoder().encode(b) : new Uint8Array(await new Response(b).arrayBuffer());
        cuerpo = aBase64(bytes);
      }
      var res = JSON.parse(atender(metodo, ruta, JSON.stringify(cab), cuerpo));
      if (metodo !== "GET") await sincronizar(false);
      var estado = res[0];
      var cuerpoRes = (estado === 204 || estado === 304) ? null : deBase64(res[2]);
      return new Response(cuerpoRes, { status: estado, headers: res[1] });
    });
    cola = tarea.catch(function () {});
    return tarea;
  };
})();
