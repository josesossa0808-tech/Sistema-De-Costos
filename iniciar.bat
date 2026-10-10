@echo off
title Sistema de Costos Estandar
cd /d "%~dp0backend"
echo Instalando dependencias (solo la primera vez tarda)...
python -m pip install -r requirements.txt --quiet
python app.py
pause
