# Resenha 2.0 — Voz, Tela 4K, Webcam, Soundboard e Chat

Um web app completo e leve (estilo Discord) para você e seus amigos conversarem por **voz**, ligarem **webcam**, **transmitirem tela em até 4K (com áudio)**, tocarem efeitos na **Mesa de Sons** e trocarem **mensagens, áudios e prints** direto pelo navegador — sem precisar de cadastro nem instalar nada.

## Recursos

### 🎙️ Voz Híbrida (100% Autônoma, sem bloqueio de CGNAT)
- **Conexão P2P + Ponte Automática pelo Servidor**: tenta WebRTC P2P direto primeiro; se a operadora bloquear (CGNAT), ativa automaticamente a **Ponte pelo Servidor** em ~3 segundos sem precisar de servidor TURN externo.
- **Push-to-Talk** (segurar tecla configurável, ex: `V` ou `Espaço`) ou **Detecção Automática (Voz livre)**.
- **Indicador de fala** (anel verde no avatar), **medidor do microfone**, **Ping (`ms`) ao vivo** e **volume individual** por amigo.
- **Modo "Só ouvir"** (para quem está sem microfone) e troca de microfone/câmera ao vivo sem cair da chamada.

### 🖥️ Transmissão de Tela até 4K + Apontador ao Vivo
- Qualidades disponíveis: `720p 30fps`, `1080p 30fps`, `1080p 60fps`, `1440p (2K) 30fps`, **`4K 30fps`** e **`4K 60fps`** (troca ao vivo durante a transmissão).
- Compartilhamento de **áudio do sistema/jogo** com controle de volume próprio.
- **🎯 Apontador na tela**: clique em qualquer ponto da tela transmitida para destacar aquele local com um pulso colorido + seu nome para todos na sala.
- Suporte a múltiplas telas simultâneas (abas), **Picture-in-Picture** e **Tela cheia**.

### 📷 Webcam & 🔊 Soundboard (Mesa de Sons)
- **Faixa de Webcams**: ligue sua câmera junto com a voz (funciona em P2P e na Ponte do Servidor).
- **Mesa de Sons**: 8 efeitos sintetizados prontos (`Buzina`, `Ba-dum-tss`, `Grilos`, `Suspense`, `Moeda 8-bit`, `Alerta`, `Vitória`, `Fail`) + upload dos **seus próprios áudios MP3/WAV** (salvos no navegador) que tocam para todos na call.

### 💬 Chat Turbinado
- **Responder (Reply)** clicável (rola até a mensagem original), **Editar** e **Apagar** mensagens.
- **Reações rápidas com emoji** (`😂 🔥 ❤️ 👍 💀`).
- **Gravação de mensagens de voz** direto no chat (`🎤`) com player integrado.
- Envio de imagens e **`Ctrl + V`** para colar prints direto na caixa de mensagem.

### 🔒 Segurança, Moderação e Personalização
- **Anfitrião da Sala (`👑`)**: o criador recebe a coroa automaticamente (transferida ao membro mais antigo se sair).
- **Senha opcional** (com hash `scrypt`), botão de **Trancar/Destrancar sala (`🔒`)** e opção de **remover intrusos (`✕`)**.
- **4 Temas visuais**: `Meia-Noite`, `OLED Preto Puro`, `Cyber Roxo Neon` e `Esmeralda Escuro`.

---

## Atalhos Úteis

| Atalho | Ação |
| --- | --- |
| `Alt + M` | Silenciar / ativar microfone |
| `Alt + D` | Ensurdecer / ativar todo o áudio |
| `Tecla Push-to-Talk` (padrão `V`) | Segurar para falar quando o modo Push-to-Talk estiver ativo |
| `Ctrl + V` no chat | Colar print/imagem da área de transferência |
| `Enter` / `Shift + Enter` | Enviar mensagem / quebrar linha |
| `Clique na tela transmitida` | Apontar um local na tela para todos os amigos |

---

## Como Rodar no seu PC

### Windows (1 clique)
- Apenas local: dê dois cliques em **`iniciar.bat`** (abre `http://localhost:3000`).
- Local + link público temporário HTTPS (Cloudflare Tunnel): dê dois cliques em **`iniciar-com-tunel.bat`**.

### Terminal
```bash
npm install
npm start
```

---

## Como Publicar / Atualizar Online (Render)

O projeto já inclui `render.yaml` e rota `/api/health`:

1. Faça commit das alterações e envie para o GitHub:
   ```powershell
   git add -A
   git commit -m "Atualizacao"
   git push
   ```
2. O **Render** detecta o `git push` automaticamente e atualiza o site em ~1–2 minutos.

### Como voltar para a versão 1.0 (caso queira reverter)
A versão inicial ficou salva na tag `v1-estavel`:
```powershell
git reset --hard v1-estavel
git push --force
```
