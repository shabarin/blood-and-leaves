/* ============================================================
   Tiny procedural audio — swords, blood, coins, wind.
   ============================================================ */

export class AudioFX {
  constructor() {
    this.ctx = null;
    this.master = null;
    this.ambience = null;
    this.enabled = true;
  }

  ensure() {
    if (this.ctx) {
      if (this.ctx.state === 'suspended') this.ctx.resume();
      return;
    }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    this.ctx = new AC();
    this.master = this.ctx.createGain();
    this.master.gain.value = 0.55;
    this.master.connect(this.ctx.destination);
  }

  tone(freq, dur, type = 'sine', vol = 0.12, slide = 0) {
    if (!this.enabled) return;
    this.ensure();
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t);
    if (slide) osc.frequency.linearRampToValueAtTime(Math.max(30, freq + slide), t + dur);
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    osc.connect(g);
    g.connect(this.master);
    osc.start(t);
    osc.stop(t + dur + 0.02);
  }

  noise(dur, vol = 0.08, freq = 1200, type = 'bandpass') {
    if (!this.enabled) return;
    this.ensure();
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    const len = Math.floor(this.ctx.sampleRate * dur);
    const buffer = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
    const src = this.ctx.createBufferSource();
    src.buffer = buffer;
    const filter = this.ctx.createBiquadFilter();
    filter.type = type;
    filter.frequency.value = freq;
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(filter);
    filter.connect(g);
    g.connect(this.master);
    src.start(t);
  }

  hit() {
    this.tone(150, 0.09, 'square', 0.12, -70);
    this.noise(0.07, 0.09, 900);
  }

  slash() { this.noise(0.13, 0.055, 2400, 'highpass'); }
  miss() { this.noise(0.08, 0.03, 1800, 'highpass'); }
  block() { this.tone(740, 0.09, 'triangle', 0.1, -220); this.noise(0.05, 0.05, 3000); }
  hurt() { this.tone(150, 0.24, 'sawtooth', 0.08, -50); }
  npcSwing() { this.noise(0.09, 0.025, 1500, 'highpass'); }
  crunch() { this.noise(0.16, 0.11, 420, 'lowpass'); this.tone(90, 0.15, 'square', 0.06, -30); }
  jump() { this.tone(260, 0.12, 'sine', 0.05, 80); }
  deathThud() { this.tone(70, 0.4, 'sawtooth', 0.08, -30); this.noise(0.2, 0.05, 300, 'lowpass'); }
  death() {
    this.tone(180, 1.5, 'sine', 0.1, -140);
    this.tone(90, 1.9, 'triangle', 0.09, -40);
    this.noise(0.8, 0.04, 220, 'lowpass');
  }
  heal() {
    this.tone(420, 0.2, 'sine', 0.08, 220);
    this.tone(630, 0.3, 'sine', 0.05, 120);
  }
  coin() {
    this.tone(980, 0.06, 'square', 0.045, 120);
    setTimeout(() => this.tone(1320, 0.1, 'square', 0.035, 60), 60);
  }
  quest() {
    [330, 440, 550].forEach((f, i) => setTimeout(() => this.tone(f, 0.18, 'triangle', 0.05), i * 90));
  }
  questComplete() {
    [440, 554, 659, 880].forEach((f, i) => setTimeout(() => this.tone(f, 0.25, 'triangle', 0.055), i * 110));
  }
  levelUp() {
    [523, 659, 784, 1046].forEach((f, i) => setTimeout(() => this.tone(f, 0.3, 'sine', 0.05), i * 100));
  }
  horn() {
    this.tone(110, 0.7, 'sawtooth', 0.07, 15);
    this.tone(165, 0.7, 'sawtooth', 0.05, -10);
  }

  startAmbience() {
    if (!this.enabled) return;
    this.ensure();
    if (!this.ctx || this.ambience) return;
    const t = this.ctx.currentTime;
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0.001, t);
    g.gain.linearRampToValueAtTime(0.035, t + 4);
    g.connect(this.master);
    const osc1 = this.ctx.createOscillator();
    osc1.type = 'sine';
    osc1.frequency.value = 55;
    const osc2 = this.ctx.createOscillator();
    osc2.type = 'sine';
    osc2.frequency.value = 82.5;
    const lfo = this.ctx.createOscillator();
    lfo.frequency.value = 0.08;
    const lfoGain = this.ctx.createGain();
    lfoGain.gain.value = 0.012;
    lfo.connect(lfoGain);
    lfoGain.connect(g.gain);
    osc1.connect(g);
    osc2.connect(g);
    osc1.start(t);
    osc2.start(t);
    lfo.start(t);
    this.ambience = { g, osc1, osc2, lfo };
  }

  stopAmbience() {
    if (!this.ambience) return;
    const t = this.ctx.currentTime;
    this.ambience.g.gain.linearRampToValueAtTime(0.0001, t + 1);
    this.ambience.osc1.stop(t + 1.1);
    this.ambience.osc2.stop(t + 1.1);
    this.ambience.lfo.stop(t + 1.1);
    this.ambience = null;
  }
}
