"""Inicio de sesión, creación de cuenta, usuarios, roles, permisos y bitácora."""
import re
from datetime import datetime, timedelta

from flask import Blueprint, g, jsonify, request
from werkzeug.security import check_password_hash

import bd
import configuracion as cfg
import validaciones as val
from rutas.comun import datos
from seguridad import (ACCIONES, MODULOS, cerrar_sesion, cifrar, crear_sesion, registrar,
                       requiere, validar_contrasena)

bp = Blueprint("usuarios", __name__)
RE_USUARIO = re.compile(r"^[A-Za-z0-9_.-]{3,40}$")


@bp.get("/api/config-publica")
def config_publica():
    return jsonify(nombre=cfg.obtener("sistema", "nombre", "Sistema de Costos"),
                   permitir_registro=cfg.booleano("seguridad", "permitir_registro", True),
                   rol_registro=cfg.obtener("seguridad", "rol_registro", "usuario"),
                   longitud_minima=cfg.entero("seguridad", "longitud_minima_contrasena", 8),
                   moneda=cfg.obtener("sistema", "moneda", "COP"),
                   decimales=cfg.entero("sistema", "decimales", 2))


def _validar_datos_usuario(d, usuario_id=None, exigir_clave=True):
    errores = {}
    nombre = (d.get("nombre") or "").strip()
    usuario = (d.get("usuario") or "").strip().lower()
    correo = (d.get("correo") or "").strip().lower()
    if not nombre:
        errores["Nombre"] = "El nombre es obligatorio"
    if not RE_USUARIO.match(usuario):
        errores["Usuario"] = "El usuario debe tener entre 3 y 40 caracteres (letras, números, punto, guion)"
    if not val.RE_CORREO.match(correo):
        errores["Correo"] = "Ingrese un correo electrónico válido"
    excluir = " AND id<>%s" % int(usuario_id) if usuario_id else ""
    if usuario and bd.uno("SELECT id FROM usuarios WHERE usuario=%s" + excluir, (usuario,)):
        errores["Usuario"] = "El nombre de usuario ya está registrado"
    if correo and bd.uno("SELECT id FROM usuarios WHERE correo=%s" + excluir, (correo,)):
        errores["Correo"] = "Ya existe una cuenta con ese correo"
    clave = d.get("contrasena") or ""
    if exigir_clave or clave:
        msg = validar_contrasena(clave)
        if msg:
            errores["Contraseña"] = msg
        elif "confirmar" in d and d.get("confirmar") != clave:
            errores["Confirmar contraseña"] = "Las contraseñas no coinciden"
    if errores:
        raise val.ErrorValidacion(errores)
    return nombre, usuario, correo, clave


# ---------------------------------------------------------------------
# Autenticación
# ---------------------------------------------------------------------
@bp.post("/api/auth/registro")
def registro():
    if not cfg.booleano("seguridad", "permitir_registro", True):
        return jsonify(error="El registro de cuentas está deshabilitado. Solicite una cuenta al administrador."), 403
    d = datos()
    nombre, usuario, correo, clave = _validar_datos_usuario(d)
    rol = cfg.obtener("seguridad", "rol_registro", "usuario")
    rol_id = bd.valor("SELECT id FROM roles WHERE nombre=%s", (rol,)) or \
        bd.valor("SELECT id FROM roles WHERE nombre='usuario'")
    uid = bd.ejecutar("INSERT INTO usuarios (nombre, usuario, correo, password_hash, rol_id, activo, creado_en)"
                      " VALUES (%s,%s,%s,%s,%s,1,%s)", (nombre, usuario, correo, cifrar(clave), rol_id, bd.ahora()))
    registrar("crear_cuenta", "usuarios", "Registro de cuenta (%s)" % rol, {"id": uid, "usuario": usuario})
    return jsonify(ok=True, mensaje="Cuenta creada. Ya puede iniciar sesión con su usuario y contraseña.")


@bp.post("/api/auth/login")
def login():
    d = datos()
    ident = (d.get("usuario") or "").strip().lower()
    clave = d.get("contrasena") or ""
    if not ident or not clave:
        return jsonify(error="Ingrese usuario y contraseña"), 400
    u = bd.uno("SELECT * FROM usuarios WHERE usuario=%s OR correo=%s", (ident, ident))
    generico = "Usuario o contraseña incorrectos"
    if not u:
        registrar("login_fallido", "usuarios", "Usuario inexistente: %s" % ident[:40], {"usuario": ident[:40]})
        return jsonify(error=generico), 401
    if not u["activo"]:
        return jsonify(error="La cuenta está desactivada. Contacte al administrador."), 403
    if u["bloqueado_hasta"] and str(u["bloqueado_hasta"]) > bd.ahora():
        return jsonify(error="Cuenta bloqueada temporalmente por intentos fallidos. Intente más tarde."), 423
    if not check_password_hash(u["password_hash"], clave):
        intentos = (u["intentos_fallidos"] or 0) + 1
        maximo = cfg.entero("seguridad", "intentos_maximos", 5)
        bloqueo = None
        if intentos >= maximo:
            bloqueo = (datetime.now() + timedelta(minutes=cfg.entero("seguridad", "minutos_bloqueo", 15))).strftime("%Y-%m-%d %H:%M:%S")
            intentos = 0
        bd.ejecutar("UPDATE usuarios SET intentos_fallidos=%s, bloqueado_hasta=%s WHERE id=%s", (intentos, bloqueo, u["id"]))
        registrar("login_fallido", "usuarios", "Contraseña incorrecta", u)
        if bloqueo:
            return jsonify(error="Demasiados intentos fallidos. La cuenta quedó bloqueada %s minutos."
                                 % cfg.entero("seguridad", "minutos_bloqueo", 15)), 423
        return jsonify(error=generico), 401
    bd.ejecutar("UPDATE usuarios SET intentos_fallidos=0, bloqueado_hasta=NULL, ultimo_acceso=%s WHERE id=%s",
                (bd.ahora(), u["id"]))
    token = crear_sesion(u["id"])
    registrar("inicio_sesion", "usuarios", "Inicio de sesión", u)
    return jsonify(ok=True, token=token)


@bp.post("/api/auth/logout")
@requiere()
def logout():
    cerrar_sesion(g.token)
    registrar("cierre_sesion", "usuarios", "Cierre de sesión")
    return jsonify(ok=True)


@bp.get("/api/auth/yo")
@requiere()
def yo():
    u = dict(g.usuario)
    u.pop("expira_en", None)
    u["modulos"] = MODULOS
    return jsonify(u)


@bp.post("/api/auth/cambiar-contrasena")
@requiere()
def cambiar_contrasena():
    d = datos()
    u = bd.uno("SELECT * FROM usuarios WHERE id=%s", (g.usuario["id"],))
    if not check_password_hash(u["password_hash"], d.get("actual") or ""):
        raise val.ErrorValidacion({"Contraseña actual": "La contraseña actual no es correcta"})
    msg = validar_contrasena(d.get("nueva"))
    if msg:
        raise val.ErrorValidacion({"Nueva contraseña": msg})
    if d.get("nueva") != d.get("confirmar"):
        raise val.ErrorValidacion({"Confirmar": "Las contraseñas no coinciden"})
    bd.ejecutar("UPDATE usuarios SET password_hash=%s WHERE id=%s", (cifrar(d["nueva"]), u["id"]))
    registrar("cambio_contrasena", "usuarios", "Cambio de contraseña propio")
    return jsonify(ok=True, mensaje="Contraseña actualizada")


# ---------------------------------------------------------------------
# Administración de usuarios
# ---------------------------------------------------------------------
@bp.get("/api/usuarios")
@requiere("usuarios", "ver")
def listar_usuarios():
    return jsonify(bd.consultar(
        "SELECT u.id, u.nombre, u.usuario, u.correo, u.rol_id, r.nombre AS rol, u.activo, u.ultimo_acceso, u.creado_en"
        " FROM usuarios u JOIN roles r ON r.id=u.rol_id ORDER BY u.nombre"))


@bp.get("/api/roles")
@requiere()
def roles():
    return jsonify(bd.consultar("SELECT * FROM roles ORDER BY id"))


def _rol_valido(rol_id):
    if not bd.uno("SELECT id FROM roles WHERE id=%s", (rol_id,)):
        raise val.ErrorValidacion({"Rol": "Seleccione un rol válido"})


@bp.post("/api/usuarios")
@requiere("usuarios", "crear")
def crear_usuario():
    d = datos()
    nombre, usuario, correo, clave = _validar_datos_usuario(d)
    _rol_valido(d.get("rol_id"))
    uid = bd.ejecutar("INSERT INTO usuarios (nombre, usuario, correo, password_hash, rol_id, activo, creado_en)"
                      " VALUES (%s,%s,%s,%s,%s,%s,%s)",
                      (nombre, usuario, correo, cifrar(clave), d["rol_id"], 1 if d.get("activo", True) else 0, bd.ahora()))
    registrar("crear", "usuarios", "Usuario %s" % usuario)
    return jsonify(ok=True, id=uid, mensaje="Usuario creado")


@bp.put("/api/usuarios/<int:uid>")
@requiere("usuarios", "editar")
def editar_usuario(uid):
    d = datos()
    if not bd.uno("SELECT id FROM usuarios WHERE id=%s", (uid,)):
        return jsonify(error="Usuario no encontrado"), 404
    nombre, usuario, correo, clave = _validar_datos_usuario(d, uid, exigir_clave=False)
    _rol_valido(d.get("rol_id"))
    activo = 1 if d.get("activo") in (True, 1, "1", "true", "on") else 0
    if uid == g.usuario["id"] and (not activo or int(d["rol_id"]) != g.usuario["rol_id"]):
        raise val.ErrorValidacion("No puede desactivarse ni cambiar su propio rol.")
    bd.ejecutar("UPDATE usuarios SET nombre=%s, usuario=%s, correo=%s, rol_id=%s, activo=%s WHERE id=%s",
                (nombre, usuario, correo, d["rol_id"], activo, uid))
    if clave:
        bd.ejecutar("UPDATE usuarios SET password_hash=%s, intentos_fallidos=0, bloqueado_hasta=NULL WHERE id=%s",
                    (cifrar(clave), uid))
    if not activo:
        bd.ejecutar("UPDATE sesiones SET activa=0 WHERE usuario_id=%s", (uid,))
    registrar("editar", "usuarios", "Usuario %s" % usuario)
    return jsonify(ok=True, mensaje="Usuario actualizado")


@bp.delete("/api/usuarios/<int:uid>")
@requiere("usuarios", "eliminar")
def eliminar_usuario(uid):
    if uid == g.usuario["id"]:
        raise val.ErrorValidacion("No puede eliminar su propia cuenta.")
    u = bd.uno("SELECT usuario FROM usuarios WHERE id=%s", (uid,))
    if not u:
        return jsonify(error="Usuario no encontrado"), 404
    bd.ejecutar("DELETE FROM usuarios WHERE id=%s", (uid,))
    registrar("eliminar", "usuarios", "Usuario %s" % u["usuario"])
    return jsonify(ok=True, mensaje="Usuario eliminado")


# ---------------------------------------------------------------------
# Permisos por rol
# ---------------------------------------------------------------------
@bp.get("/api/permisos")
@requiere("usuarios", "ver")
def ver_permisos():
    salida = []
    for r in bd.consultar("SELECT * FROM roles ORDER BY id"):
        filas = {f["modulo"]: f for f in bd.consultar("SELECT * FROM rol_permisos WHERE rol_id=%s", (r["id"],))}
        salida.append({"rol_id": r["id"], "rol": r["nombre"], "descripcion": r["descripcion"],
                       "permisos": {m: {a: bool(filas.get(m, {}).get("puede_" + a)) for a in ACCIONES} for m in MODULOS}})
    return jsonify(modulos=MODULOS, acciones=ACCIONES, roles=salida)


@bp.put("/api/permisos")
@requiere("usuarios", "editar")
def guardar_permisos():
    d = datos()
    for r in d.get("roles", []):
        rol = bd.uno("SELECT * FROM roles WHERE id=%s", (r.get("rol_id"),))
        if not rol:
            continue
        for m, p in (r.get("permisos") or {}).items():
            if m not in MODULOS:
                continue
            valores = [1 if p.get(a) else 0 for a in ACCIONES]
            if rol["nombre"] == "administrador" and m == "usuarios":
                valores = [1, 1, 1, 1]  # evita que el sistema quede sin administrador
            if bd.uno("SELECT id FROM rol_permisos WHERE rol_id=%s AND modulo=%s", (rol["id"], m)):
                bd.ejecutar("UPDATE rol_permisos SET puede_ver=%s, puede_crear=%s, puede_editar=%s, puede_eliminar=%s"
                            " WHERE rol_id=%s AND modulo=%s", valores + [rol["id"], m], confirmar=False)
            else:
                bd.ejecutar("INSERT INTO rol_permisos (rol_id, modulo, puede_ver, puede_crear, puede_editar, puede_eliminar)"
                            " VALUES (%s,%s,%s,%s,%s,%s)", [rol["id"], m] + valores, confirmar=False)
    bd.confirmar()
    registrar("editar", "usuarios", "Actualización de permisos por rol")
    return jsonify(ok=True, mensaje="Permisos actualizados")


# ---------------------------------------------------------------------
# Copia de seguridad (SQLite)
# ---------------------------------------------------------------------
@bp.get("/api/respaldo")
@requiere("usuarios", "editar")
def respaldo():
    import os
    import sqlite3
    import tempfile
    from flask import send_file
    if bd.MOTOR == "mysql":
        return _respaldo_mysql()
    destino = os.path.join(tempfile.mkdtemp(), "respaldo.db")
    origen = bd.conexion()
    copia = sqlite3.connect(destino)
    origen.backup(copia)  # copia consistente aunque el sistema esté en uso
    copia.close()
    registrar("respaldo", "usuarios", "Descarga de copia de seguridad")
    return send_file(destino, as_attachment=True, mimetype="application/octet-stream",
                     download_name="respaldo_sistema_costos_%s.db" % datetime.now().strftime("%Y%m%d_%H%M"))


def _respaldo_mysql():
    """Genera un volcado SQL completo con mysqldump (incluido en la instalación)."""
    import os
    import shutil
    import subprocess
    import tempfile
    from flask import send_file
    carpeta = cfg.obtener("base_datos", "carpeta_mysql_bin", "")
    exe = None
    if carpeta:
        candidato = os.path.join(cfg.ruta("base_datos", "carpeta_mysql_bin", carpeta), "mysqldump.exe" if os.name == "nt" else "mysqldump")
        exe = candidato if os.path.exists(candidato) else None
    exe = exe or shutil.which("mysqldump")
    if not exe:
        raise val.ErrorValidacion("No se encontró mysqldump. Indique la carpeta en config.ini (carpeta_mysql_bin).")
    destino = os.path.join(tempfile.mkdtemp(), "respaldo.sql")
    entorno = dict(os.environ, MYSQL_PWD=cfg.obtener("base_datos", "contrasena", ""))  # la clave no va en la línea de comandos
    with open(destino, "wb") as salida:
        r = subprocess.run([exe, "-h", cfg.obtener("base_datos", "host", "127.0.0.1"),
                            "-P", str(cfg.entero("base_datos", "puerto", 3306)),
                            "-u", cfg.obtener("base_datos", "usuario", "root"),
                            "--single-transaction", "--routines", "--default-character-set=utf8mb4",
                            "--databases", cfg.obtener("base_datos", "nombre_bd", "sistema_costos")],
                           stdout=salida, stderr=subprocess.PIPE, env=entorno, timeout=300)
    if r.returncode != 0:
        raise bd.ErrorBD("mysqldump falló: %s" % r.stderr.decode("utf-8", "ignore")[:300])
    registrar("respaldo", "usuarios", "Descarga de copia de seguridad (MySQL)")
    return send_file(destino, as_attachment=True, mimetype="application/sql",
                     download_name="respaldo_sistema_costos_%s.sql" % datetime.now().strftime("%Y%m%d_%H%M"))


# ---------------------------------------------------------------------
# Bitácora
# ---------------------------------------------------------------------
@bp.get("/api/bitacora")
@requiere("usuarios", "ver")
def bitacora():
    sql = "SELECT * FROM bitacora WHERE 1=1"
    params = []
    if request.args.get("usuario"):
        sql += " AND usuario LIKE %s"
        params.append("%" + request.args["usuario"] + "%")
    if request.args.get("accion"):
        sql += " AND accion=%s"
        params.append(request.args["accion"])
    if request.args.get("desde"):
        sql += " AND fecha >= %s"
        params.append(request.args["desde"])
    if request.args.get("hasta"):
        sql += " AND fecha <= %s"
        params.append(request.args["hasta"] + " 23:59:59")
    sql += " ORDER BY id DESC LIMIT 500"
    return jsonify(bd.consultar(sql, params))
