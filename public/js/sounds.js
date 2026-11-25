// Sons sutis gerados via Web Audio API (sem arquivos MP3 externos)
(function (global) {
  class SoundEffects {
    constructor() {
      this.enabled = true;
      this.ctx = null;
    }

    _ensureContext() {
      if (!this.enabled) return null;
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

    _tone(freq, startOffset, duration, volume = 0.08, type = 'sine') {
      const ctx = this._ensureContext();
      if (!ctx) return;
      const now = ctx.currentTime + startOffset;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = type;
      osc.frequency.setValueAtTime(freq, now);
      gain.gain.setValueAtTime(0.0001, now);
      gain.gain.exponentialRampToValueAtTime(volume, now + 0.015);
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

    playClick(high = true) {
      this._tone(high ? 620 : 380, 0, 0.06, 0.045, 'sine');
    }
  }

  global.ResenhaSounds = new SoundEffects();
})(window);
