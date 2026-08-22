// =========================================================================
// UNITY EOC INDIA — TACTICAL WEB AUDIO SYNTHESIZER (SIH 2026)
// =========================================================================

class TacticalAudio {
  constructor() {
    this.ctx = null;
    this.enabled = true;
  }

  init() {
    if (!this.ctx) {
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      if (AudioCtx) {
        this.ctx = new AudioCtx();
      }
    }
    if (this.ctx && this.ctx.state === 'suspended') {
      this.ctx.resume();
    }
  }

  playTone(freq, type, duration, gainVal = 0.1) {
    if (!this.enabled) return;
    try {
      this.init();
      if (!this.ctx) return;
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();

      osc.type = type;
      osc.frequency.setValueAtTime(freq, this.ctx.currentTime);
      gain.gain.setValueAtTime(gainVal, this.ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.0001, this.ctx.currentTime + duration);

      osc.connect(gain);
      gain.connect(this.ctx.destination);

      osc.start();
      osc.stop(this.ctx.currentTime + duration);
    } catch (e) {
      console.warn("Audio synth error:", e);
    }
  }

  playClick() {
    this.playTone(850, 'sine', 0.05, 0.08);
  }

  playModeToggle() {
    this.playTone(440, 'triangle', 0.08, 0.12);
    setTimeout(() => this.playTone(660, 'triangle', 0.12, 0.12), 80);
  }

  playCriticalAlert() {
    this.playTone(880, 'sawtooth', 0.15, 0.15);
    setTimeout(() => this.playTone(1100, 'sawtooth', 0.25, 0.15), 150);
  }

  playBroadcastSiren() {
    if (!this.enabled) return;
    this.init();
    if (!this.ctx) return;
    
    // EAS Dual-tone Alert Siren (853 Hz + 960 Hz)
    try {
      const t = this.ctx.currentTime;
      const osc1 = this.ctx.createOscillator();
      const osc2 = this.ctx.createOscillator();
      const gain = this.ctx.createGain();

      osc1.frequency.value = 853;
      osc2.frequency.value = 960;
      gain.gain.setValueAtTime(0.18, t);
      gain.gain.exponentialRampToValueAtTime(0.001, t + 1.2);

      osc1.connect(gain);
      osc2.connect(gain);
      gain.connect(this.ctx.destination);

      osc1.start(t);
      osc2.start(t);
      osc1.stop(t + 1.2);
      osc2.stop(t + 1.2);
    } catch (e) {
      console.warn("Broadcast audio error:", e);
    }
  }

  playRadioPtt() {
    if (!this.enabled) return;
    this.init();
    // VHF Squelch Chirp
    this.playTone(1200, 'square', 0.04, 0.06);
    setTimeout(() => this.playTone(800, 'square', 0.06, 0.08), 40);
  }
}

export const sound = new TacticalAudio();
