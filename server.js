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
const MAX_AUDIO_DATA_URL_LENGTH = 3 * 1024 * 1024; // ~2.2 MB para mensagem de voz
const MAX_SOUNDBOARD_DATA_URL_LENGTH = 900 * 1024; // ~650 KB para clipe de soundboard

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  maxHttpBufferSize: 10 * 1024 * 1024,
  pingTimeout: 20000,
  pingInterval: 10000,
});

// Armazenamento em memória das salas ativas
const rooms = new Map();
let cachedMeteredIce = { expiresAt: 0, servers: null };

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
  const palette = ['#5865F2', '#23A55A', '#E67E22', '#EB459E', '#ED4245', '#00A8FC', '#9B59B6', '#1ABC9C'];
  return palette[Math.floor(Math.random() * palette.length)];
}

function hashPassword(password, salt = crypto.randomBytes(16).toString('hex')) {
  const hash = crypto.scryptSync(String(password), salt, 32).toString('hex');
  return { salt, hash };
}

function verifyPassword(password, passObj) {
  if (!passObj || !passObj.salt || !passObj.hash) return true;
  if (typeof password !== 'string' || !password) return false;
  const candidate = crypto.scryptSync(password, passObj.salt, 32);
  const expected = Buffer.from(passObj.hash, 'hex');
  if (candidate.length !== expected.length) return false;
  return crypto.timingSafeEqual(candidate, expected);
}

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
      }
    } catch (err) {
      console.warn('[ICE] Falha ao buscar TURN do Metered:', err.message);
    }
  }

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
      hostId: null,
      locked: false,
      passwordData: null,
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

function serializeRoomMeta(room) {
  return {
    hostId: room.hostId,
    locked: Boolean(room.locked),
    hasPassword: Boolean(room.passwordData),
  };
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
    cameraOn: Boolean(u.cameraOn),
    screenSharing: u.screenSharing,
    voiceStreamId: u.voiceStreamId,
    cameraStreamId: u.cameraStreamId || null,
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

app.get('/api/room-info/:code', (req, res) => {
  const code = sanitizeRoomCode(req.params.code || '');
  const room = rooms.get(code);
  if (!room || room.users.size === 0) {
    return res.json({ exists: false, hasPassword: false, locked: false, count: 0 });
  }
  res.json({
    exists: true,
    hasPassword: Boolean(room.passwordData),
    locked: Boolean(room.locked),
    count: room.users.size,
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

app.get('/sala/:code', (_req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

io.on('connection', (socket) => {
  let currentRoomCode = null;
  let lastSoundboardAt = 0;
  let lastPingScreenAt = 0;

  // Medidor de latência (ping em ms)
  socket.on('ping-check', (callback) => {
    if (typeof callback === 'function') callback({ ok: true, serverTime: Date.now() });
  });

  socket.on('join-room', (payload = {}, callback) => {
    const reply = typeof callback === 'function' ? callback : () => {};
    const roomCode = sanitizeRoomCode(payload.roomCode);
    const name = sanitizeName(payload.name);
    const rawPassword = typeof payload.password === 'string' ? payload.password.trim().slice(0, 64) : '';

    if (!roomCode || roomCode.length < 2) {
      return reply({ ok: false, error: 'Código da sala inválido (use pelo menos 2 caracteres).' });
    }
    if (!name) {
      return reply({ ok: false, error: 'Escolha um apelido para entrar.' });
    }

    const existingRoom = rooms.get(roomCode);
    if (existingRoom && existingRoom.users.size > 0) {
      if (existingRoom.locked) {
        return reply({ ok: false, code: 'ROOM_LOCKED', error: 'Esta sala está trancada pelo anfitrião.' });
      }
      if (existingRoom.passwordData && !verifyPassword(rawPassword, existingRoom.passwordData)) {
        return reply({
          ok: false,
          code: 'PASSWORD_REQUIRED',
          error: rawPassword ? 'Senha incorreta para esta sala.' : 'Esta sala é protegida por senha.',
        });
      }
    }

    if (currentRoomCode) {
      leaveCurrentRoom();
    }

    const room = getOrCreateRoom(roomCode);
    const isFirstActiveUser = room.users.size === 0;

    // Se a sala acabou de ser criada (ou estava vazia), configura host e senha opcional
    if (isFirstActiveUser) {
      room.hostId = socket.id;
      room.locked = false;
      room.passwordData = rawPassword ? hashPassword(rawPassword) : null;
    } else if (!room.hostId || !room.users.has(room.hostId)) {
      room.hostId = socket.id;
    }

    const user = {
      id: socket.id,
      name,
      color: sanitizeColor(payload.color),
      inVoice: false,
      muted: false,
      deafened: false,
      listenOnly: false,
      cameraOn: false,
      screenSharing: false,
      voiceStreamId: null,
      cameraStreamId: null,
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
      roomMeta: serializeRoomMeta(room),
      systemMessage: sysMsg,
    });

    reply({
      ok: true,
      roomCode,
      roomMeta: serializeRoomMeta(room),
      self: serializeUser(user),
      users: Array.from(room.users.values()).map(serializeUser),
      messages: room.messages,
    });
  });

  // ==================== MODERAÇÃO E SEGURANÇA DA SALA ====================

  socket.on('room-set-lock', (payload = {}, callback) => {
    const reply = typeof callback === 'function' ? callback : () => {};
    const room = currentRoomCode ? rooms.get(currentRoomCode) : null;
    if (!room || room.hostId !== socket.id) {
      return reply({ ok: false, error: 'Apenas o anfitrião pode trancar/destrancar a sala.' });
    }
    room.locked = Boolean(payload.locked);
    const sysMsg = {
      id: crypto.randomUUID(),
      type: 'system',
      text: room.locked ? '🔒 Sala trancada pelo anfitrião.' : '🔓 Sala destrancada pelo anfitrião.',
      timestamp: Date.now(),
    };
    addRoomMessage(room, sysMsg);
    io.to(currentRoomCode).emit('room-meta-updated', {
      roomMeta: serializeRoomMeta(room),
      systemMessage: sysMsg,
    });
    reply({ ok: true, roomMeta: serializeRoomMeta(room) });
  });

  socket.on('room-set-password', (payload = {}, callback) => {
    const reply = typeof callback === 'function' ? callback : () => {};
    const room = currentRoomCode ? rooms.get(currentRoomCode) : null;
    if (!room || room.hostId !== socket.id) {
      return reply({ ok: false, error: 'Apenas o anfitrião pode alterar a senha da sala.' });
    }
    const newPass = typeof payload.password === 'string' ? payload.password.trim().slice(0, 64) : '';
    room.passwordData = newPass ? hashPassword(newPass) : null;

    const sysMsg = {
      id: crypto.randomUUID(),
      type: 'system',
      text: room.passwordData
        ? '🔑 O anfitrião definiu uma senha para a sala.'
        : '🔓 O anfitrião removeu a senha da sala.',
      timestamp: Date.now(),
    };
    addRoomMessage(room, sysMsg);
    io.to(currentRoomCode).emit('room-meta-updated', {
      roomMeta: serializeRoomMeta(room),
      systemMessage: sysMsg,
    });
    reply({ ok: true, roomMeta: serializeRoomMeta(room) });
  });

  socket.on('kick-user', (payload = {}, callback) => {
    const reply = typeof callback === 'function' ? callback : () => {};
    const room = currentRoomCode ? rooms.get(currentRoomCode) : null;
    if (!room || room.hostId !== socket.id) {
      return reply({ ok: false, error: 'Apenas o anfitrião pode remover participantes.' });
    }
    const targetId = typeof payload.targetId === 'string' ? payload.targetId : '';
    if (!targetId || targetId === socket.id || !room.users.has(targetId)) {
      return reply({ ok: false, error: 'Participante não encontrado.' });
    }

    const targetSocket = io.sockets.sockets.get(targetId);
    const targetUser = room.users.get(targetId);
    const targetName = targetUser ? targetUser.name : 'Participante';

    io.to(targetId).emit('kicked-from-room', {
      reason: 'Você foi removido da sala pelo anfitrião.',
    });

    if (targetSocket) {
      // Remove da sala desconectando e reconectando limpo no cliente
      targetSocket.disconnect(true);
    } else {
      room.users.delete(targetId);
    }

    reply({ ok: true, name: targetName });
  });

  // ==================== CHAT TURBINADO ====================

  socket.on('chat-message', (payload = {}, callback) => {
    const reply = typeof callback === 'function' ? callback : () => {};
    if (!currentRoomCode) return reply({ ok: false, error: 'Você não está em uma sala.' });

    const room = rooms.get(currentRoomCode);
    if (!room) return reply({ ok: false, error: 'Sala não encontrada.' });
    const user = room.users.get(socket.id);
    if (!user) return reply({ ok: false, error: 'Usuário não encontrado na sala.' });

    const text = typeof payload.text === 'string' ? payload.text.trim().slice(0, 2000) : '';
    let image = null;
    let audio = null;

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

    if (typeof payload.audio === 'string' && payload.audio.length > 0) {
      const validAudioPrefix = /^data:audio\/(webm|ogg|mp4|mpeg|wav)[^,]*;base64,/i;
      if (!validAudioPrefix.test(payload.audio)) {
        return reply({ ok: false, error: 'Formato de mensagem de voz não suportado.' });
      }
      if (payload.audio.length > MAX_AUDIO_DATA_URL_LENGTH) {
        return reply({ ok: false, error: 'Áudio muito longo (máximo ~2 MB).' });
      }
      audio = payload.audio;
    }

    if (!text && !image && !audio) {
      return reply({ ok: false, error: 'Mensagem vazia.' });
    }

    let replyTo = null;
    if (typeof payload.replyToId === 'string' && payload.replyToId) {
      const orig = room.messages.find((m) => m.id === payload.replyToId && m.type === 'chat');
      if (orig) {
        let preview = orig.text || '';
        if (!preview && orig.image) preview = '📷 Imagem';
        if (!preview && orig.audio) preview = '🎤 Mensagem de voz';
        replyTo = {
          id: orig.id,
          senderName: orig.senderName,
          senderColor: orig.senderColor,
          preview: preview.slice(0, 90),
        };
      }
    }

    const msg = {
      id: crypto.randomUUID(),
      type: 'chat',
      senderId: user.id,
      senderName: user.name,
      senderColor: user.color,
      text,
      image,
      audio,
      replyTo,
      reactions: {},
      editedAt: null,
      timestamp: Date.now(),
    };

    addRoomMessage(room, msg);
    io.to(currentRoomCode).emit('chat-message', msg);
    reply({ ok: true, id: msg.id });
  });

  socket.on('chat-react', (payload = {}) => {
    if (!currentRoomCode) return;
    const room = rooms.get(currentRoomCode);
    const user = room?.users.get(socket.id);
    if (!room || !user) return;

    const { messageId, emoji } = payload;
    if (typeof messageId !== 'string' || typeof emoji !== 'string') return;
    const cleanEmoji = emoji.trim().slice(0, 8);
    if (!cleanEmoji) return;

    const msg = room.messages.find((m) => m.id === messageId && m.type === 'chat');
    if (!msg) return;

    if (!msg.reactions) msg.reactions = {};
    const existingList = msg.reactions[cleanEmoji] || [];
    const idx = existingList.findIndex((entry) => entry.id === socket.id);

    if (idx >= 0) {
      existingList.splice(idx, 1);
      if (existingList.length === 0) {
        delete msg.reactions[cleanEmoji];
      }
    } else {
      if (Object.keys(msg.reactions).length >= 12 && !msg.reactions[cleanEmoji]) return;
      existingList.push({ id: socket.id, name: user.name });
      msg.reactions[cleanEmoji] = existingList;
    }

    io.to(currentRoomCode).emit('chat-message-updated', msg);
  });

  socket.on('chat-edit', (payload = {}, callback) => {
    const reply = typeof callback === 'function' ? callback : () => {};
    if (!currentRoomCode) return reply({ ok: false });
    const room = rooms.get(currentRoomCode);
    if (!room) return reply({ ok: false });

    const { messageId, text } = payload;
    const newText = typeof text === 'string' ? text.trim().slice(0, 2000) : '';
    if (!newText) return reply({ ok: false, error: 'O texto não pode ficar vazio.' });

    const msg = room.messages.find((m) => m.id === messageId && m.type === 'chat');
    if (!msg || msg.senderId !== socket.id) {
      return reply({ ok: false, error: 'Você só pode editar suas próprias mensagens.' });
    }

    msg.text = newText;
    msg.editedAt = Date.now();
    io.to(currentRoomCode).emit('chat-message-updated', msg);
    reply({ ok: true });
  });

  socket.on('chat-delete', (payload = {}, callback) => {
    const reply = typeof callback === 'function' ? callback : () => {};
    if (!currentRoomCode) return reply({ ok: false });
    const room = rooms.get(currentRoomCode);
    if (!room) return reply({ ok: false });

    const idx = room.messages.findIndex((m) => m.id === payload.messageId && m.type === 'chat');
    if (idx < 0) return reply({ ok: false });

    const msg = room.messages[idx];
    const isAllowed = msg.senderId === socket.id || room.hostId === socket.id;
    if (!isAllowed) {
      return reply({ ok: false, error: 'Sem permissão para apagar esta mensagem.' });
    }

    room.messages.splice(idx, 1);
    io.to(currentRoomCode).emit('chat-message-deleted', { messageId: msg.id });
    reply({ ok: true });
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

  // ==================== VOZ, WEBCAM, TELA E SOUNDBOARD ====================

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
    user.cameraOn = false;
    user.screenSharing = false;
    user.voiceStreamId = typeof payload.voiceStreamId === 'string' ? payload.voiceStreamId : null;
    user.cameraStreamId = null;
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
    user.cameraOn = false;
    user.screenSharing = false;
    user.voiceStreamId = null;
    user.cameraStreamId = null;
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
    if (typeof payload.cameraOn === 'boolean') user.cameraOn = payload.cameraOn;
    if (typeof payload.screenSharing === 'boolean') user.screenSharing = payload.screenSharing;
    if (payload.voiceStreamId === null || typeof payload.voiceStreamId === 'string') {
      user.voiceStreamId = payload.voiceStreamId;
    }
    if (payload.cameraStreamId === null || typeof payload.cameraStreamId === 'string') {
      user.cameraStreamId = payload.cameraStreamId;
    }
    if (payload.screenStreamId === null || typeof payload.screenStreamId === 'string') {
      user.screenStreamId = payload.screenStreamId;
    }

    io.to(currentRoomCode).emit('user-updated', serializeUser(user));
  });

  // Soundboard compartilhado no canal de voz
  socket.on('soundboard-play', (payload = {}, callback) => {
    const reply = typeof callback === 'function' ? callback : () => {};
    if (!currentRoomCode) return reply({ ok: false });
    const room = rooms.get(currentRoomCode);
    const user = room?.users.get(socket.id);
    if (!user || !user.inVoice) {
      return reply({ ok: false, error: 'Entre no canal de voz para tocar sons na call.' });
    }

    const now = Date.now();
    if (now - lastSoundboardAt < 700) {
      return reply({ ok: false, error: 'Aguarde um instante entre os efeitos!' });
    }
    lastSoundboardAt = now;

    const soundId = typeof payload.soundId === 'string' ? payload.soundId.slice(0, 32) : '';
    const soundName = typeof payload.soundName === 'string' ? payload.soundName.slice(0, 40) : 'Som';
    let customAudio = null;

    if (typeof payload.customAudio === 'string' && payload.customAudio.length > 0) {
      const validPrefix = /^data:audio\/(mpeg|mp3|wav|ogg|webm|mp4)[^,]*;base64,/i;
      if (!validPrefix.test(payload.customAudio)) {
        return reply({ ok: false, error: 'Formato de áudio inválido.' });
      }
      if (payload.customAudio.length > MAX_SOUNDBOARD_DATA_URL_LENGTH) {
        return reply({ ok: false, error: 'Áudio customizado muito grande (máximo ~650 KB).' });
      }
      customAudio = payload.customAudio;
    }

    if (!soundId && !customAudio) return reply({ ok: false });

    io.to(currentRoomCode).emit('soundboard-play', {
      fromId: user.id,
      fromName: user.name,
      fromColor: user.color,
      soundId,
      soundName,
      customAudio,
    });
    reply({ ok: true });
  });

  // Apontador / Ping na tela transmitida
  socket.on('screen-ping', (payload = {}) => {
    if (!currentRoomCode) return;
    const now = Date.now();
    if (now - lastPingScreenAt < 220) return;
    lastPingScreenAt = now;

    const room = rooms.get(currentRoomCode);
    const user = room?.users.get(socket.id);
    if (!user) return;

    const x = Number(payload.x);
    const y = Number(payload.y);
    const targetOwnerId = typeof payload.targetOwnerId === 'string' ? payload.targetOwnerId : '';
    if (!Number.isFinite(x) || !Number.isFinite(y) || x < 0 || x > 1 || y < 0 || y > 1 || !targetOwnerId) {
      return;
    }

    io.to(currentRoomCode).emit('screen-ping', {
      fromId: user.id,
      fromName: user.name,
      fromColor: user.color,
      targetOwnerId,
      x,
      y,
    });
  });

  // Sinalização WebRTC P2P
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

  // ==================== PONTE DE MÍDIA PELO SERVIDOR (FALLBACK AUTÔNOMO) ====================
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

  socket.on('relay-cam-frame', (payload) => {
    if (!currentRoomCode || !payload || !payload.frame) return;
    const room = rooms.get(currentRoomCode);
    const user = room?.users.get(socket.id);
    if (!user || !user.inVoice || !user.cameraOn) return;

    socket.to(currentRoomCode).volatile.emit('relay-cam-frame', {
      from: socket.id,
      frame: payload.frame,
      width: payload.width,
      height: payload.height,
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

    // Se o anfitrião saiu e ainda há pessoas, transfere a coroa para o membro mais antigo
    if (room.hostId === socket.id) {
      const remaining = Array.from(room.users.values()).sort((a, b) => a.joinedAt - b.joinedAt);
      room.hostId = remaining.length > 0 ? remaining[0].id : null;
    }

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
      roomMeta: serializeRoomMeta(room),
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
  console.log(`\n  Resenha 2.0 rodando em http://localhost:${PORT}`);
  console.log(`  Pressione Ctrl+C para encerrar.\n`);
};

if (HOST) {
  server.listen(PORT, HOST, onListening);
} else {
  server.listen(PORT, onListening);
}
