"""Pruebas automáticas del Sistema de Costos.

Ejecuta un caso de costeo estándar con resultados conocidos y verifica
autenticación, permisos, validaciones, cálculos de variaciones y reportes.
Usa una base SQLite temporal para no tocar la base MySQL de producción.

    python -m unittest tests/test_sistema.py -v
"""
import configparser
import os
import sys
import tempfile
import unittest

RAIZ = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
_tmp = tempfile.mkdtemp()
_c = configparser.ConfigParser(interpolation=None)
_c.read(os.path.join(RAIZ, "config", "config.ini"), encoding="utf-8")
_c["base_datos"]["motor"] = "sqlite"
_c["base_datos"]["archivo_sqlite"] = os.path.join(_tmp, "prueba.db")
_c["sistema"]["carpeta_reportes"] = os.path.join(_tmp, "reportes")
_c["sistema"]["carpeta_logs"] = os.path.join(_tmp, "logs")
with open(os.path.join(_tmp, "config.ini"), "w", encoding="utf-8") as f:
    _c.write(f)
os.environ["SC_CONFIG"] = os.path.join(_tmp, "config.ini")
sys.path.insert(0, os.path.join(RAIZ, "backend"))

import app as aplicacion  # noqa: E402


class PruebaSistema(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.app = aplicacion.inicializar_bd()
        cls.c = cls.app.test_client()
        r = cls.c.post("/api/auth/login", json={"usuario": "admin", "contrasena": "Admin123*"})
        assert r.status_code == 200, r.json
        cls.h = {"Authorization": "Bearer " + r.json["token"]}

    # ------------------------------------------------------------------
    def api(self, metodo, url, datos=None, esperado=200, h=None):
        r = getattr(self.c, metodo)(url, json=datos, headers=h or self.h)
        self.assertEqual(r.status_code, esperado, "%s %s -> %s" % (metodo, url, r.get_json()))
        return r.get_json()

    def crear(self, recurso, datos):
        return self.api("post", "/api/r/" + recurso, datos)["id"]

    # ------------------------------------------------------------------
    def test_1_registro_y_login(self):
        r = self.api("post", "/api/auth/registro", {"nombre": "Ana", "usuario": "ana", "correo": "ana@x.co",
                                                     "contrasena": "corto", "confirmar": "corto"}, 400)
        self.assertIn("Contraseña", r["errores"])
        self.api("post", "/api/auth/registro", {"nombre": "Ana Pérez", "usuario": "ana", "correo": "ana@x.co",
                                                "contrasena": "Clave2026", "confirmar": "Clave2026"})
        self.api("post", "/api/auth/registro", {"nombre": "Otra", "usuario": "ana", "correo": "otra@x.co",
                                                "contrasena": "Clave2026", "confirmar": "Clave2026"}, 400)
        self.api("post", "/api/auth/login", {"usuario": "ana", "contrasena": "mala123"}, 401)
        tok = self.api("post", "/api/auth/login", {"usuario": "ana@x.co", "contrasena": "Clave2026"})["token"]
        h = {"Authorization": "Bearer " + tok}
        yo = self.api("get", "/api/auth/yo", h=h)
        self.assertEqual(yo["rol"], "usuario")
        self.assertFalse(yo["permisos"]["usuarios"]["ver"])
        self.api("get", "/api/usuarios", h=h, esperado=403)
        self.api("post", "/api/auth/logout", h=h)
        self.api("get", "/api/auth/yo", h=h, esperado=401)

    def test_2_caso_costeo_estandar(self):
        eid = self.api("post", "/api/r/empresas", {"nit": "900123456", "razon_social": "Pastelería Prueba SAS",
                                                   "regimen_tributario": "Régimen ordinario", "tarifa_iva": 19})["id"]
        self.h["X-Empresa"] = str(eid)
        # Validaciones
        r = self.api("post", "/api/r/empresas", {"nit": "900123456", "razon_social": "Dup"}, 400)
        self.assertIn("NIT", r["errores"])
        r = self.api("post", "/api/r/materias_primas", {"codigo": "X", "descripcion": "X", "unidad_id": 1,
                                                        "precio_estandar": -5}, 400)
        self.assertIn("negativo", r["errores"]["Precio estándar"])
        self.api("post", "/api/r/periodos", {"nombre": "Mal", "fecha_inicio": "2026-10-31", "fecha_fin": "2026-10-01"}, 400)

        per = self.crear("periodos", {"nombre": "2026-10", "fecha_inicio": "2026-10-01", "fecha_fin": "2026-10-31"})
        kg = self.crear("unidades_medida", {"codigo": "KG", "nombre": "Kilogramo", "tipo": "Masa"})
        und = self.crear("unidades_medida", {"codigo": "UND", "nombre": "Unidad", "tipo": "Conteo"})
        prod = self.crear("productos", {"codigo": "T01", "nombre": "Torta", "unidad_id": und, "precio_venta": 45000})
        harina = self.crear("materias_primas", {"codigo": "MP01", "descripcion": "Harina", "unidad_id": kg,
                                                "precio_estandar": 3000})
        self.crear("estandar_materiales", {"producto_id": prod, "materia_prima_id": harina, "cantidad_estandar": 2})
        self.api("post", "/api/r/estandar_materiales", {"producto_id": prod, "materia_prima_id": harina,
                                                        "cantidad_estandar": 1}, 400)
        cargo = self.crear("cargos", {"nombre": "Pastelero", "tarifa_estandar_hora": 10000})
        self.crear("estandar_mano_obra", {"producto_id": prod, "cargo_id": cargo, "horas_estandar": 1.5})
        trab = self.crear("trabajadores", {"documento": "1001", "nombre": "Luis", "cargo_id": cargo,
                                           "salario_mensual": 1800000, "horas_mes": 192})
        self.crear("cif_parametros", {"periodo_id": per, "base_aplicacion": "horas_mod", "nivel_normal": 1000})
        self.crear("cif", {"periodo_id": per, "codigo": "C1", "concepto": "Arriendo", "comportamiento": "Fijo",
                           "valor_presupuestado": 4000000, "valor_real": 4100000})
        self.crear("cif", {"periodo_id": per, "codigo": "C2", "concepto": "Energía", "comportamiento": "Variable",
                           "valor_presupuestado": 3000000, "valor_real": 2900000})

        est = self.api("get", "/api/estandar/%d?periodo_id=%d" % (prod, per))
        self.assertAlmostEqual(est["total_unitario"], 31500)  # 6000 + 15000 + 10500

        r = self.api("post", "/api/ordenes", {"periodo_id": per, "producto_id": prod, "fecha": "2026-11-05",
                                              "cantidad_terminada": 500}, 400)
        self.assertIn("Fecha", r["errores"])
        oid = self.api("post", "/api/ordenes", {
            "periodo_id": per, "producto_id": prod, "fecha": "2026-10-15", "cantidad_terminada": 500,
            "cantidad_en_proceso": 0,
            "materiales": [{"materia_prima_id": harina, "cantidad_real": 1050, "precio_real": 3100}],
            "mano_obra": [{"trabajador_id": trab, "horas_reales": 800, "tarifa_real": 9800}]})["id"]

        hoja = self.api("get", "/api/ordenes/%d/hoja" % oid)
        self.assertAlmostEqual(hoja["total_estandar"], 15750000)
        self.assertAlmostEqual(hoja["total_real"], 18095000)

        v = self.api("get", "/api/variaciones?periodo_id=%d" % per)
        esperado = {"Variación de precio de materiales": 105000, "Variación de cantidad de materiales": 150000,
                    "Variación de tarifa de mano de obra": -160000, "Variación de eficiencia de mano de obra": 500000,
                    "Variación de presupuesto de CIF": 750000, "Variación de volumen de CIF": 1000000}
        for f in v["variaciones"]:
            self.assertAlmostEqual(f["valor"], esperado[f["tipo"]], msg=f["tipo"])
        self.assertAlmostEqual(v["variacion_total"], 2345000)
        self.assertEqual(v["naturaleza_total"], "Desfavorable")
        self.assertAlmostEqual(v["total_favorable"], -160000)

        d = self.api("get", "/api/dashboard?periodo_id=%d" % per)
        self.assertAlmostEqual(d["kpis"]["costo_estandar_unitario"], 31500)
        self.assertAlmostEqual(d["kpis"]["costo_real_unitario"], 36190)

        for tipo in ("hoja_costos", "materiales", "mano_obra", "cif", "produccion", "variaciones", "estado_costos"):
            q = "/api/reportes/%s?periodo_id=%d&orden_id=%d" % (tipo, per, oid)
            self.assertTrue(self.api("get", q)["secciones"], tipo)
            for fmt, firma in (("xlsx", b"PK"), ("pdf", b"%PDF")):
                r = self.c.get(q + "&formato=" + fmt, headers=self.h)
                self.assertEqual(r.status_code, 200, (tipo, fmt))
                self.assertTrue(r.data.startswith(firma), (tipo, fmt))

        # Integridad: no se puede borrar una materia prima en uso
        self.api("delete", "/api/r/materias_primas/%d" % harina, esperado=409)
        # Periodo cerrado bloquea cambios
        self.api("put", "/api/r/periodos/%d" % per, {"nombre": "2026-10", "fecha_inicio": "2026-10-01",
                                                     "fecha_fin": "2026-10-31", "estado": "Cerrado"})
        self.api("delete", "/api/ordenes/%d" % oid, esperado=400)

        r = self.c.get("/api/respaldo", headers=self.h)
        self.assertEqual(r.status_code, 200)
        self.assertTrue(r.data.startswith(b"SQLite format 3"))

        bit = self.api("get", "/api/bitacora")
        self.assertTrue(any(b["accion"] == "inicio_sesion" for b in bit))
        del self.h["X-Empresa"]


if __name__ == "__main__":
    unittest.main()
