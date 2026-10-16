// Procedural audio engine. Everything here is synthesized at runtime with the
// Web Audio API: no samples, no recordings. One leitmotif (the "cursor theme")
// is re-orchestrated for every era of the museum.

const mtof = (m) => 440 * Math.pow(2, (m - 69) / 12);

// --- The leitmotif ---------------------------------------------------------
// D minor, i - VI - III - VII. 16 steps per bar, 8 bars.
const CHORDS = [
  [50, 57, 62, 65, 69], // Dm
  [46, 53, 58, 62, 65], // Bb
  [41, 48, 53, 57, 60], // F
  [48, 55, 60, 64, 67], // C
];
const MELODY = [
  [[0, 62, 2], [2, 65, 2], [4, 69, 2], [6, 74, 6], [12, 72, 2], [14, 69, 2]],
  [[0, 70, 6], [6, 69, 2], [8, 65, 4], [12, 62, 4]],
  [[0, 65, 2], [2, 69, 2], [4, 72, 2], [6, 77, 6], [12, 76, 2], [14, 72, 2]],
  [[0, 76, 8], [8, 74, 2], [10, 72, 2], [12, 67, 4]],
  [[0, 62, 2], [2, 65, 2], [4, 69, 2], [6, 74, 4], [10, 77, 2], [12, 76, 2], [14, 74, 2]],
  [[0, 74, 4], [4, 70, 4], [8, 72, 2], [10, 74, 2], [12, 77, 4]],
  [[0, 81, 6], [6, 79, 2], [8, 77, 4], [12, 76, 4]],
  [[0, 72, 4], [4, 74, 2], [6, 76, 2], [8, 74, 8]],
];

// Era styles: how the same notes get played.
const STYLES = {
  silent: null,
  terminal: { bpm: 72, reverb: 0.35, delay: 0.2, lp: 2400 },
  vector: { bpm: 80, reverb: 0.45, delay: 0.35, lp: 6000 },
  chip: { bpm: 132, reverb: 0.08, delay: 0.0, lp: 12000 },
  chip2: { bpm: 140, reverb: 0.12, delay: 0.05, lp: 14000 },
  dark: { bpm: 100, reverb: 0.25, delay: 0.15, lp: 5000 },
  synth: { bpm: 108, reverb: 0.3, delay: 0.2, lp: 9000 },
  fm: { bpm: 96, reverb: 0.35, delay: 0.25, lp: 12000 },
  lush: { bpm: 88, reverb: 0.55, delay: 0.3, lp: 14000 },
  pulse: { bpm: 118, reverb: 0.35, delay: 0.2, lp: 16000 },
  ambient: { bpm: 64, reverb: 0.8, delay: 0.35, lp: 9000 },
};

export class AudioEngine {
  constructor() {
    this.ctx = null;
    this.muted = false;
    this.style = 'silent';
    this.pending = null;
    this.step = 0;
    this.bar = 0;
    this.nextTime = 0;
    this.listeners = [];
  }

  get ready() { return !!this.ctx; }

  init() {
    if (this.ctx) { if (this.ctx.state === 'suspended') this.ctx.resume(); return; }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    const c = (this.ctx = new AC());
    this.out = c.createGain();
    this.out.gain.value = this.muted ? 0 : 1;
    const comp = c.createDynamicsCompressor();
    comp.threshold.value = -14; comp.knee.value = 12; comp.ratio.value = 4;
    comp.attack.value = 0.004; comp.release.value = 0.2;
    this.master = c.createGain(); this.master.gain.value = 0.75;
    this.master.connect(comp); comp.connect(this.out); this.out.connect(c.destination);

    // Reverb (generated impulse) and a tempo delay, shared by everything.
    this.reverb = c.createConvolver();
    this.reverb.buffer = this._impulse(3.8, 2.6);
    this.revIn = c.createGain(); this.revIn.gain.value = 1;
    this.revIn.connect(this.reverb); this.reverb.connect(this.master);

    this.delay = c.createDelay(2); this.delay.delayTime.value = 0.33;
    this.delayFb = c.createGain(); this.delayFb.gain.value = 0.38;
    const dlp = c.createBiquadFilter(); dlp.type = 'lowpass'; dlp.frequency.value = 3200;
    this.delayIn = c.createGain();
    this.delayIn.connect(this.delay); this.delay.connect(dlp); dlp.connect(this.delayFb);
    this.delayFb.connect(this.delay); dlp.connect(this.master); dlp.connect(this.revIn);

    // Music bus with an era filter and send levels.
    this.music = c.createGain(); this.music.gain.value = 0.0;
    this.musicLP = c.createBiquadFilter(); this.musicLP.type = 'lowpass'; this.musicLP.frequency.value = 12000;
    this.music.connect(this.musicLP); this.musicLP.connect(this.master);
    this.musicRev = c.createGain(); this.musicRev.gain.value = 0.3;
    this.musicDel = c.createGain(); this.musicDel.gain.value = 0.2;
    this.musicLP.connect(this.musicRev); this.musicRev.connect(this.revIn);
    this.musicLP.connect(this.musicDel); this.musicDel.connect(this.delayIn);

    this.sfxBus = c.createGain(); this.sfxBus.gain.value = 0.8;
    this.sfxBus.connect(this.master);
    this.sfxRev = c.createGain(); this.sfxRev.gain.value = 0.25;
    this.sfxBus.connect(this.sfxRev); this.sfxRev.connect(this.revIn);

    // Noise buffer.
    const n = c.sampleRate * 2;
    this.noise = c.createBuffer(1, n, c.sampleRate);
    const d = this.noise.getChannelData(0);
    for (let i = 0; i < n; i++) d[i] = Math.random() * 2 - 1;

    this.waves = {
      pulse12: this._pulse(0.125),
      pulse25: this._pulse(0.25),
      pulse50: this._pulse(0.5),
    };

    this.nextTime = c.currentTime + 0.1;
    this._timer = setInterval(() => this._schedule(), 25);
    document.addEventListener('visibilitychange', () => {
      if (!this.ctx) return;
      if (document.hidden) this.ctx.suspend(); else this.ctx.resume();
    });
  }

  setMuted(m) {
    this.muted = m;
    if (this.out) this.out.gain.setTargetAtTime(m ? 0 : 1, this.ctx.currentTime, 0.05);
  }

  _impulse(seconds, decay) {
    const c = this.ctx, len = Math.floor(c.sampleRate * seconds);
    const buf = c.createBuffer(2, len, c.sampleRate);
    for (let ch = 0; ch < 2; ch++) {
      const d = buf.getChannelData(ch);
      for (let i = 0; i < len; i++) {
        const t = i / len;
        d[i] = (Math.random() * 2 - 1) * Math.pow(1 - t, decay) * (i < 200 ? i / 200 : 1);
      }
    }
    return buf;
  }

  _pulse(duty) {
    const N = 48, re = new Float32Array(N), im = new Float32Array(N);
    for (let k = 1; k < N; k++) {
      re[k] = (2 / (k * Math.PI)) * Math.sin(2 * Math.PI * k * duty);
      im[k] = (2 / (k * Math.PI)) * (1 - Math.cos(2 * Math.PI * k * duty));
    }
    return this.ctx.createPeriodicWave(re, im);
  }

  // --- Music ---------------------------------------------------------------
  setStyle(name, immediate = false) {
    if (!this.ctx) { this.style = name; return; }
    if (name === this.style && !this.pending) return;
    const c = this.ctx, t = c.currentTime;
    this.music.gain.cancelScheduledValues(t);
    this.music.gain.setTargetAtTime(0, t, 0.15);
    this.pending = name;
    this._pendingAt = t + (immediate ? 0.05 : 0.45);
  }

  _applyStyle(name) {
    this.style = name;
    const s = STYLES[name];
    const c = this.ctx, t = c.currentTime;
    if (!s) { this.music.gain.setTargetAtTime(0, t, 0.2); return; }
    this.bpm = s.bpm;
    this.musicRev.gain.setTargetAtTime(s.reverb, t, 0.1);
    this.musicDel.gain.setTargetAtTime(s.delay, t, 0.1);
    this.musicLP.frequency.setTargetAtTime(s.lp, t, 0.1);
    this.delay.delayTime.setTargetAtTime((60 / s.bpm) * 0.75, t, 0.05);
    this.music.gain.setTargetAtTime(name === 'terminal' ? 0.5 : 0.42, t, 0.6);
    this.step = 0; this.bar = 0;
    this.nextTime = t + 0.08;
  }

  _schedule() {
    const c = this.ctx;
    if (!c || c.state !== 'running') return;
    if (this.pending && c.currentTime >= this._pendingAt) {
      const p = this.pending; this.pending = null; this._applyStyle(p);
    }
    if (!STYLES[this.style]) { this.nextTime = c.currentTime + 0.05; return; }
    const spb = 60 / this.bpm / 4; // seconds per 16th
    while (this.nextTime < c.currentTime + 0.12) {
      if (this.nextTime < c.currentTime - 0.2) this.nextTime = c.currentTime + 0.02;
      this._playStep(this.nextTime, this.step, this.bar, spb);
      this.step++;
      if (this.step >= 16) { this.step = 0; this.bar = (this.bar + 1) % 8; }
      this.nextTime += spb;
    }
  }

  _playStep(t, step, bar, spb) {
    const st = this.style;
    const chord = CHORDS[bar % 4];
    const mel = MELODY[bar];
    const melNote = mel.find((m) => m[0] === step);
    const P = (m, d, v, opts) => this.voice(t, m, d, v, opts, this.music);
    const kick = (v = 1) => this.drum(t, 'kick', v, this.music);
    const snare = (v = 1) => this.drum(t, 'snare', v, this.music);
    const hat = (v = 1) => this.drum(t, 'hat', v, this.music);

    if (st === 'terminal') {
      // A dark drone; melody arrives as distant teletype beeps.
      if (step === 0) {
        P(chord[0] - 12, spb * 16, 0.25, { wave: 'sine', a: 1.5, r: 2 });
        P(chord[1] - 12, spb * 16, 0.12, { wave: 'triangle', a: 2, r: 2 });
      }
      if (melNote && (bar % 2 === 1 || step === 0)) P(melNote[1] + 12, 0.06, 0.07, { wave: 'pulse50', a: 0.002, r: 0.03 });
    } else if (st === 'vector') {
      if (step === 0) {
        P(chord[0] - 12, spb * 16, 0.32, { wave: 'sine', a: 0.4, r: 1.5 });
        P(chord[2], spb * 16, 0.06, { wave: 'sine', a: 2, r: 2 });
      }
      if (melNote) P(melNote[1], melNote[2] * spb * 1.2, 0.16, { wave: 'sine', a: 0.03, r: 0.6, vib: 4 });
      if (step % 4 === 2) P(chord[(step / 2) % 5] + 12, 0.08, 0.04, { wave: 'triangle', a: 0.003, r: 0.2 });
    } else if (st === 'chip' || st === 'chip2') {
      if (melNote) P(melNote[1], melNote[2] * spb * 0.92, 0.13, { wave: st === 'chip' ? 'pulse25' : 'pulse12', a: 0.002, r: 0.04, vib: melNote[2] > 3 ? 5 : 0 });
      // arpeggio
      const ar = chord[2 + (step % 3)] + 12;
      P(ar, spb * 0.9, 0.035, { wave: 'pulse12', a: 0.001, r: 0.01 });
      // bass: octave bounce
      if (step % 2 === 0) P(chord[0] - 12 + (step % 4 === 2 ? 12 : 0), spb * 1.6, 0.26, { wave: 'triangle', a: 0.002, r: 0.02 });
      if (step % 8 === 0) kick(0.8);
      if (step % 8 === 4) snare(0.5);
      if (st === 'chip2' && step % 2 === 1) hat(0.25);
    } else if (st === 'dark') {
      if (melNote) P(melNote[1] - 12, melNote[2] * spb, 0.12, { wave: 'sawtooth', a: 0.01, r: 0.2, lp: 1600, lpEnv: 2400 });
      if (step % 2 === 0) P(chord[0] - 24, spb * 1.8, 0.28, { wave: 'square', a: 0.005, r: 0.05, lp: 500, lpEnv: 900 });
      if (step === 0 || step === 10) kick(1);
      if (step === 4 || step === 12) snare(0.7);
      if (step % 4 === 2) hat(0.2);
    } else if (st === 'synth') {
      if (melNote) P(melNote[1], melNote[2] * spb, 0.14, { wave: 'fm', ratio: 2, index: 3, a: 0.003, r: 0.4 });
      if (step === 0) chord.slice(1).forEach((m) => P(m, spb * 15, 0.045, { wave: 'sawtooth', a: 0.3, r: 0.6, lp: 1400, detune: 8 }));
      if (step % 2 === 0) P(chord[0] - 12, spb * 1.2, 0.22, { wave: 'sawtooth', a: 0.003, r: 0.06, lp: 400, lpEnv: 1200 });
      if (step % 4 === 0) kick(0.9);
      if (step === 4 || step === 12) snare(0.6);
      if (step % 2 === 1) hat(0.15);
    } else if (st === 'fm') {
      if (melNote) P(melNote[1] + 12, melNote[2] * spb * 1.5, 0.09, { wave: 'fm', ratio: 3.5, index: 5, a: 0.002, r: 1.2 });
      if (step === 0) chord.slice(0, 4).forEach((m, i) => P(m, spb * 16, 0.05, { wave: 'fm', ratio: 1, index: 1.2, a: 0.6, r: 1, detune: i * 3 }));
      if (step === 0 || step === 6 || step === 8) kick(0.6);
      if (step % 4 === 2) hat(0.12);
    } else if (st === 'lush' || st === 'pulse') {
      if (step === 0) chord.forEach((m) => P(m, spb * 16, 0.035, { wave: 'supersaw', a: 1.2, r: 1.6, lp: 2600 }));
      if (melNote) P(melNote[1], melNote[2] * spb * 1.4, 0.1, { wave: 'triangle', a: 0.02, r: 0.8, vib: 4 });
      if (step % 4 === 0) P(chord[0] - 24, spb * 3.5, 0.28, { wave: 'sine', a: 0.01, r: 0.2 });
      if (st === 'pulse') {
        if (step % 4 === 0) kick(0.8);
        if (step % 8 === 4) snare(0.35);
        if (step % 2 === 1) hat(0.18);
      } else if (step % 4 === 2) hat(0.08);
    } else if (st === 'ambient') {
      if (step === 0 && bar % 2 === 0) chord.forEach((m, i) => P(m + (i > 2 ? 12 : 0), spb * 32, 0.04, { wave: 'supersaw', a: 3, r: 4, lp: 1800 }));
      if (melNote && (step % 4 === 0)) P(melNote[1] + 12, 2.5, 0.06, { wave: 'fm', ratio: 3.01, index: 2.2, a: 0.003, r: 2.5 });
      if (step === 0) P(chord[0] - 24, spb * 16, 0.2, { wave: 'sine', a: 1, r: 2 });
    }
  }

  // Generic synth voice.
  voice(t, midi, dur, vel = 0.2, o = {}, bus = this.sfxBus) {
    const c = this.ctx; if (!c) return;
    const f = mtof(midi);
    const a = o.a ?? 0.005, r = o.r ?? 0.1;
    const g = c.createGain();
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(vel, t + a);
    g.gain.setValueAtTime(vel, t + Math.max(a, dur));
    g.gain.exponentialRampToValueAtTime(0.0001, t + Math.max(a, dur) + r);
    let node = g;
    if (o.lp) {
      const lp = c.createBiquadFilter(); lp.type = 'lowpass'; lp.Q.value = o.q ?? 4;
      lp.frequency.setValueAtTime(o.lp + (o.lpEnv || 0), t);
      if (o.lpEnv) lp.frequency.exponentialRampToValueAtTime(o.lp, t + Math.min(dur, 0.25));
      lp.connect(g); node = lp;
    }
    const stopAt = t + Math.max(a, dur) + r + 0.05;
    const mk = (type, freq, det = 0) => {
      const osc = c.createOscillator();
      if (this.waves[type]) osc.setPeriodicWave(this.waves[type]); else osc.type = type;
      osc.frequency.value = freq; osc.detune.value = det;
      if (o.vib) {
        const l = c.createOscillator(), lg = c.createGain();
        l.frequency.value = 5.5; lg.gain.value = o.vib;
        l.connect(lg); lg.connect(osc.detune); l.start(t + 0.15); l.stop(stopAt);
      }
      osc.start(t); osc.stop(stopAt);
      return osc;
    };
    if (o.wave === 'fm') {
      const car = mk('sine', f), mod = c.createOscillator(), mg = c.createGain();
      mod.frequency.value = f * (o.ratio || 2);
      mg.gain.setValueAtTime(f * (o.index || 2), t);
      mg.gain.exponentialRampToValueAtTime(f * 0.05 + 1, t + Math.max(dur, 0.1) + r);
      mod.connect(mg); mg.connect(car.frequency); mod.start(t); mod.stop(stopAt);
      car.connect(node);
    } else if (o.wave === 'supersaw') {
      const mix = c.createGain(); mix.gain.value = 0.4; mix.connect(node);
      [-14, -5, 0, 6, 15].forEach((d) => mk('sawtooth', f, d).connect(mix));
    } else {
      const osc = mk(o.wave || 'sine', f, o.detune || 0);
      osc.connect(node);
    }
    g.connect(bus);
    if (o.pan) { /* pan handled by caller */ }
  }

  drum(t, kind, v = 1, bus = this.sfxBus) {
    const c = this.ctx; if (!c) return;
    if (kind === 'kick') {
      const o = c.createOscillator(), g = c.createGain();
      o.frequency.setValueAtTime(150, t); o.frequency.exponentialRampToValueAtTime(42, t + 0.12);
      g.gain.setValueAtTime(0.7 * v, t); g.gain.exponentialRampToValueAtTime(0.001, t + 0.3);
      o.connect(g); g.connect(bus); o.start(t); o.stop(t + 0.32);
    } else {
      const s = c.createBufferSource(); s.buffer = this.noise;
      const f = c.createBiquadFilter(), g = c.createGain();
      f.type = kind === 'hat' ? 'highpass' : 'bandpass';
      f.frequency.value = kind === 'hat' ? 7000 : 1800; f.Q.value = kind === 'hat' ? 0.7 : 0.9;
      const len = kind === 'hat' ? 0.05 : 0.18;
      g.gain.setValueAtTime((kind === 'hat' ? 0.25 : 0.45) * v, t);
      g.gain.exponentialRampToValueAtTime(0.001, t + len);
      s.connect(f); f.connect(g); g.connect(bus);
      s.start(t, Math.random() * 1.5); s.stop(t + len + 0.02);
    }
  }

  // --- Sound effects -------------------------------------------------------
  now() { return this.ctx ? this.ctx.currentTime : 0; }

  noiseBurst(dur, { type = 'bandpass', freq = 2000, q = 1, vel = 0.3, endFreq, t = this.now(), bus = this.sfxBus } = {}) {
    const c = this.ctx; if (!c) return;
    const s = c.createBufferSource(); s.buffer = this.noise;
    const f = c.createBiquadFilter(); f.type = type; f.frequency.setValueAtTime(freq, t); f.Q.value = q;
    if (endFreq) f.frequency.exponentialRampToValueAtTime(endFreq, t + dur);
    const g = c.createGain(); g.gain.setValueAtTime(vel, t); g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    s.connect(f); f.connect(g); g.connect(bus);
    s.start(t, Math.random()); s.stop(t + dur + 0.02);
  }

  tone(freq, dur, { wave = 'square', vel = 0.15, t = this.now(), endFreq, a = 0.002, bus = this.sfxBus } = {}) {
    const c = this.ctx; if (!c) return;
    const o = c.createOscillator();
    if (this.waves[wave]) o.setPeriodicWave(this.waves[wave]); else o.type = wave;
    o.frequency.setValueAtTime(freq, t);
    if (endFreq) o.frequency.exponentialRampToValueAtTime(endFreq, t + dur);
    const g = c.createGain(); g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(vel, t + a);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    o.connect(g); g.connect(bus); o.start(t); o.stop(t + dur + 0.02);
  }

  key() { // mechanical key switch
    if (!this.ctx) return;
    const t = this.now();
    this.noiseBurst(0.025, { freq: 3200 + Math.random() * 1500, q: 2, vel: 0.22, t });
    this.tone(120 + Math.random() * 40, 0.03, { wave: 'sine', vel: 0.12, t });
  }
  bell() { this.tone(1046, 0.18, { wave: 'pulse50', vel: 0.08 }); }
  click(era = 'modern') {
    if (!this.ctx) return;
    if (era === 'chip') this.tone(880, 0.06, { wave: 'pulse25', vel: 0.08, endFreq: 1320 });
    else if (era === 'terminal') this.key();
    else { this.tone(1800, 0.04, { wave: 'sine', vel: 0.06, endFreq: 1200 }); }
  }
  hover() { if (this.ctx) this.tone(2400, 0.025, { wave: 'sine', vel: 0.02 }); }
  thunk() {
    if (!this.ctx) return; const t = this.now();
    this.tone(70, 0.35, { wave: 'sine', vel: 0.6, endFreq: 38, t });
    this.noiseBurst(0.05, { freq: 900, q: 0.5, vel: 0.4, t });
  }
  powerOn() {
    if (!this.ctx) return; const t = this.now();
    this.thunk();
    // degauss: a buzzing, decaying 50-60Hz wobble
    const c = this.ctx, o = c.createOscillator(), g = c.createGain(), lp = c.createBiquadFilter();
    o.type = 'sawtooth'; o.frequency.value = 60; lp.type = 'lowpass'; lp.frequency.value = 500;
    g.gain.setValueAtTime(0.0, t); g.gain.linearRampToValueAtTime(0.25, t + 0.05);
    g.gain.exponentialRampToValueAtTime(0.001, t + 1.4);
    const lfo = c.createOscillator(), lg = c.createGain(); lfo.frequency.value = 9; lg.gain.value = 0.15;
    lfo.connect(lg); lg.connect(g.gain);
    o.connect(lp); lp.connect(g); g.connect(this.sfxBus);
    o.start(t); o.stop(t + 1.5); lfo.start(t); lfo.stop(t + 1.5);
    this.tone(14800, 2.5, { wave: 'sine', vel: 0.012, t: t + 0.2, a: 0.4 });
  }
  powerOff() {
    if (!this.ctx) return; const t = this.now();
    this.tone(900, 0.5, { wave: 'sine', vel: 0.12, endFreq: 40, t });
    this.noiseBurst(0.3, { freq: 3000, endFreq: 200, vel: 0.15, t });
  }
  whoosh(dur = 1.2, up = true, vel = 0.25) {
    if (!this.ctx) return;
    this.noiseBurst(dur, { type: 'bandpass', freq: up ? 300 : 4000, endFreq: up ? 5000 : 200, q: 1.5, vel });
  }
  glitch() {
    if (!this.ctx) return; const t = this.now();
    for (let i = 0; i < 6; i++) {
      this.tone(100 + Math.random() * 2000, 0.03, { wave: 'square', vel: 0.05, t: t + i * 0.035 });
    }
    this.noiseBurst(0.22, { type: 'highpass', freq: 1000, vel: 0.12, t });
  }
  chime(notes = [74, 78, 81, 86], wave = 'triangle', gap = 0.07) {
    if (!this.ctx) return; const t = this.now();
    notes.forEach((m, i) => this.voice(t + i * gap, m, 0.12, 0.12, { wave, a: 0.003, r: 0.5 }));
  }
  secret() {
    const st = this.style;
    if (st.startsWith('chip')) this.chime([72, 76, 79, 84, 88], 'pulse25', 0.06);
    else if (st === 'terminal') this.chime([84, 88, 91, 96], 'pulse50', 0.05);
    else this.chime([74, 81, 86, 90, 93], 'fm', 0.08);
  }
  swell() {
    if (!this.ctx) return; const t = this.now();
    [38, 50, 57, 62, 65, 69, 74, 81].forEach((m, i) => {
      this.voice(t + i * 0.05, m, 3.2, 0.06, { wave: i < 2 ? 'sine' : 'supersaw', a: 1.4, r: 2.5, lp: 3000 });
    });
    this.voice(t + 0.6, 86, 2, 0.05, { wave: 'fm', ratio: 3.01, index: 2, a: 0.01, r: 3 });
  }
  rewind(dur = 4) {
    // A tape-rewind smear down through the eras.
    if (!this.ctx) return; const t = this.now();
    const c = this.ctx, o = c.createOscillator(), g = c.createGain(), f = c.createBiquadFilter();
    o.type = 'sawtooth'; o.frequency.setValueAtTime(880, t); o.frequency.exponentialRampToValueAtTime(30, t + dur);
    f.type = 'bandpass'; f.frequency.setValueAtTime(3000, t); f.frequency.exponentialRampToValueAtTime(120, t + dur);
    g.gain.setValueAtTime(0.0, t); g.gain.linearRampToValueAtTime(0.12, t + 0.3); g.gain.linearRampToValueAtTime(0.0, t + dur);
    o.connect(f); f.connect(g); g.connect(this.sfxBus); o.start(t); o.stop(t + dur + 0.1);
    for (let i = 0; i < 18; i++) {
      const tt = t + (i / 18) * dur;
      this.tone(2000 * Math.pow(0.82, i), 0.04, { wave: i < 9 ? 'sine' : 'pulse25', vel: 0.04, t: tt });
    }
  }
  /** Rising pentatonic tick, used for step-by-step reveals. */
  tick(n = 0, vel = 0.05) {
    const scale = [0, 2, 4, 7, 9];
    const midi = 62 + scale[((n % 5) + 5) % 5] + 12 * Math.floor(n / 5);
    this.tone(440 * Math.pow(2, (midi - 69) / 12), 0.09, { wave: 'triangle', vel });
  }
  /** A mechanical push-button. */
  button() {
    if (!this.ctx) return; const t = this.now();
    this.noiseBurst(0.02, { freq: 2600, q: 3, vel: 0.25, t });
    this.tone(180, 0.04, { wave: 'sine', vel: 0.18, t });
    this.noiseBurst(0.015, { freq: 1800, q: 3, vel: 0.15, t: t + 0.06 });
  }
  /** One detent of a rotary knob. */
  detent() { if (this.ctx) this.noiseBurst(0.012, { freq: 4200, q: 4, vel: 0.12 }); }
  /** A heavy relay, like a gallery spotlight switching on. */
  relay(vel = 0.3) {
    if (!this.ctx) return; const t = this.now();
    this.noiseBurst(0.05, { type: 'lowpass', freq: 700, vel, t });
    this.tone(55, 0.25, { wave: 'sine', vel: vel * 0.8, t, endFreq: 40 });
  }
  /** The upgrade wavefront: a rising shimmer. */
  sweep(dur = 1.6, vel = 0.08) {
    if (!this.ctx) return; const t = this.now();
    this.noiseBurst(dur, { type: 'bandpass', freq: 600, endFreq: 7000, q: 6, vel: vel * 1.5, t });
    [0, 7, 12, 19].forEach((iv, i) => this.voice(t + i * dur * 0.18, 62 + iv, 0.2, vel * 0.7, { wave: 'fm', ratio: 3.01, index: 1.5, a: 0.005, r: 0.9 }));
  }
  laser() { this.tone(1400, 0.12, { wave: 'sawtooth', vel: 0.07, endFreq: 180 }); }
  boom(size = 1) { this.noiseBurst(0.3 + size * 0.3, { type: 'lowpass', freq: 1200, endFreq: 60, vel: 0.35, q: 0.5 }); }
  jump() { this.tone(300, 0.15, { wave: 'pulse25', vel: 0.08, endFreq: 900 }); }
  coin() { const t = this.now(); this.tone(1318, 0.06, { wave: 'pulse50', vel: 0.06, t }); this.tone(1760, 0.18, { wave: 'pulse50', vel: 0.06, t: t + 0.06 }); }
  hurt() { this.tone(400, 0.25, { wave: 'pulse50', vel: 0.1, endFreq: 80 }); }
  footstep(i = 0) { this.noiseBurst(0.06, { type: 'lowpass', freq: 300 + (i % 2) * 60, vel: 0.12 }); }
  blipUp(n = 0) { this.tone(440 * Math.pow(2, n / 12), 0.08, { wave: 'triangle', vel: 0.08 }); }

  // Hum of a powered CRT (60Hz mains + flyback whine).
  hum(on) {
    if (!this.ctx) return;
    const c = this.ctx, t = c.currentTime;
    if (on && !this._hum) {
      const g = c.createGain(); g.gain.value = 0; g.connect(this.master);
      const a = c.createOscillator(); a.frequency.value = 60; a.type = 'sine';
      const b = c.createOscillator(); b.frequency.value = 120; b.type = 'triangle';
      const bg = c.createGain(); bg.gain.value = 0.35;
      const w = c.createOscillator(); w.frequency.value = 15734; w.type = 'sine';
      const wg = c.createGain(); wg.gain.value = 0.02;
      a.connect(g); b.connect(bg); bg.connect(g); w.connect(wg); wg.connect(g);
      [a, b, w].forEach((o) => o.start());
      g.gain.setTargetAtTime(0.05, t, 0.5);
      this._hum = { g, nodes: [a, b, w] };
    } else if (!on && this._hum) {
      const h = this._hum; this._hum = null;
      h.g.gain.setTargetAtTime(0, t, 0.3);
      setTimeout(() => h.nodes.forEach((o) => o.stop()), 1500);
    }
  }

  // Oscilloscope XY: left channel = x, right channel = y. The picture IS the sound.
  scope() {
    const c = this.ctx; if (!c) return null;
    const ox = c.createOscillator(), oy = c.createOscillator();
    ox.type = oy.type = 'sine';
    const dly = c.createDelay(1);
    const gx = c.createGain(), gy = c.createGain();
    gx.gain.value = gy.gain.value = 0.9;
    ox.connect(gx); oy.connect(dly); dly.connect(gy);
    const merger = c.createChannelMerger(2);
    gx.connect(merger, 0, 0); gy.connect(merger, 0, 1);
    const anX = c.createAnalyser(), anY = c.createAnalyser();
    anX.fftSize = anY.fftSize = 2048;
    gx.connect(anX); gy.connect(anY);
    const vol = c.createGain(); vol.gain.value = 0;
    merger.connect(vol); vol.connect(this.master);
    ox.start(); oy.start();
    vol.gain.setTargetAtTime(0.09, c.currentTime, 0.2);
    const bx = new Float32Array(2048), by = new Float32Array(2048);
    const api = {
      set(fx, fy, phase) {
        ox.frequency.setTargetAtTime(fx, c.currentTime, 0.02);
        oy.frequency.setTargetAtTime(fy, c.currentTime, 0.02);
        dly.delayTime.setTargetAtTime(((phase / (Math.PI * 2)) / fy) % (1 / fy), c.currentTime, 0.02);
      },
      read() { anX.getFloatTimeDomainData(bx); anY.getFloatTimeDomainData(by); return [bx, by]; },
      stop() { vol.gain.setTargetAtTime(0, c.currentTime, 0.05); setTimeout(() => { ox.stop(); oy.stop(); }, 300); },
    };
    return api;
  }
}

