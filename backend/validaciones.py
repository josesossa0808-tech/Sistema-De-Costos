"""Validaciones de datos compartidas por todos los módulos.

Cada error se devuelve con un mensaje comprensible para el usuario final.
"""
import re
from datetime import date

RE_CORREO = re.compile(r"^[^@\s]+@[^@\s]+\.[^@\s]+$")


class ErrorValidacion(Exception):
    def __init__(self, errores):
        if isinstance(errores, str):
            errores = {"_": errores}
        self.errores = errores
        super().__init__("; ".join(errores.values()))


def numero(valor, etiqueta, minimo=0, maximo=None, entero=False, permitir_cero=True):
    if valor is None or str(valor).strip() == "":
        return None
    try:
        texto = str(valor).strip().replace(" ", "")
        # admite coma decimal (formato colombiano) si no hay punto
        if "," in texto and "." not in texto:
            texto = texto.replace(",", ".")
        n = float(texto)
    except ValueError:
        raise ErrorValidacion({etiqueta: "«%s» debe ser un número válido" % etiqueta})
    if entero and int(n) != n:
        raise ErrorValidacion({etiqueta: "«%s» debe ser un número entero" % etiqueta})
    if minimo is not None and n < minimo:
        if minimo == 0:
            raise ErrorValidacion({etiqueta: "«%s» no puede ser negativo" % etiqueta})
        raise ErrorValidacion({etiqueta: "«%s» debe ser mayor o igual a %s" % (etiqueta, minimo)})
    if not permitir_cero and n == 0:
        raise ErrorValidacion({etiqueta: "«%s» debe ser mayor que cero" % etiqueta})
    if maximo is not None and n > maximo:
        raise ErrorValidacion({etiqueta: "«%s» no puede ser mayor que %s" % (etiqueta, maximo)})
    return int(n) if entero else n


def porcentaje(valor, etiqueta):
    return numero(valor, etiqueta, 0, 100)


def fecha(valor, etiqueta):
    if valor is None or str(valor).strip() == "":
        return None
    try:
        return date.fromisoformat(str(valor)[:10]).isoformat()
    except ValueError:
        raise ErrorValidacion({etiqueta: "«%s» debe ser una fecha válida (AAAA-MM-DD)" % etiqueta})


def correo(valor, etiqueta):
    if valor is None or str(valor).strip() == "":
        return None
    v = str(valor).strip()
    if not RE_CORREO.match(v):
        raise ErrorValidacion({etiqueta: "«%s» no es un correo electrónico válido" % etiqueta})
    return v.lower()


def texto(valor, etiqueta, largo=None):
    if valor is None:
        return None
    v = str(valor).strip()
    if v == "":
        return None
    if largo and len(v) > largo:
        raise ErrorValidacion({etiqueta: "«%s» admite máximo %d caracteres" % (etiqueta, largo)})
    return v
