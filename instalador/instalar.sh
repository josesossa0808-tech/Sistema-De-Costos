#!/usr/bin/env bash
# =====================================================================
#  SISTEMA DE COSTOS - Instalacion en macOS o Linux
#  Uso:  bash instalador/instalar.sh
#  Base de datos: SQLite (incluida en Python). Si el equipo ya tiene
#  MySQL, puede usarlo cambiando "motor = mysql" en config/config.ini.
# =====================================================================
set -e
cd "$(dirname "$0")/.."
echo "[1/4] Buscando Python 3.10 o superior..."
PY=""
for c in python3.13 python3.12 python3.11 python3.10 python3; do
  if command -v "$c" >/dev/null 2>&1 && "$c" -c 'import sys; sys.exit(0 if sys.version_info >= (3,10) else 1)'; then PY="$c"; break; fi
done
if [ -z "$PY" ]; then
  echo "No se encontro Python 3.10+."
  if [ "$(uname)" = "Darwin" ]; then echo "Instalelo con: brew install python  (o desde https://www.python.org/downloads/)";
  else echo "Instalelo con: sudo apt install python3 python3-venv   (Debian/Ubuntu)"; fi
  exit 1
fi
echo "      $($PY --version)"
echo "[2/4] Creando entorno virtual..."
[ -x .venv/bin/python ] || "$PY" -m venv .venv
echo "[3/4] Instalando dependencias..."
.venv/bin/python -m pip install --upgrade pip -q
.venv/bin/python -m pip install -r backend/requirements.txt -q
echo "[4/4] Creando la base de datos..."
mkdir -p logs reportes_generados database
.venv/bin/python backend/app.py --init-bd
chmod +x instalador/iniciar.sh
echo
echo "Instalacion terminada. Para abrir el sistema:  ./instalador/iniciar.sh"
echo "Usuario: admin   Contrasena: Admin123*  (cambiela al entrar)"
