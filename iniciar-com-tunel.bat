@echo off
title Resenha + Tunel Cloudflare
cd /d "%~dp0"

if not exist node_modules (
  echo Instalando dependencias...
  call npm install
)

echo Iniciando o servidor Resenha...
start "Servidor Resenha" /D "%~dp0" cmd /k node server.js

timeout /t 2 /nobreak >nul

echo.
echo Iniciando tunel HTTPS do Cloudflare...
echo Aguarde o link terminado em .trycloudflare.com aparecer no quadro abaixo
echo e mande esse link pros seus amigos!
echo.
cloudflared tunnel --url http://127.0.0.1:3000
pause
