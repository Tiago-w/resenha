@echo off
title Resenha - Servidor de Voz, Tela e Chat
cd /d "%~dp0"

if not exist node_modules (
  echo Instalando dependencias...
  call npm install
)

echo.
echo Iniciando o Resenha em http://localhost:3000 ...
start "" http://localhost:3000
node server.js
pause
