# -*- mode: python ; coding: utf-8 -*-
# PyInstaller: genera dist/SistemaCostos/SistemaCostos.exe
# Uso: python -m PyInstaller --noconfirm --clean instalador/SistemaCostos.spec
import os

RAIZ = os.path.abspath(os.path.join(SPECPATH, ".."))

a = Analysis(
    [os.path.join(RAIZ, "backend", "app.py")],
    pathex=[os.path.join(RAIZ, "backend")],
    datas=[
        (os.path.join(RAIZ, "frontend"), "frontend"),
        (os.path.join(RAIZ, "database", "schema.sql"), "database"),
    ],
    hiddenimports=[
        "pymysql", "cryptography", "waitress", "openpyxl", "reportlab",
        "rutas", "rutas.catalogos", "rutas.comun", "rutas.produccion", "rutas.tablero", "rutas.usuarios",
    ],
    excludes=["tkinter", "matplotlib", "numpy", "pandas"],
    noarchive=False,
)
pyz = PYZ(a.pure)
exe = EXE(
    pyz, a.scripts, [],
    exclude_binaries=True,
    name="SistemaCostos",
    console=True,  # ventana del servidor: cerrarla detiene el sistema
    icon=os.path.join(RAIZ, "instalador", "icono.ico"),
)
coll = COLLECT(exe, a.binaries, a.datas, name="SistemaCostos")
