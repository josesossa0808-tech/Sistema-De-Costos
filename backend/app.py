"""SISTEMA DE COSTOS - Punto de entrada.

Inicia la API REST (Flask) y sirve el frontend (HTML/CSS/JS) en
http://127.0.0.1:5000 (configurable en config/config.ini). No requiere
internet: todo se ejecuta en el equipo local; la base de datos es un archivo
SQLite (database/sistema_costos.db). MySQL es opcional (ver config.ini).

Uso:  python backend/app.py            -> inicia el sistema
      python backend/app.py --init-bd  -> solo crea la base de datos y sale
"""
import logging
import os
import sys
import threading
import webbrowser
from logging.handlers import RotatingFileHandler

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from flask import Flask, jsonify, send_from_directory  # noqa: E402
from flask.json.provider import DefaultJSONProvider  # noqa: E402

import bd  # noqa: E402
import configuracion as cfg  # noqa: E402
import recursos  # noqa: E402
import seguridad  # noqa: E402
from validaciones import ErrorValidacion  # noqa: E402

VERSION = "1.0.0"


class JSONProveedor(DefaultJSONProvider):
    ensure_ascii = False
    sort_keys = False


def configurar_logs():
    carpeta = cfg.ruta("sistema", "carpeta_logs", "logs")
    os.makedirs(carpeta, exist_ok=True)
    h = RotatingFileHandler(os.path.join(carpeta, "sistema.log"), maxBytes=2_000_000, backupCount=5, encoding="utf-8")
    h.setFormatter(logging.Formatter("%(asctime)s %(levelname)s %(name)s: %(message)s"))
    raiz = logging.getLogger()
    raiz.setLevel(logging.INFO)
    raiz.addHandler(h)
    raiz.addHandler(logging.StreamHandler())


def crear_app():
    app = Flask(__name__, static_folder=None)
    app.json = JSONProveedor(app)
    app.teardown_appcontext(bd.cerrar)

    from rutas import catalogos, produccion, tablero, usuarios
    for m in (usuarios, catalogos, produccion, tablero):
        app.register_blueprint(m.bp)

    @app.get("/api/meta")
    @seguridad.requiere()
    def meta():
        return jsonify(recursos=recursos.publico(), modulos=seguridad.MODULOS, version=VERSION)

    @app.get("/api/salud")
    def salud():
        try:
            bd.valor("SELECT 1 AS v")
            estado_bd = "ok"
        except Exception as e:  # pragma: no cover
            estado_bd = str(e)
        return jsonify(sistema="ok", base_datos=estado_bd, motor=bd.MOTOR, version=VERSION)

    # ---------------- Errores con mensajes comprensibles
    @app.errorhandler(ErrorValidacion)
    def _val(e):
        return jsonify(error="Revise la información ingresada" if len(e.errores) > 1 or "_" not in e.errores
                       else e.errores["_"], errores=e.errores), 400

    @app.errorhandler(bd.ErrorIntegridad)
    def _integ(e):
        logging.warning("Integridad: %s", e)
        return jsonify(error="La operación viola la integridad de los datos (registro duplicado o en uso)."), 409

    @app.errorhandler(bd.ErrorBD)
    def _bd(e):
        logging.error("BD: %s", e)
        return jsonify(error=str(e)), 503

    @app.errorhandler(404)
    def _404(e):
        return jsonify(error="Recurso no encontrado"), 404

    @app.errorhandler(Exception)
    def _gen(e):
        if hasattr(e, "code") and hasattr(e, "description"):
            return jsonify(error=e.description), e.code
        logging.exception("Error no controlado")
        return jsonify(error="Ocurrió un error inesperado. Detalle registrado en logs/sistema.log"), 500

    # ---------------- Frontend estático
    @app.get("/")
    def raiz():
        return send_from_directory(cfg.DIR_FRONTEND, "index.html")

    @app.get("/<path:ruta>")
    def estaticos(ruta):
        if ruta.startswith("api/"):
            return jsonify(error="Recurso no encontrado"), 404
        return send_from_directory(cfg.DIR_FRONTEND, ruta)

    @app.after_request
    def sin_cache(resp):
        if resp.mimetype in ("text/html", "application/javascript", "text/javascript", "text/css"):
            resp.headers["Cache-Control"] = "no-cache"
        resp.headers["X-Content-Type-Options"] = "nosniff"
        return resp

    return app


def inicializar_bd():
    if cfg.booleano("base_datos", "crear_automaticamente", True):
        bd.crear_esquema()
    app = crear_app()
    with app.app_context():
        seguridad.sembrar_datos_iniciales()
    return app


def main():
    configurar_logs()
    log = logging.getLogger("sistema")
    try:
        app = inicializar_bd()
    except bd.ErrorBD as e:
        log.error(str(e))
        print("\n*** %s\n" % e)
        if getattr(sys, "frozen", False):
            input("Presione Enter para cerrar...")
        sys.exit(1)
    if "--init-bd" in sys.argv:
        print("Base de datos lista (%s)." % bd.MOTOR)
        return
    if "--restablecer-admin" in sys.argv:
        # Recupera el acceso: restablece la contraseña del administrador inicial definida en config.ini
        with app.app_context():
            usuario = cfg.obtener("administrador_inicial", "usuario", "admin")
            n = bd.uno("SELECT id FROM usuarios WHERE usuario=%s", (usuario,))
            if not n:
                print("No existe el usuario %s." % usuario)
                return
            rol = bd.valor("SELECT id FROM roles WHERE nombre='administrador'")
            bd.ejecutar("UPDATE usuarios SET password_hash=%s, rol_id=%s, activo=1, intentos_fallidos=0,"
                        " bloqueado_hasta=NULL WHERE id=%s",
                        (seguridad.cifrar(cfg.obtener("administrador_inicial", "contrasena", "Admin123*")), rol, n["id"]))
        print("Contraseña de '%s' restablecida al valor de config.ini." % usuario)
        return
    host = cfg.obtener("servidor", "host", "127.0.0.1")
    puerto = cfg.entero("servidor", "puerto", 5000)
    url = "http://%s:%d" % ("127.0.0.1" if host in ("0.0.0.0", "") else host, puerto)
    print("=" * 60)
    print(" %s v%s" % (cfg.obtener("sistema", "nombre", "Kosto"), VERSION))
    print(" Abra en su navegador: %s" % url)
    print(" Para detener el sistema cierre esta ventana (o Ctrl+C)")
    print("=" * 60)
    # Si el sistema ya está abierto (puerto ocupado), solo abre el navegador
    import socket
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
        ocupado = s.connect_ex(("127.0.0.1", puerto)) == 0
    if ocupado:
        print("\n Kosto ya está abierto. Abriendo el navegador en %s ..." % url)
        if "--sin-navegador" not in sys.argv:
            webbrowser.open(url)
        import time
        time.sleep(4)
        return
    if cfg.booleano("servidor", "abrir_navegador", True) and "--sin-navegador" not in sys.argv:
        threading.Timer(1.5, lambda: webbrowser.open(url)).start()
    try:
        from waitress import serve
        serve(app, host=host, port=puerto, threads=8)
    except ImportError:
        app.run(host=host, port=puerto, debug=cfg.booleano("servidor", "depuracion", False), use_reloader=False)


if __name__ == "__main__":
    try:
        main()
    except SystemExit:
        raise
    except BaseException:
        # Guarda el error en logs/error.log y deja la ventana abierta para poder leerlo
        import traceback
        detalle = traceback.format_exc()
        print(detalle)
        try:
            carpeta = os.path.join(cfg.DIR_BASE, "logs")
            os.makedirs(carpeta, exist_ok=True)
            with open(os.path.join(carpeta, "error.log"), "a", encoding="utf-8") as f:
                f.write(detalle + "\n")
        except OSError:
            pass
        print("Ocurrió un error. El detalle quedó en la carpeta logs (error.log).")
        if getattr(sys, "frozen", False):
            input("Presione Enter para cerrar...")
        sys.exit(1)
