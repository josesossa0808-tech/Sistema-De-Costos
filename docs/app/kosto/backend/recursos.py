"""Definición declarativa de los catálogos y registros del sistema.

Cada recurso describe su tabla, el módulo de permisos al que pertenece y sus
campos con reglas de validación. A partir de esta definición se generan
automáticamente: la API CRUD (/api/r/<recurso>), las validaciones y los
formularios del frontend (/api/meta).
"""

def C(nombre, etiqueta, tipo="texto", **kw):
    campo = {"nombre": nombre, "etiqueta": etiqueta, "tipo": tipo}
    campo.update(kw)
    return campo


REGIMENES = ["Régimen ordinario", "Régimen simple de tributación (RST)",
             "No responsable de IVA", "Régimen tributario especial"]

RECURSOS = {
    # ------------------------------------------------------------ Datos generales
    "empresas": {
        "titulo": "Empresas", "modulo": "datos_generales", "por_empresa": False,
        "orden": "razon_social",
        "campos": [
            C("nit", "NIT", requerido=True, unico=True, largo=20, grupo="Datos tributarios"),
            C("digito_verificacion", "DV", largo=2, grupo="Datos tributarios"),
            C("razon_social", "Razón social", requerido=True, largo=150),
            C("nombre_comercial", "Nombre comercial", largo=150),
            C("tipo_persona", "Tipo de persona", "lista", opciones=["Jurídica", "Natural"], defecto="Jurídica", grupo="Datos tributarios"),
            C("regimen_tributario", "Régimen tributario", "lista", opciones=REGIMENES, grupo="Datos tributarios"),
            C("responsable_iva", "Responsable de IVA", "lista", opciones=["Si", "No"], defecto="Si", grupo="Datos tributarios"),
            C("tarifa_iva", "Tarifa IVA (%)", "porcentaje", defecto=19, grupo="Datos tributarios"),
            C("actividad_economica", "Actividad económica (CIIU)", largo=20, grupo="Datos tributarios"),
            C("representante_legal", "Representante legal", largo=120),
            C("direccion", "Dirección", largo=150, en_tabla=False),
            C("ciudad", "Ciudad", largo=80),
            C("telefono", "Teléfono", largo=30),
            C("correo", "Correo", "correo", largo=120, en_tabla=False),
            C("moneda", "Moneda", "lista", opciones=["COP", "USD", "EUR"], defecto="COP", en_tabla=False),
        ],
    },
    "periodos": {
        "titulo": "Periodos contables", "modulo": "datos_generales", "orden": "fecha_inicio DESC",
        "campos": [
            C("nombre", "Nombre del periodo", requerido=True, unico=True, largo=40, ayuda="Ej.: 2026-10 u Octubre 2026"),
            C("fecha_inicio", "Fecha inicial", "fecha", requerido=True),
            C("fecha_fin", "Fecha final", "fecha", requerido=True),
            C("estado", "Estado", "lista", opciones=["Abierto", "Cerrado"], defecto="Abierto"),
        ],
    },
    "unidades_medida": {
        "titulo": "Unidades de medida", "modulo": "datos_generales", "por_empresa": False, "orden": "codigo",
        "campos": [
            C("codigo", "Código", requerido=True, unico=True, largo=10),
            C("nombre", "Nombre", requerido=True, largo=40),
            C("tipo", "Tipo", "lista", opciones=["Conteo", "Masa", "Volumen", "Longitud", "Área", "Tiempo"]),
        ],
    },
    "centros_costo": {
        "titulo": "Centros de costo", "modulo": "datos_generales", "orden": "codigo",
        "campos": [
            C("codigo", "Código", requerido=True, unico=True, largo=20),
            C("nombre", "Nombre", requerido=True, largo=100),
            C("tipo", "Tipo", "lista", opciones=["Producción", "Servicio", "Administración"], defecto="Producción"),
        ],
    },
    "proveedores": {
        "titulo": "Proveedores", "modulo": "materias_primas", "orden": "nombre",
        "campos": [
            C("nit", "NIT / Documento", requerido=True, unico=True, largo=20),
            C("nombre", "Nombre o razón social", requerido=True, largo=150),
            C("telefono", "Teléfono", largo=30),
            C("correo", "Correo", "correo", largo=120),
        ],
    },
    "productos": {
        "titulo": "Productos", "modulo": "datos_generales", "orden": "codigo",
        "campos": [
            C("codigo", "Código", requerido=True, unico=True, largo=20),
            C("nombre", "Nombre", requerido=True, largo=150),
            C("unidad_id", "Unidad de medida", "ref", ref="unidades_medida", etiqueta_ref="codigo", requerido=True),
            C("precio_venta", "Precio de venta", "moneda", defecto=0),
            C("horas_maquina_estandar", "Horas máquina estándar / und", "numero", defecto=0,
              ayuda="Solo si los CIF se aplican por horas máquina"),
            C("descripcion", "Descripción", "texto_largo", largo=300, en_tabla=False),
        ],
    },
    # ------------------------------------------------------------ Materias primas
    "materias_primas": {
        "titulo": "Materias primas", "modulo": "materias_primas", "orden": "codigo",
        "campos": [
            C("codigo", "Código", requerido=True, unico=True, largo=20),
            C("descripcion", "Descripción", requerido=True, largo=150),
            C("unidad_id", "Unidad de medida", "ref", ref="unidades_medida", etiqueta_ref="codigo", requerido=True),
            C("precio_estandar", "Precio estándar", "moneda", requerido=True),
            C("proveedor_id", "Proveedor", "ref", ref="proveedores", etiqueta_ref="nombre"),
            C("centro_costo_id", "Centro de costo", "ref", ref="centros_costo", etiqueta_ref="nombre"),
        ],
    },
    "estandar_materiales": {
        "titulo": "Estándar de materiales por producto", "modulo": "materias_primas", "orden": "producto_id",
        "campos": [
            C("producto_id", "Producto", "ref", ref="productos", etiqueta_ref="nombre", requerido=True),
            C("materia_prima_id", "Materia prima", "ref", ref="materias_primas", etiqueta_ref="descripcion", requerido=True),
            C("cantidad_estandar", "Cantidad estándar por unidad", "numero", requerido=True, positivo=True),
            C("precio_estandar", "Precio estándar", "moneda",
              ayuda="Si lo deja vacío se toma el precio estándar de la materia prima"),
        ],
        "unico_compuesto": [("producto_id", "materia_prima_id",
                             "Esa materia prima ya está en el estándar de este producto")],
    },
    # ------------------------------------------------------------ Mano de obra
    "cargos": {
        "titulo": "Cargos", "modulo": "mano_obra", "orden": "nombre",
        "campos": [
            C("nombre", "Cargo", requerido=True, unico=True, largo=80),
            C("tarifa_estandar_hora", "Tarifa estándar por hora", "moneda", requerido=True),
            C("descripcion", "Descripción", largo=200),
        ],
    },
    "prestaciones": {
        "titulo": "Prestaciones y cargas laborales", "modulo": "mano_obra", "orden": "tipo",
        "campos": [
            C("concepto", "Concepto", requerido=True, unico=True, largo=80),
            C("tipo", "Tipo", "lista", opciones=["Prestación social", "Seguridad social", "Parafiscal", "Otro"],
              defecto="Prestación social"),
            C("porcentaje", "Porcentaje sobre salario (%)", "porcentaje", requerido=True),
        ],
    },
    "trabajadores": {
        "titulo": "Trabajadores", "modulo": "mano_obra", "orden": "nombre",
        "campos": [
            C("documento", "Documento", requerido=True, unico=True, largo=20),
            C("nombre", "Nombre completo", requerido=True, largo=120),
            C("cargo_id", "Cargo", "ref", ref="cargos", etiqueta_ref="nombre", requerido=True),
            C("centro_costo_id", "Centro de costo", "ref", ref="centros_costo", etiqueta_ref="nombre"),
            C("salario_mensual", "Salario mensual", "moneda", requerido=True, positivo=True),
            C("auxilio_transporte", "Auxilio de transporte", "moneda", defecto=0),
            C("horas_mes", "Horas laborales al mes", "numero", requerido=True, positivo=True, defecto_cfg="horas_laborales_mes"),
            C("activo", "Activo", "bool", defecto=1),
        ],
        "calculados": ["factor_prestacional", "costo_mensual_total", "tarifa_real_hora"],
    },
    "estandar_mano_obra": {
        "titulo": "Estándar de mano de obra por producto", "modulo": "mano_obra", "orden": "producto_id",
        "campos": [
            C("producto_id", "Producto", "ref", ref="productos", etiqueta_ref="nombre", requerido=True),
            C("cargo_id", "Cargo", "ref", ref="cargos", etiqueta_ref="nombre", requerido=True),
            C("horas_estandar", "Horas estándar por unidad", "numero", requerido=True, positivo=True),
            C("tarifa_estandar", "Tarifa estándar por hora", "moneda",
              ayuda="Si lo deja vacío se toma la tarifa estándar del cargo"),
        ],
        "unico_compuesto": [("producto_id", "cargo_id", "Ese cargo ya está en el estándar de este producto")],
    },
    # ------------------------------------------------------------ CIF
    "cif_parametros": {
        "titulo": "Base de aplicación y nivel normal de CIF", "modulo": "cif", "orden": "periodo_id",
        "campos": [
            C("periodo_id", "Periodo", "ref", ref="periodos", etiqueta_ref="nombre", requerido=True, unico=True),
            C("base_aplicacion", "Base de aplicación", "lista", requerido=True,
              opciones=[["horas_mod", "Horas de mano de obra directa"], ["horas_maquina", "Horas máquina"],
                        ["unidades", "Unidades producidas"]], defecto="horas_mod"),
            C("nivel_normal", "Nivel normal de actividad (en la base)", "numero", requerido=True, positivo=True,
              ayuda="Capacidad presupuestada del periodo: horas MOD, horas máquina o unidades"),
        ],
        "calculados": ["cif_fijo_presupuestado", "cif_variable_presupuestado", "tasa_fija", "tasa_variable", "tasa_total"],
    },
    "cif": {
        "titulo": "Registro de CIF", "modulo": "cif", "orden": "codigo",
        "campos": [
            C("periodo_id", "Periodo", "ref", ref="periodos", etiqueta_ref="nombre", requerido=True),
            C("codigo", "Código", requerido=True, largo=20),
            C("concepto", "Concepto", requerido=True, largo=120),
            C("comportamiento", "Comportamiento", "lista", opciones=["Fijo", "Variable"], requerido=True),
            C("centro_costo_id", "Centro de costo", "ref", ref="centros_costo", etiqueta_ref="nombre"),
            C("valor_presupuestado", "CIF presupuestado", "moneda", requerido=True),
            C("valor_real", "CIF real", "moneda", defecto=0),
        ],
        "unico_compuesto": [("periodo_id", "codigo", "Ya existe un CIF con ese código en el periodo")],
        "filtro": "periodo_id",
    },
}


def publico():
    """Metadatos para el frontend (sin detalles internos)."""
    return {k: {"titulo": v["titulo"], "modulo": v["modulo"], "campos": v["campos"],
                "calculados": v.get("calculados", []), "filtro": v.get("filtro")}
            for k, v in RECURSOS.items()}
