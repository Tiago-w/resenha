# Resenha — Voz, Transmissão de Tela e Chat

Um web app leve (estilo Discord) feito para você e seus amigos conversarem por **voz**, **transmitirem tela (com áudio)** e trocarem **mensagens e prints** direto pelo navegador — sem precisar de cadastro nem instalar nada.

## Recursos

- **Salas rápidas por link/código**: crie uma sala e mande o link (`/sala/codigo`) pros amigos.
- **Chamada de voz (WebRTC)**:
  - Indicador visual (anel verde) quando alguém está falando.
  - Controle de **volume individual** para cada amigo.
  - Botões de **Silenciar (`Alt + M`)**, **Ensurdecer (`Alt + D`)** e **Entrar só ouvindo (sem microfone)**.
  - Troca de microfone ao vivo sem derrubar a chamada.
- **Transmissão de tela com áudio**:
  - Escolha qualidade (720p 30fps, 1080p 30fps ou 1080p 60fps).
  - Suporte a várias telas transmitidas ao mesmo tempo (com abas para alternar).
  - Controle de volume do áudio da transmissão, **Picture-in-Picture** e **Tela cheia**.
- **Chat de texto em tempo real**:
  - Mensagens com links clicáveis, emojis rápidos, aviso de "está digitando..." e histórico recente da sessão.
  - Envio de imagens e **Ctrl + V** para colar prints direto no chat.

---

## 1. Como testar agora no seu PC

### Jeito mais fácil (Windows)
Dê dois cliques no arquivo **`iniciar.bat`**. Ele inicia o servidor e abre `http://localhost:3000` automaticamente.

*(Dica: abra duas abas do navegador na mesma sala para testar o chat, a voz e a transmissão de tela sozinho!)*

### Pelo terminal
```bash
npm install
npm start
```
Depois abra: `http://localhost:3000`

---

## 2. Como chamar seus amigos AGORA (rodando no seu PC, grátis e com HTTPS)

> **Importante:** Navegadores só liberam **microfone** e **transmissão de tela** em `localhost` ou em links **HTTPS**.

Você pode gerar um link HTTPS público gratuito apontando pro seu PC em segundos usando o **Cloudflare Quick Tunnel** (não precisa criar conta):

1. Deixe o Resenha rodando (`iniciar.bat` ou `npm start`).
2. Instale o `cloudflared` (uma vez só, no PowerShell):
   ```powershell
   winget install --id Cloudflare.cloudflared
   ```
3. Em outro terminal, rode:
   ```powershell
   cloudflared tunnel --url http://127.0.0.1:3000
   ```
   *(Ou simplesmente dê dois cliques em **`iniciar-com-tunel.bat`** para abrir o servidor e o túnel juntos!)*
4. O Cloudflare vai gerar um link `https://xxxx.trycloudflare.com`. Mande esse link pros seus amigos e pronto!

---

## 3. Como deixar sempre online na internet (Grátis / Barato)

O projeto já vem pronto com `render.yaml` e suporte à variável `PORT`:

- **Render.com** (plano grátis com HTTPS automático):
  1. Suba esta pasta para um repositório no GitHub.
  2. No Render, clique em **New + → Web Service** (ou Blueprint usando o `render.yaml`).
  3. Build Command: `npm install` | Start Command: `npm start`.
  4. Em ~1 minuto você terá um link fixo `https://seu-app.onrender.com`.
- **Railway / Fly.io / VPS**: basta subir o projeto e rodar `npm start`.

---

## 4. (Opcional) Se algum amigo tiver rede muito restrita (TURN)

A maioria das conexões funciona direto via STUN (já configurado). Se algum amigo estiver em 4G/rede corporativa que bloqueia P2P direto, você pode adicionar um servidor TURN gratuito (ex: Metered.ca Open Relay) configurando estas variáveis de ambiente:

```env
TURN_URL=turn:seu-servidor:3478
TURN_USERNAME=seu_usuario
TURN_CREDENTIAL=sua_senha
```
