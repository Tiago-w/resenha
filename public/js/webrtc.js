// Gerenciador Híbrido 2.0: Voz + Webcam + Tela 4K + Push-to-Talk + Ping + Ponte Automática
(function (global) {
  const QUALITY_PRESETS = {
    '720p30': { width: { ideal: 1280, max: 1280 }, height: { ideal: 720, max: 720 }, frameRate: { ideal: 30, max: 30 }, maxBitrate: 3_000_000, contentHint: 'motion', relayMaxWidth: 960, relayFps: 12, relayQuality: 0.6 },
    '1080p30': { width: { ideal: 1920, max: 1920 }, height: { ideal: 1080, max: 1080 }, frameRate: { ideal: 30, max: 30 }, maxBitrate: 6_000_000, contentHint: 'detail', relayMaxWidth: 1280, relayFps: 12, relayQuality: 0.65 },
    '1080p60': { width: { ideal: 1920, max: 1920 }, height: { ideal: 1080, max: 1080 }, frameRate: { ideal: 60, max: 60 }, maxBitrate: 9_000_000, contentHint: 'motion', relayMaxWidth: 1920, relayFps: 15, relayQuality: 0.68 },
    '1440p30': { width: { ideal: 2560, max: 2560 }, height: { ideal: 1440, max: 1440 }, frameRate: { ideal: 30, max: 30 }, maxBitrate: 12_000_000, contentHint: 'detail', relayMaxWidth: 2560, relayFps: 12, relayQuality: 0.74 },
    '4k30': { width: { ideal: 3840, max: 3840 }, height: { ideal: 2160, max: 2160 }, frameRate: { ideal: 30, max: 30 }, maxBitrate: 16_000_000, contentHint: 'detail', relayMaxWidth: 3840, relayFps: 12, relayQuality: 0.8 },
    '4k60': { width: { ideal: 3840, max: 3840 }, height: { ideal: 2160, max: 2160 }, frameRate: { ideal: 60, max: 60 }, maxBitrate: 24_000_000, contentHint: 'motion', relayMaxWidth: 3840, relayFps: 15, relayQuality: 0.8 },
  };

  const RELAY_FALLBACK_MS = 3500;
  const VOICE_RELAY_RATE = 16000;
  const SCREEN_AUDIO_RELAY_RATE = 24000;

  class VoiceManager {
    constructor(options) {
      this.socket = options.socket;
      this.getUserMeta = options.getUserMeta;
      this.onScreenStreamsChanged = options.onScreenStreamsChanged || (() => {});
      this.onRelayScreenFrame = options.onRelayScreenFrame || (() => {});
      this.onCamerasChanged = options.onCamerasChanged || (() => {});
      this.onRelayCamFrame = options.onRelayCamFrame || (() => {});
      this.onSpeakingChange = options.onSpeakingChange || (() => {});
      this.onLocalMicLevel = options.onLocalMicLevel || (() => {});
      this.onPeerStateChange = options.onPeerStateChange || (() => {});
      this.onAutoplayBlocked = options.onAutoplayBlocked || (() => {});
      this.onLatencyUpdate = options.onLatencyUpdate || (() => {});
      this.onStateChange = options.onStateChange || (() => {});
      this.onToast = options.onToast || (() => {});

      this.myId = null;
      this.inVoice = false;
      this.muted = false;
      this.deafened = false;
      this.listenOnly = false;
      this.cameraOn = false;
      this.screenSharing = false;
      this.selectedMicId = '';
      this.selectedCamId = '';
      this.screenQuality = '1080p30';
      this.activeScreenOwnerId = null;
      this.streamVolume = 0.8;

      // Push-to-Talk
      this.pttEnabled = false;
      this.pttPressed = false;
      this._pttReleaseTimer = null;

      // Ping em ms
      this.latencyMs = null;
      this._pingInterval = null;

      this.iceServers = [
        { urls: 'stun:stun.l.google.com:19302' },
        { urls: 'stun:stun1.l.google.com:19302' },
      ];
      this.hasTurn = false;

      this.localVoiceStream = null;
      this.localCameraStream = null;
      this.localScreenStream = null;

      this.peers = new Map();
      this.peerVolumes = new Map();

      this.audioCtx = null;
      this.workletLoaded = false;
      this.analysers = new Map();
      this.vadTimer = null;

      this._voiceRelayCapture = null;
      this._voiceHangoverUntil = 0;
      this._camRelayCapture = null;
      this._screenRelayCapture = null;
      this._screenAudioRelayCapture = null;
      this._screenAudioGain = null;
      this._screenAudioNextTime = 0;

      this.audioContainer = document.getElementById('remote-audios');

      this._bindSocketEvents();
      this._iceConfigPromise = this._loadIceConfig();
    }

    async _loadIceConfig() {
      try {
        const res = await fetch('/api/ice-config');
        if (res.ok) {
          const data = await res.json();
          if (Array.isArray(data.iceServers) && data.iceServers.length > 0) {
            this.iceServers = data.iceServers;
            this.hasTurn = Boolean(data.hasTurn);
          }
        }
      } catch {}
    }

    startLatencyMonitor() {
      this.stopLatencyMonitor();
      const measure = () => {
        if (!this.socket.connected) return;
        const t0 = performance.now();
        this.socket.emit('ping-check', () => {
          this.latencyMs = Math.max(1, Math.round(performance.now() - t0));
          this.onLatencyUpdate(this.latencyMs);
        });
      };
      measure();
      this._pingInterval = setInterval(measure, 4000);
    }

    stopLatencyMonitor() {
      if (this._pingInterval) {
        clearInterval(this._pingInterval);
        this._pingInterval = null;
      }
      this.latencyMs = null;
    }

    _bindSocketEvents() {
      this.socket.on('voice-user-joined', (user) => {
        if (!this.inVoice || !user || user.id === this.myId) return;
        this._ensurePeer(user.id);
      });

      this.socket.on('voice-user-left', ({ userId }) => {
        if (!userId) return;
        this._removePeer(userId);
      });

      this.socket.on('user-updated', (user) => {
        if (!user || user.id === this.myId) return;
        const peer = this.peers.get(user.id);
        if (!peer) return;

        if (!user.screenSharing && (peer.screenStream || peer.relayScreenActive)) {
          peer.screenStream = null;
          peer.relayScreenActive = false;
          peer.relayScreenHasAudio = false;
          this.onScreenStreamsChanged();
        }
        if (!user.cameraOn && (peer.cameraStream || peer.relayCamActive)) {
          peer.cameraStream = null;
          peer.relayCamActive = false;
          this.onCamerasChanged();
        }
      });

      this.socket.on('webrtc-signal', ({ from, description, candidate }) => {
        if (!this.inVoice || !from || from === this.myId) return;
        const peer = this._ensurePeer(from);

        peer.signalQueue = peer.signalQueue
          .then(() => this._handleSignal(peer, description, candidate))
          .catch((err) => {
            console.error('[WebRTC] Erro de sinalização com', from, err);
          });
      });

      // ==================== RECEBIMENTO DA PONTE (SERVIDOR) ====================
      this.socket.on('relay-voice', ({ from, chunk }) => {
        if (!this.inVoice || !from || from === this.myId || !chunk) return;
        const peer = this.peers.get(from);
        if (!peer) return;
        if (this._isPeerWebRtcConnected(peer)) return;

        if (peer.transport !== 'relay') {
          this._activateRelayForPeer(peer);
        }
        this._playRelayVoiceChunk(peer, chunk);
      });

      this.socket.on('relay-cam-frame', ({ from, frame, width, height }) => {
        if (!this.inVoice || !from || from === this.myId || !frame) return;
        const peer = this.peers.get(from);
        if (!peer) return;
        if (this._isPeerWebRtcConnected(peer) && peer.cameraStream) return;

        if (peer.transport !== 'relay') {
          this._activateRelayForPeer(peer);
        }

        const wasActive = peer.relayCamActive;
        peer.relayCamActive = true;
        if (!wasActive) {
          this.onCamerasChanged();
        }
        this.onRelayCamFrame(from, frame, width, height);
      });

      this.socket.on('relay-screen-frame', ({ from, frame, width, height, hasAudio }) => {
        if (!this.inVoice || !from || from === this.myId || !frame) return;
        const peer = this.peers.get(from);
        if (!peer) return;
        if (this._isPeerWebRtcConnected(peer) && peer.screenStream) return;

        if (peer.transport !== 'relay') {
          this._activateRelayForPeer(peer);
        }

        const wasActive = peer.relayScreenActive;
        const audioChanged = peer.relayScreenHasAudio !== Boolean(hasAudio);
        peer.relayScreenActive = true;
        peer.relayScreenHasAudio = Boolean(hasAudio);

        if (!wasActive || audioChanged) {
          this.onScreenStreamsChanged();
        }
        this.onRelayScreenFrame(from, frame, width, height);
      });

      this.socket.on('relay-screen-audio', ({ from, chunk }) => {
        if (!this.inVoice || !from || from === this.myId || !chunk) return;
        if (this.deafened || from !== this.activeScreenOwnerId) return;
        const peer = this.peers.get(from);
        if (!peer) return;
        if (this._isPeerWebRtcConnected(peer) && peer.screenStream) return;

        this._playRelayScreenAudioChunk(chunk);
      });
    }

    async _handleSignal(peer, description, candidate) {
      const { pc, peerId } = peer;
      if (pc.signalingState === 'closed') return;

      if (description) {
        const readyForOffer =
          !peer.makingOffer &&
          (pc.signalingState === 'stable' || peer.isSettingRemoteAnswerPending);
        const offerCollision = description.type === 'offer' && !readyForOffer;

        peer.ignoreOffer = !peer.polite && offerCollision;
        if (peer.ignoreOffer) return;

        peer.isSettingRemoteAnswerPending = description.type === 'answer';
        await pc.setRemoteDescription(description);
        peer.isSettingRemoteAnswerPending = false;
        peer.established = true;

        if (peer.pendingCandidates.length > 0) {
          const queued = peer.pendingCandidates.splice(0);
          for (const c of queued) {
            try {
              await pc.addIceCandidate(c);
            } catch {}
          }
        }

        if (description.type === 'offer') {
          await pc.setLocalDescription();
          this.socket.emit('webrtc-signal', {
            to: peerId,
            description: {
              type: pc.localDescription.type,
              sdp: pc.localDescription.sdp,
            },
          });
        }
        this.onPeerStateChange(peerId, peer.connectionState);
      } else if (candidate) {
        if (peer.ignoreOffer) return;
        peer.remoteCandCount += 1;
        if (!pc.remoteDescription || !pc.remoteDescription.type) {
          peer.pendingCandidates.push(candidate);
          return;
        }
        try {
          await pc.addIceCandidate(candidate);
        } catch {}
        this.onPeerStateChange(peerId, peer.connectionState);
      }
    }

    setSelfId(id) {
      this.myId = id;
    }

    setActiveScreenOwner(ownerId) {
      this.activeScreenOwnerId = ownerId;
    }

    setStreamVolume(vol0to1) {
      this.streamVolume = Math.max(0, Math.min(1, Number(vol0to1)));
      if (this._screenAudioGain) {
        this._screenAudioGain.gain.value = this.deafened ? 0 : this.streamVolume;
      }
    }

    // ==================== PUSH-TO-TALK ====================

    setPttMode(enabled) {
      this.pttEnabled = Boolean(enabled);
      clearTimeout(this._pttReleaseTimer);
      this.pttPressed = false;
      if (this.inVoice && !this.listenOnly && !this.deafened) {
        this.muted = this.pttEnabled;
        this._applyLocalMicEnabled();
        this._emitMediaState();
        this.onStateChange();
      }
    }

    setPttActive(pressed) {
      if (!this.inVoice || !this.pttEnabled || this.listenOnly || this.deafened) return;
      clearTimeout(this._pttReleaseTimer);

      if (pressed) {
        if (this.pttPressed && !this.muted) return;
        this.pttPressed = true;
        this.muted = false;
        this._applyLocalMicEnabled();
        this._emitMediaState();
        this.onStateChange();
      } else {
        this.pttPressed = false;
        // Mantém 120 ms extras para não cortar o final da frase
        this._pttReleaseTimer = setTimeout(() => {
          if (!this.pttPressed && this.pttEnabled && this.inVoice && !this.listenOnly) {
            this.muted = true;
            this._applyLocalMicEnabled();
            this._emitMediaState();
            this.onStateChange();
          }
        }, 120);
      }
    }

    async listMicrophones() {
      if (!navigator.mediaDevices || !navigator.mediaDevices.enumerateDevices) return [];
      try {
        const devices = await navigator.mediaDevices.enumerateDevices();
        return devices.filter((d) => d.kind === 'audioinput');
      } catch {
        return [];
      }
    }

    async listCameras() {
      if (!navigator.mediaDevices || !navigator.mediaDevices.enumerateDevices) return [];
      try {
        const devices = await navigator.mediaDevices.enumerateDevices();
        return devices.filter((d) => d.kind === 'videoinput');
      } catch {
        return [];
      }
    }

    async joinVoice({ listenOnly = false } = {}) {
      if (this.inVoice) return { ok: true };

      await this._iceConfigPromise;

      this.listenOnly = Boolean(listenOnly);
      this.muted = this.listenOnly || this.pttEnabled;
      this.deafened = false;

      if (!this.listenOnly) {
        try {
          this.localVoiceStream = await this._captureMicrophone(this.selectedMicId);
          this._applyLocalMicEnabled();
        } catch (err) {
          return { ok: false, error: this._friendlyMediaError(err, 'microfone') };
        }
      }

      this._ensureAudioCtx();

      this.inVoice = true;
      this._startVADLoop();
      if (this.localVoiceStream) {
        this._attachAnalyser(this.myId, this.localVoiceStream);
      }

      const response = await new Promise((resolve) => {
        this.socket.emit(
          'voice-join',
          {
            muted: this.muted,
            deafened: this.deafened,
            listenOnly: this.listenOnly,
            voiceStreamId: this.localVoiceStream ? this.localVoiceStream.id : null,
          },
          resolve
        );
      });

      if (!response || !response.ok) {
        this.inVoice = false;
        this._cleanupLocalVoice();
        return { ok: false, error: response?.error || 'Não foi possível entrar na voz.' };
      }

      for (const peerUser of response.voicePeers || []) {
        if (peerUser.id !== this.myId) {
          this._ensurePeer(peerUser.id);
        }
      }

      this._syncRelaySenders();
      this.onStateChange();
      return { ok: true };
    }

    async enableMicrophone() {
      if (!this.inVoice || !this.listenOnly) return { ok: true };

      try {
        this.localVoiceStream = await this._captureMicrophone(this.selectedMicId);
      } catch (err) {
        return { ok: false, error: this._friendlyMediaError(err, 'microfone') };
      }

      this.listenOnly = false;
      this.muted = this.pttEnabled && !this.pttPressed;
      this._applyLocalMicEnabled();
      this._attachAnalyser(this.myId, this.localVoiceStream);

      this._emitMediaState();

      for (const peer of this.peers.values()) {
        for (const track of this.localVoiceStream.getTracks()) {
          const sender = peer.pc.addTrack(track, this.localVoiceStream);
          peer.voiceSenders.push(sender);
        }
      }

      this._syncRelaySenders();
      this.onStateChange();
      return { ok: true };
    }

    async switchMicrophone(deviceId) {
      this.selectedMicId = deviceId || '';
      if (!this.inVoice || this.listenOnly || !this.localVoiceStream) return { ok: true };

      try {
        const newStream = await this._captureMicrophone(this.selectedMicId);
        const newTrack = newStream.getAudioTracks()[0];
        if (!newTrack) return { ok: false, error: 'Nenhuma faixa de áudio encontrada.' };

        newTrack.enabled = !this.muted && !this.deafened;

        for (const peer of this.peers.values()) {
          for (const sender of peer.voiceSenders) {
            if (sender.track && sender.track.kind === 'audio') {
              await sender.replaceTrack(newTrack);
            }
          }
        }

        this.localVoiceStream.getTracks().forEach((t) => t.stop());
        this.localVoiceStream = newStream;
        this._detachAnalyser(this.myId);
        this._attachAnalyser(this.myId, this.localVoiceStream);

        if (this._voiceRelayCapture) {
          this._stopRelayVoiceCapture();
          this._startRelayVoiceCapture();
        }

        this._emitMediaState();
        return { ok: true };
      } catch (err) {
        return { ok: false, error: this._friendlyMediaError(err, 'microfone') };
      }
    }

    // ==================== WEBCAM ====================

    async toggleCamera() {
      if (this.cameraOn) {
        this.stopCamera();
        return { ok: true, cameraOn: false };
      }
      return this.startCamera();
    }

    async startCamera() {
      if (!this.inVoice) {
        return { ok: false, error: 'Entre no canal de voz primeiro para ligar a câmera.' };
      }
      if (this.cameraOn) return { ok: true, cameraOn: true };
      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        return { ok: false, error: 'Navegador sem suporte a câmera.' };
      }

      const videoConstraints = {
        width: { ideal: 640, max: 1280 },
        height: { ideal: 360, max: 720 },
        frameRate: { ideal: 24, max: 30 },
      };
      if (this.selectedCamId) {
        videoConstraints.deviceId = { exact: this.selectedCamId };
      }

      let stream;
      try {
        stream = await navigator.mediaDevices.getUserMedia({ video: videoConstraints, audio: false });
      } catch (err) {
        return { ok: false, error: this._friendlyMediaError(err, 'câmera') };
      }

      this.localCameraStream = stream;
      this.cameraOn = true;

      const track = stream.getVideoTracks()[0];
      if (track) {
        track.onended = () => this.stopCamera();
      }

      this._emitMediaState();

      for (const peer of this.peers.values()) {
        for (const t of stream.getTracks()) {
          const sender = peer.pc.addTrack(t, stream);
          peer.cameraSenders.push(sender);
        }
      }

      this._syncRelaySenders();
      this.onCamerasChanged();
      this.onStateChange();
      return { ok: true, cameraOn: true };
    }

    stopCamera({ notifyServer = true } = {}) {
      if (!this.cameraOn && !this.localCameraStream) return;

      this._stopRelayCamCapture();

      for (const peer of this.peers.values()) {
        for (const sender of peer.cameraSenders) {
          try {
            peer.pc.removeTrack(sender);
          } catch {}
        }
        peer.cameraSenders = [];
      }

      if (this.localCameraStream) {
        this.localCameraStream.getTracks().forEach((t) => {
          t.onended = null;
          t.stop();
        });
        this.localCameraStream = null;
      }

      this.cameraOn = false;
      if (notifyServer) {
        this._emitMediaState();
      }
      this.onCamerasChanged();
      this.onStateChange();
    }

    async switchCamera(deviceId) {
      this.selectedCamId = deviceId || '';
      if (!this.inVoice || !this.cameraOn || !this.localCameraStream) return { ok: true };

      try {
        const videoConstraints = {
          width: { ideal: 640, max: 1280 },
          height: { ideal: 360, max: 720 },
          frameRate: { ideal: 24, max: 30 },
        };
        if (this.selectedCamId) videoConstraints.deviceId = { exact: this.selectedCamId };
        const newStream = await navigator.mediaDevices.getUserMedia({ video: videoConstraints, audio: false });
        const newTrack = newStream.getVideoTracks()[0];
        if (!newTrack) return { ok: false, error: 'Câmera não encontrada.' };

        newTrack.onended = () => this.stopCamera();

        for (const peer of this.peers.values()) {
          for (const sender of peer.cameraSenders) {
            if (sender.track && sender.track.kind === 'video') {
              await sender.replaceTrack(newTrack);
            }
          }
        }

        this.localCameraStream.getTracks().forEach((t) => t.stop());
        this.localCameraStream = newStream;

        if (this._camRelayCapture) {
          this._stopRelayCamCapture();
          this._startRelayCamCapture();
        }

        this._emitMediaState();
        this.onCamerasChanged();
        return { ok: true };
      } catch (err) {
        return { ok: false, error: this._friendlyMediaError(err, 'câmera') };
      }
    }

    getActiveCameras() {
      const list = [];
      if (this.localCameraStream) {
        list.push({
          ownerId: this.myId,
          isSelf: true,
          isRelay: false,
          stream: this.localCameraStream,
        });
      }
      for (const [peerId, peer] of this.peers.entries()) {
        const webrtcLive =
          this._isPeerWebRtcConnected(peer) &&
          peer.cameraStream &&
          peer.cameraStream.getVideoTracks().some((t) => t.readyState === 'live');
        if (webrtcLive) {
          list.push({
            ownerId: peerId,
            isSelf: false,
            isRelay: false,
            stream: peer.cameraStream,
          });
        } else if (peer.relayCamActive) {
          list.push({
            ownerId: peerId,
            isSelf: false,
            isRelay: true,
            stream: null,
          });
        }
      }
      return list;
    }

    leaveVoice({ notifyServer = true } = {}) {
      if (!this.inVoice) return;

      clearTimeout(this._pttReleaseTimer);
      this.pttPressed = false;

      if (this.cameraOn) {
        this.stopCamera({ notifyServer: false });
      }
      if (this.screenSharing) {
        this.stopScreenShare({ notifyServer: false });
      }

      this._stopRelayVoiceCapture();
      this._stopRelayCamCapture();
      this._stopRelayScreenCapture();

      for (const peerId of Array.from(this.peers.keys())) {
        this._removePeer(peerId);
      }

      this._cleanupLocalVoice();
      this.inVoice = false;
      this.muted = false;
      this.deafened = false;
      this.listenOnly = false;
      this.cameraOn = false;
      this.screenSharing = false;
      this.onAutoplayBlocked(false);
      this.onLocalMicLevel(0);

      if (notifyServer) {
        this.socket.emit('voice-leave');
      }

      this.onCamerasChanged();
      this.onScreenStreamsChanged();
      this.onStateChange();
    }

    toggleMute() {
      if (!this.inVoice) return;
      if (this.listenOnly) {
        return this.enableMicrophone();
      }

      if (this.deafened && this.muted) {
        this.deafened = false;
        this._applyDeafenToRemoteAudio();
      }

      this.muted = !this.muted;
      this._applyLocalMicEnabled();
      this._emitMediaState();
      this.onStateChange();
      return { ok: true, muted: this.muted };
    }

    toggleDeafen() {
      if (!this.inVoice) return;
      this.deafened = !this.deafened;
      if (this.deafened && !this.listenOnly) {
        this.muted = true;
      } else if (!this.deafened && !this.listenOnly) {
        this.muted = this.pttEnabled && !this.pttPressed;
      }
      this._applyLocalMicEnabled();
      this._applyDeafenToRemoteAudio();
      this._emitMediaState();
      this.onStateChange();
    }

    unlockAudio() {
      if (this.audioCtx && this.audioCtx.state === 'suspended') {
        this.audioCtx.resume().catch(() => {});
      }
      let allPlayed = true;
      for (const peer of this.peers.values()) {
        if (peer.audioEl && peer.audioEl.srcObject) {
          peer.audioEl.muted = this.deafened;
          peer.audioEl.volume = this.getPeerVolume(peer.peerId);
          peer.audioEl.play().catch(() => {
            allPlayed = false;
          });
        }
      }
      if (allPlayed) {
        this.onAutoplayBlocked(false);
      }
    }

    reconnectPeer(peerId) {
      const peer = this.peers.get(peerId);
      if (!peer) {
        if (this.inVoice) this._ensurePeer(peerId);
        return;
      }
      this._activateRelayForPeer(peer);
      peer.established = true;
      peer.signalQueue = peer.signalQueue
        .then(async () => {
          if (peer.pc.signalingState === 'closed') return;
          try {
            const offer = await peer.pc.createOffer({ iceRestart: true });
            await peer.pc.setLocalDescription(offer);
            this.socket.emit('webrtc-signal', {
              to: peerId,
              description: {
                type: peer.pc.localDescription.type,
                sdp: peer.pc.localDescription.sdp,
              },
            });
          } catch {}
        })
        .catch(() => {});
    }

    getPeerConnectionState(peerId) {
      const peer = this.peers.get(peerId);
      return peer ? peer.connectionState : 'connecting';
    }

    getPeerTransport(peerId) {
      const peer = this.peers.get(peerId);
      return peer ? peer.transport : 'webrtc';
    }

    getPeerDiagnostics(peerId) {
      const peer = this.peers.get(peerId);
      if (!peer) return null;
      return {
        sig: peer.pc.signalingState,
        ice: peer.pc.iceConnectionState,
        localCand: peer.localCandCount,
        remoteCand: peer.remoteCandCount,
        hasTurn: this.hasTurn,
        transport: peer.transport,
      };
    }

    async setScreenQuality(preset) {
      if (!QUALITY_PRESETS[preset]) return;
      this.screenQuality = preset;
      const cfg = QUALITY_PRESETS[preset];

      if (this.screenSharing && this.localScreenStream) {
        const videoTrack = this.localScreenStream.getVideoTracks()[0];
        if (videoTrack) {
          videoTrack.contentHint = cfg.contentHint || 'detail';
          try {
            await videoTrack.applyConstraints({
              width: cfg.width,
              height: cfg.height,
              frameRate: cfg.frameRate,
            });
          } catch {}
        }
        for (const peer of this.peers.values()) {
          for (const sender of peer.screenSenders) {
            if (sender.track && sender.track.kind === 'video') {
              this._applyVideoSenderBitrate(sender, cfg.maxBitrate);
            }
          }
        }
        if (this._screenRelayCapture) {
          this._stopRelayScreenCapture();
          this._startRelayScreenCapture();
        }
      }
    }

    _applyVideoSenderBitrate(sender, maxBitrate) {
      if (!sender || !sender.getParameters || !sender.setParameters || !maxBitrate) return;
      try {
        const params = sender.getParameters();
        if (!params.encodings || params.encodings.length === 0) {
          params.encodings = [{}];
        }
        params.encodings[0].maxBitrate = maxBitrate;
        params.degradationPreference = 'maintain-resolution';
        sender.setParameters(params).catch(() => {});
      } catch {}
    }

    async startScreenShare() {
      if (!this.inVoice) {
        return { ok: false, error: 'Entre no canal de voz primeiro para transmitir sua tela.' };
      }
      if (this.screenSharing) return { ok: true };
      if (!navigator.mediaDevices || !navigator.mediaDevices.getDisplayMedia) {
        return { ok: false, error: 'Seu navegador não suporta transmissão de tela.' };
      }

      const preset = QUALITY_PRESETS[this.screenQuality] || QUALITY_PRESETS['1080p30'];

      let stream;
      try {
        stream = await navigator.mediaDevices.getDisplayMedia({
          video: { width: preset.width, height: preset.height, frameRate: preset.frameRate },
          audio: {
            echoCancellation: false,
            noiseSuppression: false,
            autoGainControl: false,
          },
        });
      } catch (err) {
        if (err && (err.name === 'NotAllowedError' || err.name === 'AbortError')) {
          return { ok: false, cancelled: true };
        }
        return { ok: false, error: this._friendlyMediaError(err, 'tela') };
      }

      this.localScreenStream = stream;
      this.screenSharing = true;

      const videoTrack = stream.getVideoTracks()[0];
      if (videoTrack) {
        videoTrack.contentHint = preset.contentHint || 'detail';
        videoTrack.onended = () => {
          this.stopScreenShare();
        };
      }

      this._emitMediaState();

      for (const peer of this.peers.values()) {
        for (const track of stream.getTracks()) {
          const sender = peer.pc.addTrack(track, stream);
          peer.screenSenders.push(sender);
          if (track.kind === 'video') {
            this._applyVideoSenderBitrate(sender, preset.maxBitrate);
          }
        }
      }

      this._syncRelaySenders();
      this.onScreenStreamsChanged();
      this.onStateChange();
      return { ok: true };
    }

    stopScreenShare({ notifyServer = true } = {}) {
      if (!this.screenSharing && !this.localScreenStream) return;

      this._stopRelayScreenCapture();

      for (const peer of this.peers.values()) {
        for (const sender of peer.screenSenders) {
          try {
            peer.pc.removeTrack(sender);
          } catch {}
        }
        peer.screenSenders = [];
      }

      if (this.localScreenStream) {
        this.localScreenStream.getTracks().forEach((t) => {
          t.onended = null;
          t.stop();
        });
        this.localScreenStream = null;
      }

      this.screenSharing = false;
      if (notifyServer) {
        this._emitMediaState();
      }
      this.onScreenStreamsChanged();
      this.onStateChange();
    }

    setPeerVolume(peerId, volume0to1) {
      const clamped = Math.max(0, Math.min(1, Number(volume0to1)));
      this.peerVolumes.set(peerId, clamped);
      const peer = this.peers.get(peerId);
      if (peer) {
        if (peer.audioEl) peer.audioEl.volume = clamped;
        if (peer.relayGain) peer.relayGain.gain.value = this.deafened ? 0 : clamped;
      }
    }

    getPeerVolume(peerId) {
      return this.peerVolumes.has(peerId) ? this.peerVolumes.get(peerId) : 1;
    }

    getActiveScreenShares() {
      const list = [];
      if (this.localScreenStream) {
        list.push({
          ownerId: this.myId,
          isSelf: true,
          isRelay: false,
          stream: this.localScreenStream,
          hasAudio: this.localScreenStream.getAudioTracks().length > 0,
        });
      }
      for (const [peerId, peer] of this.peers.entries()) {
        const webrtcLive =
          this._isPeerWebRtcConnected(peer) &&
          peer.screenStream &&
          peer.screenStream.getVideoTracks().some((t) => t.readyState === 'live');

        if (webrtcLive) {
          list.push({
            ownerId: peerId,
            isSelf: false,
            isRelay: false,
            stream: peer.screenStream,
            hasAudio: peer.screenStream.getAudioTracks().length > 0,
          });
        } else if (peer.relayScreenActive) {
          list.push({
            ownerId: peerId,
            isSelf: false,
            isRelay: true,
            stream: null,
            hasAudio: peer.relayScreenHasAudio,
          });
        }
      }
      return list;
    }

    // ==================== PONTE PELO SERVIDOR ====================

    _isPeerWebRtcConnected(peer) {
      const ice = peer.pc.iceConnectionState;
      return ice === 'connected' || ice === 'completed';
    }

    _hasRelayPeers() {
      for (const peer of this.peers.values()) {
        if (peer.transport === 'relay') return true;
      }
      return false;
    }

    _activateRelayForPeer(peer) {
      if (peer.relayTimer) {
        clearTimeout(peer.relayTimer);
        peer.relayTimer = null;
      }
      const changed = peer.transport !== 'relay' || peer.connectionState !== 'connected';
      peer.transport = 'relay';
      peer.connectionState = 'connected';
      this._syncRelaySenders();
      if (changed) {
        this.onPeerStateChange(peer.peerId, 'connected');
      }
    }

    _syncRelaySenders() {
      const needRelay = this.inVoice && this._hasRelayPeers();
      if (needRelay && this.localVoiceStream && !this.listenOnly) {
        this._startRelayVoiceCapture();
      } else {
        this._stopRelayVoiceCapture();
      }

      if (needRelay && this.cameraOn && this.localCameraStream) {
        this._startRelayCamCapture();
      } else {
        this._stopRelayCamCapture();
      }

      if (needRelay && this.screenSharing && this.localScreenStream) {
        this._startRelayScreenCapture();
      } else {
        this._stopRelayScreenCapture();
      }
    }

    async _createPcmCapture(stream, targetSampleRate, onChunk) {
      const ctx = this._ensureAudioCtx();
      if (!ctx) return null;

      const tracks = stream.getAudioTracks();
      if (tracks.length === 0) return null;

      const source = ctx.createMediaStreamSource(new MediaStream(tracks));
      const silentGain = ctx.createGain();
      silentGain.gain.value = 0;

      if (ctx.audioWorklet) {
        try {
          if (!this.workletLoaded) {
            await ctx.audioWorklet.addModule('/js/pcm-processor.js');
            this.workletLoaded = true;
          }
          const node = new AudioWorkletNode(ctx, 'pcm-capture-processor', {
            processorOptions: { targetSampleRate },
          });
          node.port.onmessage = (e) => {
            if (e.data) onChunk(e.data);
          };
          source.connect(node);
          node.connect(silentGain);
          silentGain.connect(ctx.destination);
          return {
            stop() {
              try {
                node.port.onmessage = null;
                source.disconnect();
                node.disconnect();
                silentGain.disconnect();
              } catch {}
            },
          };
        } catch {}
      }

      const ratio = ctx.sampleRate / targetSampleRate;
      const chunkSize = Math.round(targetSampleRate * 0.08);
      const outBuf = new Int16Array(chunkSize);
      let outIdx = 0;
      let accum = 0;

      const processor = ctx.createScriptProcessor(4096, 1, 1);
      processor.onaudioprocess = (ev) => {
        const ch = ev.inputBuffer.getChannelData(0);
        const len = ch.length;
        while (accum < len) {
          let s = ch[Math.floor(accum)];
          if (s > 1) s = 1;
          else if (s < -1) s = -1;
          outBuf[outIdx++] = s < 0 ? s * 0x8000 : s * 0x7fff;
          accum += ratio;
          if (outIdx >= chunkSize) {
            onChunk(outBuf.slice(0).buffer);
            outIdx = 0;
          }
        }
        accum -= len;
      };
      source.connect(processor);
      processor.connect(silentGain);
      silentGain.connect(ctx.destination);
      return {
        stop() {
          try {
            processor.onaudioprocess = null;
            source.disconnect();
            processor.disconnect();
            silentGain.disconnect();
          } catch {}
        },
      };
    }

    async _startRelayVoiceCapture() {
      if (this._voiceRelayCapture || !this.localVoiceStream) return;
      this._voiceRelayCapture = { pending: true, stop() {} };

      const cap = await this._createPcmCapture(this.localVoiceStream, VOICE_RELAY_RATE, (buffer) => {
        if (!this.inVoice || this.muted || this.deafened || this.listenOnly || !this._hasRelayPeers()) return;

        const samples = new Int16Array(buffer);
        let sumSq = 0;
        for (let i = 0; i < samples.length; i += 4) {
          sumSq += samples[i] * samples[i];
        }
        const rms = Math.sqrt(sumSq / (samples.length / 4));
        const now = Date.now();
        if (rms > 140) {
          this._voiceHangoverUntil = now + 450;
        }
        if (now <= this._voiceHangoverUntil) {
          this.socket.volatile.emit('relay-voice', buffer);
        }
      });

      if (!this._voiceRelayCapture) {
        if (cap) cap.stop();
        return;
      }
      this._voiceRelayCapture = cap;
    }

    _stopRelayVoiceCapture() {
      if (this._voiceRelayCapture) {
        this._voiceRelayCapture.stop();
        this._voiceRelayCapture = null;
      }
    }

    _startRelayCamCapture() {
      if (this._camRelayCapture || !this.localCameraStream) return;

      const hiddenVideo = document.createElement('video');
      hiddenVideo.muted = true;
      hiddenVideo.playsInline = true;
      hiddenVideo.autoplay = true;
      hiddenVideo.srcObject = this.localCameraStream;
      hiddenVideo.play().catch(() => {});

      const canvas = document.createElement('canvas');
      const ctx2d = canvas.getContext('2d', { alpha: false });
      let encoding = false;
      let stopped = false;

      const timer = setInterval(() => {
        if (stopped || encoding || !this.cameraOn || !this._hasRelayPeers()) return;
        const vw = hiddenVideo.videoWidth;
        const vh = hiddenVideo.videoHeight;
        if (!vw || !vh) return;

        const maxW = 360;
        const scale = vw > maxW ? maxW / vw : 1;
        const cw = Math.max(2, Math.round((vw * scale) / 2) * 2);
        const ch = Math.max(2, Math.round((vh * scale) / 2) * 2);
        if (canvas.width !== cw || canvas.height !== ch) {
          canvas.width = cw;
          canvas.height = ch;
        }

        ctx2d.drawImage(hiddenVideo, 0, 0, cw, ch);
        encoding = true;

        canvas.toBlob(
          async (blob) => {
            try {
              if (!stopped && blob && this.cameraOn && this._hasRelayPeers()) {
                const buf = await blob.arrayBuffer();
                this.socket.volatile.emit('relay-cam-frame', {
                  frame: buf,
                  width: cw,
                  height: ch,
                });
              }
            } catch {}
            encoding = false;
          },
          'image/webp',
          0.58
        );
      }, 110); // ~9 FPS leve para webcam

      this._camRelayCapture = {
        stop() {
          stopped = true;
          clearInterval(timer);
          hiddenVideo.srcObject = null;
        },
      };
    }

    _stopRelayCamCapture() {
      if (this._camRelayCapture) {
        this._camRelayCapture.stop();
        this._camRelayCapture = null;
      }
    }

    _startRelayScreenCapture() {
      if (this._screenRelayCapture || !this.localScreenStream) return;

      const preset = QUALITY_PRESETS[this.screenQuality] || QUALITY_PRESETS['1080p30'];
      const hasAudio = this.localScreenStream.getAudioTracks().length > 0;

      const hiddenVideo = document.createElement('video');
      hiddenVideo.muted = true;
      hiddenVideo.playsInline = true;
      hiddenVideo.autoplay = true;
      hiddenVideo.srcObject = this.localScreenStream;
      hiddenVideo.play().catch(() => {});

      const canvas = document.createElement('canvas');
      const ctx2d = canvas.getContext('2d', { alpha: false });
      let encoding = false;
      let stopped = false;

      const intervalMs = Math.round(1000 / (preset.relayFps || 12));
      const timer = setInterval(() => {
        if (stopped || encoding || !this.screenSharing || !this._hasRelayPeers()) return;
        const vw = hiddenVideo.videoWidth;
        const vh = hiddenVideo.videoHeight;
        if (!vw || !vh) return;

        const maxW = preset.relayMaxWidth || 1280;
        const scale = vw > maxW ? maxW / vw : 1;
        const cw = Math.max(2, Math.round((vw * scale) / 2) * 2);
        const ch = Math.max(2, Math.round((vh * scale) / 2) * 2);
        if (canvas.width !== cw || canvas.height !== ch) {
          canvas.width = cw;
          canvas.height = ch;
        }

        ctx2d.drawImage(hiddenVideo, 0, 0, cw, ch);
        encoding = true;

        canvas.toBlob(
          async (blob) => {
            try {
              if (!stopped && blob && this.screenSharing && this._hasRelayPeers()) {
                const buf = await blob.arrayBuffer();
                this.socket.volatile.emit('relay-screen-frame', {
                  frame: buf,
                  width: cw,
                  height: ch,
                  hasAudio,
                });
              }
            } catch {}
            encoding = false;
          },
          'image/webp',
          preset.relayQuality || 0.65
        );
      }, intervalMs);

      this._screenRelayCapture = {
        stop() {
          stopped = true;
          clearInterval(timer);
          hiddenVideo.srcObject = null;
        },
      };

      if (hasAudio && !this._screenAudioRelayCapture) {
        this._screenAudioRelayCapture = { pending: true, stop() {} };
        this._createPcmCapture(this.localScreenStream, SCREEN_AUDIO_RELAY_RATE, (buffer) => {
          if (!this.screenSharing || !this._hasRelayPeers()) return;
          this.socket.volatile.emit('relay-screen-audio', buffer);
        }).then((cap) => {
          if (!this._screenAudioRelayCapture) {
            if (cap) cap.stop();
            return;
          }
          this._screenAudioRelayCapture = cap;
        });
      }
    }

    _stopRelayScreenCapture() {
      if (this._screenRelayCapture) {
        this._screenRelayCapture.stop();
        this._screenRelayCapture = null;
      }
      if (this._screenAudioRelayCapture) {
        this._screenAudioRelayCapture.stop();
        this._screenAudioRelayCapture = null;
      }
    }

    _toInt16Array(chunk) {
      if (chunk instanceof ArrayBuffer) {
        return new Int16Array(chunk);
      }
      if (ArrayBuffer.isView(chunk)) {
        return new Int16Array(chunk.buffer, chunk.byteOffset, Math.floor(chunk.byteLength / 2));
      }
      return null;
    }

    _playRelayVoiceChunk(peer, chunk) {
      const ctx = this._ensureAudioCtx();
      if (!ctx) return;

      if (ctx.state === 'suspended') {
        ctx.resume().catch(() => {});
        if (ctx.state === 'suspended') {
          this.onAutoplayBlocked(true);
        }
      }

      const int16 = this._toInt16Array(chunk);
      if (!int16 || int16.length === 0) return;

      const float32 = new Float32Array(int16.length);
      let sumSq = 0;
      for (let i = 0; i < int16.length; i++) {
        const v = int16[i] / 32768;
        float32[i] = v;
        sumSq += v * v;
      }

      const rms = Math.sqrt(sumSq / float32.length);
      if (rms > 0.015) {
        if (!peer.relaySpeaking) {
          peer.relaySpeaking = true;
          this.onSpeakingChange(peer.peerId, true);
        }
        clearTimeout(peer.relaySpeakTimer);
        peer.relaySpeakTimer = setTimeout(() => {
          peer.relaySpeaking = false;
          this.onSpeakingChange(peer.peerId, false);
        }, 260);
      }

      if (!peer.relayGain) {
        peer.relayGain = ctx.createGain();
        peer.relayGain.gain.value = this.deafened ? 0 : this.getPeerVolume(peer.peerId);
        peer.relayGain.connect(ctx.destination);
      }

      const audioBuf = ctx.createBuffer(1, float32.length, VOICE_RELAY_RATE);
      audioBuf.copyToChannel(float32, 0);

      const src = ctx.createBufferSource();
      src.buffer = audioBuf;
      src.connect(peer.relayGain);

      const now = ctx.currentTime;
      if (!peer.nextVoiceTime || peer.nextVoiceTime < now + 0.012 || peer.nextVoiceTime > now + 0.35) {
        peer.nextVoiceTime = now + 0.055;
      }
      src.start(peer.nextVoiceTime);
      peer.nextVoiceTime += audioBuf.duration;
    }

    _playRelayScreenAudioChunk(chunk) {
      const ctx = this._ensureAudioCtx();
      if (!ctx) return;
      if (ctx.state === 'suspended') {
        ctx.resume().catch(() => {});
      }

      const int16 = this._toInt16Array(chunk);
      if (!int16 || int16.length === 0) return;

      const float32 = new Float32Array(int16.length);
      for (let i = 0; i < int16.length; i++) {
        float32[i] = int16[i] / 32768;
      }

      if (!this._screenAudioGain) {
        this._screenAudioGain = ctx.createGain();
        this._screenAudioGain.gain.value = this.deafened ? 0 : this.streamVolume;
        this._screenAudioGain.connect(ctx.destination);
      }

      const audioBuf = ctx.createBuffer(1, float32.length, SCREEN_AUDIO_RELAY_RATE);
      audioBuf.copyToChannel(float32, 0);

      const src = ctx.createBufferSource();
      src.buffer = audioBuf;
      src.connect(this._screenAudioGain);

      const now = ctx.currentTime;
      if (!this._screenAudioNextTime || this._screenAudioNextTime < now + 0.012 || this._screenAudioNextTime > now + 0.35) {
        this._screenAudioNextTime = now + 0.06;
      }
      src.start(this._screenAudioNextTime);
      this._screenAudioNextTime += audioBuf.duration;
    }

    // ==================== INTERNOS WEBRTC ====================

    async _captureMicrophone(deviceId) {
      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        throw new Error('Navegador sem suporte a microfone ou página sem HTTPS.');
      }
      const audioConstraints = {
        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl: true,
      };
      if (deviceId) {
        audioConstraints.deviceId = { exact: deviceId };
      }
      return navigator.mediaDevices.getUserMedia({ audio: audioConstraints, video: false });
    }

    _friendlyMediaError(err, kind) {
      if (!window.isSecureContext) {
        return `Para usar ${kind}, abra o app via localhost ou link HTTPS.`;
      }
      if (!err) return `Não foi possível acessar ${kind}.`;
      if (err.name === 'NotAllowedError' || err.name === 'PermissionDeniedError') {
        return `Permissão negada para acessar ${kind}. Libere no cadeado da barra de endereço do navegador.`;
      }
      if (err.name === 'NotFoundError' || err.name === 'DevicesNotFoundError') {
        return `Nenhum ${kind} encontrado neste dispositivo.`;
      }
      if (err.name === 'NotReadableError') {
        return `O ${kind} parece estar ocupado por outro programa.`;
      }
      return err.message || `Erro ao acessar ${kind}.`;
    }

    _ensurePeer(peerId) {
      if (this.peers.has(peerId)) {
        return this.peers.get(peerId);
      }

      const pc = new RTCPeerConnection({
        iceServers: this.iceServers,
        iceCandidatePoolSize: 4,
      });

      const peer = {
        peerId,
        pc,
        polite: String(this.myId) < String(peerId),
        established: false,
        makingOffer: false,
        ignoreOffer: false,
        isSettingRemoteAnswerPending: false,
        pendingCandidates: [],
        signalQueue: Promise.resolve(),
        transport: 'webrtc',
        connectionState: 'connecting',
        relayTimer: null,
        relayGain: null,
        nextVoiceTime: 0,
        relaySpeaking: false,
        relaySpeakTimer: null,
        relayCamActive: false,
        relayScreenActive: false,
        relayScreenHasAudio: false,
        localCandCount: 0,
        remoteCandCount: 0,
        voiceSenders: [],
        cameraSenders: [],
        screenSenders: [],
        voiceStream: null,
        cameraStream: null,
        screenStream: null,
        audioEl: null,
      };

      this.peers.set(peerId, peer);
      this.onPeerStateChange(peerId, 'connecting');

      peer.relayTimer = setTimeout(() => {
        if (!this.peers.has(peerId)) return;
        if (!this._isPeerWebRtcConnected(peer)) {
          this._activateRelayForPeer(peer);
        }
      }, RELAY_FALLBACK_MS);

      pc.onicecandidate = ({ candidate }) => {
        if (candidate) {
          peer.localCandCount += 1;
          const plain = typeof candidate.toJSON === 'function' ? candidate.toJSON() : candidate;
          this.socket.emit('webrtc-signal', { to: peerId, candidate: plain });
        }
      };

      pc.onnegotiationneeded = () => {
        peer.signalQueue = peer.signalQueue
          .then(async () => {
            if (pc.signalingState === 'closed') return;
            if (!peer.established && peer.polite) return;
            try {
              peer.makingOffer = true;
              await pc.setLocalDescription();
              this.socket.emit('webrtc-signal', {
                to: peerId,
                description: {
                  type: pc.localDescription.type,
                  sdp: pc.localDescription.sdp,
                },
              });
            } catch {} finally {
              peer.makingOffer = false;
            }
          })
          .catch(() => {});
      };

      const handleConnChange = () => {
        const ice = pc.iceConnectionState;
        const conn = pc.connectionState;

        if (ice === 'connected' || ice === 'completed' || conn === 'connected') {
          if (peer.relayTimer) {
            clearTimeout(peer.relayTimer);
            peer.relayTimer = null;
          }
          peer.transport = 'webrtc';
          peer.connectionState = 'connected';
          this._syncRelaySenders();
          this.onPeerStateChange(peerId, 'connected');
          this.onCamerasChanged();
          this.onScreenStreamsChanged();
        } else if (ice === 'failed' || ice === 'disconnected' || conn === 'failed') {
          this._activateRelayForPeer(peer);
        }
      };

      pc.oniceconnectionstatechange = handleConnChange;
      pc.onconnectionstatechange = handleConnChange;

      pc.ontrack = (event) => {
        const track = event.track;
        const stream = (event.streams && event.streams[0]) || new MediaStream([track]);
        const meta = this.getUserMeta ? this.getUserMeta(peerId) : null;

        const isCameraTrack =
          track.kind === 'video' &&
          meta &&
          meta.cameraStreamId &&
          stream.id === meta.cameraStreamId;

        const isScreenTrack =
          !isCameraTrack &&
          (track.kind === 'video' ||
            (meta && meta.screenStreamId && stream.id === meta.screenStreamId) ||
            stream.getVideoTracks().length > 0);

        if (isCameraTrack) {
          peer.cameraStream = stream;
          this.onCamerasChanged();
          track.onended = () => {
            if (peer.cameraStream && peer.cameraStream.getVideoTracks().every((t) => t.readyState !== 'live')) {
              peer.cameraStream = null;
              this.onCamerasChanged();
            }
          };
          stream.onremovetrack = () => {
            if (peer.cameraStream && peer.cameraStream.getVideoTracks().length === 0) {
              peer.cameraStream = null;
              this.onCamerasChanged();
            }
          };
        } else if (isScreenTrack) {
          if (peer.voiceStream && peer.voiceStream.id === stream.id) {
            this._detachPeerVoiceAudio(peer);
          }

          peer.screenStream = stream;
          this.onScreenStreamsChanged();

          track.onended = () => {
            if (peer.screenStream && peer.screenStream.getVideoTracks().every((t) => t.readyState !== 'live')) {
              peer.screenStream = null;
              this.onScreenStreamsChanged();
            }
          };

          stream.onremovetrack = () => {
            if (peer.screenStream && peer.screenStream.getVideoTracks().length === 0) {
              peer.screenStream = null;
              this.onScreenStreamsChanged();
            }
          };
        } else if (track.kind === 'audio') {
          peer.voiceStream = stream;
          this._attachPeerVoiceAudio(peer, stream);
        }
      };

      if (this.localVoiceStream) {
        for (const track of this.localVoiceStream.getTracks()) {
          const sender = pc.addTrack(track, this.localVoiceStream);
          peer.voiceSenders.push(sender);
        }
      } else if (!peer.polite && !this.localCameraStream && !this.localScreenStream) {
        pc.addTransceiver('audio', { direction: 'recvonly' });
      }
      if (this.localCameraStream) {
        for (const track of this.localCameraStream.getTracks()) {
          const sender = pc.addTrack(track, this.localCameraStream);
          peer.cameraSenders.push(sender);
        }
      }
      if (this.localScreenStream) {
        const preset = QUALITY_PRESETS[this.screenQuality] || QUALITY_PRESETS['1080p30'];
        for (const track of this.localScreenStream.getTracks()) {
          const sender = pc.addTrack(track, this.localScreenStream);
          peer.screenSenders.push(sender);
          if (track.kind === 'video') {
            this._applyVideoSenderBitrate(sender, preset.maxBitrate);
          }
        }
      }

      return peer;
    }

    _attachPeerVoiceAudio(peer, stream) {
      if (!peer.audioEl) {
        const audio = document.createElement('audio');
        audio.autoplay = true;
        audio.playsInline = true;
        audio.dataset.peerId = peer.peerId;
        this.audioContainer.appendChild(audio);
        peer.audioEl = audio;
      }

      peer.audioEl.srcObject = stream;
      peer.audioEl.volume = this.getPeerVolume(peer.peerId);
      peer.audioEl.muted = this.deafened;

      const playPromise = peer.audioEl.play();
      if (playPromise && typeof playPromise.then === 'function') {
        playPromise.catch(() => {
          this.onAutoplayBlocked(true);
        });
      }

      this._detachAnalyser(peer.peerId);
      this._attachAnalyser(peer.peerId, stream);
    }

    _detachPeerVoiceAudio(peer) {
      if (peer.audioEl) {
        peer.audioEl.srcObject = null;
        peer.audioEl.remove();
        peer.audioEl = null;
      }
      peer.voiceStream = null;
      this._detachAnalyser(peer.peerId);
    }

    _removePeer(peerId) {
      const peer = this.peers.get(peerId);
      if (!peer) return;

      if (peer.relayTimer) clearTimeout(peer.relayTimer);
      if (peer.relaySpeakTimer) clearTimeout(peer.relaySpeakTimer);
      if (peer.relayGain) {
        try {
          peer.relayGain.disconnect();
        } catch {}
      }

      const hadCam = Boolean(peer.cameraStream || peer.relayCamActive);
      const hadScreen = Boolean(peer.screenStream || peer.relayScreenActive);
      this._detachPeerVoiceAudio(peer);

      try {
        peer.pc.ontrack = null;
        peer.pc.onicecandidate = null;
        peer.pc.onnegotiationneeded = null;
        peer.pc.oniceconnectionstatechange = null;
        peer.pc.onconnectionstatechange = null;
        peer.pc.close();
      } catch {}

      this.peers.delete(peerId);
      this.onSpeakingChange(peerId, false);
      this._syncRelaySenders();

      if (hadCam) this.onCamerasChanged();
      if (hadScreen) this.onScreenStreamsChanged();
    }

    _applyLocalMicEnabled() {
      if (!this.localVoiceStream) return;
      const enabled = !this.muted && !this.deafened;
      this.localVoiceStream.getAudioTracks().forEach((t) => {
        t.enabled = enabled;
      });
      if (!enabled) {
        this.onSpeakingChange(this.myId, false);
        this.onLocalMicLevel(0);
      }
    }

    _applyDeafenToRemoteAudio() {
      for (const peer of this.peers.values()) {
        if (peer.audioEl) {
          peer.audioEl.muted = this.deafened;
        }
        if (peer.relayGain) {
          peer.relayGain.gain.value = this.deafened ? 0 : this.getPeerVolume(peer.peerId);
        }
      }
      if (this._screenAudioGain) {
        this._screenAudioGain.gain.value = this.deafened ? 0 : this.streamVolume;
      }
    }

    _emitMediaState() {
      this.socket.emit('media-state', {
        muted: this.muted,
        deafened: this.deafened,
        listenOnly: this.listenOnly,
        cameraOn: this.cameraOn,
        screenSharing: this.screenSharing,
        voiceStreamId: this.localVoiceStream ? this.localVoiceStream.id : null,
        cameraStreamId: this.localCameraStream ? this.localCameraStream.id : null,
        screenStreamId: this.localScreenStream ? this.localScreenStream.id : null,
      });
    }

    _cleanupLocalVoice() {
      this._stopVADLoop();
      if (this.localVoiceStream) {
        this.localVoiceStream.getTracks().forEach((t) => t.stop());
        this.localVoiceStream = null;
      }
      this.onSpeakingChange(this.myId, false);
    }

    _ensureAudioCtx() {
      if (!this.audioCtx) {
        const Ctx = window.AudioContext || window.webkitAudioContext;
        if (!Ctx) return null;
        this.audioCtx = new Ctx();
      }
      if (this.audioCtx.state === 'suspended') {
        this.audioCtx.resume().catch(() => {});
      }
      return this.audioCtx;
    }

    _attachAnalyser(userId, stream) {
      const audioTracks = stream ? stream.getAudioTracks() : [];
      if (!userId || audioTracks.length === 0) return;
      const ctx = this._ensureAudioCtx();
      if (!ctx) return;

      try {
        const analyserStream = new MediaStream(audioTracks);
        const source = ctx.createMediaStreamSource(analyserStream);
        const analyser = ctx.createAnalyser();
        analyser.fftSize = 256;
        analyser.smoothingTimeConstant = 0.55;
        source.connect(analyser);
        this.analysers.set(userId, {
          source,
          analyser,
          data: new Uint8Array(analyser.fftSize),
          speaking: false,
        });
      } catch {}
    }

    _detachAnalyser(userId) {
      const entry = this.analysers.get(userId);
      if (!entry) return;
      try {
        entry.source.disconnect();
      } catch {}
      this.analysers.delete(userId);
      this.onSpeakingChange(userId, false);
    }

    _startVADLoop() {
      if (this.vadTimer) return;
      this.vadTimer = setInterval(() => {
        for (const [userId, entry] of this.analysers.entries()) {
          if (userId === this.myId && (this.muted || this.deafened)) {
            if (entry.speaking) {
              entry.speaking = false;
              this.onSpeakingChange(userId, false);
            }
            this.onLocalMicLevel(0);
            continue;
          }

          entry.analyser.getByteTimeDomainData(entry.data);
          let sumSq = 0;
          for (let i = 0; i < entry.data.length; i++) {
            const v = (entry.data[i] - 128) / 128;
            sumSq += v * v;
          }
          const rms = Math.sqrt(sumSq / entry.data.length);

          if (userId === this.myId) {
            const pct = Math.min(100, Math.round(rms * 420));
            this.onLocalMicLevel(pct);
          }

          const isNowSpeaking = rms > 0.02;
          if (isNowSpeaking !== entry.speaking) {
            entry.speaking = isNowSpeaking;
            this.onSpeakingChange(userId, isNowSpeaking);
          }
        }
      }, 90);
    }

    _stopVADLoop() {
      if (this.vadTimer) {
        clearInterval(this.vadTimer);
        this.vadTimer = null;
      }
      for (const userId of Array.from(this.analysers.keys())) {
        this._detachAnalyser(userId);
      }
    }
  }

  global.VoiceManager = VoiceManager;
})(window);
