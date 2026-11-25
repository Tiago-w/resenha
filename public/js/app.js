// Controlador principal do Resenha (UI + Chat + Coordenação com VoiceManager)
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

  const ROOM_WORDS_A = ['resenha', 'squad', 'noite', 'cafe', 'combo', 'galera', 'festa', 'turbo', 'pixel', 'ponto'];
  const ROOM_WORDS_B = ['vip', 'gamer', 'top', 'azul', 'raiz', 'livre', 'pro', 'br', 'gold', 'max'];

  // Estado da aplicação
  const state = {
    roomCode: null,
    self: null,
    users: new Map(), // id -> user
    speakingIds: new Set(),
    typingUsers: new Map(), // id -> { name, timer }
    lastMessageMeta: null,
    pendingImageDataUrl: null,
    selectedColor: localStorage.getItem('resenha_color') || AVATAR_COLORS[0],
    activeScreenOwnerId: null,
    stageHiddenByUser: false,
    streamVolume: 0.8,
    soundsEnabled: localStorage.getItem('resenha_sounds') !== 'false',
  };

  // Referências DOM
  const els = {
    lobbyView: document.getElementById('lobby-view'),
    roomView: document.getElementById('room-view'),
    joinForm: document.getElementById('join-form'),
    nicknameInput: document.getElementById('nickname-input'),
    roomInput: document.getElementById('room-input'),
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
    micMeterFill: document.getElementById('mic-meter-fill'),
    leaveVoiceBtn: document.getElementById('leave-voice-btn'),
    muteBtn: document.getElementById('mute-btn'),
    muteBtnLabel: document.getElementById('mute-btn-label'),
    deafenBtn: document.getElementById('deafen-btn'),
    screenBtn: document.getElementById('screen-btn'),
    screenBtnLabel: document.getElementById('screen-btn-label'),
    settingsBtn: document.getElementById('settings-btn'),
    selfAvatar: document.getElementById('self-avatar'),
    selfName: document.getElementById('self-name'),
    leaveRoomBtn: document.getElementById('leave-room-btn'),
    copyInviteSidebarBtn: document.getElementById('copy-invite-sidebar-btn'),
    copyInviteTopBtn: document.getElementById('copy-invite-top-btn'),
    soundToggleBtn: document.getElementById('sound-toggle-btn'),
    audioUnlockBanner: document.getElementById('audio-unlock-banner'),
    unlockAudioBtn: document.getElementById('unlock-audio-btn'),

    workspace: document.getElementById('workspace'),
    screenStage: document.getElementById('screen-stage'),
    screenTabs: document.getElementById('screen-tabs'),
    stageVideo: document.getElementById('stage-video'),
    stageCanvas: document.getElementById('stage-canvas'),
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
    imagePreviewBar: document.getElementById('image-preview-bar'),
    imagePreviewThumb: document.getElementById('image-preview-thumb'),
    imagePreviewName: document.getElementById('image-preview-name'),
    removeImageBtn: document.getElementById('remove-image-btn'),
    emojiBar: document.getElementById('emoji-bar'),
    chatForm: document.getElementById('chat-form'),
    chatInput: document.getElementById('chat-input'),
    attachBtn: document.getElementById('attach-btn'),
    imageFileInput: document.getElementById('image-file-input'),
    emojiBtn: document.getElementById('emoji-btn'),

    settingsModal: document.getElementById('settings-modal'),
    closeSettingsBtn: document.getElementById('close-settings-btn'),
    doneSettingsBtn: document.getElementById('done-settings-btn'),
    micSelect: document.getElementById('mic-select'),
    qualitySelect: document.getElementById('quality-select'),

    lightboxModal: document.getElementById('lightbox-modal'),
    lightboxImg: document.getElementById('lightbox-img'),
    closeLightboxBtn: document.getElementById('close-lightbox-btn'),

    toastContainer: document.getElementById('toast-container'),
  };

  // Inicializa sons e socket
  window.ResenhaSounds.enabled = state.soundsEnabled;
  const socket = io({ autoConnect: true });

  let relayCanvasBusy = false;
  let lastStageResLabel = '';
  const stageCanvasCtx = els.stageCanvas.getContext('2d', { alpha: false });

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

  async function drawRelayFrame(ownerId, frameBuffer, width, height) {
    if (ownerId !== state.activeScreenOwnerId || state.stageHiddenByUser) return;
    if (relayCanvasBusy) return;
    relayCanvasBusy = true;
    try {
      const blob = new Blob([frameBuffer], { type: 'image/webp' });
      if (typeof createImageBitmap === 'function') {
        const bitmap = await createImageBitmap(blob);
        if (els.stageCanvas.width !== bitmap.width || els.stageCanvas.height !== bitmap.height) {
          els.stageCanvas.width = bitmap.width;
          els.stageCanvas.height = bitmap.height;
        }
        stageCanvasCtx.drawImage(bitmap, 0, 0);
        updateStageBadgeWithResolution(bitmap.width, bitmap.height);
        bitmap.close();
      } else {
        const url = URL.createObjectURL(blob);
        await new Promise((resolve) => {
          const img = new Image();
          img.onload = () => {
            const w = width || img.width;
            const h = height || img.height;
            if (els.stageCanvas.width !== w || els.stageCanvas.height !== h) {
              els.stageCanvas.width = w;
              els.stageCanvas.height = h;
            }
            stageCanvasCtx.drawImage(img, 0, 0);
            updateStageBadgeWithResolution(w, h);
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
    } catch {}
    relayCanvasBusy = false;
  }

  const voice = new window.VoiceManager({
    socket,
    getUserMeta: (id) => state.users.get(id),
    onScreenStreamsChanged: () => renderScreenStage(),
    onRelayScreenFrame: (ownerId, frame, w, h) => drawRelayFrame(ownerId, frame, w, h),
    onSpeakingChange: (userId, isSpeaking) => {
      if (isSpeaking) state.speakingIds.add(userId);
      else state.speakingIds.delete(userId);
      updateSpeakingAvatar(userId, isSpeaking);
    },
    onLocalMicLevel: (pct) => {
      if (els.micMeterFill) els.micMeterFill.style.width = `${pct}%`;
    },
    onPeerStateChange: () => {
      renderMembers();
    },
    onAutoplayBlocked: (blocked) => {
      els.audioUnlockBanner.classList.toggle('hidden', !blocked);
    },
    onStateChange: () => updateVoiceDockUI(),
    onToast: (msg, type) => showToast(msg, type),
  });

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
        () => showToast('Link de convite copiado! Mande pros seus amigos.', 'success'),
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

  // ==================== LOBBY INIT ====================

  function initLobby() {
    const savedName = localStorage.getItem('resenha_name');
    if (savedName) els.nicknameInput.value = savedName;

    // Monta seletor de cores
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

    // Monta barra de emojis
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
      els.nicknameInput.focus();
    } else {
      els.roomInput.value = generateRoomCode();
      els.nicknameInput.focus();
    }

    updateSoundToggleIcon();
  }

  els.generateRoomBtn.addEventListener('click', () => {
    els.roomInput.value = generateRoomCode();
    els.inviteBanner.classList.add('hidden');
  });

  els.joinForm.addEventListener('submit', (e) => {
    e.preventDefault();
    els.lobbyError.classList.add('hidden');

    const name = els.nicknameInput.value.trim();
    const roomCode = els.roomInput.value.trim();
    if (!name || !roomCode) return;

    els.joinBtn.disabled = true;
    els.joinBtn.textContent = 'Entrando...';

    socket.emit('join-room', { name, roomCode, color: state.selectedColor }, (res) => {
      els.joinBtn.disabled = false;
      els.joinBtn.textContent = 'Entrar na Sala';

      if (!res || !res.ok) {
        els.lobbyError.textContent = res?.error || 'Erro ao entrar na sala.';
        els.lobbyError.classList.remove('hidden');
        return;
      }

      localStorage.setItem('resenha_name', name);
      enterRoomUI(res);
    });
  });

  function enterRoomUI(data) {
    state.roomCode = data.roomCode;
    state.self = data.self;
    state.users.clear();
    (data.users || []).forEach((u) => state.users.set(u.id, u));
    voice.setSelfId(data.self.id);

    // Atualiza URL para facilitar compartilhar
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

    renderMessagesFull(data.messages || []);
    renderMembers();
    updateVoiceDockUI();
    renderScreenStage();

    window.ResenhaSounds.playJoin();
    els.chatInput.focus();
  }

  function leaveRoom() {
    voice.leaveVoice({ notifyServer: true });
    socket.disconnect();
    socket.connect();

    state.roomCode = null;
    state.self = null;
    state.users.clear();
    state.speakingIds.clear();
    state.typingUsers.clear();
    state.activeScreenOwnerId = null;
    state.stageHiddenByUser = false;

    window.history.replaceState({}, '', '/');
    els.roomView.classList.add('hidden');
    els.lobbyView.classList.remove('hidden');
    closeMobileSidebar();
  }

  // ==================== SOCKET EVENTS ====================

  socket.on('user-joined', ({ user, systemMessage }) => {
    if (!user) return;
    state.users.set(user.id, user);
    renderMembers();
    if (systemMessage) appendMessage(systemMessage);
    window.ResenhaSounds.playJoin();
  });

  socket.on('user-left', ({ userId, systemMessage }) => {
    state.users.delete(userId);
    state.speakingIds.delete(userId);
    clearTypingUser(userId);
    renderMembers();
    if (systemMessage) appendMessage(systemMessage);
    window.ResenhaSounds.playLeave();
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
    renderScreenStage();
  });

  socket.on('chat-message', (msg) => {
    appendMessage(msg);
    if (msg.senderId && msg.senderId !== state.self?.id) {
      clearTypingUser(msg.senderId);
      window.ResenhaSounds.playMessage();
    }
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
    // Se reconectar automaticamente após queda rápida, reentra na sala
    if (state.roomCode && state.self && !els.roomView.classList.contains('hidden')) {
      const wasInVoice = voice.inVoice;
      const wasListenOnly = voice.listenOnly;
      if (wasInVoice) voice.leaveVoice({ notifyServer: false });

      socket.emit(
        'join-room',
        { name: state.self.name, roomCode: state.roomCode, color: state.self.color },
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

  // ==================== MEMBROS E VOZ UI ====================

  function renderMembers() {
    const allUsers = Array.from(state.users.values()).sort((a, b) => a.joinedAt - b.joinedAt);
    const voiceUsers = allUsers.filter((u) => u.inVoice);

    els.onlineCount.textContent = `${allUsers.length} ${allUsers.length === 1 ? 'online' : 'online'}`;
    els.voiceCountBadge.textContent = String(voiceUsers.length);
    els.membersCountBadge.textContent = String(allUsers.length);

    // Lista do canal de voz
    els.voiceMembersList.innerHTML = '';
    voiceUsers.forEach((u) => {
      const isSelf = state.self && u.id === state.self.id;
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
      nameEl.textContent = u.name;
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

      // Status da conexão WebRTC + controle de volume individual para amigos na voz
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
            showToast(`Tentando reconectar voz com ${u.name}...`, 'info');
          });
          connRow.appendChild(retryBtn);
        }
        li.appendChild(connRow);

        if (connState !== 'connected') {
          const diag = voice.getPeerDiagnostics(u.id);
          if (diag) {
            const diagRow = document.createElement('div');
            diagRow.className = 'peer-diag-row';
            diagRow.textContent = `sig:${diag.sig} • ice:${diag.ice} • cand:${diag.localCand}/${diag.remoteCand} • TURN:${diag.hasTurn ? 'on' : 'off'}`;
            li.appendChild(diagRow);
          }
        }

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
      nameEl.textContent = u.name;
      if (isSelf) {
        const tag = document.createElement('span');
        tag.className = 'self-tag';
        tag.textContent = '(você)';
        nameEl.appendChild(tag);
      }
      nameWrap.appendChild(nameEl);

      row.appendChild(avatar);
      row.appendChild(nameWrap);
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

  function updateSpeakingAvatar(userId, isSpeaking) {
    const avatars = els.voiceMembersList.querySelectorAll(`[data-avatar-user-id="${CSS.escape(userId)}"]`);
    avatars.forEach((el) => el.classList.toggle('speaking', isSpeaking));
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
      els.voiceStatusTitle.textContent = 'Áudio ensurdecido';
      els.voiceStatusSub.textContent = 'Microfone e som pausados';
    } else if (voice.listenOnly) {
      els.voiceStatusTitle.textContent = 'Só ouvindo';
      els.voiceStatusSub.textContent = 'Clique em Mic para falar';
    } else if (voice.muted) {
      els.voiceStatusTitle.textContent = 'Voz conectada';
      els.voiceStatusSub.textContent = 'Microfone silenciado';
    } else {
      els.voiceStatusTitle.textContent = 'Voz conectada';
      els.voiceStatusSub.textContent = voice.screenSharing ? 'Transmitindo tela' : 'Microfone ativo';
    }

    // Botão Mic
    const micOff = voice.muted || voice.listenOnly;
    els.muteBtn.classList.toggle('danger-active', micOff);
    els.muteBtn.querySelector('.icon-on').classList.toggle('hidden', micOff);
    els.muteBtn.querySelector('.icon-off').classList.toggle('hidden', !micOff);
    els.muteBtnLabel.textContent = voice.listenOnly ? 'Ativar' : voice.muted ? 'Mudo' : 'Mic';

    // Botão Deafen
    els.deafenBtn.classList.toggle('danger-active', voice.deafened);
    els.deafenBtn.querySelector('.icon-on').classList.toggle('hidden', voice.deafened);
    els.deafenBtn.querySelector('.icon-off').classList.toggle('hidden', !voice.deafened);

    // Botão Tela
    els.screenBtn.classList.toggle('live-active', voice.screenSharing);
    els.screenBtnLabel.textContent = voice.screenSharing ? 'Parar' : 'Tela';
  }

  // ==================== PALCO DE TRANSMISSÃO DE TELA ====================

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

    // Garante que o dono selecionado ainda está transmitindo
    let active = shares.find((s) => s.ownerId === state.activeScreenOwnerId);
    if (!active) {
      active = shares[0];
      state.activeScreenOwnerId = active.ownerId;
    }
    voice.setActiveScreenOwner(active.ownerId);

    // Atualiza pílula na barra superior
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

    // Abas para trocar entre múltiplas telas
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

    // Define mute/volume ANTES de dar play (nunca reproduz o próprio áudio da tela)
    const showAudioSlider = !active.isSelf && active.hasAudio;
    els.streamAudioControl.classList.toggle('hidden', !showAudioSlider);
    const shouldMute = active.isSelf || voice.deafened;

    if (active.isRelay) {
      // Modo Ponte pelo servidor: renderiza frames WebP no canvas + áudio PCM pelo AudioContext
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

  // ==================== CONTROLES DE VOZ & TELA ====================

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
      } else {
        showToast('Picture-in-Picture não disponível neste navegador.', 'info');
      }
    } catch {
      showToast('Não foi possível abrir Picture-in-Picture.', 'error');
    }
  });

  els.fullscreenBtn.addEventListener('click', () => {
    const wrap = els.stageVideo.parentElement;
    if (!document.fullscreenElement) {
      (wrap.requestFullscreen || els.stageVideo.requestFullscreen)?.call(wrap);
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

  // ==================== CHAT ====================

  function renderMessagesFull(messages) {
    els.messagesList.innerHTML = '';
    state.lastMessageMeta = null;

    const welcome = document.createElement('div');
    welcome.className = 'welcome-card';
    welcome.innerHTML = `
      <h3>Bem-vindo à sala #${escapeHtml(state.roomCode)}</h3>
      <p>Converse por aqui, entre no canal de voz ao lado ou transmita sua tela para seus amigos. Você também pode colar prints direto com <strong>Ctrl + V</strong>.</p>
    `;
    els.messagesList.appendChild(welcome);

    messages.forEach((m) => appendMessage(m, { autoScroll: false }));
    scrollChatToBottom(true);
  }

  function escapeHtml(str) {
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
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
      const canGroup =
        state.lastMessageMeta &&
        state.lastMessageMeta.senderId === msg.senderId &&
        msg.timestamp - state.lastMessageMeta.timestamp < 5 * 60 * 1000;

      const row = document.createElement('div');
      row.className = canGroup ? 'msg-continuation' : 'msg-group';

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

      row.appendChild(gutter);
      row.appendChild(body);
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

  // Envio de mensagem + imagens + digitação
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
    if (els.chatInput.value.trim().length > 0) {
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
    const image = state.pendingImageDataUrl;
    if (!text && !image) return;

    socket.emit('chat-message', { text, image }, (res) => {
      if (res && !res.ok && res.error) {
        showToast(res.error, 'error');
      }
    });

    els.chatInput.value = '';
    autoResizeTextarea();
    clearPendingImage();
    els.emojiBar.classList.add('hidden');
    if (typingSent) {
      typingSent = false;
      clearTimeout(typingStopTimer);
      socket.emit('typing', { isTyping: false });
    }
  });

  // ==================== CONFIGURAÇÕES, LIGHTBOX E ATALHOS ====================

  async function openSettingsModal() {
    els.settingsModal.classList.remove('hidden');
    const mics = await voice.listMicrophones();
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
    els.qualitySelect.value = voice.screenQuality;
  }

  function closeSettingsModal() {
    els.settingsModal.classList.add('hidden');
  }

  els.settingsBtn.addEventListener('click', openSettingsModal);
  els.closeSettingsBtn.addEventListener('click', closeSettingsModal);
  els.doneSettingsBtn.addEventListener('click', closeSettingsModal);
  els.settingsModal.addEventListener('click', (e) => {
    if (e.target === els.settingsModal) closeSettingsModal();
  });

  els.micSelect.addEventListener('change', async () => {
    const res = await voice.switchMicrophone(els.micSelect.value);
    if (!res.ok) {
      showToast(res.error || 'Erro ao trocar microfone.', 'error');
    } else {
      showToast('Microfone alterado!', 'success');
    }
  });

  const savedQuality = localStorage.getItem('resenha_screen_quality');
  if (savedQuality) {
    voice.setScreenQuality(savedQuality);
  }

  els.qualitySelect.addEventListener('change', async () => {
    const val = els.qualitySelect.value;
    localStorage.setItem('resenha_screen_quality', val);
    await voice.setScreenQuality(val);
    showToast(
      voice.screenSharing ? 'Qualidade atualizada ao vivo!' : 'Qualidade salva!',
      'success'
    );
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

  // Atalhos de teclado
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      closeSettingsModal();
      closeLightbox();
      els.emojiBar.classList.add('hidden');
      closeMobileSidebar();
      return;
    }
    if (!voice.inVoice) return;
    if (e.altKey && (e.key === 'm' || e.key === 'M')) {
      e.preventDefault();
      els.muteBtn.click();
    } else if (e.altKey && (e.key === 'd' || e.key === 'D')) {
      e.preventDefault();
      els.deafenBtn.click();
    }
  });

  initLobby();
})();
