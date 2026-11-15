@echo off
title Cifras Liturgicas
echo Iniciando o Cifras Liturgicas... (feche esta janela para desligar)
start "" http://localhost:8765
wsl --cd "%~dp0" node server/servidor.mjs
pause
