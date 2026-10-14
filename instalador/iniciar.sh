#!/usr/bin/env bash
# SISTEMA DE COSTOS - Inicia el sistema en macOS o Linux
cd "$(dirname "$0")/.."
if [ ! -x .venv/bin/python ]; then echo "Primero ejecute: bash instalador/instalar.sh"; exit 1; fi
exec .venv/bin/python backend/app.py
