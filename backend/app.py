"""
Sistema de Costos Estándar - API (backend)
Ejecutar:  python app.py   (desde la carpeta backend)
"""
import configparser
import os
from functools import wraps

import mysql.connector
from flask import Flask, jsonify, request, send_from_directory, session
from werkzeug.security import check_password_hash, generate_password_hash

BASE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
FRONTEND = os.path.join(BASE, "frontend")

cfg = configparser.ConfigParser()
cfg.read(os.path.join(BASE, "config", "config.ini"), encoding="utf-8")

app = Flask(__name__, static_folder=FRONTEND, static_url_path="")
app.secret_key = cfg["server"]["secret_key"]


# ---------- Base de datos ----------
def db():
    d = cfg["database"]
    return mysql.connector.connect(
        host=d["host"], port=int(d["port"]), user=d["user"],
        password=d["password"], database=d["name"],
    )


def consulta(sql, params=(), uno=False, escribir=False):
    con = db()
    cur = con.cursor(dictionary=True)
    cur.execute(sql, params)
    if escribir:
        con.commit()
        res = cur.lastrowid
    else:
        res = cur.fetchone() if uno else cur.fetchall()
    cur.close()
    con.close()
    return res


def registrar(accion, detalle=""):
    consulta("INSERT INTO bitacora (usuario_id, accion, detalle) VALUES (%s,%s,%s)",
             (session.get("uid"), accion, detalle), escribir=True)


def crear_admin_inicial():
    a = cfg["admin_inicial"]
    if not consulta("SELECT id FROM usuarios WHERE usuario=%s", (a["usuario"],), uno=True):
        consulta("INSERT INTO usuarios (usuario, password_hash, nombre, rol_id) VALUES (%s,%s,%s,1)",
                 (a["usuario"], generate_password_hash(a["password"]), "Administrador"), escribir=True)


# ---------- Seguridad ----------
def requiere_login(roles=None):
    def deco(f):
        @wraps(f)
        def w(*a, **k):
            if "uid" not in session:
                return jsonify(error="Debe iniciar sesión"), 401
            if roles and session.get("rol") not in roles:
                return jsonify(error="No tiene permiso para esta acción"), 403
            return f(*a, **k)
        return w
    return deco


@app.route("/")
def inicio():
    return send_from_directory(FRONTEND, "index.html")


@app.post("/api/login")
def login():
    d = request.get_json()
    u = consulta("""SELECT u.*, r.nombre AS rol FROM usuarios u JOIN roles r ON r.id=u.rol_id
                    WHERE u.usuario=%s AND u.activo=1""", (d.get("usuario"),), uno=True)
    if not u or not check_password_hash(u["password_hash"], d.get("password", "")):
        return jsonify(error="Usuario o contraseña incorrectos"), 401
    session.update(uid=u["id"], nombre=u["nombre"], rol=u["rol"])
    registrar("Inicio de sesión", u["usuario"])
    return jsonify(nombre=u["nombre"], rol=u["rol"])


@app.post("/api/logout")
def logout():
    if "uid" in session:
        registrar("Cierre de sesión")
    session.clear()
    return jsonify(ok=True)


@app.get("/api/sesion")
@requiere_login()
def sesion():
    return jsonify(nombre=session["nombre"], rol=session["rol"])


# ---------- Usuarios (solo administrador) ----------
@app.get("/api/usuarios")
@requiere_login(["Administrador"])
def usuarios():
    return jsonify(consulta("""SELECT u.id, u.usuario, u.nombre, r.nombre AS rol, u.activo
                               FROM usuarios u JOIN roles r ON r.id=u.rol_id ORDER BY u.id"""))


@app.post("/api/usuarios")
@requiere_login(["Administrador"])
def crear_usuario():
    d = request.get_json()
    nid = consulta("INSERT INTO usuarios (usuario, password_hash, nombre, rol_id) VALUES (%s,%s,%s,%s)",
                   (d["usuario"], generate_password_hash(d["password"]), d["nombre"], d["rol_id"]),
                   escribir=True)
    registrar("Crear usuario", d["usuario"])
    return jsonify(id=nid)


@app.get("/api/bitacora")
@requiere_login(["Administrador"])
def bitacora():
    return jsonify(consulta("""SELECT b.fecha, u.usuario, b.accion, b.detalle FROM bitacora b
                               LEFT JOIN usuarios u ON u.id=b.usuario_id ORDER BY b.id DESC LIMIT 200"""))


# ---------- Empresas ----------
@app.get("/api/empresas")
@requiere_login()
def empresas():
    return jsonify(consulta("SELECT * FROM empresas ORDER BY razon_social"))


@app.post("/api/empresas")
@requiere_login(["Administrador", "Usuario"])
def crear_empresa():
    d = request.get_json()
    nid = consulta("""INSERT INTO empresas (nit, razon_social, regimen_tributario, direccion, telefono)
                      VALUES (%s,%s,%s,%s,%s)""",
                   (d["nit"], d["razon_social"], d.get("regimen_tributario"),
                    d.get("direccion"), d.get("telefono")), escribir=True)
    registrar("Crear empresa", d["razon_social"])
    return jsonify(id=nid)


@app.put("/api/empresas/<int:eid>")
@requiere_login(["Administrador", "Usuario"])
def editar_empresa(eid):
    d = request.get_json()
    consulta("""UPDATE empresas SET nit=%s, razon_social=%s, regimen_tributario=%s,
                direccion=%s, telefono=%s WHERE id=%s""",
             (d["nit"], d["razon_social"], d.get("regimen_tributario"),
              d.get("direccion"), d.get("telefono"), eid), escribir=True)
    registrar("Editar empresa", str(eid))
    return jsonify(ok=True)


@app.delete("/api/empresas/<int:eid>")
@requiere_login(["Administrador"])
def eliminar_empresa(eid):
    consulta("DELETE FROM empresas WHERE id=%s", (eid,), escribir=True)
    registrar("Eliminar empresa", str(eid))
    return jsonify(ok=True)


# ---------- Análisis de variaciones (fórmulas de costo estándar) ----------
def tipo(v):
    return "Favorable" if v < 0 else ("Desfavorable" if v > 0 else "Sin variación")


@app.post("/api/variaciones/calcular")
@requiere_login()
def calcular_variaciones():
    """Recibe estándares y reales, devuelve todas las variaciones.
    Convención: valor positivo = desfavorable, negativo = favorable."""
    d = request.get_json()
    f = lambda k: float(d.get(k, 0))

    # Materiales
    v_precio_mat = (f("precio_real") - f("precio_std")) * f("cantidad_real")
    v_cant_mat = (f("cantidad_real") - f("cantidad_std_permitida")) * f("precio_std")
    # Mano de obra
    v_tarifa = (f("tarifa_real") - f("tarifa_std")) * f("horas_reales")
    v_eficiencia = (f("horas_reales") - f("horas_std_permitidas")) * f("tarifa_std")
    # CIF (método de dos variaciones)
    tasa_var = f("cif_variable_presup") / f("capacidad_normal") if f("capacidad_normal") else 0
    tasa_fija = f("cif_fijo_presup") / f("capacidad_normal") if f("capacidad_normal") else 0
    cif_aplicado = (tasa_var + tasa_fija) * f("base_std_permitida")
    presupuesto_flexible = f("cif_fijo_presup") + tasa_var * f("base_std_permitida")
    v_presupuesto_cif = f("cif_real") - presupuesto_flexible
    v_volumen_cif = presupuesto_flexible - cif_aplicado

    items = {
        "Precio de materiales": v_precio_mat,
        "Cantidad de materiales": v_cant_mat,
        "Tarifa de mano de obra": v_tarifa,
        "Eficiencia de mano de obra": v_eficiencia,
        "Presupuesto de CIF": v_presupuesto_cif,
        "Volumen de CIF": v_volumen_cif,
    }
    total = sum(items.values())
    return jsonify(
        tasa_predeterminada=round(tasa_var + tasa_fija, 4),
        cif_aplicado=round(cif_aplicado, 2),
        variaciones=[{"nombre": k, "valor": round(v, 2), "tipo": tipo(v)} for k, v in items.items()],
        total={"valor": round(total, 2), "tipo": tipo(total)},
    )


if __name__ == "__main__":
    crear_admin_inicial()
    s = cfg["server"]
    print(f"\nSistema iniciado. Abra en su navegador: http://{s['host']}:{s['port']}\n")
    app.run(host=s["host"], port=int(s["port"]))
