// Sons de interface + Mesa de Sons (Soundboard) via Web Audio API
(function (global) {
  const BUILTIN_SOUNDS = [
    { id: 'airhorn', emoji: '📯', name: 'Buzina' },
    { id: 'badumtss', emoji: '🥁', name: 'Ba-dum-tss' },
    { id: 'crickets', emoji: '🦗', name: 'Grilos' },
    { id: 'suspense', emoji: '🎬', name: 'Suspense' },
    { id: 'coin', emoji: '🪙', name: 'Moeda 8-bit' },
    { id: 'siren', emoji: '🚨', name: 'Alerta' },
    { id: 'victory', emoji: '🎉', name: 'Vitória' },
    { id: 'fail', emoji: '💀', name: 'Fail' },
  ];

  class SoundEffects {
    constructor() {
      this.enabled = true;
      this.soundboardVolume = 0.7;
      this.ctx = null;
      this.builtinList = BUILTIN_SOUNDS;
    }

    _ensureContext(forceForSoundboard = false) {
      if (!this.enabled && !forceForSoundboard) return null;
      if (!this.ctx) {
        const AudioCtx = window.AudioContext || window.webkitAudioContext;
        if (!AudioCtx) return null;
        this.ctx = new AudioCtx();
      }
      if (this.ctx.state === 'suspended') {
        this.ctx.resume().catch(() => {});
      }
      return this.ctx;
    }

    _tone(freq, startOffset, duration, volume = 0.08, type = 'sine', force = false) {
      const ctx = this._ensureContext(force);
      if (!ctx) return;
      const now = ctx.currentTime + startOffset;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = type;
      osc.frequency.setValueAtTime(freq, now);
      gain.gain.setValueAtTime(0.0001, now);
      gain.gain.exponentialRampToValueAtTime(Math.max(0.0002, volume), now + 0.015);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + duration);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(now);
      osc.stop(now + duration + 0.02);
    }

    playJoin() {
      this._tone(440, 0, 0.14, 0.07, 'sine');
      this._tone(587.33, 0.09, 0.18, 0.07, 'sine');
    }

    playLeave() {
      this._tone(493.88, 0, 0.13, 0.06, 'sine');
      this._tone(349.23, 0.09, 0.18, 0.06, 'sine');
    }

    playMessage() {
      this._tone(680, 0, 0.09, 0.045, 'triangle');
    }

    playScreenStart() {
      this._tone(523.25, 0, 0.12, 0.06, 'sine');
      this._tone(659.25, 0.07, 0.14, 0.06, 'sine');
      this._tone(783.99, 0.14, 0.2, 0.06, 'sine');
    }

    playPing() {
      this._tone(880, 0, 0.09, 0.055, 'sine');
      this._tone(1320, 0.05, 0.12, 0.045, 'sine');
    }

    playClick(high = true) {
      this._tone(high ? 620 : 380, 0, 0.055, 0.04, 'sine');
    }

    // ==================== SOUNDBOARD ====================

    playSoundboard(soundId, customDataUrl, isDeafened = false) {
      if (isDeafened) return;
      const vol = Math.max(0.01, Math.min(1, this.soundboardVolume));

      if (customDataUrl) {
        try {
          const audio = new Audio(customDataUrl);
          audio.volume = vol;
          audio.play().catch(() => {});
        } catch {}
        return;
      }

      const ctx = this._ensureContext(true);
      if (!ctx) return;
      const v = vol * 0.22;

      switch (soundId) {
        case 'airhorn': {
          const blasts = [
            [0, 0.11],
            [0.14, 0.11],
            [0.28, 0.52],
          ];
          const freqs = [392, 466.16, 587.33];
          blasts.forEach(([start, dur]) => {
            freqs.forEach((f) => this._tone(f, start, dur, v * 0.65, 'sawtooth', true));
          });
          break;
        }
        case 'badumtss': {
          this._drumKick(ctx, 0, 150, 48, 0.16, v * 1.4);
          this._drumKick(ctx, 0.18, 210, 75, 0.18, v * 1.3);
          this._noiseBurst(ctx, 0.38, 0.48, v * 0.85, 5500);
          break;
        }
        case 'crickets': {
          [0, 0.42].forEach((cluster) => {
            for (let i = 0; i < 4; i++) {
              this._tone(4350, cluster + i * 0.055, 0.038, v * 0.45, 'sine', true);
            }
          });
          break;
        }
        case 'suspense': {
          const notes = [
            [392, 0, 0.16],
            [392, 0.19, 0.16],
            [392, 0.38, 0.16],
            [311.13, 0.58, 0.72],
          ];
          notes.forEach(([f, st, d]) => {
            this._tone(f, st, d, v * 0.7, 'sawtooth', true);
            this._tone(f / 2, st, d, v * 0.7, 'triangle', true);
          });
          break;
        }
        case 'coin': {
          this._tone(987.77, 0, 0.09, v * 0.75, 'square', true);
          this._tone(1318.51, 0.085, 0.34, v * 0.75, 'square', true);
          break;
        }
        case 'siren': {
          const now = ctx.currentTime;
          const osc = ctx.createOscillator();
          const gain = ctx.createGain();
          osc.type = 'sawtooth';
          osc.frequency.setValueAtTime(520, now);
          osc.frequency.linearRampToValueAtTime(920, now + 0.25);
          osc.frequency.linearRampToValueAtTime(520, now + 0.5);
          osc.frequency.linearRampToValueAtTime(920, now + 0.75);
          gain.gain.setValueAtTime(v * 0.65, now);
          gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.82);
          osc.connect(gain);
          gain.connect(ctx.destination);
          osc.start(now);
          osc.stop(now + 0.84);
          break;
        }
        case 'victory': {
          const notes = [
            [523.25, 0, 0.12],
            [659.25, 0.12, 0.12],
            [783.99, 0.24, 0.12],
            [1046.5, 0.36, 0.45],
          ];
          notes.forEach(([f, st, d]) => this._tone(f, st, d, v * 0.75, 'triangle', true));
          break;
        }
        case 'fail': {
          const steps = [
            [293.66, 0, 0.24],
            [277.18, 0.25, 0.24],
            [261.63, 0.5, 0.24],
            [246.94, 0.75, 0.62],
          ];
          steps.forEach(([f, st, d]) => this._tone(f, st, d, v * 0.75, 'sawtooth', true));
          break;
        }
      }
    }

    _drumKick(ctx, offset, startFreq, endFreq, dur, vol) {
      const now = ctx.currentTime + offset;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(startFreq, now);
      osc.frequency.exponentialRampToValueAtTime(endFreq, now + dur);
      gain.gain.setValueAtTime(vol, now);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + dur);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(now);
      osc.stop(now + dur + 0.02);
    }

    _noiseBurst(ctx, offset, dur, vol, highpassFreq) {
      const now = ctx.currentTime + offset;
      const bufferSize = Math.floor(ctx.sampleRate * dur);
      const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
      const data = buffer.getChannelData(0);
      for (let i = 0; i < bufferSize; i++) {
        data[i] = Math.random() * 2 - 1;
      }
      const noise = ctx.createBufferSource();
      noise.buffer = buffer;

      const filter = ctx.createBiquadFilter();
      filter.type = 'highpass';
      filter.frequency.value = highpassFreq;

      const gain = ctx.createGain();
      gain.gain.setValueAtTime(vol, now);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + dur);

      noise.connect(filter);
      filter.connect(gain);
      gain.connect(ctx.destination);
      noise.start(now);
      noise.stop(now + dur + 0.02);
    }
  }

  global.ResenhaSounds = new SoundEffects();
})(window);
