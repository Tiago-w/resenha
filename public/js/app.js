// Controlador Principal do Resenha 2.0
(function () {
  const AVATAR_COLORS = [
    '#5865F2',
    '#23A55A',
    '#E67E22',
    '#EB459E',
    '#ED4245',
    '#00A8FC',
    '#9B59B6',
    '#1ABC9C',
  ];

  const QUICK_EMOJIS = [
    '😂', '🔥', '👏', '❤️', '💀', '👀', '🎮', '🎧',
    '🚀', '😎', '🤝', '😭', '🤯', '🎉', '👍', '☕',
  ];

  const QUICK_REACTIONS = ['😂', '🔥', '❤️', '👍', '💀'];
  const THEMES = ['midnight', 'oled', 'cyber', 'emerald'];
  const THEME_LABELS = {
    midnight: 'Meia-Noite',
    oled: 'OLED Preto',
    cyber: 'Cyber Roxo',
    emerald: 'Esmeralda',
  };

  const ROOM_WORDS_A = ['resenha', 'squad', 'noite', 'cafe', 'combo', 'galera', 'festa', 'turbo', 'pixel', 'ponto'];
  const ROOM_WORDS_B = ['vip', 'gamer', 'top', 'azul', 'raiz', 'livre', 'pro', 'br', 'gold', 'max'];

  const state = {
    roomCode: null,
    roomPasswordMemory: '',
    roomMeta: { hostId: null, locked: false, hasPassword: false },
    self: null,
    users: new Map(),
    messagesById: new Map(),
    speakingIds: new Set(),
    typingUsers: new Map(),
    lastMessageMeta: null,
    pendingImageDataUrl: null,
    replyingToId: null,
    editingMessageId: null,
    selectedColor: localStorage.getItem('resenha_color') || AVATAR_COLORS[0],
    activeScreenOwnerId: null,
    stageHiddenByUser: false,
    streamVolume: 0.8,
    soundsEnabled: localStorage.getItem('resenha_sounds') !== 'false',
    soundboardVol: Number(localStorage.getItem('resenha_sb_vol') || 70) / 100,
    customSounds: loadCustomSounds(),
    theme: localStorage.getItem('resenha_theme') || 'midnight',
    voiceMode: localStorage.getItem('resenha_voice_mode') || 'auto',
    pttKeyCode: localStorage.getItem('resenha_ptt_key') || 'KeyV',
    pttKeyLabel: localStorage.getItem('resenha_ptt_label') || 'V',
    bindingPttKey: false,
  };

  function loadCustomSounds() {
    try {
      const raw = localStorage.getItem('resenha_custom_sounds');
      const arr = raw ? JSON.parse(raw) : [];
      return Array.isArray(arr) ? arr.slice(0, 8) : [];
    } catch {
      return [];
    }
  }

  function saveCustomSounds() {
    try {
      localStorage.setItem('resenha_custom_sounds', JSON.stringify(state.customSounds));
    } catch {
      showToast('Armazenamento local cheio! Remova algum som antigo.', 'error');
    }
  }

  const els = {
    lobbyView: document.getElementById('lobby-view'),
    roomView: document.getElementById('room-view'),
    joinForm: document.getElementById('join-form'),
    nicknameInput: document.getElementById('nickname-input'),
    roomInput: document.getElementById('room-input'),
    roomPasswordInput: document.getElementById('room-password-input'),
    roomPasswordLabel: document.getElementById('room-password-label'),
    generateRoomBtn: document.getElementById('generate-room-btn'),
    colorPicker: document.getElementById('color-picker'),
    inviteBanner: document.getElementById('invite-banner'),
    inviteRoomLabel: document.getElementById('invite-room-label'),
    lobbyError: document.getElementById('lobby-error'),
    joinBtn: document.getElementById('join-btn'),

    sidebar: document.getElementById('sidebar'),
    sidebarBackdrop: document.getElementById('sidebar-backdrop'),
    mobileMenuBtn: document.getElementById('mobile-menu-btn'),
    roomTitle: document.getElementById('room-title'),
    roomLockIndicator: document.getElementById('room-lock-indicator'),
    roomPassIndicator: document.getElementById('room-pass-indicator'),
    lockRoomBtn: document.getElementById('lock-room-btn'),
    onlineCount: document.getElementById('online-count'),
    voiceCountBadge: document.getElementById('voice-count-badge'),
    membersCountBadge: document.getElementById('members-count-badge'),
    voiceJoinBox: document.getElementById('voice-join-box'),
    joinVoiceBtn: document.getElementById('join-voice-btn'),
    joinListenBtn: document.getElementById('join-listen-btn'),
    voiceMembersList: document.getElementById('voice-members-list'),
    allMembersList: document.getElementById('all-members-list'),
    voiceDock: document.getElementById('voice-dock'),
    voiceStatusTitle: document.getElementById('voice-status-title'),
    voiceStatusSub: document.getElementById('voice-status-sub'),
    pingBadge: document.getElementById('ping-badge'),
    micMeterFill: document.getElementById('mic-meter-fill'),
    leaveVoiceBtn: document.getElementById('leave-voice-btn'),
    muteBtn: document.getElementById('mute-btn'),
    muteBtnLabel: document.getElementById('mute-btn-label'),
    deafenBtn: document.getElementById('deafen-btn'),
    camBtn: document.getElementById('cam-btn'),
    camBtnLabel: document.getElementById('cam-btn-label'),
    screenBtn: document.getElementById('screen-btn'),
    screenBtnLabel: document.getElementById('screen-btn-label'),
    soundboardBtn: document.getElementById('soundboard-btn'),
    settingsBtn: document.getElementById('settings-btn'),
    selfAvatar: document.getElementById('self-avatar'),
    selfName: document.getElementById('self-name'),
    selfRoleSub: document.getElementById('self-role-sub'),
    leaveRoomBtn: document.getElementById('leave-room-btn'),
    copyInviteSidebarBtn: document.getElementById('copy-invite-sidebar-btn'),
    copyInviteTopBtn: document.getElementById('copy-invite-top-btn'),
    themeQuickBtn: document.getElementById('theme-quick-btn'),
    soundToggleBtn: document.getElementById('sound-toggle-btn'),
    audioUnlockBanner: document.getElementById('audio-unlock-banner'),
    unlockAudioBtn: document.getElementById('unlock-audio-btn'),

    cameraStrip: document.getElementById('camera-strip'),
    workspace: document.getElementById('workspace'),
    screenStage: document.getElementById('screen-stage'),
    screenTabs: document.getElementById('screen-tabs'),
    stageVideoWrap: document.getElementById('stage-video-wrap'),
    stageVideo: document.getElementById('stage-video'),
    stageCanvas: document.getElementById('stage-canvas'),
    screenPingsLayer: document.getElementById('screen-pings-layer'),
    stageStreamerName: document.getElementById('stage-streamer-name'),
    streamAudioControl: document.getElementById('stream-audio-control'),
    streamVolumeSlider: document.getElementById('stream-volume-slider'),
    pipBtn: document.getElementById('pip-btn'),
    fullscreenBtn: document.getElementById('fullscreen-btn'),
    hideStageBtn: document.getElementById('hide-stage-btn'),
    showStagePill: document.getElementById('show-stage-pill'),
    showStageText: document.getElementById('show-stage-text'),

    messagesList: document.getElementById('messages-list'),
    typingIndicator: document.getElementById('typing-indicator'),
    composerContextBar: document.getElementById('composer-context-bar'),
    composerContextText: document.getElementById('composer-context-text'),
    cancelContextBtn: document.getElementById('cancel-context-btn'),
    voiceRecBar: document.getElementById('voice-rec-bar'),
    voiceRecTimer: document.getElementById('voice-rec-timer'),
    cancelRecBtn: document.getElementById('cancel-rec-btn'),
    sendRecBtn: document.getElementById('send-rec-btn'),
    imagePreviewBar: document.getElementById('image-preview-bar'),
    imagePreviewThumb: document.getElementById('image-preview-thumb'),
    imagePreviewName: document.getElementById('image-preview-name'),
    removeImageBtn: document.getElementById('remove-image-btn'),
    emojiBar: document.getElementById('emoji-bar'),
    chatForm: document.getElementById('chat-form'),
    chatInput: document.getElementById('chat-input'),
    attachBtn: document.getElementById('attach-btn'),
    recordVoiceMsgBtn: document.getElementById('record-voice-msg-btn'),
    imageFileInput: document.getElementById('image-file-input'),
    emojiBtn: document.getElementById('emoji-btn'),

    soundboardModal: document.getElementById('soundboard-modal'),
    closeSoundboardBtn: document.getElementById('close-soundboard-btn'),
    soundboardVolSlider: document.getElementById('soundboard-vol-slider'),
    soundboardVolLabel: document.getElementById('soundboard-vol-label'),
    soundboardGrid: document.getElementById('soundboard-grid'),
    addCustomSoundBtn: document.getElementById('add-custom-sound-btn'),
    customSoundInput: document.getElementById('custom-sound-input'),

    settingsModal: document.getElementById('settings-modal'),
    closeSettingsBtn: document.getElementById('close-settings-btn'),
    doneSettingsBtn: document.getElementById('done-settings-btn'),
    themeSelect: document.getElementById('theme-select'),
    voiceModeSelect: document.getElementById('voice-mode-select'),
    pttKeyBox: document.getElementById('ptt-key-box'),
    pttBindBtn: document.getElementById('ptt-bind-btn'),
    micSelect: document.getElementById('mic-select'),
    camSelect: document.getElementById('cam-select'),
    qualitySelect: document.getElementById('quality-select'),
    hostSecuritySection: document.getElementById('host-security-section'),
    hostPasswordInput: document.getElementById('host-password-input'),
    saveRoomPasswordBtn: document.getElementById('save-room-password-btn'),

    lightboxModal: document.getElementById('lightbox-modal'),
    lightboxImg: document.getElementById('lightbox-img'),
    closeLightboxBtn: document.getElementById('close-lightbox-btn'),

    toastContainer: document.getElementById('toast-container'),
  };

  window.ResenhaSounds.enabled = state.soundsEnabled;
  window.ResenhaSounds.soundboardVolume = state.soundboardVol;
  applyTheme(state.theme);

  const socket = io({ autoConnect: true });

  // ==================== DESENHO DE FRAMES RELAY (TELA E WEBCAMS) ====================

  let relayCanvasBusy = false;
  let lastStageResLabel = '';
  const stageCanvasCtx = els.stageCanvas.getContext('2d', { alpha: false });
  const camCanvasBusy = new Set();

  function updateStageBadgeWithResolution(w, h) {
    if (!w || !h) return;
    const resTag = `${w}×${h}`;
    if (resTag === lastStageResLabel) return;
    lastStageResLabel = resTag;
    const activeOwner = state.users.get(state.activeScreenOwnerId);
    const base =
      state.activeScreenOwnerId === state.self?.id
        ? 'Você está transmitindo sua tela'
        : `Tela de ${activeOwner ? activeOwner.name : 'Amigo'}`;
    els.stageStreamerName.textContent = `${base} • ${resTag}`;
  }

  els.stageVideo.addEventListener('loadedmetadata', () => {
    updateStageBadgeWithResolution(els.stageVideo.videoWidth, els.stageVideo.videoHeight);
  });
  els.stageVideo.addEventListener('resize', () => {
    updateStageBadgeWithResolution(els.stageVideo.videoWidth, els.stageVideo.videoHeight);
  });

  async function drawBlobToCanvas(canvas, ctx, frameBuffer, width, height, onDimensions) {
    const blob = new Blob([frameBuffer], { type: 'image/webp' });
    if (typeof createImageBitmap === 'function') {
      const bitmap = await createImageBitmap(blob);
      if (canvas.width !== bitmap.width || canvas.height !== bitmap.height) {
        canvas.width = bitmap.width;
        canvas.height = bitmap.height;
      }
      ctx.drawImage(bitmap, 0, 0);
      if (onDimensions) onDimensions(bitmap.width, bitmap.height);
      bitmap.close();
    } else {
      const url = URL.createObjectURL(blob);
      await new Promise((resolve) => {
        const img = new Image();
        img.onload = () => {
          const w = width || img.width;
          const h = height || img.height;
          if (canvas.width !== w || canvas.height !== h) {
            canvas.width = w;
            canvas.height = h;
          }
          ctx.drawImage(img, 0, 0);
          if (onDimensions) onDimensions(w, h);
          URL.revokeObjectURL(url);
          resolve();
        };
        img.onerror = () => {
          URL.revokeObjectURL(url);
          resolve();
        };
        img.src = url;
      });
    }
  }

  async function drawRelayScreenFrame(ownerId, frameBuffer, width, height) {
    if (ownerId !== state.activeScreenOwnerId || state.stageHiddenByUser || relayCanvasBusy) return;
    relayCanvasBusy = true;
    try {
      await drawBlobToCanvas(els.stageCanvas, stageCanvasCtx, frameBuffer, width, height, updateStageBadgeWithResolution);
    } catch {}
    relayCanvasBusy = false;
  }

  async function drawRelayCamFrame(ownerId, frameBuffer, width, height) {
    if (camCanvasBusy.has(ownerId)) return;
    const canvas = els.cameraStrip.querySelector(`canvas[data-cam-owner="${CSS.escape(ownerId)}"]`);
    if (!canvas) return;
    camCanvasBusy.add(ownerId);
    try {
      const ctx = canvas.getContext('2d', { alpha: false });
      await drawBlobToCanvas(canvas, ctx, frameBuffer, width, height);
    } catch {}
    camCanvasBusy.delete(ownerId);
  }

  const voice = new window.VoiceManager({
    socket,
    getUserMeta: (id) => state.users.get(id),
    onScreenStreamsChanged: () => renderScreenStage(),
    onRelayScreenFrame: (ownerId, frame, w, h) => drawRelayScreenFrame(ownerId, frame, w, h),
    onCamerasChanged: () => renderCameraStrip(),
    onRelayCamFrame: (ownerId, frame, w, h) => drawRelayCamFrame(ownerId, frame, w, h),
    onSpeakingChange: (userId, isSpeaking) => {
      if (isSpeaking) state.speakingIds.add(userId);
      else state.speakingIds.delete(userId);
      updateSpeakingIndicators(userId, isSpeaking);
    },
    onLocalMicLevel: (pct) => {
      if (els.micMeterFill) els.micMeterFill.style.width = `${pct}%`;
    },
    onPeerStateChange: () => renderMembers(),
    onAutoplayBlocked: (blocked) => {
      els.audioUnlockBanner.classList.toggle('hidden', !blocked);
    },
    onLatencyUpdate: (ms) => {
      els.pingBadge.textContent = `${ms} ms`;
      els.pingBadge.classList.remove('good', 'warn', 'bad');
      if (ms < 90) els.pingBadge.classList.add('good');
      else if (ms < 200) els.pingBadge.classList.add('warn');
      else els.pingBadge.classList.add('bad');
    },
    onStateChange: () => updateVoiceDockUI(),
    onToast: (msg, type) => showToast(msg, type),
  });

  // Configura PTT e Qualidade salvos
  voice.setPttMode(state.voiceMode === 'ptt');
  const savedQuality = localStorage.getItem('resenha_screen_quality');
  if (savedQuality) voice.setScreenQuality(savedQuality);

  els.unlockAudioBtn.addEventListener('click', () => {
    voice.unlockAudio();
    if (els.stageVideo.srcObject && state.activeScreenOwnerId !== state.self?.id) {
      els.stageVideo.muted = voice.deafened;
      els.stageVideo.volume = state.streamVolume;
      els.stageVideo.play().catch(() => {});
    }
    showToast('Áudio liberado!', 'success');
  });

  // ==================== HELPERS ====================

  function isHost() {
    return Boolean(state.self && state.roomMeta.hostId === state.self.id);
  }

  function applyTheme(theme) {
    const valid = THEMES.includes(theme) ? theme : 'midnight';
    state.theme = valid;
    document.documentElement.setAttribute('data-theme', valid);
    localStorage.setItem('resenha_theme', valid);
    if (els.themeSelect) els.themeSelect.value = valid;
  }

  function getInitials(name) {
    const parts = (name || '?').trim().split(/\s+/);
    if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
    return (parts[0] || '?').slice(0, 2).toUpperCase();
  }

  function formatTime(ts) {
    return new Date(ts).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
  }

  function generateRoomCode() {
    const a = ROOM_WORDS_A[Math.floor(Math.random() * ROOM_WORDS_A.length)];
    const b = ROOM_WORDS_B[Math.floor(Math.random() * ROOM_WORDS_B.length)];
    const n = Math.floor(10 + Math.random() * 89);
    return `${a}-${b}-${n}`;
  }

  function extractRoomFromUrl() {
    const match = window.location.pathname.match(/^\/sala\/([^/]+)/i);
    if (match && match[1]) return decodeURIComponent(match[1]);
    const params = new URLSearchParams(window.location.search);
    return params.get('sala') || '';
  }

  function showToast(text, type = 'info') {
    const el = document.createElement('div');
    el.className = `toast ${type}`;
    el.textContent = text;
    els.toastContainer.appendChild(el);
    setTimeout(() => {
      el.style.opacity = '0';
      el.style.transition = 'opacity 0.25s ease';
      setTimeout(() => el.remove(), 260);
    }, 3200);
  }

  function appendFormattedText(container, text) {
    const urlRegex = /(https?:\/\/[^\s<]+)/g;
    let lastIndex = 0;
    let match;
    while ((match = urlRegex.exec(text)) !== null) {
      if (match.index > lastIndex) {
        container.appendChild(document.createTextNode(text.slice(lastIndex, match.index)));
      }
      const url = match[0];
      const a = document.createElement('a');
      a.href = url;
      a.target = '_blank';
      a.rel = 'noopener noreferrer';
      a.textContent = url;
      container.appendChild(a);
      lastIndex = match.index + url.length;
    }
    if (lastIndex < text.length) {
      container.appendChild(document.createTextNode(text.slice(lastIndex)));
    }
  }

  function copyInviteLink() {
    if (!state.roomCode) return;
    const url = `${window.location.origin}/sala/${encodeURIComponent(state.roomCode)}`;
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(url).then(
        () => showToast('Link de convite copiado! Mande pros amigos.', 'success'),
        () => fallbackCopy(url)
      );
    } else {
      fallbackCopy(url);
    }
  }

  function fallbackCopy(text) {
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.style.position = 'fixed';
    ta.style.opacity = '0';
    document.body.appendChild(ta);
    ta.select();
    try {
      document.execCommand('copy');
      showToast('Link de convite copiado!', 'success');
    } catch {
      showToast(`Link: ${text}`, 'info');
    }
    ta.remove();
  }

  // ==================== LOBBY INIT ====================

  async function checkRoomSecurityHint(code) {
    if (!code || code.length < 2) return;
    try {
      const res = await fetch(`/api/room-info/${encodeURIComponent(code)}`);
      if (!res.ok) return;
      const info = await res.json();
      if (info.exists && info.hasPassword) {
        els.roomPasswordLabel.textContent = '🔑 Esta sala exige senha';
        els.roomPasswordInput.placeholder = 'Digite a senha da sala';
      } else {
        els.roomPasswordLabel.textContent = 'Senha da sala (opcional)';
        els.roomPasswordInput.placeholder = 'Deixe vazio para sala aberta';
      }
    } catch {}
  }

  function initLobby() {
    const savedName = localStorage.getItem('resenha_name');
    if (savedName) els.nicknameInput.value = savedName;

    AVATAR_COLORS.forEach((hex) => {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'color-swatch' + (hex === state.selectedColor ? ' selected' : '');
      btn.style.background = hex;
      btn.setAttribute('aria-label', `Cor ${hex}`);
      btn.addEventListener('click', () => {
        state.selectedColor = hex;
        localStorage.setItem('resenha_color', hex);
        els.colorPicker.querySelectorAll('.color-swatch').forEach((s) => s.classList.remove('selected'));
        btn.classList.add('selected');
      });
      els.colorPicker.appendChild(btn);
    });

    QUICK_EMOJIS.forEach((em) => {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'emoji-item';
      btn.textContent = em;
      btn.addEventListener('click', () => {
        els.chatInput.value += em;
        els.chatInput.focus();
        autoResizeTextarea();
      });
      els.emojiBar.appendChild(btn);
    });

    const urlRoom = extractRoomFromUrl();
    if (urlRoom) {
      els.roomInput.value = urlRoom;
      els.inviteRoomLabel.textContent = urlRoom;
      els.inviteBanner.classList.remove('hidden');
      checkRoomSecurityHint(urlRoom);
      els.nicknameInput.focus();
    } else {
      els.roomInput.value = generateRoomCode();
      els.nicknameInput.focus();
    }

    els.roomInput.addEventListener('blur', () => {
      checkRoomSecurityHint(els.roomInput.value.trim());
    });

    updateSoundToggleIcon();
    updatePttBindLabel();
    els.voiceModeSelect.value = state.voiceMode;
    els.pttKeyBox.classList.toggle('hidden', state.voiceMode !== 'ptt');
    els.soundboardVolSlider.value = String(Math.round(state.soundboardVol * 100));
    els.soundboardVolLabel.textContent = `${Math.round(state.soundboardVol * 100)}%`;
  }

  els.generateRoomBtn.addEventListener('click', () => {
    els.roomInput.value = generateRoomCode();
    els.inviteBanner.classList.add('hidden');
    els.roomPasswordLabel.textContent = 'Senha da sala (opcional)';
  });

  els.joinForm.addEventListener('submit', (e) => {
    e.preventDefault();
    els.lobbyError.classList.add('hidden');

    const name = els.nicknameInput.value.trim();
    const roomCode = els.roomInput.value.trim();
    const password = els.roomPasswordInput.value.trim();
    if (!name || !roomCode) return;

    els.joinBtn.disabled = true;
    els.joinBtn.textContent = 'Entrando...';

    socket.emit('join-room', { name, roomCode, color: state.selectedColor, password }, (res) => {
      els.joinBtn.disabled = false;
      els.joinBtn.textContent = 'Entrar na Sala';

      if (!res || !res.ok) {
        els.lobbyError.textContent = res?.error || 'Erro ao entrar na sala.';
        els.lobbyError.classList.remove('hidden');
        if (res?.code === 'PASSWORD_REQUIRED') {
          els.roomPasswordLabel.textContent = '🔑 Esta sala exige senha';
          els.roomPasswordInput.focus();
        }
        return;
      }

      state.roomPasswordMemory = password;
      localStorage.setItem('resenha_name', name);
      enterRoomUI(res);
    });
  });

  function enterRoomUI(data) {
    state.roomCode = data.roomCode;
    state.roomMeta = data.roomMeta || { hostId: null, locked: false, hasPassword: false };
    state.self = data.self;
    state.users.clear();
    (data.users || []).forEach((u) => state.users.set(u.id, u));
    voice.setSelfId(data.self.id);
    voice.startLatencyMonitor();

    const targetPath = `/sala/${encodeURIComponent(data.roomCode)}`;
    if (window.location.pathname !== targetPath) {
      window.history.replaceState({}, '', targetPath);
    }

    els.roomTitle.textContent = data.roomCode;
    els.selfName.textContent = data.self.name;
    els.selfAvatar.textContent = getInitials(data.self.name);
    els.selfAvatar.style.background = data.self.color;

    els.lobbyView.classList.add('hidden');
    els.roomView.classList.remove('hidden');

    renderRoomMetaUI();
    renderMessagesFull(data.messages || []);
    renderMembers();
    updateVoiceDockUI();
    renderCameraStrip();
    renderScreenStage();

    window.ResenhaSounds.playJoin();
    els.chatInput.focus();
  }

  function leaveRoom() {
    cancelVoiceRecording();
    voice.stopLatencyMonitor();
    voice.leaveVoice({ notifyServer: true });
    socket.disconnect();
    socket.connect();

    state.roomCode = null;
    state.self = null;
    state.users.clear();
    state.messagesById.clear();
    state.speakingIds.clear();
    state.typingUsers.clear();
    state.activeScreenOwnerId = null;
    state.stageHiddenByUser = false;
    clearComposerContext();

    window.history.replaceState({}, '', '/');
    els.roomView.classList.add('hidden');
    els.lobbyView.classList.remove('hidden');
    closeMobileSidebar();
  }

  function renderRoomMetaUI() {
    els.roomLockIndicator.classList.toggle('hidden', !state.roomMeta.locked);
    els.roomPassIndicator.classList.toggle('hidden', !state.roomMeta.hasPassword);

    const amHost = isHost();
    els.lockRoomBtn.classList.toggle('hidden', !amHost);
    els.lockRoomBtn.classList.toggle('active', Boolean(state.roomMeta.locked));
    els.lockRoomBtn.title = state.roomMeta.locked
      ? 'Sala trancada (clique para destrancar)'
      : 'Trancar sala (impede novos acessos)';

    els.selfRoleSub.textContent = amHost ? '👑 Anfitrião' : 'Online';
    els.hostSecuritySection.classList.toggle('hidden', !amHost);
  }

  // ==================== SOCKET EVENTS ====================

  socket.on('user-joined', ({ user, roomMeta, systemMessage }) => {
    if (!user) return;
    state.users.set(user.id, user);
    if (roomMeta) state.roomMeta = roomMeta;
    renderRoomMetaUI();
    renderMembers();
    if (systemMessage) appendMessage(systemMessage);
    window.ResenhaSounds.playJoin();
  });

  socket.on('user-left', ({ userId, roomMeta, systemMessage }) => {
    state.users.delete(userId);
    state.speakingIds.delete(userId);
    clearTypingUser(userId);
    if (roomMeta) state.roomMeta = roomMeta;
    renderRoomMetaUI();
    renderMembers();
    if (systemMessage) appendMessage(systemMessage);
    window.ResenhaSounds.playLeave();
  });

  socket.on('room-meta-updated', ({ roomMeta, systemMessage }) => {
    if (roomMeta) state.roomMeta = roomMeta;
    renderRoomMetaUI();
    renderMembers();
    if (systemMessage) appendMessage(systemMessage);
  });

  socket.on('kicked-from-room', ({ reason }) => {
    leaveRoom();
    showToast(reason || 'Você foi removido da sala.', 'error');
  });

  socket.on('user-updated', (user) => {
    if (!user) return;
    const prev = state.users.get(user.id);
    state.users.set(user.id, user);
    if (state.self && user.id === state.self.id) {
      state.self = user;
    }

    if (prev && !prev.screenSharing && user.screenSharing && user.id !== state.self?.id) {
      showToast(`${user.name} começou a transmitir a tela!`, 'info');
      window.ResenhaSounds.playScreenStart();
      state.stageHiddenByUser = false;
    }

    renderMembers();
    renderCameraStrip();
    renderScreenStage();
  });

  socket.on('chat-message', (msg) => {
    appendMessage(msg);
    if (msg.senderId && msg.senderId !== state.self?.id) {
      clearTypingUser(msg.senderId);
      window.ResenhaSounds.playMessage();
    }
  });

  socket.on('chat-message-updated', (msg) => {
    if (!msg || !msg.id) return;
    state.messagesById.set(msg.id, msg);
    updateMessageDOM(msg);
  });

  socket.on('chat-message-deleted', ({ messageId }) => {
    if (!messageId) return;
    state.messagesById.delete(messageId);
    const el = els.messagesList.querySelector(`[data-msg-id="${CSS.escape(messageId)}"]`);
    if (el) el.remove();
  });

  socket.on('user-typing', ({ userId, name, isTyping }) => {
    if (!userId || userId === state.self?.id) return;
    if (isTyping) {
      const existing = state.typingUsers.get(userId);
      if (existing) clearTimeout(existing.timer);
      const timer = setTimeout(() => clearTypingUser(userId), 3500);
      state.typingUsers.set(userId, { name, timer });
    } else {
      clearTypingUser(userId);
    }
    renderTypingIndicator();
  });

  socket.on('soundboard-play', ({ fromName, soundId, soundName, customAudio }) => {
    if (!voice.inVoice) return;
    window.ResenhaSounds.playSoundboard(soundId, customAudio, voice.deafened);
    showToast(`🔊 ${fromName} tocou: ${soundName}`, 'info');
  });

  socket.on('screen-ping', (payload) => {
    renderIncomingScreenPing(payload);
  });

  socket.on('disconnect', (reason) => {
    if (state.roomCode && reason !== 'io client disconnect') {
      showToast('Conexão perdida. Tentando reconectar...', 'error');
    }
  });

  socket.on('connect', () => {
    if (state.roomCode && state.self && !els.roomView.classList.contains('hidden')) {
      const wasInVoice = voice.inVoice;
      const wasListenOnly = voice.listenOnly;
      if (wasInVoice) voice.leaveVoice({ notifyServer: false });

      socket.emit(
        'join-room',
        {
          name: state.self.name,
          roomCode: state.roomCode,
          color: state.self.color,
          password: state.roomPasswordMemory,
        },
        async (res) => {
          if (res && res.ok) {
            enterRoomUI(res);
            showToast('Reconectado à sala!', 'success');
            if (wasInVoice) {
              await handleJoinVoice(wasListenOnly);
            }
          }
        }
      );
    }
  });

  // ==================== MODERAÇÃO (LOCK, SENHA, KICK) ====================

  els.lockRoomBtn.addEventListener('click', () => {
    if (!isHost()) return;
    socket.emit('room-set-lock', { locked: !state.roomMeta.locked }, (res) => {
      if (res && !res.ok && res.error) showToast(res.error, 'error');
    });
  });

  els.saveRoomPasswordBtn.addEventListener('click', () => {
    if (!isHost()) return;
    const newPass = els.hostPasswordInput.value.trim();
    socket.emit('room-set-password', { password: newPass }, (res) => {
      if (res && res.ok) {
        state.roomPasswordMemory = newPass;
        els.hostPasswordInput.value = '';
        showToast(newPass ? 'Senha da sala atualizada!' : 'Senha da sala removida!', 'success');
      } else if (res?.error) {
        showToast(res.error, 'error');
      }
    });
  });

  function kickMember(user) {
    if (!isHost() || !user) return;
    if (!window.confirm(`Remover "${user.name}" da sala?`)) return;
    socket.emit('kick-user', { targetId: user.id }, (res) => {
      if (res && res.ok) showToast(`${user.name} foi removido da sala.`, 'info');
      else if (res?.error) showToast(res.error, 'error');
    });
  }

  // ==================== MEMBROS E VOZ UI ====================

  function renderMembers() {
    const allUsers = Array.from(state.users.values()).sort((a, b) => a.joinedAt - b.joinedAt);
    const voiceUsers = allUsers.filter((u) => u.inVoice);
    const amHost = isHost();

    els.onlineCount.textContent = `${allUsers.length} online`;
    els.voiceCountBadge.textContent = String(voiceUsers.length);
    els.membersCountBadge.textContent = String(allUsers.length);

    els.voiceMembersList.innerHTML = '';
    voiceUsers.forEach((u) => {
      const isSelf = state.self && u.id === state.self.id;
      const uIsHost = state.roomMeta.hostId === u.id;
      const li = document.createElement('li');
      li.className = 'member-item';

      const row = document.createElement('div');
      row.className = 'member-row';

      const avatar = document.createElement('div');
      avatar.className = 'avatar' + (state.speakingIds.has(u.id) ? ' speaking' : '');
      avatar.dataset.avatarUserId = u.id;
      avatar.style.background = u.color;
      avatar.textContent = getInitials(u.name);

      const nameWrap = document.createElement('div');
      nameWrap.className = 'member-name-wrap';
      const nameEl = document.createElement('div');
      nameEl.className = 'member-name';
      if (uIsHost) {
        const crown = document.createElement('span');
        crown.className = 'host-crown';
        crown.textContent = '👑';
        crown.title = 'Anfitrião da sala';
        nameEl.appendChild(crown);
      }
      nameEl.appendChild(document.createTextNode(u.name));
      if (isSelf) {
        const tag = document.createElement('span');
        tag.className = 'self-tag';
        tag.textContent = '(você)';
        nameEl.appendChild(tag);
      }
      nameWrap.appendChild(nameEl);

      const badges = document.createElement('div');
      badges.className = 'member-badges';

      if (u.cameraOn) {
        const camIcon = document.createElement('span');
        camIcon.className = 'status-icon';
        camIcon.title = 'Webcam ligada';
        camIcon.textContent = '📷';
        badges.appendChild(camIcon);
      }

      if (u.screenSharing) {
        const liveBtn = document.createElement('button');
        liveBtn.type = 'button';
        liveBtn.className = 'live-badge-btn';
        liveBtn.textContent = 'AO VIVO';
        liveBtn.title = 'Assistir transmissão de tela';
        liveBtn.addEventListener('click', () => {
          state.activeScreenOwnerId = u.id;
          state.stageHiddenByUser = false;
          renderScreenStage();
          closeMobileSidebar();
        });
        badges.appendChild(liveBtn);
      }

      if (u.deafened) {
        badges.appendChild(makeStatusIcon('deafened', 'Ensurdecido'));
      } else if (u.listenOnly) {
        badges.appendChild(makeStatusIcon('listen', 'Só ouvindo'));
      } else if (u.muted) {
        badges.appendChild(makeStatusIcon('muted', 'Microfone silenciado'));
      }

      row.appendChild(avatar);
      row.appendChild(nameWrap);
      row.appendChild(badges);
      li.appendChild(row);

      if (!isSelf && voice.inVoice) {
        const connState = voice.getPeerConnectionState(u.id);
        const connRow = document.createElement('div');
        connRow.className = 'peer-conn-row';

        const pill = document.createElement('span');
        const transport = voice.getPeerTransport(u.id);
        if (connState === 'connected') {
          pill.className = 'peer-conn-pill connected';
          pill.textContent = transport === 'relay' ? 'Áudio conectado (Ponte)' : 'Áudio conectado (P2P)';
        } else if (connState === 'failed' || connState === 'disconnected') {
          pill.className = 'peer-conn-pill failed';
          pill.textContent = 'Sem conexão de áudio';
        } else {
          pill.className = 'peer-conn-pill connecting';
          pill.textContent = 'Conectando áudio...';
        }
        connRow.appendChild(pill);

        if (connState !== 'connected') {
          const retryBtn = document.createElement('button');
          retryBtn.type = 'button';
          retryBtn.className = 'peer-retry-btn';
          retryBtn.textContent = 'Reconectar';
          retryBtn.addEventListener('click', () => {
            voice.reconnectPeer(u.id);
            showToast(`Reconectando voz com ${u.name}...`, 'info');
          });
          connRow.appendChild(retryBtn);
        }
        li.appendChild(connRow);

        const volRow = document.createElement('div');
        volRow.className = 'member-volume-row';
        const volPct = Math.round(voice.getPeerVolume(u.id) * 100);
        const label = document.createElement('span');
        label.textContent = `${volPct}%`;
        const slider = document.createElement('input');
        slider.type = 'range';
        slider.min = '0';
        slider.max = '100';
        slider.value = String(volPct);
        slider.title = `Volume de ${u.name}`;
        slider.addEventListener('input', () => {
          const val = Number(slider.value);
          label.textContent = `${val}%`;
          voice.setPeerVolume(u.id, val / 100);
        });
        volRow.appendChild(slider);
        volRow.appendChild(label);
        li.appendChild(volRow);
      }

      els.voiceMembersList.appendChild(li);
    });

    // Lista de todos os membros online
    els.allMembersList.innerHTML = '';
    allUsers.forEach((u) => {
      const isSelf = state.self && u.id === state.self.id;
      const uIsHost = state.roomMeta.hostId === u.id;
      const li = document.createElement('li');
      li.className = 'member-item';

      const row = document.createElement('div');
      row.className = 'member-row';

      const avatar = document.createElement('div');
      avatar.className = 'avatar sm';
      avatar.style.background = u.color;
      avatar.textContent = getInitials(u.name);

      const nameWrap = document.createElement('div');
      nameWrap.className = 'member-name-wrap';
      const nameEl = document.createElement('div');
      nameEl.className = 'member-name';
      if (uIsHost) {
        const crown = document.createElement('span');
        crown.className = 'host-crown';
        crown.textContent = '👑';
        nameEl.appendChild(crown);
      }
      nameEl.appendChild(document.createTextNode(u.name));
      if (isSelf) {
        const tag = document.createElement('span');
        tag.className = 'self-tag';
        tag.textContent = '(você)';
        nameEl.appendChild(tag);
      }
      nameWrap.appendChild(nameEl);

      row.appendChild(avatar);
      row.appendChild(nameWrap);

      if (amHost && !isSelf) {
        const kickBtn = document.createElement('button');
        kickBtn.type = 'button';
        kickBtn.className = 'kick-btn';
        kickBtn.textContent = '✕';
        kickBtn.title = `Remover ${u.name} da sala`;
        kickBtn.addEventListener('click', () => kickMember(u));
        row.appendChild(kickBtn);
      }

      li.appendChild(row);
      els.allMembersList.appendChild(li);
    });
  }

  function makeStatusIcon(kind, title) {
    const span = document.createElement('span');
    span.className = 'status-icon' + (kind === 'muted' || kind === 'deafened' ? ' muted' : '');
    span.title = title;
    if (kind === 'muted') {
      span.innerHTML =
        '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><line x1="2" x2="22" y1="2" y2="22"/><path d="M18.89 13.23A7.12 7.12 0 0 0 19 12v-2"/><path d="M5 10v2a7 7 0 0 0 12 5"/><path d="M15 9.34V5a3 3 0 0 0-5.68-1.33"/><path d="M9 9v3a3 3 0 0 0 5.12 2.12"/></svg>';
    } else if (kind === 'deafened') {
      span.innerHTML =
        '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><line x1="2" x2="22" y1="2" y2="22"/><path d="M3 14h3a2 2 0 0 1 2 2v3a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-7a9 9 0 0 1 12.68-8.23"/><path d="M21 12v7a2 2 0 0 1-2 2h-1a2 2 0 0 1-2-2v-3a2 2 0 0 1 2-2h3"/></svg>';
    } else {
      span.innerHTML =
        '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 14h3a2 2 0 0 1 2 2v3a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-7a9 9 0 0 1 18 0v7a2 2 0 0 1-2 2h-1a2 2 0 0 1-2-2v-3a2 2 0 0 1 2-2h3"/></svg>';
    }
    return span;
  }

  function updateSpeakingIndicators(userId, isSpeaking) {
    const avatars = els.voiceMembersList.querySelectorAll(`[data-avatar-user-id="${CSS.escape(userId)}"]`);
    avatars.forEach((el) => el.classList.toggle('speaking', isSpeaking));

    const camCards = els.cameraStrip.querySelectorAll(`[data-cam-card="${CSS.escape(userId)}"]`);
    camCards.forEach((el) => el.classList.toggle('speaking', isSpeaking));
  }

  function updateVoiceDockUI() {
    if (!voice.inVoice) {
      els.voiceJoinBox.classList.remove('hidden');
      els.voiceDock.classList.add('hidden');
      return;
    }

    els.voiceJoinBox.classList.add('hidden');
    els.voiceDock.classList.remove('hidden');

    if (voice.deafened) {
      els.voiceStatusTitle.textContent = 'Ensurdecido';
      els.voiceStatusSub.textContent = 'Microfone e som pausados';
    } else if (voice.listenOnly) {
      els.voiceStatusTitle.textContent = 'Só ouvindo';
      els.voiceStatusSub.textContent = 'Clique em Mic para falar';
    } else if (voice.pttEnabled) {
      els.voiceStatusTitle.textContent = 'Push-to-Talk';
      els.voiceStatusSub.textContent = voice.pttPressed
        ? '🟢 Transmitindo voz...'
        : `Segure [${state.pttKeyLabel}] p/ falar`;
    } else if (voice.muted) {
      els.voiceStatusTitle.textContent = 'Voz conectada';
      els.voiceStatusSub.textContent = 'Microfone silenciado';
    } else {
      els.voiceStatusTitle.textContent = 'Voz conectada';
      els.voiceStatusSub.textContent = voice.screenSharing ? 'Transmitindo tela' : 'Microfone ativo';
    }

    const micOff = voice.muted || voice.listenOnly;
    els.muteBtn.classList.toggle('danger-active', micOff);
    els.muteBtn.querySelector('.icon-on').classList.toggle('hidden', micOff);
    els.muteBtn.querySelector('.icon-off').classList.toggle('hidden', !micOff);
    els.muteBtnLabel.textContent = voice.listenOnly ? 'Ativar' : voice.muted ? 'Mudo' : 'Mic';

    els.deafenBtn.classList.toggle('danger-active', voice.deafened);
    els.deafenBtn.querySelector('.icon-on').classList.toggle('hidden', voice.deafened);
    els.deafenBtn.querySelector('.icon-off').classList.toggle('hidden', !voice.deafened);

    els.camBtn.classList.toggle('live-active', voice.cameraOn);
    els.camBtnLabel.textContent = voice.cameraOn ? 'Câm ON' : 'Câmera';

    els.screenBtn.classList.toggle('live-active', voice.screenSharing);
    els.screenBtnLabel.textContent = voice.screenSharing ? 'Parar' : 'Tela';
  }

  // ==================== FAIXA DE WEBCAMS ====================

  function renderCameraStrip() {
    const cams = voice.getActiveCameras();
    if (cams.length === 0) {
      els.cameraStrip.classList.add('hidden');
      els.cameraStrip.innerHTML = '';
      return;
    }

    els.cameraStrip.classList.remove('hidden');
    const wantedIds = new Set(cams.map((c) => c.ownerId));

    // Remove cartões de câmeras desligadas
    els.cameraStrip.querySelectorAll('[data-cam-card]').forEach((card) => {
      if (!wantedIds.has(card.dataset.camCard)) card.remove();
    });

    cams.forEach((c) => {
      const owner = state.users.get(c.ownerId);
      const name = c.isSelf ? 'Você' : owner ? owner.name : 'Amigo';
      let card = els.cameraStrip.querySelector(`[data-cam-card="${CSS.escape(c.ownerId)}"]`);
      const modeTag = c.isRelay ? 'relay' : 'webrtc';

      if (!card || card.dataset.mode !== modeTag) {
        if (card) card.remove();
        card = document.createElement('div');
        card.className = 'cam-card' + (c.isSelf ? ' self-cam' : '') + (state.speakingIds.has(c.ownerId) ? ' speaking' : '');
        card.dataset.camCard = c.ownerId;
        card.dataset.mode = modeTag;

        if (c.isRelay) {
          const canvas = document.createElement('canvas');
          canvas.dataset.camOwner = c.ownerId;
          card.appendChild(canvas);
        } else {
          const vid = document.createElement('video');
          vid.autoplay = true;
          vid.playsInline = true;
          vid.muted = true;
          vid.srcObject = c.stream;
          vid.play().catch(() => {});
          card.appendChild(vid);
        }

        const label = document.createElement('div');
        label.className = 'cam-label';
        label.textContent = name;
        card.appendChild(label);

        els.cameraStrip.appendChild(card);
      } else if (!c.isRelay) {
        const vid = card.querySelector('video');
        if (vid && vid.srcObject !== c.stream) {
          vid.srcObject = c.stream;
          vid.play().catch(() => {});
        }
      }
    });
  }

  // ==================== PALCO DE TELA + APONTADOR ====================

  function renderScreenStage() {
    const shares = voice.getActiveScreenShares();

    if (shares.length === 0) {
      state.activeScreenOwnerId = null;
      voice.setActiveScreenOwner(null);
      els.screenStage.classList.add('hidden');
      els.workspace.classList.remove('stage-open');
      els.showStagePill.classList.add('hidden');
      els.stageVideo.srcObject = null;
      els.stageVideo.classList.remove('hidden');
      els.stageCanvas.classList.add('hidden');
      return;
    }

    let active = shares.find((s) => s.ownerId === state.activeScreenOwnerId);
    if (!active) {
      active = shares[0];
      state.activeScreenOwnerId = active.ownerId;
    }
    voice.setActiveScreenOwner(active.ownerId);

    els.showStageText.textContent =
      shares.length === 1 ? '1 tela ao vivo' : `${shares.length} telas ao vivo`;
    els.showStagePill.classList.toggle('hidden', !state.stageHiddenByUser);

    if (state.stageHiddenByUser) {
      els.screenStage.classList.add('hidden');
      els.workspace.classList.remove('stage-open');
      return;
    }

    els.screenStage.classList.remove('hidden');
    els.workspace.classList.add('stage-open');

    els.screenTabs.innerHTML = '';
    shares.forEach((s) => {
      const owner = state.users.get(s.ownerId);
      const label = s.isSelf ? 'Sua tela' : `Tela de ${owner ? owner.name : 'Amigo'}`;
      const tab = document.createElement('button');
      tab.type = 'button';
      tab.className = 'screen-tab' + (s.ownerId === active.ownerId ? ' active' : '');
      tab.textContent = label;
      tab.addEventListener('click', () => {
        state.activeScreenOwnerId = s.ownerId;
        renderScreenStage();
      });
      els.screenTabs.appendChild(tab);
    });

    const activeOwner = state.users.get(active.ownerId);
    lastStageResLabel = '';
    els.stageStreamerName.textContent = active.isSelf
      ? 'Você está transmitindo sua tela'
      : `Tela de ${activeOwner ? activeOwner.name : 'Amigo'}`;

    const showAudioSlider = !active.isSelf && active.hasAudio;
    els.streamAudioControl.classList.toggle('hidden', !showAudioSlider);
    const shouldMute = active.isSelf || voice.deafened;

    if (active.isRelay) {
      els.stageVideo.srcObject = null;
      els.stageVideo.classList.add('hidden');
      els.stageCanvas.classList.remove('hidden');
      els.pipBtn.classList.add('hidden');
      voice.setStreamVolume(state.streamVolume);
    } else {
      els.stageCanvas.classList.add('hidden');
      els.stageVideo.classList.remove('hidden');
      els.pipBtn.classList.remove('hidden');
      els.stageVideo.muted = shouldMute;
      els.stageVideo.volume = state.streamVolume;

      if (els.stageVideo.srcObject !== active.stream) {
        els.stageVideo.srcObject = active.stream;
      }

      const playPromise = els.stageVideo.play();
      if (playPromise && typeof playPromise.catch === 'function') {
        playPromise.catch(() => {
          if (!shouldMute) {
            els.stageVideo.muted = true;
            els.stageVideo.play().catch(() => {});
            els.audioUnlockBanner.classList.remove('hidden');
          }
        });
      }
    }
  }

  // Calcula caixa exata da imagem dentro do container (object-fit: contain)
  function getStageContentBox() {
    const wrapRect = els.stageVideoWrap.getBoundingClientRect();
    const isCanvas = !els.stageCanvas.classList.contains('hidden');
    const mediaW = isCanvas ? els.stageCanvas.width : els.stageVideo.videoWidth;
    const mediaH = isCanvas ? els.stageCanvas.height : els.stageVideo.videoHeight;

    if (!mediaW || !mediaH || !wrapRect.width || !wrapRect.height) {
      return { left: 0, top: 0, width: wrapRect.width, height: wrapRect.height, wrapRect };
    }

    const wrapRatio = wrapRect.width / wrapRect.height;
    const mediaRatio = mediaW / mediaH;
    let width, height, left, top;

    if (mediaRatio > wrapRatio) {
      width = wrapRect.width;
      height = wrapRect.width / mediaRatio;
      left = 0;
      top = (wrapRect.height - height) / 2;
    } else {
      height = wrapRect.height;
      width = wrapRect.height * mediaRatio;
      top = 0;
      left = (wrapRect.width - width) / 2;
    }

    return { left, top, width, height, wrapRect };
  }

  els.stageVideoWrap.addEventListener('click', (e) => {
    if (!state.activeScreenOwnerId) return;
    const box = getStageContentBox();
    if (!box.width || !box.height) return;

    const relX = (e.clientX - box.wrapRect.left - box.left) / box.width;
    const relY = (e.clientY - box.wrapRect.top - box.top) / box.height;
    if (relX < 0 || relX > 1 || relY < 0 || relY > 1) return;

    socket.emit('screen-ping', {
      targetOwnerId: state.activeScreenOwnerId,
      x: Number(relX.toFixed(4)),
      y: Number(relY.toFixed(4)),
    });
  });

  function renderIncomingScreenPing({ fromName, fromColor, targetOwnerId, x, y }) {
    if (!state.activeScreenOwnerId || targetOwnerId !== state.activeScreenOwnerId || state.stageHiddenByUser) return;
    const box = getStageContentBox();
    if (!box.width || !box.height) return;

    window.ResenhaSounds.playPing();

    const marker = document.createElement('div');
    marker.className = 'screen-ping-marker';
    marker.style.left = `${box.left + x * box.width}px`;
    marker.style.top = `${box.top + y * box.height}px`;
    marker.style.setProperty('--ping-color', fromColor || '#5865F2');

    const ring = document.createElement('div');
    ring.className = 'screen-ping-ring';

    const label = document.createElement('div');
    label.className = 'screen-ping-label';
    label.textContent = fromName || 'Aqui!';

    marker.appendChild(ring);
    marker.appendChild(label);
    els.screenPingsLayer.appendChild(marker);

    setTimeout(() => marker.remove(), 1550);
  }

  // ==================== CONTROLES DE VOZ, WEBCAM & TELA ====================

  async function handleJoinVoice(listenOnly) {
    els.joinVoiceBtn.disabled = true;
    els.joinListenBtn.disabled = true;

    const res = await voice.joinVoice({ listenOnly });

    els.joinVoiceBtn.disabled = false;
    els.joinListenBtn.disabled = false;

    if (!res.ok) {
      showToast(res.error || 'Erro ao conectar voz.', 'error');
      return;
    }

    window.ResenhaSounds.playJoin();
    renderMembers();
    updateVoiceDockUI();
    showToast(listenOnly ? 'Você entrou na voz (só ouvindo).' : 'Conectado ao canal de voz!', 'success');
  }

  els.joinVoiceBtn.addEventListener('click', () => handleJoinVoice(false));
  els.joinListenBtn.addEventListener('click', () => handleJoinVoice(true));

  els.leaveVoiceBtn.addEventListener('click', () => {
    voice.leaveVoice({ notifyServer: true });
    window.ResenhaSounds.playLeave();
    renderMembers();
    showToast('Você saiu do canal de voz.', 'info');
  });

  els.muteBtn.addEventListener('click', async () => {
    if (voice.pttEnabled && !voice.listenOnly) {
      // Se estava em Push-to-Talk e clicou no Mic, volta para Voz Livre rapidamente
      state.voiceMode = 'auto';
      localStorage.setItem('resenha_voice_mode', 'auto');
      els.voiceModeSelect.value = 'auto';
      els.pttKeyBox.classList.add('hidden');
      voice.setPttMode(false);
      showToast('Modo Voz Livre ativado!', 'info');
      renderMembers();
      return;
    }
    const res = await voice.toggleMute();
    if (res && !res.ok && res.error) {
      showToast(res.error, 'error');
      return;
    }
    window.ResenhaSounds.playClick(!voice.muted);
    renderMembers();
  });

  els.deafenBtn.addEventListener('click', () => {
    voice.toggleDeafen();
    window.ResenhaSounds.playClick(!voice.deafened);
    renderMembers();
    renderScreenStage();
  });

  els.camBtn.addEventListener('click', async () => {
    const res = await voice.toggleCamera();
    if (!res.ok && res.error) {
      showToast(res.error, 'error');
      return;
    }
    window.ResenhaSounds.playClick(Boolean(res.cameraOn));
    renderCameraStrip();
    renderMembers();
  });

  els.screenBtn.addEventListener('click', async () => {
    if (voice.screenSharing) {
      voice.stopScreenShare();
      showToast('Transmissão de tela encerrada.', 'info');
      return;
    }
    const res = await voice.startScreenShare();
    if (!res.ok) {
      if (!res.cancelled && res.error) showToast(res.error, 'error');
      return;
    }
    state.activeScreenOwnerId = state.self.id;
    state.stageHiddenByUser = false;
    window.ResenhaSounds.playScreenStart();
    renderScreenStage();
    showToast('Transmissão de tela iniciada!', 'success');
  });

  els.streamVolumeSlider.addEventListener('input', () => {
    state.streamVolume = Number(els.streamVolumeSlider.value) / 100;
    els.stageVideo.volume = state.streamVolume;
    voice.setStreamVolume(state.streamVolume);
  });

  els.pipBtn.addEventListener('click', async () => {
    try {
      if (document.pictureInPictureElement) {
        await document.exitPictureInPicture();
      } else if (els.stageVideo.requestPictureInPicture) {
        await els.stageVideo.requestPictureInPicture();
      }
    } catch {
      showToast('Picture-in-Picture indisponível para esta transmissão.', 'info');
    }
  });

  els.fullscreenBtn.addEventListener('click', () => {
    if (!document.fullscreenElement) {
      els.stageVideoWrap.requestFullscreen?.();
    } else {
      document.exitFullscreen?.();
    }
  });

  els.hideStageBtn.addEventListener('click', () => {
    state.stageHiddenByUser = true;
    renderScreenStage();
  });

  els.showStagePill.addEventListener('click', () => {
    state.stageHiddenByUser = false;
    renderScreenStage();
  });

  // ==================== SOUNDBOARD ====================

  function renderSoundboardGrid() {
    els.soundboardGrid.innerHTML = '';

    window.ResenhaSounds.builtinList.forEach((item) => {
      const pad = document.createElement('button');
      pad.type = 'button';
      pad.className = 'sound-pad';
      pad.innerHTML = `<span class="sound-pad-emoji">${item.emoji}</span><span class="sound-pad-name">${escapeHtml(item.name)}</span>`;
      pad.addEventListener('click', () => triggerSoundboard({ soundId: item.id, soundName: item.name }));
      els.soundboardGrid.appendChild(pad);
    });

    state.customSounds.forEach((custom, idx) => {
      const pad = document.createElement('button');
      pad.type = 'button';
      pad.className = 'sound-pad';

      const em = document.createElement('span');
      em.className = 'sound-pad-emoji';
      em.textContent = '🎵';

      const nm = document.createElement('span');
      nm.className = 'sound-pad-name';
      nm.textContent = custom.name;

      const del = document.createElement('button');
      del.type = 'button';
      del.className = 'sound-pad-del';
      del.textContent = '✕';
      del.title = 'Remover áudio';
      del.addEventListener('click', (ev) => {
        ev.stopPropagation();
        state.customSounds.splice(idx, 1);
        saveCustomSounds();
        renderSoundboardGrid();
      });

      pad.appendChild(em);
      pad.appendChild(nm);
      pad.appendChild(del);
      pad.addEventListener('click', () =>
        triggerSoundboard({ soundId: 'custom', soundName: custom.name, customAudio: custom.dataUrl })
      );
      els.soundboardGrid.appendChild(pad);
    });
  }

  function triggerSoundboard(payload) {
    socket.emit('soundboard-play', payload, (res) => {
      if (res && !res.ok && res.error) showToast(res.error, 'error');
    });
  }

  els.soundboardBtn.addEventListener('click', () => {
    renderSoundboardGrid();
    els.soundboardModal.classList.remove('hidden');
  });
  els.closeSoundboardBtn.addEventListener('click', () => els.soundboardModal.classList.add('hidden'));
  els.soundboardModal.addEventListener('click', (e) => {
    if (e.target === els.soundboardModal) els.soundboardModal.classList.add('hidden');
  });

  els.soundboardVolSlider.addEventListener('input', () => {
    const val = Number(els.soundboardVolSlider.value);
    state.soundboardVol = val / 100;
    window.ResenhaSounds.soundboardVolume = state.soundboardVol;
    els.soundboardVolLabel.textContent = `${val}%`;
    localStorage.setItem('resenha_sb_vol', String(val));
  });

  els.addCustomSoundBtn.addEventListener('click', () => els.customSoundInput.click());
  els.customSoundInput.addEventListener('change', () => {
    const file = els.customSoundInput.files?.[0];
    els.customSoundInput.value = '';
    if (!file) return;
    if (file.size > 650 * 1024) {
      showToast('Escolha um áudio curto de até 650 KB!', 'error');
      return;
    }
    const cleanName = file.name.replace(/\.[^.]+$/, '').slice(0, 24) || 'Meu Áudio';
    const reader = new FileReader();
    reader.onload = () => {
      if (state.customSounds.length >= 8) {
        showToast('Limite de 8 áudios customizados atingido.', 'error');
        return;
      }
      state.customSounds.push({ name: cleanName, dataUrl: reader.result });
      saveCustomSounds();
      renderSoundboardGrid();
      showToast(`"${cleanName}" adicionado à Mesa de Sons!`, 'success');
    };
    reader.readAsDataURL(file);
  });

  // ==================== CHAT TURBINADO ====================

  function escapeHtml(str) {
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function renderMessagesFull(messages) {
    els.messagesList.innerHTML = '';
    state.messagesById.clear();
    state.lastMessageMeta = null;

    const welcome = document.createElement('div');
    welcome.className = 'welcome-card';
    welcome.innerHTML = `
      <h3>Bem-vindo à sala #${escapeHtml(state.roomCode)}</h3>
      <p>Converse, reaja às mensagens, mande áudios ou prints com <strong>Ctrl + V</strong>, ligue a webcam ou aponte clicando na tela transmitida!</p>
    `;
    els.messagesList.appendChild(welcome);

    messages.forEach((m) => appendMessage(m, { autoScroll: false }));
    scrollChatToBottom(true);
  }

  function appendMessage(msg, { autoScroll = true } = {}) {
    const isNearBottom =
      els.messagesList.scrollHeight - els.messagesList.scrollTop - els.messagesList.clientHeight < 150;

    if (msg.type === 'system') {
      const sys = document.createElement('div');
      sys.className = 'msg-system';
      sys.textContent = msg.text;
      els.messagesList.appendChild(sys);
      state.lastMessageMeta = null;
    } else {
      state.messagesById.set(msg.id, msg);
      const canGroup =
        !msg.replyTo &&
        state.lastMessageMeta &&
        state.lastMessageMeta.senderId === msg.senderId &&
        msg.timestamp - state.lastMessageMeta.timestamp < 5 * 60 * 1000;

      const row = buildChatMessageElement(msg, canGroup);
      els.messagesList.appendChild(row);

      state.lastMessageMeta = {
        senderId: msg.senderId,
        timestamp: msg.timestamp,
      };
    }

    if (autoScroll && (isNearBottom || msg.senderId === state.self?.id)) {
      scrollChatToBottom(false);
    }
  }

  function buildChatMessageElement(msg, grouped) {
    const row = document.createElement('div');
    row.className = 'msg-row' + (grouped ? ' grouped' : '');
    row.dataset.msgId = msg.id;
    row.dataset.grouped = grouped ? '1' : '0';
    populateChatMessageInner(row, msg, grouped);
    return row;
  }

  function updateMessageDOM(msg) {
    const row = els.messagesList.querySelector(`[data-msg-id="${CSS.escape(msg.id)}"]`);
    if (!row) return;
    const grouped = row.dataset.grouped === '1';
    populateChatMessageInner(row, msg, grouped);
  }

  function populateChatMessageInner(row, msg, grouped) {
    row.innerHTML = '';

    const gutter = document.createElement('div');
    gutter.className = 'msg-gutter';
    if (grouped) {
      const hoverTime = document.createElement('span');
      hoverTime.className = 'msg-hover-time';
      hoverTime.textContent = formatTime(msg.timestamp);
      gutter.appendChild(hoverTime);
    } else {
      const avatar = document.createElement('div');
      avatar.className = 'avatar lg';
      avatar.style.background = msg.senderColor || '#5865F2';
      avatar.textContent = getInitials(msg.senderName);
      gutter.appendChild(avatar);
    }

    const body = document.createElement('div');
    body.className = 'msg-body';

    if (msg.replyTo) {
      const quote = document.createElement('div');
      quote.className = 'msg-reply-quote';
      const qAuthor = document.createElement('strong');
      qAuthor.style.color = msg.replyTo.senderColor || '#a5adc2';
      qAuthor.textContent = `@${msg.replyTo.senderName}`;
      const qText = document.createElement('span');
      qText.textContent = msg.replyTo.preview || '';
      quote.appendChild(qAuthor);
      quote.appendChild(qText);
      quote.addEventListener('click', () => scrollToMessage(msg.replyTo.id));
      body.appendChild(quote);
    }

    if (!grouped) {
      const header = document.createElement('div');
      header.className = 'msg-header';

      const author = document.createElement('span');
      author.className = 'msg-author';
      author.style.color = msg.senderColor || '#f2f4f8';
      author.textContent = msg.senderName;

      const time = document.createElement('span');
      time.className = 'msg-time';
      time.textContent = formatTime(msg.timestamp);

      header.appendChild(author);
      header.appendChild(time);
      body.appendChild(header);
    }

    if (msg.text) {
      const textEl = document.createElement('div');
      textEl.className = 'msg-text';
      appendFormattedText(textEl, msg.text);
      if (msg.editedAt) {
        const ed = document.createElement('span');
        ed.className = 'msg-edited';
        ed.textContent = '(editado)';
        textEl.appendChild(ed);
      }
      body.appendChild(textEl);
    }

    if (msg.image) {
      const img = document.createElement('img');
      img.className = 'msg-image';
      img.src = msg.image;
      img.alt = `Imagem de ${msg.senderName}`;
      img.loading = 'lazy';
      img.addEventListener('click', () => openLightbox(msg.image));
      body.appendChild(img);
    }

    if (msg.audio) {
      const audioEl = document.createElement('audio');
      audioEl.className = 'msg-audio-player';
      audioEl.controls = true;
      audioEl.preload = 'metadata';
      audioEl.src = msg.audio;
      body.appendChild(audioEl);
    }

    // Reações existentes
    const reactionEntries = msg.reactions ? Object.entries(msg.reactions) : [];
    if (reactionEntries.length > 0) {
      const reactWrap = document.createElement('div');
      reactWrap.className = 'msg-reactions';
      reactionEntries.forEach(([emoji, users]) => {
        if (!Array.isArray(users) || users.length === 0) return;
        const isMine = users.some((u) => u.id === state.self?.id);
        const chip = document.createElement('button');
        chip.type = 'button';
        chip.className = 'reaction-chip' + (isMine ? ' mine' : '');
        chip.title = users.map((u) => u.name).join(', ');
        chip.textContent = `${emoji} ${users.length}`;
        chip.addEventListener('click', () => {
          socket.emit('chat-react', { messageId: msg.id, emoji });
        });
        reactWrap.appendChild(chip);
      });
      body.appendChild(reactWrap);
    }

    // Barra flutuante de ações (Reagir, Responder, Editar, Apagar)
    const actions = document.createElement('div');
    actions.className = 'msg-actions-bar';

    QUICK_REACTIONS.forEach((em) => {
      const rb = document.createElement('button');
      rb.type = 'button';
      rb.className = 'msg-act-btn';
      rb.textContent = em;
      rb.title = `Reagir com ${em}`;
      rb.addEventListener('click', () => socket.emit('chat-react', { messageId: msg.id, emoji: em }));
      actions.appendChild(rb);
    });

    const replyBtn = document.createElement('button');
    replyBtn.type = 'button';
    replyBtn.className = 'msg-act-btn';
    replyBtn.textContent = '↩';
    replyBtn.title = 'Responder';
    replyBtn.addEventListener('click', () => startReplyTo(msg));
    actions.appendChild(replyBtn);

    const isMine = state.self && msg.senderId === state.self.id;
    if (isMine && msg.text) {
      const editBtn = document.createElement('button');
      editBtn.type = 'button';
      editBtn.className = 'msg-act-btn';
      editBtn.textContent = '✏️';
      editBtn.title = 'Editar mensagem';
      editBtn.addEventListener('click', () => startEditMessage(msg));
      actions.appendChild(editBtn);
    }

    if (isMine || isHost()) {
      const delBtn = document.createElement('button');
      delBtn.type = 'button';
      delBtn.className = 'msg-act-btn danger';
      delBtn.textContent = '🗑️';
      delBtn.title = 'Apagar mensagem';
      delBtn.addEventListener('click', () => {
        socket.emit('chat-delete', { messageId: msg.id });
      });
      actions.appendChild(delBtn);
    }

    row.appendChild(gutter);
    row.appendChild(body);
    row.appendChild(actions);
  }

  function scrollToMessage(msgId) {
    const target = els.messagesList.querySelector(`[data-msg-id="${CSS.escape(msgId)}"]`);
    if (!target) {
      showToast('Mensagem original não está mais no histórico recente.', 'info');
      return;
    }
    target.scrollIntoView({ behavior: 'smooth', block: 'center' });
    target.classList.add('highlight-flash');
    setTimeout(() => target.classList.remove('highlight-flash'), 1400);
  }

  function startReplyTo(msg) {
    state.editingMessageId = null;
    state.replyingToId = msg.id;
    els.composerContextText.textContent = `Respondendo a ${msg.senderName}: "${(msg.text || 'mídia').slice(0, 50)}"`;
    els.composerContextBar.classList.remove('hidden');
    els.chatInput.focus();
  }

  function startEditMessage(msg) {
    state.replyingToId = null;
    state.editingMessageId = msg.id;
    els.composerContextText.textContent = '✏️ Editando sua mensagem (Enter salva • Esc cancela)';
    els.composerContextBar.classList.remove('hidden');
    els.chatInput.value = msg.text || '';
    autoResizeTextarea();
    els.chatInput.focus();
  }

  function clearComposerContext() {
    if (state.editingMessageId) {
      els.chatInput.value = '';
      autoResizeTextarea();
    }
    state.replyingToId = null;
    state.editingMessageId = null;
    els.composerContextBar.classList.add('hidden');
  }

  els.cancelContextBtn.addEventListener('click', clearComposerContext);

  function scrollChatToBottom(instant) {
    els.messagesList.scrollTo({
      top: els.messagesList.scrollHeight,
      behavior: instant ? 'auto' : 'smooth',
    });
  }

  function clearTypingUser(userId) {
    const entry = state.typingUsers.get(userId);
    if (entry) {
      clearTimeout(entry.timer);
      state.typingUsers.delete(userId);
      renderTypingIndicator();
    }
  }

  function renderTypingIndicator() {
    const names = Array.from(state.typingUsers.values()).map((t) => t.name);
    if (names.length === 0) {
      els.typingIndicator.classList.add('hidden');
      els.typingIndicator.textContent = '';
      return;
    }
    els.typingIndicator.classList.remove('hidden');
    if (names.length === 1) {
      els.typingIndicator.textContent = `${names[0]} está digitando...`;
    } else if (names.length === 2) {
      els.typingIndicator.textContent = `${names[0]} e ${names[1]} estão digitando...`;
    } else {
      els.typingIndicator.textContent = 'Várias pessoas estão digitando...';
    }
  }

  // ==================== GRAVAÇÃO DE MENSAGEM DE VOZ NO CHAT ====================

  let chatRecorder = null;
  let chatRecStream = null;
  let chatRecChunks = [];
  let chatRecTimer = null;
  let chatRecSeconds = 0;

  async function startVoiceRecording() {
    if (chatRecorder) return;
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia || typeof MediaRecorder === 'undefined') {
      showToast('Seu navegador não suporta gravação de áudio.', 'error');
      return;
    }

    try {
      chatRecStream = await navigator.mediaDevices.getUserMedia({ audio: true });
    } catch {
      showToast('Permita o acesso ao microfone para gravar áudio.', 'error');
      return;
    }

    const mimeCandidates = ['audio/webm;codecs=opus', 'audio/webm', 'audio/ogg;codecs=opus', 'audio/mp4'];
    const mimeType = mimeCandidates.find((m) => MediaRecorder.isTypeSupported(m)) || '';

    chatRecChunks = [];
    chatRecorder = mimeType ? new MediaRecorder(chatRecStream, { mimeType }) : new MediaRecorder(chatRecStream);

    chatRecorder.ondataavailable = (ev) => {
      if (ev.data && ev.data.size > 0) chatRecChunks.push(ev.data);
    };

    chatRecorder.start();
    chatRecSeconds = 0;
    els.voiceRecTimer.textContent = 'Gravando 0:00';
    els.voiceRecBar.classList.remove('hidden');

    chatRecTimer = setInterval(() => {
      chatRecSeconds += 1;
      const mins = Math.floor(chatRecSeconds / 60);
      const secs = String(chatRecSeconds % 60).padStart(2, '0');
      els.voiceRecTimer.textContent = `Gravando ${mins}:${secs}`;
      if (chatRecSeconds >= 60) {
        finishAndSendVoiceRecording();
      }
    }, 1000);
  }

  function cleanupVoiceRecResources() {
    clearInterval(chatRecTimer);
    chatRecTimer = null;
    if (chatRecStream) {
      chatRecStream.getTracks().forEach((t) => t.stop());
      chatRecStream = null;
    }
    chatRecorder = null;
    els.voiceRecBar.classList.add('hidden');
  }

  function cancelVoiceRecording() {
    if (!chatRecorder) return;
    try {
      chatRecorder.ondataavailable = null;
      chatRecorder.onstop = null;
      chatRecorder.stop();
    } catch {}
    chatRecChunks = [];
    cleanupVoiceRecResources();
  }

  function finishAndSendVoiceRecording() {
    if (!chatRecorder) return;
    const rec = chatRecorder;
    rec.onstop = () => {
      const blob = new Blob(chatRecChunks, { type: rec.mimeType || 'audio/webm' });
      chatRecChunks = [];
      cleanupVoiceRecResources();
      if (blob.size < 200) return;

      const reader = new FileReader();
      reader.onload = () => {
        socket.emit(
          'chat-message',
          { text: '', audio: reader.result, replyToId: state.replyingToId },
          (res) => {
            if (res && !res.ok && res.error) showToast(res.error, 'error');
          }
        );
        clearComposerContext();
      };
      reader.readAsDataURL(blob);
    };
    try {
      rec.stop();
    } catch {
      cleanupVoiceRecResources();
    }
  }

  els.recordVoiceMsgBtn.addEventListener('click', startVoiceRecording);
  els.cancelRecBtn.addEventListener('click', cancelVoiceRecording);
  els.sendRecBtn.addEventListener('click', finishAndSendVoiceRecording);

  // ==================== ENVIO DE TEXTO E IMAGENS ====================

  let typingSent = false;
  let typingStopTimer = null;

  function notifyTyping() {
    if (!typingSent) {
      typingSent = true;
      socket.emit('typing', { isTyping: true });
    }
    clearTimeout(typingStopTimer);
    typingStopTimer = setTimeout(() => {
      typingSent = false;
      socket.emit('typing', { isTyping: false });
    }, 2200);
  }

  function autoResizeTextarea() {
    els.chatInput.style.height = 'auto';
    els.chatInput.style.height = Math.min(els.chatInput.scrollHeight, 130) + 'px';
  }

  els.chatInput.addEventListener('input', () => {
    autoResizeTextarea();
    if (els.chatInput.value.trim().length > 0 && !state.editingMessageId) {
      notifyTyping();
    }
  });

  els.chatInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      els.chatForm.requestSubmit();
    }
  });

  els.chatInput.addEventListener('paste', (e) => {
    const items = e.clipboardData?.items;
    if (!items) return;
    for (const item of items) {
      if (item.type && item.type.startsWith('image/')) {
        const file = item.getAsFile();
        if (file) {
          e.preventDefault();
          loadImageFile(file);
          return;
        }
      }
    }
  });

  els.attachBtn.addEventListener('click', () => els.imageFileInput.click());
  els.imageFileInput.addEventListener('change', () => {
    const file = els.imageFileInput.files?.[0];
    if (file) loadImageFile(file);
    els.imageFileInput.value = '';
  });

  function loadImageFile(file) {
    if (!/^image\/(png|jpeg|jpg|gif|webp)$/.test(file.type)) {
      showToast('Use imagens PNG, JPG, GIF ou WebP.', 'error');
      return;
    }
    if (file.size > 3 * 1024 * 1024) {
      showToast('Imagem muito grande! Limite de 3 MB.', 'error');
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      state.pendingImageDataUrl = reader.result;
      els.imagePreviewThumb.src = reader.result;
      els.imagePreviewName.textContent = file.name || 'Imagem colada';
      els.imagePreviewBar.classList.remove('hidden');
      els.chatInput.focus();
    };
    reader.readAsDataURL(file);
  }

  function clearPendingImage() {
    state.pendingImageDataUrl = null;
    els.imagePreviewBar.classList.add('hidden');
    els.imagePreviewThumb.src = '';
  }

  els.removeImageBtn.addEventListener('click', clearPendingImage);

  els.emojiBtn.addEventListener('click', () => {
    els.emojiBar.classList.toggle('hidden');
  });

  els.chatForm.addEventListener('submit', (e) => {
    e.preventDefault();
    const text = els.chatInput.value.trim();

    if (state.editingMessageId) {
      if (!text) return;
      socket.emit('chat-edit', { messageId: state.editingMessageId, text }, (res) => {
        if (res && !res.ok && res.error) showToast(res.error, 'error');
      });
      clearComposerContext();
      return;
    }

    const image = state.pendingImageDataUrl;
    if (!text && !image) return;

    socket.emit(
      'chat-message',
      { text, image, replyToId: state.replyingToId },
      (res) => {
        if (res && !res.ok && res.error) showToast(res.error, 'error');
      }
    );

    els.chatInput.value = '';
    autoResizeTextarea();
    clearPendingImage();
    clearComposerContext();
    els.emojiBar.classList.add('hidden');
    if (typingSent) {
      typingSent = false;
      clearTimeout(typingStopTimer);
      socket.emit('typing', { isTyping: false });
    }
  });

  // ==================== CONFIGURAÇÕES, TEMAS E PUSH-TO-TALK ====================

  function updatePttBindLabel() {
    els.pttBindBtn.textContent = state.bindingPttKey
      ? 'Pressione qualquer tecla...'
      : `Tecla atual: ${state.pttKeyLabel} (clique p/ trocar)`;
  }

  async function openSettingsModal() {
    els.settingsModal.classList.remove('hidden');
    renderRoomMetaUI();

    const [mics, cams] = await Promise.all([voice.listMicrophones(), voice.listCameras()]);

    els.micSelect.innerHTML = '';
    if (mics.length === 0) {
      const opt = document.createElement('option');
      opt.value = '';
      opt.textContent = 'Padrão do sistema';
      els.micSelect.appendChild(opt);
    } else {
      mics.forEach((m, idx) => {
        const opt = document.createElement('option');
        opt.value = m.deviceId;
        opt.textContent = m.label || `Microfone ${idx + 1}`;
        if (m.deviceId === voice.selectedMicId) opt.selected = true;
        els.micSelect.appendChild(opt);
      });
    }

    els.camSelect.innerHTML = '';
    if (cams.length === 0) {
      const opt = document.createElement('option');
      opt.value = '';
      opt.textContent = 'Padrão do sistema';
      els.camSelect.appendChild(opt);
    } else {
      cams.forEach((c, idx) => {
        const opt = document.createElement('option');
        opt.value = c.deviceId;
        opt.textContent = c.label || `Câmera ${idx + 1}`;
        if (c.deviceId === voice.selectedCamId) opt.selected = true;
        els.camSelect.appendChild(opt);
      });
    }

    els.themeSelect.value = state.theme;
    els.voiceModeSelect.value = state.voiceMode;
    els.pttKeyBox.classList.toggle('hidden', state.voiceMode !== 'ptt');
    els.qualitySelect.value = voice.screenQuality;
  }

  function closeSettingsModal() {
    state.bindingPttKey = false;
    updatePttBindLabel();
    els.settingsModal.classList.add('hidden');
  }

  els.settingsBtn.addEventListener('click', openSettingsModal);
  els.closeSettingsBtn.addEventListener('click', closeSettingsModal);
  els.doneSettingsBtn.addEventListener('click', closeSettingsModal);
  els.settingsModal.addEventListener('click', (e) => {
    if (e.target === els.settingsModal) closeSettingsModal();
  });

  els.themeSelect.addEventListener('change', () => {
    applyTheme(els.themeSelect.value);
    showToast(`Tema: ${THEME_LABELS[state.theme]}`, 'info');
  });

  els.themeQuickBtn.addEventListener('click', () => {
    const nextIdx = (THEMES.indexOf(state.theme) + 1) % THEMES.length;
    applyTheme(THEMES[nextIdx]);
    showToast(`Tema alterado para ${THEME_LABELS[state.theme]}!`, 'info');
  });

  els.voiceModeSelect.addEventListener('change', () => {
    state.voiceMode = els.voiceModeSelect.value;
    localStorage.setItem('resenha_voice_mode', state.voiceMode);
    const ptt = state.voiceMode === 'ptt';
    els.pttKeyBox.classList.toggle('hidden', !ptt);
    voice.setPttMode(ptt);
    renderMembers();
    showToast(ptt ? `Push-to-Talk ativado (segure ${state.pttKeyLabel})` : 'Voz Livre ativada!', 'success');
  });

  els.pttBindBtn.addEventListener('click', () => {
    state.bindingPttKey = true;
    updatePttBindLabel();
  });

  els.micSelect.addEventListener('change', async () => {
    const res = await voice.switchMicrophone(els.micSelect.value);
    if (!res.ok) showToast(res.error || 'Erro ao trocar microfone.', 'error');
    else showToast('Microfone alterado!', 'success');
  });

  els.camSelect.addEventListener('change', async () => {
    const res = await voice.switchCamera(els.camSelect.value);
    if (!res.ok) showToast(res.error || 'Erro ao trocar câmera.', 'error');
    else showToast('Câmera alterada!', 'success');
  });

  els.qualitySelect.addEventListener('change', async () => {
    const val = els.qualitySelect.value;
    localStorage.setItem('resenha_screen_quality', val);
    await voice.setScreenQuality(val);
    showToast(voice.screenSharing ? 'Qualidade atualizada ao vivo!' : 'Qualidade salva!', 'success');
  });

  function openLightbox(src) {
    els.lightboxImg.src = src;
    els.lightboxModal.classList.remove('hidden');
  }

  function closeLightbox() {
    els.lightboxModal.classList.add('hidden');
    els.lightboxImg.src = '';
  }

  els.closeLightboxBtn.addEventListener('click', closeLightbox);
  els.lightboxModal.addEventListener('click', (e) => {
    if (e.target === els.lightboxModal) closeLightbox();
  });

  function updateSoundToggleIcon() {
    els.soundToggleBtn.classList.toggle('active', state.soundsEnabled);
    els.soundToggleBtn.title = state.soundsEnabled
      ? 'Sons de notificação ligados (clique para silenciar)'
      : 'Sons de notificação desligados (clique para ativar)';
  }

  els.soundToggleBtn.addEventListener('click', () => {
    state.soundsEnabled = !state.soundsEnabled;
    window.ResenhaSounds.enabled = state.soundsEnabled;
    localStorage.setItem('resenha_sounds', String(state.soundsEnabled));
    updateSoundToggleIcon();
    showToast(state.soundsEnabled ? 'Sons de notificação ligados.' : 'Sons de notificação desligados.', 'info');
  });

  els.copyInviteSidebarBtn.addEventListener('click', copyInviteLink);
  els.copyInviteTopBtn.addEventListener('click', copyInviteLink);
  els.leaveRoomBtn.addEventListener('click', leaveRoom);

  // Mobile sidebar
  function openMobileSidebar() {
    els.sidebar.classList.add('open');
    els.sidebarBackdrop.classList.remove('hidden');
  }
  function closeMobileSidebar() {
    els.sidebar.classList.remove('open');
    els.sidebarBackdrop.classList.add('hidden');
  }
  els.mobileMenuBtn.addEventListener('click', openMobileSidebar);
  els.sidebarBackdrop.addEventListener('click', closeMobileSidebar);

  // ==================== ATALHOS E TECLAS DO PUSH-TO-TALK ====================

  function isTypingInField(target) {
    if (!target) return false;
    const tag = target.tagName;
    return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || target.isContentEditable;
  }

  document.addEventListener('keydown', (e) => {
    if (state.bindingPttKey) {
      e.preventDefault();
      if (e.key === 'Escape') {
        state.bindingPttKey = false;
        updatePttBindLabel();
        return;
      }
      state.pttKeyCode = e.code;
      state.pttKeyLabel = e.key === ' ' ? 'Espaço' : e.key.length === 1 ? e.key.toUpperCase() : e.key;
      localStorage.setItem('resenha_ptt_key', state.pttKeyCode);
      localStorage.setItem('resenha_ptt_label', state.pttKeyLabel);
      state.bindingPttKey = false;
      updatePttBindLabel();
      updateVoiceDockUI();
      showToast(`Tecla Push-to-Talk definida: ${state.pttKeyLabel}`, 'success');
      return;
    }

    if (e.key === 'Escape') {
      if (state.editingMessageId || state.replyingToId) {
        clearComposerContext();
        return;
      }
      closeSettingsModal();
      closeLightbox();
      els.soundboardModal.classList.add('hidden');
      els.emojiBar.classList.add('hidden');
      closeMobileSidebar();
      return;
    }

    if (!voice.inVoice) return;

    if (e.altKey && (e.key === 'm' || e.key === 'M')) {
      e.preventDefault();
      els.muteBtn.click();
      return;
    }
    if (e.altKey && (e.key === 'd' || e.key === 'D')) {
      e.preventDefault();
      els.deafenBtn.click();
      return;
    }

    // Push-to-Talk
    if (voice.pttEnabled && e.code === state.pttKeyCode && !isTypingInField(e.target)) {
      if (!e.repeat) {
        voice.setPttActive(true);
        renderMembers();
      }
    }
  });

  document.addEventListener('keyup', (e) => {
    if (voice.inVoice && voice.pttEnabled && e.code === state.pttKeyCode) {
      voice.setPttActive(false);
      renderMembers();
    }
  });

  window.addEventListener('blur', () => {
    if (voice.inVoice && voice.pttEnabled && voice.pttPressed) {
      voice.setPttActive(false);
      renderMembers();
    }
  });

  initLobby();
})();
