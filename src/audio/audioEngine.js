// NEON ESCAPE — audioEngine.js
// Procedural Web Audio engine: synthwave music loop, engine/skid/wind,
// one-shot SFX, and ambient city hum. Zero external assets, Web Audio only.

const BPM = 112;
const SIXTEENTH = 60 / BPM / 4;

// Chord progression: Am - F - C - G (one chord per bar, midi numbers)
const CHORDS = [
  { root: 33, tones: [57, 60, 64] }, // Am: A1 root, A3 C4 E4 pad
  { root: 29, tones: [53, 57, 60] }, // F:  F1 root, F3 A3 C4 pad
  { root: 36, tones: [60, 64, 67] }, // C:  C2 root, C4 E4 G4 pad
  { root: 31, tones: [55, 59, 62] }, // G:  G1 root, G3 B3 D4 pad
];
const BASS_PATTERN = [0, 0, 12, 0, 0, 7, 0, 3]; // semitone offsets per 8th note

const midiHz = (m) => 440 * Math.pow(2, (m - 69) / 12);
const clamp01 = (v) => Math.min(1, Math.max(0, v));

export const audio = {
  ctx: null,
  masterGain: null,
  musicGain: null,
  sfxGain: null,

  _noiseBuf: null,
  _wsCurve: null,
  _engine: null, // { osc, sub, filter, gain, lfo }
  _skid: null, // { gain }
  _wind: null, // { gain }
  _music: null, // { timer, step, nextTime }
  _musicPending: false,
  _volumes: { master: 80, music: 70, sfx: 80 },

  // ---- lifecycle ----------------------------------------------------------

  unlock() {
    if (!this.ctx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return;
      this.ctx = new AC();

      this.masterGain = this.ctx.createGain();
      this.masterGain.connect(this.ctx.destination);

      this.musicGain = this.ctx.createGain();
      this.musicGain.connect(this.masterGain);

      this.sfxGain = this.ctx.createGain();
      this.sfxGain.connect(this.masterGain);

      this._applyVolumes();
      this._makeNoiseBuffer();
      this._startAmbient();
    }
    if (this.ctx.state === 'suspended') this.ctx.resume();
    if (this._musicPending) {
      this._musicPending = false;
      this.startMusic();
    }
  },

  setVolumes({ master, music, sfx } = {}) {
    if (master !== undefined)
      this._volumes.master = Math.min(100, Math.max(0, master));
    if (music !== undefined)
      this._volumes.music = Math.min(100, Math.max(0, music));
    if (sfx !== undefined) this._volumes.sfx = Math.min(100, Math.max(0, sfx));
    if (!this.ctx) return;
    this._applyVolumes();
  },

  _applyVolumes() {
    const t = this.ctx.currentTime;
    this.masterGain.gain.setTargetAtTime(this._volumes.master / 100, t, 0.05);
    this.musicGain.gain.setTargetAtTime(this._volumes.music / 100, t, 0.05);
    this.sfxGain.gain.setTargetAtTime(this._volumes.sfx / 100, t, 0.05);
  },

  // ---- shared resources ---------------------------------------------------

  _makeNoiseBuffer() {
    const len = this.ctx.sampleRate * 2;
    const buf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    this._noiseBuf = buf;
  },

  _noiseSource() {
    const src = this.ctx.createBufferSource();
    src.buffer = this._noiseBuf;
    src.loop = true;
    return src;
  },

  _distortionCurve() {
    if (this._wsCurve) return this._wsCurve;
    const n = 256;
    const curve = new Float32Array(n);
    for (let i = 0; i < n; i++) {
      const x = (i / (n - 1)) * 2 - 1;
      curve[i] = Math.tanh(3 * x);
    }
    this._wsCurve = curve;
    return curve;
  },

  // ---- ambient city hum (started on unlock) -------------------------------

  _startAmbient() {
    const t = this.ctx.currentTime;

    const osc = this.ctx.createOscillator();
    osc.type = 'sine';
    osc.frequency.value = 55;
    const og = this.ctx.createGain();
    og.gain.value = 0.02;
    osc.connect(og);
    og.connect(this.sfxGain);
    osc.start(t);

    const src = this._noiseSource();
    const f = this.ctx.createBiquadFilter();
    f.type = 'lowpass';
    f.frequency.value = 200;
    const ng = this.ctx.createGain();
    ng.gain.value = 0.008;
    src.connect(f);
    f.connect(ng);
    ng.connect(this.sfxGain);
    src.start(t);
  },

  // ---- engine -------------------------------------------------------------

  engineStart() {
    if (!this.ctx || this._engine) return;
    const t = this.ctx.currentTime;

    const osc = this.ctx.createOscillator();
    osc.type = 'sawtooth';
    osc.frequency.value = 70;

    const sub = this.ctx.createOscillator();
    sub.type = 'square';
    sub.frequency.value = 35;

    const filter = this.ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = 500;
    filter.Q.value = 2;

    const subGain = this.ctx.createGain();
    subGain.gain.value = 0.5;

    const gain = this.ctx.createGain();
    gain.gain.value = 0;
    gain.gain.setTargetAtTime(0.12, t, 0.2);

    // slight vibrato
    const lfo = this.ctx.createOscillator();
    lfo.type = 'sine';
    lfo.frequency.value = 8;
    const lfoGain = this.ctx.createGain();
    lfoGain.gain.value = 4;
    lfo.connect(lfoGain);
    lfoGain.connect(osc.frequency);
    lfoGain.connect(sub.frequency);

    osc.connect(filter);
    sub.connect(subGain);
    subGain.connect(filter);
    filter.connect(gain);
    gain.connect(this.sfxGain);

    osc.start(t);
    sub.start(t);
    lfo.start(t);

    this._engine = { osc, sub, filter, gain, lfo };
  },

  engineStop() {
    if (!this.ctx || !this._engine) return;
    const t = this.ctx.currentTime;
    const e = this._engine;
    this._engine = null;
    e.gain.gain.setTargetAtTime(0, t, 0.08);
    setTimeout(() => {
      try {
        e.osc.stop();
        e.sub.stop();
        e.lfo.stop();
        e.gain.disconnect();
      } catch (_) {
        /* already stopped */
      }
    }, 500);
  },

  setEngine(rpm01, load01, nitro01) {
    if (!this.ctx || !this._engine) return;
    const t = this.ctx.currentTime;
    const rpm = clamp01(rpm01);
    const load = clamp01(load01);
    const nitro = clamp01(nitro01);
    const freq = 60 + rpm * 220 + nitro * 40;
    this._engine.osc.frequency.setTargetAtTime(freq, t, 0.05);
    this._engine.sub.frequency.setTargetAtTime(freq / 2, t, 0.05);
    this._engine.filter.frequency.setTargetAtTime(
      400 + rpm * 1600 + nitro * 2000,
      t,
      0.1
    );
    this._engine.gain.gain.setTargetAtTime(
      0.08 + load * 0.1 + nitro * 0.06,
      t,
      0.05
    );
  },

  // ---- skid ----------------------------------------------------------------

  _ensureSkid() {
    if (this._skid) return;
    const src = this._noiseSource();
    const f = this.ctx.createBiquadFilter();
    f.type = 'bandpass';
    f.frequency.value = 900;
    f.Q.value = 8;
    const g = this.ctx.createGain();
    g.gain.value = 0;
    src.connect(f);
    f.connect(g);
    g.connect(this.sfxGain);
    src.start();
    this._skid = { gain: g };
  },

  setSkid(amount01) {
    if (!this.ctx) return;
    this._ensureSkid();
    const a = clamp01(amount01);
    this._skid.gain.gain.setTargetAtTime(a * 0.25, this.ctx.currentTime, 0.05);
  },

  // ---- wind -----------------------------------------------------------------

  _ensureWind() {
    if (this._wind) return;
    const src = this._noiseSource();
    const f = this.ctx.createBiquadFilter();
    f.type = 'lowpass';
    f.frequency.value = 400;
    const g = this.ctx.createGain();
    g.gain.value = 0;
    src.connect(f);
    f.connect(g);
    g.connect(this.sfxGain);
    src.start();
    this._wind = { gain: g };
  },

  setWind(amount01) {
    if (!this.ctx) return;
    this._ensureWind();
    const a = clamp01(amount01);
    this._wind.gain.gain.setTargetAtTime(a * 0.5, this.ctx.currentTime, 0.1);
  },

  // ---- one-shot SFX ----------------------------------------------------------

  impact(strength01) {
    if (!this.ctx) return;
    const s = clamp01(strength01);
    if (s <= 0) return;
    const t = this.ctx.currentTime;

    // noise burst with lowpass sweep
    const src = this.ctx.createBufferSource();
    src.buffer = this._noiseBuf;
    const f = this.ctx.createBiquadFilter();
    f.type = 'lowpass';
    f.frequency.setValueAtTime(2500, t);
    f.frequency.exponentialRampToValueAtTime(150, t + 0.25);
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0.6 * s, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.25);
    src.connect(f);
    f.connect(g);
    g.connect(this.sfxGain);
    src.start(t);
    src.stop(t + 0.3);

    // low thump: sine drop 120 -> 40 Hz
    const o = this.ctx.createOscillator();
    o.type = 'sine';
    o.frequency.setValueAtTime(120, t);
    o.frequency.exponentialRampToValueAtTime(40, t + 0.2);
    const og = this.ctx.createGain();
    og.gain.setValueAtTime(0.8 * s, t);
    og.gain.exponentialRampToValueAtTime(0.001, t + 0.22);
    o.connect(og);
    og.connect(this.sfxGain);
    o.start(t);
    o.stop(t + 0.25);
  },

  explosion() {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;

    const ws = this.ctx.createWaveShaper();
    ws.curve = this._distortionCurve();

    // long noise burst
    const src = this.ctx.createBufferSource();
    src.buffer = this._noiseBuf;
    const f = this.ctx.createBiquadFilter();
    f.type = 'lowpass';
    f.frequency.setValueAtTime(4000, t);
    f.frequency.exponentialRampToValueAtTime(80, t + 1.1);
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0.9, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + 1.2);
    src.connect(f);
    f.connect(ws);
    ws.connect(g);
    g.connect(this.sfxGain);
    src.start(t);
    src.stop(t + 1.3);

    // deep sine drop 100 -> 28 Hz
    const o = this.ctx.createOscillator();
    o.type = 'sine';
    o.frequency.setValueAtTime(100, t);
    o.frequency.exponentialRampToValueAtTime(28, t + 0.8);
    const og = this.ctx.createGain();
    og.gain.setValueAtTime(1.0, t);
    og.gain.exponentialRampToValueAtTime(0.001, t + 0.9);
    o.connect(ws);
    ws.connect(og);
    og.connect(this.sfxGain);
    o.start(t);
    o.stop(t + 1.0);
  },

  pickup() {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    [660, 990].forEach((freq, i) => {
      const start = t + i * 0.12;
      const o = this.ctx.createOscillator();
      o.type = 'square';
      o.frequency.value = freq;
      const g = this.ctx.createGain();
      g.gain.setValueAtTime(0.0001, start);
      g.gain.exponentialRampToValueAtTime(0.25, start + 0.01);
      g.gain.exponentialRampToValueAtTime(0.001, start + 0.11);
      o.connect(g);
      g.connect(this.sfxGain);
      o.start(start);
      o.stop(start + 0.13);
    });
  },

  uiClick() {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    const o = this.ctx.createOscillator();
    o.type = 'square';
    o.frequency.value = 1200;
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0.15, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.05);
    o.connect(g);
    g.connect(this.sfxGain);
    o.start(t);
    o.stop(t + 0.06);
  },

  // ---- synthwave music loop ---------------------------------------------------

  startMusic() {
    if (!this.ctx) {
      this._musicPending = true;
      return;
    }
    this._musicPending = false;
    if (this._music) return;
    this._music = {
      step: 0,
      nextTime: this.ctx.currentTime + 0.1,
      timer: null,
    };
    this._music.timer = setInterval(() => this._tick(), 100);
  },

  stopMusic() {
    this._musicPending = false;
    if (!this._music) return;
    clearInterval(this._music.timer);
    this._music = null;
  },

  _tick() {
    const m = this._music;
    if (!m || !this.ctx) return;
    while (m.nextTime < this.ctx.currentTime + 0.2) {
      this._scheduleStep(m.step, m.nextTime);
      m.nextTime += SIXTEENTH;
      m.step++;
    }
  },

  _scheduleStep(step, time) {
    const bar = Math.floor(step / 16) % 4;
    const s = step % 16;
    const chord = CHORDS[bar];

    if (s % 4 === 0) this._kick(time); // four-on-the-floor
    if (s % 4 === 2) this._hat(time); // offbeat hats
    if (s % 2 === 0) this._bass(chord.root + BASS_PATTERN[s / 2], time);
    if (s === 0) this._pad(chord.tones, time, 16 * SIXTEENTH);
    if (bar % 2 === 1) {
      // lead arp, very quiet, every other bar
      const arp = [
        chord.tones[0] + 12,
        chord.tones[1] + 12,
        chord.tones[2] + 12,
        chord.tones[2] + 24,
      ];
      this._lead(arp[s % 4], time);
    }
  },

  _kick(time) {
    const o = this.ctx.createOscillator();
    o.type = 'sine';
    o.frequency.setValueAtTime(150, time);
    o.frequency.exponentialRampToValueAtTime(45, time + 0.12);
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0.6, time);
    g.gain.exponentialRampToValueAtTime(0.001, time + 0.25);
    o.connect(g);
    g.connect(this.musicGain);
    o.start(time);
    o.stop(time + 0.3);
  },

  _hat(time) {
    const src = this.ctx.createBufferSource();
    src.buffer = this._noiseBuf;
    const f = this.ctx.createBiquadFilter();
    f.type = 'highpass';
    f.frequency.value = 7000;
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0.18, time);
    g.gain.exponentialRampToValueAtTime(0.001, time + 0.05);
    src.connect(f);
    f.connect(g);
    g.connect(this.musicGain);
    src.start(time);
    src.stop(time + 0.06);
  },

  _bass(midi, time) {
    const o = this.ctx.createOscillator();
    o.type = 'sawtooth';
    o.frequency.value = midiHz(midi);
    const f = this.ctx.createBiquadFilter();
    f.type = 'lowpass';
    f.frequency.value = 600;
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0.22, time);
    g.gain.exponentialRampToValueAtTime(0.001, time + 0.24);
    o.connect(f);
    f.connect(g);
    g.connect(this.musicGain);
    o.start(time);
    o.stop(time + 0.26);
  },

  _pad(tones, time, dur) {
    tones.forEach((midi) => {
      [-6, 6].forEach((cents) => {
        const o = this.ctx.createOscillator();
        o.type = 'sawtooth';
        o.frequency.value = midiHz(midi);
        o.detune.value = cents;
        const f = this.ctx.createBiquadFilter();
        f.type = 'lowpass';
        f.frequency.value = 1200;
        const g = this.ctx.createGain();
        g.gain.setValueAtTime(0.0001, time);
        g.gain.linearRampToValueAtTime(0.04, time + 0.5);
        g.gain.setValueAtTime(0.04, time + dur - 0.4);
        g.gain.linearRampToValueAtTime(0.0001, time + dur);
        o.connect(f);
        f.connect(g);
        g.connect(this.musicGain);
        o.start(time);
        o.stop(time + dur + 0.05);
      });
    });
  },

  _lead(midi, time) {
    const o = this.ctx.createOscillator();
    o.type = 'square';
    o.frequency.value = midiHz(midi);
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0.05, time);
    g.gain.exponentialRampToValueAtTime(0.001, time + 0.12);
    o.connect(g);
    g.connect(this.musicGain);
    o.start(time);
    o.stop(time + 0.14);
  },
};
