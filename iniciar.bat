@echo off
rem Abre o Terra Boa no navegador usando um servidor local (precisa do Python).
cd /d "%~dp0"
start "" http://127.0.0.1:8650/
python tools\servidor.py 8650
