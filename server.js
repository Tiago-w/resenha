const express = require('express');
const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { Server } = require('socket.io');

const PORT = Number(process.env.PORT) || 3000;
const HOST = process.env.HOST || undefined;
const MAX_MESSAGES_PER_ROOM = 150;
const ROOM_EMPTY_TTL_MS = 5 * 60 * 1000; // Mantém histórico por 5 min se todos saírem
const MAX_IMAGE_DATA_URL_LENGTH = 4 * 1024 * 1024; // ~3 MB em base64

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  maxHttpBufferSize: 10 * 1024 * 1024,
  pingTimeout: 20000,
  pingInterval: 10000,
});

// Armazenamento em memória das salas ativas
const rooms = new Map();

function sanitizeRoomCode(raw) {
  if (typeof raw !== 'string') return '';
  return raw
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9-_]/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 32);
}

function sanitizeName(raw) {
  if (typeof raw !== 'string') return '';
  return raw.trim().replace(/\s+/g, ' ').slice(0, 28);
}

function sanitizeColor(raw) {
  if (typeof raw === 'string' && /^#[0-9a-fA-F]{6}$/.test(raw)) {
    return raw;
  }
  const palette = ['#5865F2', '#57F287', '#FEE75C', '#EB459E', '#ED4245', '#00B0F4', '#F47FFF', '#FF9F43'];
  return palette[Math.floor(Math.random() * palette.length)];
}

let cachedMeteredIce = { expiresAt: 0, servers: null };

function readTurnConfigFile() {
  const filePath = path.join(__dirname, 'turn.json');
  if (!fs.existsSync(filePath)) return null;
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch (err) {
    console.warn('[ICE] Erro ao ler turn.json:', err.message);
    return null;
  }
}

async function buildIceServers() {
  const fileCfg = readTurnConfigFile() || {};

  // 1. JSON explícito via variável de ambiente ou turn.json
  if (process.env.ICE_SERVERS_JSON) {
    try {
      const parsed = JSON.parse(process.env.ICE_SERVERS_JSON);
      if (Array.isArray(parsed) && parsed.length > 0) return parsed;
    } catch (err) {
      console.warn('[ICE] ICE_SERVERS_JSON inválido:', err.message);
    }
  }
  if (Array.isArray(fileCfg.iceServers) && fileCfg.iceServers.length > 0) {
    return fileCfg.iceServers;
  }

  const baseStun = [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' },
    { urls: 'stun:stun2.l.google.com:19302' },
    { urls: 'stun:stun.cloudflare.com:3478' },
  ];

  // 2. Metered.ca API URL (20 GB/mês grátis) via METERED_API_URL ou turn.json
  const meteredUrl = process.env.METERED_API_URL || fileCfg.meteredApiUrl;
  if (meteredUrl && typeof meteredUrl === 'string') {
    if (cachedMeteredIce.servers && Date.now() < cachedMeteredIce.expiresAt) {
      return [...baseStun, ...cachedMeteredIce.servers];
    }
    try {
      const res = await fetch(meteredUrl);
      if (res.ok) {
        const list = await res.json();
        if (Array.isArray(list) && list.length > 0) {
          cachedMeteredIce = { servers: list, expiresAt: Date.now() + 5 * 60 * 1000 };
          return [...baseStun, ...list];
        }
      } else {
        console.warn('[ICE] Metered API respondeu HTTP', res.status);
      }
    } catch (err) {
      console.warn('[ICE] Falha ao buscar TURN do Metered:', err.message);
    }
  }

  // 3. TURN manual (ExpressTURN, CoTURN, Twilio, etc.) via env ou turn.json
  const turnUrl = process.env.TURN_URL || fileCfg.turnUrl;
  if (turnUrl) {
    const turnEntry = { urls: turnUrl };
    const u = process.env.TURN_USERNAME || fileCfg.turnUsername;
    const c = process.env.TURN_CREDENTIAL || fileCfg.turnCredential;
    if (u) turnEntry.username = u;
    if (c) turnEntry.credential = c;
    return [...baseStun, turnEntry];
  }

  return baseStun;
}

function getOrCreateRoom(roomCode) {
  let room = rooms.get(roomCode);
  if (!room) {
    room = {
      code: roomCode,
      users: new Map(),
      messages: [],
      cleanupTimer: null,
      createdAt: Date.now(),
    };
    rooms.set(roomCode, room);
  } else if (room.cleanupTimer) {
    clearTimeout(room.cleanupTimer);
    room.cleanupTimer = null;
  }
  return room;
}

function addRoomMessage(room, msg) {
  room.messages.push(msg);
  if (room.messages.length > MAX_MESSAGES_PER_ROOM) {
    room.messages.splice(0, room.messages.length - MAX_MESSAGES_PER_ROOM);
  }
}

function serializeUser(u) {
  return {
    id: u.id,
    name: u.name,
    color: u.color,
    inVoice: u.inVoice,
    muted: u.muted,
    deafened: u.deafened,
    listenOnly: u.listenOnly,
    screenSharing: u.screenSharing,
    voiceStreamId: u.voiceStreamId,
    screenStreamId: u.screenStreamId,
    joinedAt: u.joinedAt,
  };
}

// Middlewares e rotas
app.use(express.static(path.join(__dirname, 'public')));

app.get('/api/health', (_req, res) => {
  res.json({
    ok: true,
    rooms: rooms.size,
    uptime: Math.floor(process.uptime()),
  });
});

app.get('/api/ice-config', async (_req, res) => {
  const iceServers = await buildIceServers();
  const hasTurn = iceServers.some((s) => {
    const urls = Array.isArray(s.urls) ? s.urls : [s.urls];
    return urls.some((u) => typeof u === 'string' && /^turns?:/i.test(u));
  });
  res.json({ iceServers, hasTurn });
});

// Links diretos de sala: /sala/meu-codigo
app.get('/sala/:code', (_req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

io.on('connection', (socket) => {
  let currentRoomCode = null;

  socket.on('join-room', (payload = {}, callback) => {
    const reply = typeof callback === 'function' ? callback : () => {};
    const roomCode = sanitizeRoomCode(payload.roomCode);
    const name = sanitizeName(payload.name);

    if (!roomCode || roomCode.length < 2) {
      return reply({ ok: false, error: 'Código da sala inválido (use pelo menos 2 caracteres).' });
    }
    if (!name) {
      return reply({ ok: false, error: 'Escolha um apelido para entrar.' });
    }

    // Se já estava em outra sala, sai primeiro
    if (currentRoomCode) {
      leaveCurrentRoom();
    }

    const room = getOrCreateRoom(roomCode);
    const user = {
      id: socket.id,
      name,
      color: sanitizeColor(payload.color),
      inVoice: false,
      muted: false,
      deafened: false,
      listenOnly: false,
      screenSharing: false,
      voiceStreamId: null,
      screenStreamId: null,
      joinedAt: Date.now(),
    };

    room.users.set(socket.id, user);
    currentRoomCode = roomCode;
    socket.join(roomCode);

    const sysMsg = {
      id: crypto.randomUUID(),
      type: 'system',
      text: `${user.name} entrou na sala.`,
      timestamp: Date.now(),
    };
    addRoomMessage(room, sysMsg);

    socket.to(roomCode).emit('user-joined', {
      user: serializeUser(user),
      systemMessage: sysMsg,
    });

    reply({
      ok: true,
      roomCode,
      self: serializeUser(user),
      users: Array.from(room.users.values()).map(serializeUser),
      messages: room.messages,
    });
  });

  socket.on('chat-message', (payload = {}, callback) => {
    const reply = typeof callback === 'function' ? callback : () => {};
    if (!currentRoomCode) return reply({ ok: false, error: 'Você não está em uma sala.' });

    const room = rooms.get(currentRoomCode);
    if (!room) return reply({ ok: false, error: 'Sala não encontrada.' });
    const user = room.users.get(socket.id);
    if (!user) return reply({ ok: false, error: 'Usuário não encontrado na sala.' });

    const text = typeof payload.text === 'string' ? payload.text.trim().slice(0, 2000) : '';
    let image = null;

    if (typeof payload.image === 'string' && payload.image.length > 0) {
      const validImagePrefix = /^data:image\/(png|jpeg|jpg|gif|webp);base64,/;
      if (!validImagePrefix.test(payload.image)) {
        return reply({ ok: false, error: 'Formato de imagem não suportado.' });
      }
      if (payload.image.length > MAX_IMAGE_DATA_URL_LENGTH) {
        return reply({ ok: false, error: 'Imagem muito grande (máximo ~3 MB).' });
      }
      image = payload.image;
    }

    if (!text && !image) {
      return reply({ ok: false, error: 'Mensagem vazia.' });
    }

    const msg = {
      id: crypto.randomUUID(),
      type: 'chat',
      senderId: user.id,
      senderName: user.name,
      senderColor: user.color,
      text,
      image,
      timestamp: Date.now(),
    };

    addRoomMessage(room, msg);
    io.to(currentRoomCode).emit('chat-message', msg);
    reply({ ok: true, id: msg.id });
  });

  socket.on('typing', (payload = {}) => {
    if (!currentRoomCode) return;
    const room = rooms.get(currentRoomCode);
    const user = room?.users.get(socket.id);
    if (!user) return;

    socket.to(currentRoomCode).emit('user-typing', {
      userId: user.id,
      name: user.name,
      isTyping: Boolean(payload.isTyping),
    });
  });

  socket.on('voice-join', (payload = {}, callback) => {
    const reply = typeof callback === 'function' ? callback : () => {};
    if (!currentRoomCode) return reply({ ok: false, error: 'Você não está em uma sala.' });

    const room = rooms.get(currentRoomCode);
    const user = room?.users.get(socket.id);
    if (!user) return reply({ ok: false, error: 'Usuário não encontrado.' });

    user.inVoice = true;
    user.muted = Boolean(payload.muted);
    user.deafened = Boolean(payload.deafened);
    user.listenOnly = Boolean(payload.listenOnly);
    user.voiceStreamId = typeof payload.voiceStreamId === 'string' ? payload.voiceStreamId : null;
    user.screenSharing = false;
    user.screenStreamId = null;

    const voicePeers = Array.from(room.users.values())
      .filter((u) => u.inVoice && u.id !== socket.id)
      .map(serializeUser);

    const serialized = serializeUser(user);
    socket.to(currentRoomCode).emit('voice-user-joined', serialized);
    io.to(currentRoomCode).emit('user-updated', serialized);

    reply({ ok: true, self: serialized, voicePeers });
  });

  socket.on('voice-leave', () => {
    if (!currentRoomCode) return;
    const room = rooms.get(currentRoomCode);
    const user = room?.users.get(socket.id);
    if (!user || !user.inVoice) return;

    user.inVoice = false;
    user.muted = false;
    user.deafened = false;
    user.listenOnly = false;
    user.screenSharing = false;
    user.voiceStreamId = null;
    user.screenStreamId = null;

    const serialized = serializeUser(user);
    socket.to(currentRoomCode).emit('voice-user-left', { userId: socket.id });
    io.to(currentRoomCode).emit('user-updated', serialized);
  });

  socket.on('media-state', (payload = {}) => {
    if (!currentRoomCode) return;
    const room = rooms.get(currentRoomCode);
    const user = room?.users.get(socket.id);
    if (!user) return;

    if (typeof payload.muted === 'boolean') user.muted = payload.muted;
    if (typeof payload.deafened === 'boolean') user.deafened = payload.deafened;
    if (typeof payload.listenOnly === 'boolean') user.listenOnly = payload.listenOnly;
    if (typeof payload.screenSharing === 'boolean') user.screenSharing = payload.screenSharing;
    if (payload.voiceStreamId === null || typeof payload.voiceStreamId === 'string') {
      user.voiceStreamId = payload.voiceStreamId;
    }
    if (payload.screenStreamId === null || typeof payload.screenStreamId === 'string') {
      user.screenStreamId = payload.screenStreamId;
    }

    io.to(currentRoomCode).emit('user-updated', serializeUser(user));
  });

  socket.on('webrtc-signal', (payload = {}) => {
    if (!currentRoomCode) return;
    const { to, description, candidate } = payload;
    if (typeof to !== 'string') return;

    const room = rooms.get(currentRoomCode);
    if (!room || !room.users.has(socket.id) || !room.users.has(to)) return;

    if (description && description.type) {
      const fromUser = room.users.get(socket.id)?.name || socket.id;
      const toUser = room.users.get(to)?.name || to;
      console.log(`[WebRTC] ${fromUser} -> ${toUser}: ${description.type}`);
    }

    io.to(to).emit('webrtc-signal', {
      from: socket.id,
      description: description || null,
      candidate: candidate || null,
    });
  });

  // ==================== PONTE DE MÍDIA PELO SERVIDOR (FALLBACK AUTÔNOMO SEM TURN) ====================
  socket.on('relay-voice', (chunk) => {
    if (!currentRoomCode || !chunk) return;
    const room = rooms.get(currentRoomCode);
    const user = room?.users.get(socket.id);
    if (!user || !user.inVoice) return;

    socket.to(currentRoomCode).volatile.emit('relay-voice', {
      from: socket.id,
      chunk,
    });
  });

  socket.on('relay-screen-frame', (payload) => {
    if (!currentRoomCode || !payload || !payload.frame) return;
    const room = rooms.get(currentRoomCode);
    const user = room?.users.get(socket.id);
    if (!user || !user.inVoice || !user.screenSharing) return;

    socket.to(currentRoomCode).volatile.emit('relay-screen-frame', {
      from: socket.id,
      frame: payload.frame,
      width: payload.width,
      height: payload.height,
      hasAudio: Boolean(payload.hasAudio),
    });
  });

  socket.on('relay-screen-audio', (chunk) => {
    if (!currentRoomCode || !chunk) return;
    const room = rooms.get(currentRoomCode);
    const user = room?.users.get(socket.id);
    if (!user || !user.inVoice || !user.screenSharing) return;

    socket.to(currentRoomCode).volatile.emit('relay-screen-audio', {
      from: socket.id,
      chunk,
    });
  });

  function leaveCurrentRoom() {
    if (!currentRoomCode) return;
    const roomCode = currentRoomCode;
    currentRoomCode = null;

    const room = rooms.get(roomCode);
    if (!room) return;

    const user = room.users.get(socket.id);
    if (!user) return;

    const wasInVoice = user.inVoice;
    room.users.delete(socket.id);
    socket.leave(roomCode);

    if (wasInVoice) {
      socket.to(roomCode).emit('voice-user-left', { userId: socket.id });
    }

    const sysMsg = {
      id: crypto.randomUUID(),
      type: 'system',
      text: `${user.name} saiu da sala.`,
      timestamp: Date.now(),
    };
    addRoomMessage(room, sysMsg);

    socket.to(roomCode).emit('user-left', {
      userId: socket.id,
      systemMessage: sysMsg,
    });

    if (room.users.size === 0) {
      room.cleanupTimer = setTimeout(() => {
        const latest = rooms.get(roomCode);
        if (latest && latest.users.size === 0) {
          rooms.delete(roomCode);
        }
      }, ROOM_EMPTY_TTL_MS);
    }
  }

  socket.on('disconnect', () => {
    leaveCurrentRoom();
  });
});

const onListening = () => {
  console.log(`\n  Resenha rodando em http://localhost:${PORT}`);
  console.log(`  Pressione Ctrl+C para encerrar.\n`);
};

if (HOST) {
  server.listen(PORT, HOST, onListening);
} else {
  server.listen(PORT, onListening);
}
