// Sound: everything is synthesized live with the Web Audio API (no audio files to ship or license).
// Buses: master > effects / ambience / interface / voices, each with its own volume setting.
// Positional sounds get distance falloff and left/right panning relative to the camera.

const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const rnd = (a, b) => a + Math.random() * (b - a);
const pickOne = (arr) => arr[Math.floor(Math.random() * arr.length)];

class Sound {
  constructor() {
    this.ctx = null;
    this.vol = { master: 0.8, sfx: 1, ambient: 0.6, ui: 0.8, voice: 0.9 };
    this.listener = { x: 0, z: 0, yaw: 0 };
    this.loops = new Map();
    this.lastPlayed = new Map();
    this.muffled = false;
  }

  /** Create the audio context (browsers only allow this after a click or key press). */
  unlock() {
    if (!this.ctx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return;
      this.setup(new AC());
      this.ticker = setInterval(() => this.tickLoops(), 120);
    }
    if (this.ctx.state === 'suspended') this.ctx.resume().catch(() => {});
  }

  /** Build the mixer on a context (a live one, or an offline one for tests). */
  setup(c) {
    {
      this.ctx = c;
      this.master = c.createGain();
      this.master.connect(c.destination);
      this.bus = {};
      for (const k of ['sfx', 'ambient', 'ui', 'voice']) {
        this.bus[k] = c.createGain();
        this.bus[k].connect(this.master);
      }
      // a short room echo shared by everything that asks for it
      this.verb = c.createDelay(1);
      this.verb.delayTime.value = 0.11;
      const fb = c.createGain();
      fb.gain.value = 0.32;
      const lp = c.createBiquadFilter();
      lp.type = 'lowpass';
      lp.frequency.value = 2400;
      this.verb.connect(lp);
      lp.connect(fb);
      fb.connect(this.verb);
      this.verbOut = c.createGain();
      this.verbOut.gain.value = 0.35;
      lp.connect(this.verbOut);
      this.verbOut.connect(this.bus.sfx);
      // white noise, reused by every noisy sound
      const n = c.sampleRate * 2;
      this.noiseBuf = c.createBuffer(1, n, c.sampleRate);
      const d = this.noiseBuf.getChannelData(0);
      for (let i = 0; i < n; i++) d[i] = Math.random() * 2 - 1;
      this.applyVolumes();
    }
  }

  setVolumes(v) {
    Object.assign(this.vol, v || {});
    this.applyVolumes();
  }

  applyVolumes() {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    this.master.gain.setTargetAtTime(this.vol.master, t, 0.05);
    for (const k of Object.keys(this.bus)) this.bus[k].gain.setTargetAtTime(this.vol[k] ?? 1, t, 0.05);
  }

  setListener(x, z, yaw) {
    this.listener.x = x;
    this.listener.z = z;
    this.listener.yaw = yaw;
  }

  get ok() {
    return !!this.ctx && (this.ctx.state === 'running' || this.offline);
  }

  // ---- building blocks ---------------------------------------------------
  /** Output node for one sound: positional (pan + falloff) when x/z are given. */
  out(o = {}) {
    const c = this.ctx;
    const g = c.createGain();
    let vol = (o.vol ?? 1) * (this.gainMul || 1);
    let node = g;
    if (o.x != null) {
      const L = this.listener;
      const dx = o.x - L.x;
      const dz = o.z - L.z;
      const d = Math.hypot(dx, dz);
      const maxD = o.range || 22;
      if (d > maxD) return null;
      vol *= Math.pow(1 - d / maxD, 1.6);
      const p = c.createStereoPanner();
      // camera looks along (sin yaw, cos yaw); its right is (-cos yaw, sin yaw)
      const right = -Math.cos(L.yaw) * dx + Math.sin(L.yaw) * dz;
      p.pan.value = d > 0.3 ? clamp(right / Math.max(d, 1), -0.85, 0.85) : 0;
      g.connect(p);
      node = p;
    }
    g.gain.value = vol;
    node.connect(this.bus[o.bus || 'sfx']);
    if (o.verb) node.connect(this.verb);
    return g;
  }

  tone(dst, { f = 440, f2 = null, dur = 0.2, type = 'sine', a = 0.005, vol = 0.3, at = 0, vib = 0, curve = 'exp' }) {
    const c = this.ctx;
    const t = c.currentTime + at;
    const o = c.createOscillator();
    o.type = type;
    o.frequency.setValueAtTime(f, t);
    if (f2) {
      if (curve === 'lin') o.frequency.linearRampToValueAtTime(f2, t + dur);
      else o.frequency.exponentialRampToValueAtTime(Math.max(20, f2), t + dur);
    }
    if (vib) {
      const l = c.createOscillator();
      const lg = c.createGain();
      l.frequency.value = 6;
      lg.gain.value = vib;
      l.connect(lg);
      lg.connect(o.frequency);
      l.start(t);
      l.stop(t + dur + 0.05);
    }
    const g = c.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol, t + a);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g);
    g.connect(dst);
    o.start(t);
    o.stop(t + dur + 0.05);
  }

  noise(dst, { dur = 0.2, vol = 0.3, type = 'bandpass', f = 1000, f2 = null, q = 1, a = 0.004, at = 0, hold = 0 }) {
    const c = this.ctx;
    const t = c.currentTime + at;
    const s = c.createBufferSource();
    s.buffer = this.noiseBuf;
    s.loop = true;
    const fl = c.createBiquadFilter();
    fl.type = type;
    fl.frequency.setValueAtTime(f, t);
    if (f2) fl.frequency.exponentialRampToValueAtTime(f2, t + dur);
    fl.Q.value = q;
    const g = c.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol, t + a);
    if (hold) g.gain.setValueAtTime(vol, t + a + hold);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    s.connect(fl);
    fl.connect(g);
    g.connect(dst);
    s.start(t, Math.random() * 1.5);
    s.stop(t + dur + 0.05);
  }

  // ---- one-shots -----------------------------------------------------------
  /**
   * Play a named sound. o: { x, z (positional), vol, range, surface, pitch }.
   * minGap keeps rapid repeats (several people stepping at once) from piling up.
   */
  play(name, o = {}) {
    if (!this.ok) return;
    const fn = SFX[name];
    if (!fn) return;
    const now = performance.now();
    const gap = o.minGap ?? 0;
    if (gap && now - (this.lastPlayed.get(name) || 0) < gap) return;
    this.lastPlayed.set(name, now);
    this.gainMul = GAIN[name] || 1;
    try {
      fn(this, o);
    } catch (e) {
      console.warn('sound', name, e);
    }
    this.gainMul = 1;
  }

  // ---- loops (ambience, engines, machines) -------------------------------------
  /** Keep a loop running at volume v (0 stops it, fading out). Call every frame or whenever it changes. */
  loop(name, v = 1, o = {}) {
    if (!this.ctx) return;
    let L = this.loops.get(name);
    if (!L && v > 0.001) {
      const def = LOOPS[name];
      if (!def) return;
      const c = this.ctx;
      const g = c.createGain();
      g.gain.value = 0;
      g.connect(this.bus[def.bus || 'ambient']);
      L = { name, g, nodes: [], v: 0, def, o };
      try {
        def.build(this, L);
      } catch (e) {
        console.warn('loop', name, e);
      }
      this.loops.set(name, L);
    }
    if (!L) return;
    L.o = o;
    if (Math.abs(L.v - v) > 0.01) {
      L.v = v;
      L.g.gain.setTargetAtTime(v * (L.def.vol ?? 1), this.ctx.currentTime, v > 0 ? 0.4 : 0.6);
    }
    if (v <= 0.001 && !L.stopAt) L.stopAt = performance.now() + 3000;
    if (v > 0.001) L.stopAt = 0;
  }

  /** Stop every loop except the ones named. */
  only(names) {
    for (const k of this.loops.keys()) if (!names.includes(k)) this.loop(k, 0);
  }

  stopAll() {
    for (const k of this.loops.keys()) this.loop(k, 0);
  }

  tickLoops() {
    const now = performance.now();
    for (const [k, L] of this.loops) {
      if (L.stopAt && now > L.stopAt) {
        for (const n of L.nodes) {
          try {
            n.stop?.();
            n.disconnect?.();
          } catch (_) {}
        }
        L.g.disconnect();
        this.loops.delete(k);
        continue;
      }
      if (L.v > 0.01 && L.def.tick && this.ok) {
        try {
          L.def.tick(this, L);
        } catch (_) {}
      }
    }
  }

  // loop helpers
  noiseBed(L, { type = 'lowpass', f = 800, q = 0.7, vol = 0.3, lfo = 0, lfoRate = 0.2 }) {
    const c = this.ctx;
    const s = c.createBufferSource();
    s.buffer = this.noiseBuf;
    s.loop = true;
    const fl = c.createBiquadFilter();
    fl.type = type;
    fl.frequency.value = f;
    fl.Q.value = q;
    const g = c.createGain();
    g.gain.value = vol;
    s.connect(fl);
    fl.connect(g);
    g.connect(L.g);
    if (lfo) {
      const l = c.createOscillator();
      const lg = c.createGain();
      l.frequency.value = lfoRate;
      lg.gain.value = lfo;
      l.connect(lg);
      lg.connect(g.gain);
      l.start();
      L.nodes.push(l);
    }
    s.start(0, Math.random());
    L.nodes.push(s);
    return { fl, g };
  }

  hum(L, { f = 60, type = 'sine', vol = 0.1, detune = 0 }) {
    const c = this.ctx;
    const o = c.createOscillator();
    o.type = type;
    o.frequency.value = f;
    o.detune.value = detune;
    const g = c.createGain();
    g.gain.value = vol;
    o.connect(g);
    g.connect(L.g);
    o.start();
    L.nodes.push(o);
    return { o, g };
  }
}

export const sound = new Sound();
export { Sound, SFX as SFX_LIST };

// ---------------------------------------------------------------------------
// One-shot sound recipes. Each gets (snd, opts).
const SFX = {
  // ---- interface
  click: (s, o) => s.tone(s.out({ bus: 'ui', vol: 0.5 }), { f: 1800, f2: 1200, dur: 0.05, type: 'triangle', vol: 0.25 }),
  hover: (s) => s.tone(s.out({ bus: 'ui', vol: 0.3 }), { f: 2400, dur: 0.03, type: 'sine', vol: 0.12 }),
  panel: (s) => {
    // manga panel slaps onto the page
    const d = s.out({ bus: 'ui' });
    s.noise(d, { dur: 0.16, vol: 0.35, type: 'bandpass', f: 2600, f2: 700, q: 0.8 });
    s.tone(d, { f: 180, f2: 90, dur: 0.12, type: 'sine', vol: 0.3 });
  },
  toastGood: (s) => {
    const d = s.out({ bus: 'ui' });
    s.tone(d, { f: 880, dur: 0.18, type: 'triangle', vol: 0.18 });
    s.tone(d, { f: 1320, dur: 0.25, type: 'triangle', vol: 0.16, at: 0.08 });
  },
  toastBad: (s) => {
    const d = s.out({ bus: 'ui' });
    s.tone(d, { f: 220, f2: 160, dur: 0.25, type: 'square', vol: 0.08 });
    s.tone(d, { f: 110, dur: 0.3, type: 'sine', vol: 0.25 });
  },
  toast: (s) => s.tone(s.out({ bus: 'ui' }), { f: 1046, dur: 0.12, type: 'sine', vol: 0.14 }),
  taskDone: (s) => {
    const d = s.out({ bus: 'ui' });
    [784, 988, 1175, 1568].forEach((f, i) => s.tone(d, { f, dur: 0.22, type: 'triangle', vol: 0.15, at: i * 0.07 }));
  },
  request: (s) => {
    const d = s.out({ bus: 'ui' });
    s.tone(d, { f: 660, dur: 0.1, type: 'square', vol: 0.06 });
    s.tone(d, { f: 990, dur: 0.14, type: 'square', vol: 0.06, at: 0.1 });
  },
  mapOpen: (s) => {
    const d = s.out({ bus: 'ui' });
    s.noise(d, { dur: 0.3, vol: 0.25, type: 'highpass', f: 1800, q: 0.5 });
  },
  // ---- the player's body and hands
  step: (s, o) => {
    const d = s.out({ ...o, range: o.range || 14, vol: (o.vol ?? 1) * (o.run ? 1.25 : 1) });
    if (!d) return;
    const surf = o.surface || 'floor';
    const f = surf === 'carpet' ? 380 : surf === 'outdoor' ? 900 : surf === 'wet' ? 1400 : surf === 'tile' ? 2200 : 1300;
    s.noise(d, { dur: surf === 'carpet' ? 0.07 : 0.09, vol: surf === 'carpet' ? 0.18 : 0.28, type: 'bandpass', f: f * rnd(0.85, 1.15), q: 1.4 });
    s.tone(d, { f: rnd(70, 95), f2: 50, dur: 0.07, type: 'sine', vol: 0.22 });
    if (surf === 'wet') s.noise(d, { dur: 0.12, vol: 0.12, type: 'highpass', f: 3500, at: 0.02 });
    if (surf === 'heels') s.tone(d, { f: 2600, f2: 1800, dur: 0.03, type: 'triangle', vol: 0.08 });
  },
  sit: (s, o) => {
    const d = s.out(o);
    if (!d) return;
    s.noise(d, { dur: 0.25, vol: 0.3, type: 'lowpass', f: 500, q: 0.6 });
    s.tone(d, { f: 140, f2: 70, dur: 0.18, vol: 0.3 });
  },
  rustle: (s, o) => {
    const d = s.out(o);
    if (!d) return;
    for (let i = 0; i < 4; i++) s.noise(d, { dur: 0.08, vol: 0.15, type: 'bandpass', f: rnd(2500, 5000), q: 1.5, at: i * rnd(0.04, 0.08) });
  },
  pickup: (s, o) => {
    const d = s.out(o);
    if (!d) return;
    s.noise(d, { dur: 0.18, vol: 0.22, type: 'bandpass', f: 1800, f2: 3200, q: 1 });
    s.tone(d, { f: 300, f2: 420, dur: 0.1, type: 'triangle', vol: 0.1 });
  },
  drop: (s, o) => {
    const d = s.out(o);
    if (!d) return;
    s.tone(d, { f: 160, f2: 60, dur: 0.2, vol: 0.4 });
    s.noise(d, { dur: 0.15, vol: 0.25, type: 'lowpass', f: 900 });
  },
  hide: (s, o) => {
    const d = s.out(o);
    if (!d) return;
    s.noise(d, { dur: 0.35, vol: 0.2, type: 'bandpass', f: 1200, f2: 600, q: 0.8 });
  },
  rip: (s, o) => {
    // fabric tearing: a crackling run of noise bursts
    const d = s.out({ ...o, verb: true });
    if (!d) return;
    for (let i = 0; i < 14; i++) s.noise(d, { dur: 0.05, vol: rnd(0.25, 0.45), type: 'bandpass', f: rnd(1500, 4500), q: 3, at: i * 0.028 });
    s.noise(d, { dur: 0.5, vol: 0.25, type: 'bandpass', f: 2500, f2: 900, q: 1, at: 0.05 });
  },
  crash: (s, o) => {
    const d = s.out({ ...o, verb: true });
    if (!d) return;
    s.noise(d, { dur: 0.7, vol: 0.5, type: 'lowpass', f: 3000, f2: 400 });
    for (let i = 0; i < 6; i++) s.tone(d, { f: rnd(500, 1800), dur: rnd(0.1, 0.35), type: 'triangle', vol: 0.08, at: rnd(0, 0.25) });
    s.tone(d, { f: 120, f2: 50, dur: 0.3, vol: 0.4 });
  },
  papers: (s, o) => {
    const d = s.out(o);
    if (!d) return;
    for (let i = 0; i < 10; i++) s.noise(d, { dur: rnd(0.08, 0.2), vol: 0.18, type: 'bandpass', f: rnd(2000, 6000), q: 2, at: i * rnd(0.03, 0.08) });
  },
  // ---- doors, machines and fixtures
  door: (s, o) => {
    const d = s.out({ ...o, verb: true });
    if (!d) return;
    s.tone(d, { f: rnd(380, 520), f2: rnd(250, 330), dur: 0.35, type: 'sawtooth', vol: 0.05, vib: 18 }); // creak
    s.tone(d, { f: 95, f2: 55, dur: 0.22, vol: 0.45, at: 0.32 }); // shut
    s.noise(d, { dur: 0.12, vol: 0.25, type: 'lowpass', f: 1200, at: 0.32 });
  },
  ding: (s, o) => {
    const d = s.out({ ...o, verb: true });
    s.tone(d, { f: 1318, dur: 1.2, type: 'sine', vol: 0.22 });
    s.tone(d, { f: 1046, dur: 1.4, type: 'sine', vol: 0.2, at: 0.35 });
  },
  elevatorDoor: (s, o) => {
    const d = s.out(o);
    s.noise(d, { dur: 0.9, vol: 0.12, type: 'bandpass', f: 600, q: 2, hold: 0.5 });
    s.tone(d, { f: 80, dur: 0.15, vol: 0.2, at: 0.85 });
  },
  beep: (s, o) => s.tone(s.out(o), { f: 1900, dur: 0.09, type: 'square', vol: 0.06 }),
  buttons: (s, o) => {
    const d = s.out(o);
    if (!d) return;
    for (let i = 0; i < 3; i++) s.tone(d, { f: rnd(1500, 2200), dur: 0.06, type: 'square', vol: 0.05, at: i * 0.12 });
  },
  typing: (s, o) => {
    const d = s.out({ ...o, range: o.range || 10 });
    if (!d) return;
    const n = 4 + Math.floor(Math.random() * 6);
    for (let i = 0; i < n; i++) s.noise(d, { dur: 0.025, vol: rnd(0.12, 0.22), type: 'bandpass', f: rnd(2500, 4200), q: 3, at: i * rnd(0.06, 0.13) });
  },
  writing: (s, o) => {
    const d = s.out({ ...o, range: o.range || 8 });
    if (!d) return;
    s.noise(d, { dur: 0.5, vol: 0.06, type: 'bandpass', f: 5000, q: 4, hold: 0.3 });
  },
  pour: (s, o) => {
    const d = s.out(o);
    if (!d) return;
    s.noise(d, { dur: 1.2, vol: 0.2, type: 'bandpass', f: 900, f2: 1700, q: 3, hold: 0.8 });
    for (let i = 0; i < 6; i++) s.tone(d, { f: rnd(500, 900), f2: rnd(900, 1400), dur: 0.06, vol: 0.05, at: rnd(0, 1) });
  },
  water: (s, o) => {
    const d = s.out(o);
    if (!d) return;
    s.noise(d, { dur: 1.4, vol: 0.25, type: 'highpass', f: 2200, q: 0.5, hold: 1 });
  },
  splash: (s, o) => {
    const d = s.out({ ...o, verb: true });
    if (!d) return;
    s.noise(d, { dur: 0.6, vol: 0.5, type: 'lowpass', f: 4000, f2: 600 });
    for (let i = 0; i < 5; i++) s.tone(d, { f: rnd(400, 900), f2: rnd(900, 1600), dur: 0.07, vol: 0.08, at: rnd(0.05, 0.4) });
  },
  flush: (s, o) => {
    const d = s.out({ ...o, verb: true });
    s.noise(d, { dur: 2.2, vol: 0.35, type: 'bandpass', f: 1500, f2: 300, q: 0.7, hold: 0.6 });
  },
  shred: (s, o) => {
    const d = s.out(o);
    if (!d) return;
    s.noise(d, { dur: 1.1, vol: 0.3, type: 'bandpass', f: 700, q: 2, hold: 0.8 });
    s.tone(d, { f: 95, dur: 1.1, type: 'sawtooth', vol: 0.06 });
  },
  copier: (s, o) => {
    const d = s.out(o);
    if (!d) return;
    s.noise(d, { dur: 1.6, vol: 0.12, type: 'bandpass', f: 1100, q: 1.5, hold: 1.2 });
    s.tone(d, { f: 140, f2: 180, dur: 1.6, type: 'triangle', vol: 0.06 });
    s.noise(d, { dur: 0.25, vol: 0.2, type: 'highpass', f: 3000, at: 1.3 });
  },
  microwave: (s, o) => {
    const d = s.out(o);
    s.tone(d, { f: 1000, dur: 0.15, type: 'square', vol: 0.06 });
    s.tone(d, { f: 1000, dur: 0.15, type: 'square', vol: 0.06, at: 0.25 });
    s.tone(d, { f: 1000, dur: 0.15, type: 'square', vol: 0.06, at: 0.5 });
  },
  phone: (s, o) => {
    // a classic office double ring
    const d = s.out({ ...o, range: o.range || 30 });
    if (!d) return;
    for (let r = 0; r < 2; r++) {
      for (let i = 0; i < 8; i++) {
        s.tone(d, { f: 950, dur: 0.04, type: 'square', vol: 0.06, at: r * 0.5 + i * 0.05 });
        s.tone(d, { f: 1150, dur: 0.04, type: 'square', vol: 0.05, at: r * 0.5 + i * 0.05 + 0.025 });
      }
    }
  },
  squeak: (s, o) => {
    const d = s.out(o);
    if (!d) return;
    s.tone(d, { f: rnd(1600, 2400), f2: rnd(2400, 3200), dur: 0.12, type: 'sine', vol: 0.06, vib: 40 });
  },
  mop: (s, o) => {
    const d = s.out(o);
    if (!d) return;
    s.noise(d, { dur: 0.6, vol: 0.15, type: 'bandpass', f: 700, q: 1.2 });
    s.noise(d, { dur: 0.2, vol: 0.08, type: 'highpass', f: 4000, at: 0.3 });
  },
  thump: (s, o) => {
    const d = s.out(o);
    if (!d) return;
    s.tone(d, { f: 110, f2: 50, dur: 0.18, vol: 0.4 });
  },
  wheels: (s, o) => {
    const d = s.out(o);
    if (!d) return;
    s.noise(d, { dur: 0.3, vol: 0.12, type: 'lowpass', f: 300, q: 2 });
  },
  // ---- town
  busBrake: (s, o) => {
    const d = s.out({ ...o, range: 40 });
    if (!d) return;
    s.noise(d, { dur: 1.3, vol: 0.35, type: 'highpass', f: 3500, q: 0.5, hold: 0.3 });
    s.tone(d, { f: 900, f2: 650, dur: 0.6, type: 'sawtooth', vol: 0.03, at: 0.1 });
  },
  busDoor: (s, o) => {
    const d = s.out({ ...o, range: 30 });
    if (!d) return;
    s.noise(d, { dur: 0.6, vol: 0.3, type: 'highpass', f: 2500 });
    s.tone(d, { f: 70, dur: 0.15, vol: 0.25, at: 0.5 });
  },
  bell: (s, o) => {
    const d = s.out(o);
    s.tone(d, { f: 1568, dur: 0.6, type: 'sine', vol: 0.18 });
    s.tone(d, { f: 1568 * 2.7, dur: 0.3, type: 'sine', vol: 0.05 });
  },
  horn: (s, o) => {
    const d = s.out({ ...o, range: 60 });
    if (!d) return;
    s.tone(d, { f: 400, dur: 0.4, type: 'sawtooth', vol: 0.06 });
    s.tone(d, { f: 500, dur: 0.4, type: 'sawtooth', vol: 0.05 });
  },
  bark: (s, o) => {
    const d = s.out({ ...o, range: 40, verb: true });
    if (!d) return;
    for (let i = 0; i < 2; i++) {
      s.tone(d, { f: 520, f2: 300, dur: 0.12, type: 'sawtooth', vol: 0.12, at: i * 0.22 });
      s.noise(d, { dur: 0.12, vol: 0.2, type: 'bandpass', f: 900, q: 1.5, at: i * 0.22 });
    }
  },
  thunder: (s) => {
    const d = s.out({ bus: 'ambient', vol: 0.9 });
    s.noise(d, { dur: 3.5, vol: 0.5, type: 'lowpass', f: 400, f2: 80, q: 0.5, a: 0.05 });
    s.noise(d, { dur: 0.5, vol: 0.3, type: 'lowpass', f: 1200, f2: 300, at: rnd(0, 0.3) });
  },
  // ---- tension and drama (manga-style stingers)
  noticed: (s) => {
    // the "!" moment
    const d = s.out({ bus: 'sfx', vol: 0.9 });
    s.tone(d, { f: 1400, f2: 2200, dur: 0.12, type: 'square', vol: 0.06 });
    s.tone(d, { f: 2200, dur: 0.18, type: 'square', vol: 0.05, at: 0.1 });
  },
  shock: (s) => {
    // DOOOM: low hit with a noise swell
    const d = s.out({ bus: 'sfx', verb: true });
    s.tone(d, { f: 70, f2: 38, dur: 1.4, vol: 0.6 });
    s.tone(d, { f: 140, f2: 75, dur: 0.9, type: 'triangle', vol: 0.18 });
    s.noise(d, { dur: 0.9, vol: 0.3, type: 'lowpass', f: 2500, f2: 300 });
    s.tone(d, { f: 466, dur: 0.9, type: 'sawtooth', vol: 0.04 });
    s.tone(d, { f: 494, dur: 0.9, type: 'sawtooth', vol: 0.04 });
  },
  heartbeat: (s, o) => {
    const d = s.out({ bus: 'sfx', vol: o.vol ?? 0.7 });
    s.tone(d, { f: 60, f2: 40, dur: 0.12, vol: 0.5 });
    s.tone(d, { f: 55, f2: 38, dur: 0.14, vol: 0.4, at: 0.16 });
  },
  sparkle: (s, o) => {
    const d = s.out({ bus: 'sfx', verb: true, vol: o.vol ?? 1 });
    const notes = [1568, 1760, 2093, 2349, 2637, 3136];
    for (let i = 0; i < 9; i++) s.tone(d, { f: pickOne(notes) * (Math.random() < 0.3 ? 2 : 1), dur: 0.5, type: 'sine', vol: 0.06, at: i * rnd(0.04, 0.09) });
  },
  choir: (s) => {
    // a heavenly "aaah": a stacked major chord of soft voices, slowly swelling
    const d = s.out({ bus: 'sfx', verb: true });
    const c = s.ctx;
    const t = c.currentTime;
    for (const f of [261.6, 329.6, 392, 523.2, 659.3]) {
      for (const det of [-7, 6]) {
        const o = c.createOscillator();
        o.type = 'sawtooth';
        o.frequency.value = f;
        o.detune.value = det;
        const fl = c.createBiquadFilter();
        fl.type = 'bandpass';
        fl.frequency.value = 900;
        fl.Q.value = 1.2;
        const g = c.createGain();
        g.gain.setValueAtTime(0.0001, t);
        g.gain.exponentialRampToValueAtTime(0.025, t + 0.9);
        g.gain.exponentialRampToValueAtTime(0.0001, t + 3.2);
        o.connect(fl);
        fl.connect(g);
        g.connect(d);
        o.start(t);
        o.stop(t + 3.3);
      }
    }
    SFX.sparkle(s, { vol: 0.8 });
  },
  writeup: (s) => {
    // the rubber stamp
    const d = s.out({ bus: 'sfx', verb: true });
    s.tone(d, { f: 120, f2: 45, dur: 0.3, vol: 0.6 });
    s.noise(d, { dur: 0.15, vol: 0.4, type: 'lowpass', f: 1500 });
  },
  sadTrombone: (s) => {
    const d = s.out({ bus: 'sfx' });
    [[392, 370], [370, 349], [349, 330], [330, 262]].forEach(([a, b], i) => s.tone(d, { f: a, f2: b, dur: i === 3 ? 1.1 : 0.45, type: 'sawtooth', vol: 0.07, at: i * 0.5, vib: i === 3 ? 8 : 0 }));
  },
  fanfare: (s) => {
    const d = s.out({ bus: 'sfx', verb: true });
    [[523, 0], [659, 0.15], [784, 0.3], [1046, 0.45], [784, 0.75], [1046, 0.9]].forEach(([f, at]) => s.tone(d, { f, dur: 0.35, type: 'square', vol: 0.05, at }));
    SFX.sparkle(s, {});
  },
  alarm: (s) => {
    const d = s.out({ bus: 'sfx' });
    for (let i = 0; i < 4; i++) {
      s.tone(d, { f: 2000, dur: 0.07, type: 'square', vol: 0.05, at: i * 0.18 });
      s.tone(d, { f: 2000, dur: 0.07, type: 'square', vol: 0.05, at: i * 0.18 + 0.09 });
    }
  },
  sleep: (s) => {
    const d = s.out({ bus: 'sfx', verb: true });
    [784, 659, 523, 392].forEach((f, i) => s.tone(d, { f, dur: 0.6, type: 'sine', vol: 0.08, at: i * 0.25 }));
  },
  whoosh: (s, o) => {
    const d = s.out(o);
    if (!d) return;
    s.noise(d, { dur: 0.4, vol: 0.25, type: 'bandpass', f: 500, f2: 3000, q: 1 });
  },
  // ---- wordless voices (people reacting)
  gasp: (s, o) => {
    const d = s.out({ ...o, bus: 'voice' });
    if (!d) return;
    s.noise(d, { dur: 0.35, vol: 0.3, type: 'bandpass', f: (o.pitch || 1) * 1300, f2: (o.pitch || 1) * 2200, q: 2, a: 0.03 });
  },
  hm: (s, o) => {
    const d = s.out({ ...o, bus: 'voice' });
    if (!d) return;
    const p = o.pitch || 1;
    s.tone(d, { f: 180 * p, f2: 240 * p, dur: 0.35, type: 'triangle', vol: 0.12, a: 0.04 });
  },
  huh: (s, o) => {
    const d = s.out({ ...o, bus: 'voice' });
    if (!d) return;
    const p = o.pitch || 1;
    s.tone(d, { f: 170 * p, f2: 330 * p, dur: 0.3, type: 'sawtooth', vol: 0.04, a: 0.02 });
    s.noise(d, { dur: 0.08, vol: 0.12, type: 'bandpass', f: 1200 * p, q: 2 });
  },
  hmph: (s, o) => {
    const d = s.out({ ...o, bus: 'voice' });
    if (!d) return;
    const p = o.pitch || 1;
    s.noise(d, { dur: 0.12, vol: 0.25, type: 'bandpass', f: 600 * p, q: 1.5 });
    s.tone(d, { f: 200 * p, f2: 130 * p, dur: 0.25, type: 'triangle', vol: 0.1, at: 0.05 });
  },
  tsk: (s, o) => {
    const d = s.out({ ...o, bus: 'voice' });
    if (!d) return;
    for (let i = 0; i < 2; i++) s.noise(d, { dur: 0.03, vol: 0.3, type: 'highpass', f: 3500, at: i * 0.12 });
  },
  giggle: (s, o) => {
    const d = s.out({ ...o, bus: 'voice' });
    if (!d) return;
    const p = o.pitch || 1;
    for (let i = 0; i < 5; i++) s.tone(d, { f: (320 - i * 15) * p, f2: (380 - i * 15) * p, dur: 0.08, type: 'triangle', vol: 0.08, at: i * 0.11 });
  },
  whistle: (s, o) => {
    // wolf whistle
    const d = s.out({ ...o, bus: 'voice' });
    if (!d) return;
    s.tone(d, { f: 1200, f2: 2600, dur: 0.25, type: 'sine', vol: 0.12, curve: 'lin' });
    s.tone(d, { f: 1700, f2: 2900, dur: 0.18, type: 'sine', vol: 0.1, at: 0.33, curve: 'lin' });
    s.tone(d, { f: 2900, f2: 1100, dur: 0.45, type: 'sine', vol: 0.1, at: 0.51, curve: 'lin' });
  },
  murmur: (s, o) => {
    const d = s.out({ ...o, bus: 'voice' });
    if (!d) return;
    const p = o.pitch || 1;
    for (let i = 0; i < 6; i++) s.tone(d, { f: rnd(150, 240) * p, f2: rnd(150, 240) * p, dur: rnd(0.08, 0.16), type: 'triangle', vol: 0.05, at: i * rnd(0.1, 0.16), a: 0.02 });
  },
};

// level balancing (measured offline so everything sits at a similar loudness)
const GAIN = {
  thunder: 3, noticed: 3, choir: 2.5, sadTrombone: 2.5, alarm: 2.5, huh: 2, wheels: 3, water: 0.6, writing: 2, buttons: 1.6, beep: 1.5,
  typing: 1.5, horn: 1.5, phone: 2, microwave: 1.6, fanfare: 1.6, sleep: 1.5, rip: 1.8, papers: 1.6, gasp: 1.5, bark: 1.6, whoosh: 1.5,
};

// Reaction kind -> wordless voice
export function reactionSound(kind) {
  return { concern: 'hm', attraction: 'whistle', confusion: 'huh', stunned: 'gasp', amused: 'giggle', disapproving: 'hmph', polite: 'hm' }[kind] || 'hm';
}

// ---------------------------------------------------------------------------
// Ambient loops. build(snd, L) wires a continuous bed; tick(snd, L) adds occasional details.
const LOOPS = {
  office: {
    vol: 0.5,
    build: (s, L) => {
      s.noiseBed(L, { type: 'lowpass', f: 350, vol: 0.25 }); // ventilation
      s.hum(L, { f: 120, vol: 0.015 }); // fluorescent lights
    },
    tick: (s, L) => {
      const r = Math.random();
      const far = { bus: 'ambient', vol: 0.35 };
      if (r < 0.06) SFX.typing(s, far);
      else if (r < 0.075) SFX.murmur(s, { ...far, pitch: rnd(0.8, 1.4) });
      else if (r < 0.08) SFX.phone(s, { bus: 'ambient', vol: 0.15 });
      else if (r < 0.085) SFX.copier(s, { bus: 'ambient', vol: 0.3 });
    },
  },
  city: {
    vol: 0.6,
    build: (s, L) => {
      s.noiseBed(L, { type: 'lowpass', f: 500, vol: 0.3, lfo: 0.08, lfoRate: 0.07 }); // traffic wash
      s.noiseBed(L, { type: 'bandpass', f: 1600, q: 0.6, vol: 0.04 });
    },
    tick: (s, L) => {
      const r = Math.random();
      if (r < 0.012 && !L.o.rain) SFX.horn(s, { bus: 'ambient', vol: 0.25 });
      else if (r < 0.05 && !L.o.rain && L.o.day) SFX.squeak(s, { bus: 'ambient', vol: 0.4 }); // birds
      else if (r < 0.07) SFX.murmur(s, { bus: 'ambient', vol: 0.3, pitch: rnd(0.8, 1.4) });
    },
  },
  rain: {
    vol: 0.4,
    build: (s, L) => {
      L.bed = s.noiseBed(L, { type: 'highpass', f: 1200, q: 0.4, vol: 0.35 });
      s.noiseBed(L, { type: 'lowpass', f: 300, vol: 0.2 });
    },
    tick: (s, L) => {
      // indoors the rain is just a muffled patter on the windows
      if (L.bed) L.bed.fl.frequency.setTargetAtTime(L.o.inside ? 400 : 1200, s.ctx.currentTime, 0.5);
      if (Math.random() < 0.003) SFX.thunder(s);
    },
  },
  bus: {
    vol: 0.55,
    build: (s, L) => {
      L.eng = s.hum(L, { f: 48, type: 'sawtooth', vol: 0.04 });
      s.noiseBed(L, { type: 'lowpass', f: 220, vol: 0.4, lfo: 0.1, lfoRate: 0.5 });
    },
    tick: (s, L) => {
      if (L.eng) L.eng.o.frequency.setTargetAtTime(42 + (L.o.speed || 0) * 2.2, s.ctx.currentTime, 0.3);
    },
  },
  apartment: {
    vol: 0.4,
    build: (s, L) => {
      s.hum(L, { f: 55, vol: 0.02 }); // fridge
      s.noiseBed(L, { type: 'lowpass', f: 250, vol: 0.08 });
    },
    tick: (s) => {
      if (Math.random() < 0.08) SFX.tick?.(s);
    },
  },
  pool: {
    vol: 0.5,
    build: (s, L) => s.noiseBed(L, { type: 'bandpass', f: 600, q: 0.7, vol: 0.2, lfo: 0.12, lfoRate: 0.3 }),
    tick: (s, L) => {
      if (Math.random() < 0.06 && L.o.day) SFX.squeak(s, { bus: 'ambient', vol: 0.4 });
      if (Math.random() < 0.03) SFX.splash(s, { bus: 'ambient', vol: 0.08 });
    },
  },
  laundry: {
    vol: 0.5,
    build: (s, L) => {
      s.noiseBed(L, { type: 'lowpass', f: 400, vol: 0.25, lfo: 0.1, lfoRate: 0.9 }); // washers churning
      s.hum(L, { f: 100, vol: 0.02 });
    },
    tick: (s) => {
      if (Math.random() < 0.05) SFX.thump(s, { bus: 'ambient', vol: 0.15 }); // dryer tumble
    },
  },
  hallway: {
    vol: 0.35,
    build: (s, L) => s.noiseBed(L, { type: 'lowpass', f: 300, vol: 0.2 }),
    tick: (s) => {
      if (Math.random() < 0.01) SFX.door(s, { bus: 'ambient', vol: 0.15 });
      if (Math.random() < 0.01) SFX.murmur(s, { bus: 'ambient', vol: 0.12 });
    },
  },
  shop: {
    vol: 0.45,
    build: (s, L) => {
      s.noiseBed(L, { type: 'lowpass', f: 450, vol: 0.2 });
      s.hum(L, { f: 120, vol: 0.012 });
    },
    tick: (s) => {
      if (Math.random() < 0.03) SFX.beep(s, { bus: 'ambient', vol: 0.4 }); // checkout scanner
      if (Math.random() < 0.05) SFX.murmur(s, { bus: 'ambient', vol: 0.25, pitch: rnd(0.8, 1.4) });
    },
  },
  shower: {
    bus: 'sfx',
    vol: 0.35,
    build: (s, L) => s.noiseBed(L, { type: 'highpass', f: 2500, q: 0.4, vol: 0.3 }),
  },
  pushing: {
    bus: 'sfx',
    vol: 0.6,
    build: (s, L) => s.noiseBed(L, { type: 'lowpass', f: 260, q: 2, vol: 0.4, lfo: 0.15, lfoRate: 7 }),
  },
  tension: {
    // someone's eyes are on you: a low pulse that tightens as suspicion grows
    bus: 'sfx',
    vol: 0.5,
    build: (s, L) => {
      L.a = s.hum(L, { f: 55, type: 'triangle', vol: 0.05 });
      L.b = s.hum(L, { f: 58, type: 'triangle', vol: 0.04 });
    },
    tick: (s, L) => {
      L.beatT = (L.beatT || 0) - 0.12;
      const k = clamp(L.o.level || 0, 0, 1);
      if (L.beatT <= 0) {
        L.beatT = 1.0 - k * 0.6;
        SFX.heartbeat(s, { vol: 0.3 + k * 0.6 });
      }
    },
  },
  title: {
    vol: 0.5,
    build: (s, L) => {
      for (const f of [130.8, 196, 261.6, 329.6]) s.hum(L, { f, type: 'sine', vol: 0.015, detune: rnd(-6, 6) });
    },
    tick: (s) => {
      if (Math.random() < 0.05) SFX.sparkle(s, { vol: 0.35 });
    },
  },
};
SFX.tick = (s) => s.tone(s.out({ bus: 'ambient', vol: 0.3 }), { f: 3200, dur: 0.02, type: 'square', vol: 0.03 });

// ---- volume settings UI (shared by the Settings screen and the pause menu)
export const VOLUME_DEFAULTS = { volMaster: 0.8, volSfx: 1, volAmbient: 0.6, volUi: 0.8, volVoice: 0.9 };
const VOL_ROWS = [
  ['volMaster', 'Master volume'],
  ['volSfx', 'Sound effects'],
  ['volVoice', 'Voices and reactions'],
  ['volAmbient', 'Ambience'],
  ['volUi', 'Interface'],
];

export function applyVolumeSettings(st) {
  sound.setVolumes({
    master: st.volMaster ?? VOLUME_DEFAULTS.volMaster,
    sfx: st.volSfx ?? VOLUME_DEFAULTS.volSfx,
    ambient: st.volAmbient ?? VOLUME_DEFAULTS.volAmbient,
    ui: st.volUi ?? VOLUME_DEFAULTS.volUi,
    voice: st.volVoice ?? VOLUME_DEFAULTS.volVoice,
  });
}

export function volumeSlidersHTML(st) {
  return VOL_ROWS.map(([k, label]) => `<label>${label}: <b id="v-${k}">${Math.round((st[k] ?? VOLUME_DEFAULTS[k]) * 100)}%</b></label>
      <input type="range" id="s-${k}" min="0" max="1" step="0.05" value="${st[k] ?? VOLUME_DEFAULTS[k]}" />`).join('\n');
}

/** Hook up the sliders: live preview, then save(st). */
export function bindVolumeSliders(root, st, save) {
  for (const [k] of VOL_ROWS) {
    const el = root.querySelector('#s-' + k);
    if (!el) continue;
    el.addEventListener('input', () => {
      st[k] = +el.value;
      root.querySelector('#v-' + k).textContent = `${Math.round(st[k] * 100)}%`;
      applyVolumeSettings(st);
    });
    el.addEventListener('change', () => {
      sound.play(k === 'volAmbient' ? 'squeak' : k === 'volVoice' ? 'giggle' : k === 'volUi' ? 'toastGood' : 'pickup');
      save && save(st);
    });
  }
}
