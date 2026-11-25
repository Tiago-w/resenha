// Controlador Principal do Resenha 2.0 (Voz, Tela 4K, Webcam, Soundboard, Apontador, Chat Turbinado, Temas e Segurança)
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

  const REACTION_BAR_EMOJIS = ['😂', '🔥', '❤️', '👍', '💀'];
  const THEMES = ['midnight', 'oled', 'cyber', 'emerald'];

  const ROOM_WORDS_A = ['resenha', 'squad', 'noite', 'cafe', 'combo', 'galera', 'festa', 'turbo', 'pixel', 'ponto'];
  const ROOM_WORDS_B = ['vip', 'gamer', 'top', 'azul', 'raiz', 'livre', 'pro', 'br', 'gold', 'max'];

  const state = {
    roomCode: null,
    roomMeta: { hostId: null, locked: false, hasPassword: false },
    self: null,
    users: new Map(),
    messagesMap: new Map(),
    speakingIds: new Set(),
    typingUsers: new Map(),
    lastMessageMeta: null,
    pendingImageDataUrl: null,
    replyingToMsg: null,
    editingMsgId: null,
    lastEnteredPassword: '',
    selectedColor: localStorage.getItem('resenha_color') || AVATAR_COLORS[0],
    theme: localStorage.getItem('resenha_theme') || 'midnight',
    voiceMode: localStorage.getItem('resenha_voice_mode') || 'auto', // 'auto' | 'ptt'
    pttKeyCode: localStorage.getItem('resenha_ptt_key') || 'KeyV',
    pttKeyLabel: localStorage.getItem('resenha_ptt_label') || 'V',
    bindingPttKey: false,
    activeScreenOwnerId: null,
    stageHiddenByUser: false,
    streamVolume: 0.8,
    soundsEnabled: localStorage.getItem('resenha_sounds') !== 'false',
    soundboardVolume: Number(localStorage.getItem('resenha_sb_vol') || '70') / 100,
    customSounds: loadCustomSounds(),
  };

  function loadCustomSounds() {
    try {
      const raw = localStorage.getItem('resenha_custom_sounds');
      const parsed = raw ? JSON.parse(raw) : [];
      return Array.isArray(parsed) ? parsed.slice(0, 6) : [];
    } catch {
      return [];
    }
  }

  function saveCustomSounds() {
    try {
      localStorage.setItem('resenha_custom_sounds', JSON.stringify(state.customSounds.slice(0, 6)));
    } catch {
      showToast('Armazenamento local cheio! Apague algum som antigo.', 'error');
    }
  }

  const els = {
    lobbyView: document.getElementById('lobby-view'),
    roomView: document.getElementById('room-view'),
    joinForm: document.getElementById('join-form'),
    nicknameInput: document.getElementById('nickname-input'),
    roomInput: document.getElementById('room-input'),
    generateRoomBtn: document.getElementById('generate-room-btn'),
    colorPicker: document.getElementById('color-picker'),
    roomPasswordInput: document.getElementById('room-password-input'),
    roomPasswordLabel: document.getElementById('room-password-label'),
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
    imageFileInput: document.getElementById('image-file-input'),
    recordVoiceMsgBtn: document.getElementById('record-voice-msg-btn'),
    emojiBtn: document.getElementById('emoji-btn'),

    soundboardModal: document.getElementById('soundboard-modal'),
    closeSoundboardBtn: document.getElementById('close-soundboard-btn'),
    soundboardVolSlider: document.getElementById('soundboard-vol-slider'),
    soundboardVolLabel: document.getElementById('soundboard-vol-label'),
    soundboardGrid: document.getElementById('soundboard-grid'),
    customSoundInput: document.getElementById('custom-sound-input'),
    addCustomSoundBtn: document.getElementById('add-custom-sound-btn'),

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
  window.ResenhaSounds.soundboardVolume = state.soundboardVolume;
  applyTheme(state.theme);

  const socket = io({ autoConnect: true });

  // ==================== DESENHO DE FRAMES RELAY (TELA E WEBCAM) ====================

  let relayCanvasBusy = false;
  let lastStageResLabel = '';
  const stageCanvasCtx = els.stageCanvas.getContext('2d', { alpha: false });
  const camRelayBusyMap = new Map();

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

  async function drawWebpToCanvas(canvasEl, ctx2d, frameBuffer, width, height, onDimensions) {
    const blob = new Blob([frameBuffer], { type: 'image/webp' });
    if (typeof createImageBitmap === 'function') {
      const bitmap = await createImageBitmap(blob);
      if (canvasEl.width !== bitmap.width || canvasEl.height !== bitmap.height) {
        canvasEl.width = bitmap.width;
        canvasEl.height = bitmap.height;
      }
      ctx2d.drawImage(bitmap, 0, 0);
      if (onDimensions) onDimensions(bitmap.width, bitmap.height);
      bitmap.close();
    } else {
      const url = URL.createObjectURL(blob);
      await new Promise((resolve) => {
        const img = new Image();
        img.onload = () => {
          const w = width || img.width;
          const h = height || img.height;
          if (canvasEl.width !== w || canvasEl.height !== h) {
            canvasEl.width = w;
            canvasEl.height = h;
          }
          ctx2d.drawImage(img, 0, 0);
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
      await drawWebpToCanvas(els.stageCanvas, stageCanvasCtx, frameBuffer, width, height, updateStageBadgeWithResolution);
    } catch {}
    relayCanvasBusy = false;
  }

  async function drawRelayCamFrame(ownerId, frameBuffer, width, height) {
    if (camRelayBusyMap.get(ownerId)) return;
    const canvas = els.cameraStrip.querySelector(`canvas[data-cam-canvas="${CSS.escape(ownerId)}"]`);
    if (!canvas) return;
    const ctx2d = canvas.getContext('2d', { alpha: false });
    camRelayBusyMap.set(ownerId, true);
    try {
      await drawWebpToCanvas(canvas, ctx2d, frameBuffer, width, height);
    } catch {}
    camRelayBusyMap.set(ownerId, false);
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
    onLatencyUpdate: (ms) => updatePingBadge(ms),
    onStateChange: () => updateVoiceDockUI(),
    onToast: (msg, type) => showToast(msg, type),
  });

  const savedQuality = localStorage.getItem('resenha_screen_quality');
  if (savedQuality) voice.setScreenQuality(savedQuality);
  voice.setPttMode(state.voiceMode === 'ptt');

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

  function isSelfHost() {
    return Boolean(state.self && state.roomMeta.hostId && state.self.id === state.roomMeta.hostId);
  }

  function applyTheme(theme) {
    const valid = THEMES.includes(theme) ? theme : 'midnight';
    state.theme = valid;
    document.documentElement.setAttribute('data-theme', valid);
    localStorage.setItem('resenha_theme', valid);
    if (els.themeSelect) els.themeSelect.value = valid;
  }

  function updatePingBadge(ms) {
    if (!els.pingBadge) return;
    if (!ms) {
      els.pingBadge.textContent = '-- ms';
      els.pingBadge.className = 'ping-badge';
      return;
    }
    els.pingBadge.textContent = `${ms} ms`;
    els.pingBadge.className = 'ping-badge ' + (ms < 90 ? 'good' : ms < 190 ? 'warn' : 'bad');
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
        () => showToast('Link de convite copiado!', 'success'),
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
      showToast(`Copie o link: ${text}`, 'info');
    }
    ta.remove();
  }

  // ==================== LOBBY ====================

  async function checkLobbyRoomInfo(code) {
    const clean = (code || '').trim();
    if (clean.length < 2) return;
    try {
      const res = await fetch(`/api/room-info/${encodeURIComponent(clean)}`);
      if (!res.ok) return;
      const info = await res.json();
      if (info.exists && info.hasPassword) {
        els.roomPasswordLabel.textContent = '🔑 Senha obrigatória desta sala';
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
      checkLobbyRoomInfo(urlRoom);
      els.nicknameInput.focus();
    } else {
      els.roomInput.value = generateRoomCode();
      els.nicknameInput.focus();
    }

    els.roomInput.addEventListener('blur', () => checkLobbyRoomInfo(els.roomInput.value));
    updateSoundToggleIcon();
    updatePttUiControls();
  }

  els.generateRoomBtn.addEventListener('click', () => {
    els.roomInput.value = generateRoomCode();
    els.roomPasswordInput.value = '';
    els.roomPasswordLabel.textContent = 'Senha da sala (opcional)';
    els.inviteBanner.classList.add('hidden');
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
          els.roomPasswordLabel.textContent = '🔑 Senha obrigatória desta sala';
          els.roomPasswordInput.focus();
        }
        return;
      }

      state.lastEnteredPassword = password;
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

    updateRoomSecurityUI();
    renderMessagesFull(data.messages || []);
    renderMembers();
    updateVoiceDockUI();
    renderCameraStrip();
    renderScreenStage();

    window.ResenhaSounds.playJoin();
    els.chatInput.focus();
  }

  function leaveRoom(customReasonToast = null) {
    cancelVoiceRecording();
    voice.stopLatencyMonitor();
    voice.leaveVoice({ notifyServer: true });
    socket.disconnect();
    socket.connect();

    state.roomCode = null;
    state.self = null;
    state.users.clear();
    state.messagesMap.clear();
    state.speakingIds.clear();
    state.typingUsers.clear();
    state.activeScreenOwnerId = null;
    state.stageHiddenByUser = false;
    clearComposerContext();

    window.history.replaceState({}, '', '/');
    els.roomView.classList.add('hidden');
    els.lobbyView.classList.remove('hidden');
    closeMobileSidebar();

    if (customReasonToast) {
      showToast(customReasonToast, 'error');
    }
  }

  function updateRoomSecurityUI() {
    const host = isSelfHost();
    els.roomLockIndicator.classList.toggle('hidden', !state.roomMeta.locked);
    els.roomPassIndicator.classList.toggle('hidden', !state.roomMeta.hasPassword);
    els.lockRoomBtn.classList.toggle('hidden', !host);
    els.lockRoomBtn.classList.toggle('active', Boolean(state.roomMeta.locked));
    els.lockRoomBtn.title = state.roomMeta.locked
      ? 'Sala trancada — clique para destrancar'
      : 'Trancar sala (impede novas entradas)';
    els.hostSecuritySection.classList.toggle('hidden', !host);
    els.selfRoleSub.textContent = host ? '👑 Anfitrião' : 'Online';
  }

  els.lockRoomBtn.addEventListener('click', () => {
    if (!isSelfHost()) return;
    socket.emit('room-set-lock', { locked: !state.roomMeta.locked }, (res) => {
      if (res && !res.ok && res.error) showToast(res.error, 'error');
    });
  });

  els.saveRoomPasswordBtn.addEventListener('click', () => {
    if (!isSelfHost()) return;
    const newPassword = els.hostPasswordInput.value.trim();
    socket.emit('room-set-password', { password: newPassword }, (res) => {
      if (res && res.ok) {
        state.lastEnteredPassword = newPassword;
        els.hostPasswordInput.value = '';
        showToast(newPassword ? 'Senha da sala atualizada!' : 'Senha removida!', 'success');
      } else if (res?.error) {
        showToast(res.error, 'error');
      }
    });
  });

  // ==================== SOCKET EVENTS ====================

  socket.on('user-joined', ({ user, roomMeta, systemMessage }) => {
    if (!user) return;
    state.users.set(user.id, user);
    if (roomMeta) state.roomMeta = roomMeta;
    updateRoomSecurityUI();
    renderMembers();
    if (systemMessage) appendMessage(systemMessage);
    window.ResenhaSounds.playJoin();
  });

  socket.on('user-left', ({ userId, roomMeta, systemMessage }) => {
    state.users.delete(userId);
    state.speakingIds.delete(userId);
    clearTypingUser(userId);
    if (roomMeta) state.roomMeta = roomMeta;
    updateRoomSecurityUI();
    renderMembers();
    if (systemMessage) appendMessage(systemMessage);
    window.ResenhaSounds.playLeave();
  });

  socket.on('room-meta-updated', ({ roomMeta, systemMessage }) => {
    if (roomMeta) state.roomMeta = roomMeta;
    updateRoomSecurityUI();
    renderMembers();
    if (systemMessage) appendMessage(systemMessage);
  });

  socket.on('kicked-from-room', ({ reason }) => {
    leaveRoom(reason || 'Você foi removido da sala.');
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
    state.messagesMap.set(msg.id, msg);
    const existingRow = els.messagesList.querySelector(`[data-message-id="${CSS.escape(msg.id)}"]`);
    if (existingRow) {
      const wasGrouped = existingRow.classList.contains('grouped');
      const freshRow = buildChatMessageElement(msg, wasGrouped);
      existingRow.replaceWith(freshRow);
    }
  });

  socket.on('chat-message-deleted', ({ messageId }) => {
    if (!messageId) return;
    state.messagesMap.delete(messageId);
    const row = els.messagesList.querySelector(`[data-message-id="${CSS.escape(messageId)}"]`);
    if (row) row.remove();
  });

  socket.on('soundboard-play', ({ fromName, soundId, soundName, customAudio }) => {
    if (!voice.inVoice) return;
    window.ResenhaSounds.playSoundboard(soundId, customAudio, voice.deafened);
    showToast(`🔊 ${fromName} tocou: ${soundName}`, 'info');
  });

  socket.on('screen-ping', ({ fromName, fromColor, targetOwnerId, x, y }) => {
    if (targetOwnerId !== state.activeScreenOwnerId || state.stageHiddenByUser) return;
    renderScreenPingMarker(fromName, fromColor, x, y);
    window.ResenhaSounds.playPing();
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
          password: state.lastEnteredPassword,
        },
        async (res) => {
          if (res && res.ok) {
            enterRoomUI(res);
            showToast('Reconectado à sala!', 'success');
            if (wasInVoice) await handleJoinVoice(wasListenOnly);
          }
        }
      );
    }
  });

  // ==================== MEMBROS E VOZ UI ====================

  function renderMembers() {
    const allUsers = Array.from(state.users.values()).sort((a, b) => a.joinedAt - b.joinedAt);
    const voiceUsers = allUsers.filter((u) => u.inVoice);
    const amHost = isSelfHost();

    els.onlineCount.textContent = `${allUsers.length} online`;
    els.voiceCountBadge.textContent = String(voiceUsers.length);
    els.membersCountBadge.textContent = String(allUsers.length);

    els.voiceMembersList.innerHTML = '';
    voiceUsers.forEach((u) => {
      const isSelf = state.self && u.id === state.self.id;
      const isHost = state.roomMeta.hostId === u.id;
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
      if (isHost) {
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

    els.allMembersList.innerHTML = '';
    allUsers.forEach((u) => {
      const isSelf = state.self && u.id === state.self.id;
      const isHost = state.roomMeta.hostId === u.id;
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
      if (isHost) {
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
        kickBtn.addEventListener('click', () => {
          if (!confirm(`Remover "${u.name}" da sala?`)) return;
          socket.emit('kick-user', { targetId: u.id }, (res) => {
            if (res && res.ok) showToast(`${u.name} foi removido.`, 'info');
          });
        });
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
    const camCards = els.cameraStrip.querySelectorAll(`[data-cam-card-id="${CSS.escape(userId)}"]`);
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
      els.voiceStatusTitle.textContent = voice.muted ? 'Push-to-Talk' : 'Transmitindo voz!';
      els.voiceStatusSub.textContent = voice.muted
        ? `Segure [${state.pttKeyLabel}] para falar`
        : 'Microfone aberto';
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
    els.camBtnLabel.textContent = voice.cameraOn ? 'Cam ON' : 'Câmera';

    els.screenBtn.classList.toggle('live-active', voice.screenSharing);
    els.screenBtnLabel.textContent = voice.screenSharing ? 'Parar' : 'Tela';
  }

  // ==================== WEBCAM STRIP ====================

  function renderCameraStrip() {
    const cams = voice.getActiveCameras();
    if (cams.length === 0) {
      els.cameraStrip.classList.add('hidden');
      els.cameraStrip.innerHTML = '';
      return;
    }

    els.cameraStrip.classList.remove('hidden');

    const activeIds = new Set(cams.map((c) => c.ownerId));
    // Remove cartões antigos
    Array.from(els.cameraStrip.children).forEach((child) => {
      if (!activeIds.has(child.dataset.camCardId)) {
        child.remove();
      }
    });

    cams.forEach((c) => {
      const owner = state.users.get(c.ownerId);
      const name = c.isSelf ? 'Você' : owner ? owner.name : 'Amigo';
      let card = els.cameraStrip.querySelector(`[data-cam-card-id="${CSS.escape(c.ownerId)}"]`);
      const modeKey = c.isRelay ? 'relay' : 'stream';

      if (card && card.dataset.camMode !== modeKey) {
        card.remove();
        card = null;
      }

      if (!card) {
        card = document.createElement('div');
        card.className =
          'cam-card' +
          (c.isSelf ? ' self-cam' : '') +
          (state.speakingIds.has(c.ownerId) ? ' speaking' : '');
        card.dataset.camCardId = c.ownerId;
        card.dataset.camMode = modeKey;

        if (c.isRelay) {
          const canvas = document.createElement('canvas');
          canvas.dataset.camCanvas = c.ownerId;
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
      els.screenPingsLayer.innerHTML = '';
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

  // Calcula caixa exata da imagem dentro do object-fit:contain para o ping cair no pixel certo
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
    let width;
    let height;
    if (mediaRatio > wrapRatio) {
      width = wrapRect.width;
      height = wrapRect.width / mediaRatio;
    } else {
      height = wrapRect.height;
      width = wrapRect.height * mediaRatio;
    }
    return {
      left: (wrapRect.width - width) / 2,
      top: (wrapRect.height - height) / 2,
      width,
      height,
      wrapRect,
    };
  }

  els.stageVideoWrap.addEventListener('click', (e) => {
    if (!state.activeScreenOwnerId) return;
    const box = getStageContentBox();
    if (!box.width || !box.height) return;

    const clickX = e.clientX - box.wrapRect.left - box.left;
    const clickY = e.clientY - box.wrapRect.top - box.top;
    if (clickX < 0 || clickY < 0 || clickX > box.width || clickY > box.height) return;

    const x = Math.max(0, Math.min(1, clickX / box.width));
    const y = Math.max(0, Math.min(1, clickY / box.height));

    socket.emit('screen-ping', {
      targetOwnerId: state.activeScreenOwnerId,
      x,
      y,
    });
  });

  function renderScreenPingMarker(name, color, xPct, yPct) {
    const box = getStageContentBox();
    if (!box.width || !box.height) return;

    const marker = document.createElement('div');
    marker.className = 'screen-ping-marker';
    marker.style.left = `${box.left + xPct * box.width}px`;
    marker.style.top = `${box.top + yPct * box.height}px`;
    marker.style.setProperty('--ping-color', color || '#5865F2');

    const ring = document.createElement('div');
    ring.className = 'screen-ping-ring';

    const label = document.createElement('div');
    label.className = 'screen-ping-label';
    label.textContent = name;

    marker.appendChild(ring);
    marker.appendChild(label);
    els.screenPingsLayer.appendChild(marker);

    setTimeout(() => marker.remove(), 1550);
  }

  // ==================== CONTROLES DE VOZ, WEBCAM E TELA ====================

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
    if (res && !res.ok && res.error) {
      showToast(res.error, 'error');
      return;
    }
    renderCameraStrip();
    showToast(voice.cameraOn ? 'Webcam ligada!' : 'Webcam desligada.', 'info');
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
      showToast('Não foi possível abrir Picture-in-Picture.', 'error');
    }
  });

  els.fullscreenBtn.addEventListener('click', () => {
    if (!document.fullscreenElement) {
      (els.stageVideoWrap.requestFullscreen || els.stageVideo.requestFullscreen)?.call(els.stageVideoWrap);
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

  function renderSoundboardPads() {
    els.soundboardGrid.innerHTML = '';

    window.ResenhaSounds.builtinList.forEach((s) => {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'sound-pad';
      btn.innerHTML = `<span class="sound-pad-emoji">${s.emoji}</span><span class="sound-pad-name">${escapeHtml(s.name)}</span>`;
      btn.addEventListener('click', () => triggerSoundboard(s.id, `${s.emoji} ${s.name}`, null));
      els.soundboardGrid.appendChild(btn);
    });

    state.customSounds.forEach((cs, idx) => {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'sound-pad';

      const em = document.createElement('span');
      em.className = 'sound-pad-emoji';
      em.textContent = '🎵';

      const nm = document.createElement('span');
      nm.className = 'sound-pad-name';
      nm.textContent = cs.name;

      const del = document.createElement('span');
      del.className = 'sound-pad-del';
      del.textContent = '×';
      del.title = 'Apagar som';
      del.addEventListener('click', (e) => {
        e.stopPropagation();
        state.customSounds.splice(idx, 1);
        saveCustomSounds();
        renderSoundboardPads();
      });

      btn.appendChild(em);
      btn.appendChild(nm);
      btn.appendChild(del);
      btn.addEventListener('click', () => triggerSoundboard('', `🎵 ${cs.name}`, cs.dataUrl));
      els.soundboardGrid.appendChild(btn);
    });
  }

  function triggerSoundboard(soundId, soundName, customAudio) {
    socket.emit('soundboard-play', { soundId, soundName, customAudio }, (res) => {
      if (res && !res.ok && res.error) showToast(res.error, 'error');
    });
  }

  els.soundboardBtn.addEventListener('click', () => {
    els.soundboardVolSlider.value = String(Math.round(state.soundboardVolume * 100));
    els.soundboardVolLabel.textContent = `${Math.round(state.soundboardVolume * 100)}%`;
    renderSoundboardPads();
    els.soundboardModal.classList.remove('hidden');
  });

  els.closeSoundboardBtn.addEventListener('click', () => els.soundboardModal.classList.add('hidden'));
  els.soundboardModal.addEventListener('click', (e) => {
    if (e.target === els.soundboardModal) els.soundboardModal.classList.add('hidden');
  });

  els.soundboardVolSlider.addEventListener('input', () => {
    const pct = Number(els.soundboardVolSlider.value);
    els.soundboardVolLabel.textContent = `${pct}%`;
    state.soundboardVolume = pct / 100;
    window.ResenhaSounds.soundboardVolume = state.soundboardVolume;
    localStorage.setItem('resenha_sb_vol', String(pct));
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
    if (state.customSounds.length >= 6) {
      showToast('Limite de 6 áudios personalizados atingido. Apague um antes.', 'error');
      return;
    }
    const cleanName = file.name.replace(/\.[^.]+$/, '').slice(0, 22) || 'Meu Áudio';
    const reader = new FileReader();
    reader.onload = () => {
      state.customSounds.push({ name: cleanName, dataUrl: reader.result });
      saveCustomSounds();
      renderSoundboardPads();
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
    state.messagesMap.clear();
    state.lastMessageMeta = null;

    const welcome = document.createElement('div');
    welcome.className = 'welcome-card';
    welcome.innerHTML = `
      <h3>Bem-vindo à sala #${escapeHtml(state.roomCode)}</h3>
      <p>Converse por aqui, reaja com emojis, envie áudios 🎤, cole prints com <strong>Ctrl + V</strong> ou entre na voz para ligar tela 4K, webcam e soundboard!</p>
    `;
    els.messagesList.appendChild(welcome);

    messages.forEach((m) => appendMessage(m, { autoScroll: false }));
    scrollChatToBottom(true);
  }

  function buildChatMessageElement(msg, isGrouped) {
    const canGroup = isGrouped && !msg.replyTo;
    const row = document.createElement('div');
    row.className = 'msg-row' + (canGroup ? ' grouped' : '');
    row.dataset.messageId = msg.id;

    const gutter = document.createElement('div');
    gutter.className = 'msg-gutter';

    if (canGroup) {
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
      qText.textContent = msg.replyTo.preview || 'Mensagem';
      quote.appendChild(qAuthor);
      quote.appendChild(qText);
      quote.addEventListener('click', () => scrollToMessage(msg.replyTo.id));
      body.appendChild(quote);
    }

    if (!canGroup) {
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
      img.alt = `Imagem enviada por ${msg.senderName}`;
      img.loading = 'lazy';
      img.addEventListener('click', () => openLightbox(msg.image));
      body.appendChild(img);
    }

    if (msg.audio) {
      const aud = document.createElement('audio');
      aud.className = 'msg-audio-player';
      aud.controls = true;
      aud.preload = 'metadata';
      aud.src = msg.audio;
      body.appendChild(aud);
    }

    // Reações existentes
    const reactionEntries = msg.reactions ? Object.entries(msg.reactions) : [];
    if (reactionEntries.length > 0) {
      const reactWrap = document.createElement('div');
      reactWrap.className = 'msg-reactions';
      reactionEntries.forEach(([emoji, users]) => {
        if (!Array.isArray(users) || users.length === 0) return;
        const mine = users.some((u) => u.id === state.self?.id);
        const chip = document.createElement('button');
        chip.type = 'button';
        chip.className = 'reaction-chip' + (mine ? ' mine' : '');
        chip.title = users.map((u) => u.name).join(', ');
        chip.textContent = `${emoji} ${users.length}`;
        chip.addEventListener('click', () => {
          socket.emit('chat-react', { messageId: msg.id, emoji });
        });
        reactWrap.appendChild(chip);
      });
      body.appendChild(reactWrap);
    }

    // Barra flutuante de ações ao passar o mouse
    const actions = document.createElement('div');
    actions.className = 'msg-actions-bar';

    REACTION_BAR_EMOJIS.forEach((em) => {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'msg-act-btn';
      b.textContent = em;
      b.title = `Reagir com ${em}`;
      b.addEventListener('click', () => socket.emit('chat-react', { messageId: msg.id, emoji: em }));
      actions.appendChild(b);
    });

    const replyBtn = document.createElement('button');
    replyBtn.type = 'button';
    replyBtn.className = 'msg-act-btn';
    replyBtn.textContent = '↩';
    replyBtn.title = 'Responder';
    replyBtn.addEventListener('click', () => startReplyToMessage(msg));
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

    if (isMine || isSelfHost()) {
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
    return row;
  }

  function appendMessage(msg, { autoScroll = true } = {}) {
    const isNearBottom =
      els.messagesList.scrollHeight - els.messagesList.scrollTop - els.messagesList.clientHeight < 140;

    if (msg.type === 'system') {
      const sys = document.createElement('div');
      sys.className = 'msg-system';
      sys.textContent = msg.text;
      els.messagesList.appendChild(sys);
      state.lastMessageMeta = null;
    } else {
      state.messagesMap.set(msg.id, msg);
      const canGroup =
        !msg.replyTo &&
        state.lastMessageMeta &&
        state.lastMessageMeta.senderId === msg.senderId &&
        msg.timestamp - state.lastMessageMeta.timestamp < 5 * 60 * 1000;

      const row = buildChatMessageElement(msg, Boolean(canGroup));
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

  function scrollToMessage(messageId) {
    const target = els.messagesList.querySelector(`[data-message-id="${CSS.escape(messageId)}"]`);
    if (!target) return;
    target.scrollIntoView({ behavior: 'smooth', block: 'center' });
    target.classList.add('highlight-flash');
    setTimeout(() => target.classList.remove('highlight-flash'), 1200);
  }

  function startReplyToMessage(msg) {
    state.editingMsgId = null;
    state.replyingToMsg = msg;
    const preview = msg.text || (msg.image ? '📷 Imagem' : '🎤 Mensagem de voz');
    els.composerContextText.textContent = `↩ Respondendo a ${msg.senderName}: ${preview.slice(0, 60)}`;
    els.composerContextBar.classList.remove('hidden');
    els.chatInput.focus();
  }

  function startEditMessage(msg) {
    state.replyingToMsg = null;
    state.editingMsgId = msg.id;
    els.composerContextText.textContent = '✏️ Editando sua mensagem (Esc para cancelar)';
    els.composerContextBar.classList.remove('hidden');
    els.chatInput.value = msg.text || '';
    autoResizeTextarea();
    els.chatInput.focus();
  }

  function clearComposerContext() {
    const wasEditing = Boolean(state.editingMsgId);
    state.replyingToMsg = null;
    state.editingMsgId = null;
    els.composerContextBar.classList.add('hidden');
    if (wasEditing) {
      els.chatInput.value = '';
      autoResizeTextarea();
    }
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

  // ==================== GRAVADOR DE MENSAGEM DE VOZ NO CHAT ====================

  let voiceRecorder = null;
  let voiceRecChunks = [];
  let voiceRecStream = null;
  let voiceRecTimerId = null;
  let voiceRecStartAt = 0;

  function getSupportedAudioMime() {
    if (typeof MediaRecorder === 'undefined') return '';
    const candidates = ['audio/webm;codecs=opus', 'audio/webm', 'audio/ogg;codecs=opus', 'audio/mp4'];
    for (const mime of candidates) {
      if (!MediaRecorder.isTypeSupported || MediaRecorder.isTypeSupported(mime)) return mime;
    }
    return '';
  }

  async function startVoiceRecording() {
    if (voiceRecorder) return;
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia || typeof MediaRecorder === 'undefined') {
      showToast('Seu navegador não suporta gravação de mensagem de voz.', 'error');
      return;
    }

    try {
      voiceRecStream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
    } catch {
      showToast('Permita o microfone para gravar mensagem de voz.', 'error');
      return;
    }

    const mimeType = getSupportedAudioMime();
    voiceRecChunks = [];
    voiceRecorder = mimeType ? new MediaRecorder(voiceRecStream, { mimeType }) : new MediaRecorder(voiceRecStream);

    voiceRecorder.ondataavailable = (ev) => {
      if (ev.data && ev.data.size > 0) voiceRecChunks.push(ev.data);
    };

    voiceRecorder.start(200);
    voiceRecStartAt = Date.now();
    els.voiceRecTimer.textContent = 'Gravando 0:00';
    els.voiceRecBar.classList.remove('hidden');

    voiceRecTimerId = setInterval(() => {
      const sec = Math.floor((Date.now() - voiceRecStartAt) / 1000);
      const m = Math.floor(sec / 60);
      const s = String(sec % 60).padStart(2, '0');
      els.voiceRecTimer.textContent = `Gravando ${m}:${s}`;
      if (sec >= 60) finishAndSendVoiceRecording();
    }, 500);
  }

  function cleanupVoiceRecorderResources() {
    clearInterval(voiceRecTimerId);
    voiceRecTimerId = null;
    if (voiceRecStream) {
      voiceRecStream.getTracks().forEach((t) => t.stop());
      voiceRecStream = null;
    }
    voiceRecorder = null;
    els.voiceRecBar.classList.add('hidden');
  }

  function cancelVoiceRecording() {
    if (!voiceRecorder) return;
    try {
      voiceRecorder.ondataavailable = null;
      voiceRecorder.onstop = null;
      if (voiceRecorder.state !== 'inactive') voiceRecorder.stop();
    } catch {}
    cleanupVoiceRecorderResources();
  }

  function finishAndSendVoiceRecording() {
    if (!voiceRecorder) return;
    const rec = voiceRecorder;
    rec.onstop = () => {
      const blob = new Blob(voiceRecChunks, { type: rec.mimeType || 'audio/webm' });
      cleanupVoiceRecorderResources();
      if (blob.size < 400) return;

      const reader = new FileReader();
      reader.onload = () => {
        socket.emit(
          'chat-message',
          {
            text: '',
            audio: reader.result,
            replyToId: state.replyingToMsg ? state.replyingToMsg.id : null,
          },
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
      cleanupVoiceRecorderResources();
    }
  }

  els.recordVoiceMsgBtn.addEventListener('click', startVoiceRecording);
  els.cancelRecBtn.addEventListener('click', cancelVoiceRecording);
  els.sendRecBtn.addEventListener('click', finishAndSendVoiceRecording);

  // ==================== ENVIO DE TEXTO E IMAGEM ====================

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
    if (els.chatInput.value.trim().length > 0 && !state.editingMsgId) {
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
  els.emojiBtn.addEventListener('click', () => els.emojiBar.classList.toggle('hidden'));

  els.chatForm.addEventListener('submit', (e) => {
    e.preventDefault();
    const text = els.chatInput.value.trim();

    if (state.editingMsgId) {
      if (!text) return;
      const targetId = state.editingMsgId;
      clearComposerContext();
      socket.emit('chat-edit', { messageId: targetId, text }, (res) => {
        if (res && !res.ok && res.error) showToast(res.error, 'error');
      });
      return;
    }

    const image = state.pendingImageDataUrl;
    if (!text && !image) return;

    const replyToId = state.replyingToMsg ? state.replyingToMsg.id : null;
    socket.emit('chat-message', { text, image, replyToId }, (res) => {
      if (res && !res.ok && res.error) showToast(res.error, 'error');
    });

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

  function updatePttUiControls() {
    els.voiceModeSelect.value = state.voiceMode;
    els.pttKeyBox.classList.toggle('hidden', state.voiceMode !== 'ptt');
    els.pttBindBtn.textContent = `Tecla atual: ${state.pttKeyLabel} (clique para trocar)`;
  }

  async function openSettingsModal() {
    els.settingsModal.classList.remove('hidden');
    els.themeSelect.value = state.theme;
    updatePttUiControls();
    els.hostSecuritySection.classList.toggle('hidden', !isSelfHost());

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

    els.qualitySelect.value = voice.screenQuality;
  }

  function closeSettingsModal() {
    state.bindingPttKey = false;
    els.settingsModal.classList.add('hidden');
  }

  els.settingsBtn.addEventListener('click', openSettingsModal);
  els.closeSettingsBtn.addEventListener('click', closeSettingsModal);
  els.doneSettingsBtn.addEventListener('click', closeSettingsModal);
  els.settingsModal.addEventListener('click', (e) => {
    if (e.target === els.settingsModal) closeSettingsModal();
  });

  els.themeSelect.addEventListener('change', () => applyTheme(els.themeSelect.value));
  els.themeQuickBtn.addEventListener('click', () => {
    const nextIdx = (THEMES.indexOf(state.theme) + 1) % THEMES.length;
    applyTheme(THEMES[nextIdx]);
    showToast(`Tema: ${els.themeSelect.options[nextIdx]?.text || THEMES[nextIdx]}`, 'info');
  });

  els.voiceModeSelect.addEventListener('change', () => {
    state.voiceMode = els.voiceModeSelect.value;
    localStorage.setItem('resenha_voice_mode', state.voiceMode);
    voice.setPttMode(state.voiceMode === 'ptt');
    updatePttUiControls();
    renderMembers();
  });

  els.pttBindBtn.addEventListener('click', () => {
    state.bindingPttKey = true;
    els.pttBindBtn.textContent = 'Pressione qualquer tecla agora...';
  });

  els.micSelect.addEventListener('change', async () => {
    const res = await voice.switchMicrophone(els.micSelect.value);
    if (!res.ok) showToast(res.error || 'Erro ao trocar microfone.', 'error');
    else showToast('Microfone alterado!', 'success');
  });

  els.camSelect.addEventListener('change', async () => {
    const res = await voice.switchCamera(els.camSelect.value);
    if (!res.ok) showToast(res.error || 'Erro ao trocar câmera.', 'error');
    else showToast('Câmera selecionada!', 'success');
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
  els.leaveRoomBtn.addEventListener('click', () => leaveRoom());

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

  // ==================== TECLADO GLOBAL (ATALHOS E PUSH-TO-TALK) ====================

  function isTypingInField(target) {
    if (!target) return false;
    const tag = target.tagName;
    return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || target.isContentEditable;
  }

  document.addEventListener('keydown', (e) => {
    if (state.bindingPttKey) {
      e.preventDefault();
      state.bindingPttKey = false;
      if (e.key !== 'Escape') {
        state.pttKeyCode = e.code;
        state.pttKeyLabel = e.key === ' ' ? 'Espaço' : e.key.length === 1 ? e.key.toUpperCase() : e.key;
        localStorage.setItem('resenha_ptt_key', state.pttKeyCode);
        localStorage.setItem('resenha_ptt_label', state.pttKeyLabel);
      }
      updatePttUiControls();
      updateVoiceDockUI();
      return;
    }

    if (e.key === 'Escape') {
      if (state.editingMsgId || state.replyingToMsg) {
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

    if (state.voiceMode === 'ptt' && e.code === state.pttKeyCode && !isTypingInField(e.target)) {
      e.preventDefault();
      if (!e.repeat) {
        voice.setPttActive(true);
        renderMembers();
      }
    }
  });

  document.addEventListener('keyup', (e) => {
    if (state.voiceMode === 'ptt' && e.code === state.pttKeyCode) {
      voice.setPttActive(false);
      renderMembers();
    }
  });

  window.addEventListener('blur', () => {
    if (state.voiceMode === 'ptt') {
      voice.setPttActive(false);
      renderMembers();
    }
  });

  initLobby();
})();
