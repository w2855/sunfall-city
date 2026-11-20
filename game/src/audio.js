// Sunfall City — every sound is synthesized WebAudio: no files, no network. A two-saw
// engine voice through a lowpass tracks the revs, a triangle siren wails on an LFO, and
// gunshots, cash chimes and impact thuds are one-shot voices built on demand.
let ctx = null;
let master = null;
let engine = null;
let sirenVoice = null;
let noiseBuffer = null;

export function initAudio() {
  if (ctx) return;
  const AC = window.AudioContext || window.webkitAudioContext;
  if (!AC) return;
  ctx = new AC();
  if (ctx.state === 'suspended') ctx.resume();
  master = ctx.createGain();
  master.gain.value = 0.55;
  master.connect(ctx.destination);

  // The engine: two detuned saws through a lowpass, tracking the revs.
  const g = ctx.createGain();
  g.gain.value = 0.0001;
  const f = ctx.createBiquadFilter();
  f.type = 'lowpass';
  f.frequency.value = 320;
  f.Q.value = 1.4;
  const o1 = ctx.createOscillator();
  o1.type = 'sawtooth';
  o1.frequency.value = 52;
  const o2 = ctx.createOscillator();
  o2.type = 'sawtooth';
  o2.frequency.value = 78;
  o2.detune.value = 14;
  o1.connect(f);
  o2.connect(f);
  f.connect(g);
  g.connect(master);
  o1.start();
  o2.start();
  engine = { g, f, o1, o2 };

  // The siren: a triangle wail driven by an LFO, silent until switched on.
  const sg = ctx.createGain();
  sg.gain.value = 0;
  const so = ctx.createOscillator();
  so.type = 'triangle';
  so.frequency.value = 680;
  const lfo = ctx.createOscillator();
  lfo.type = 'sine';
  lfo.frequency.value = 0.85;
  const lfoGain = ctx.createGain();
  lfoGain.gain.value = 210;
  lfo.connect(lfoGain);
  lfoGain.connect(so.frequency);
  so.connect(sg);
  sg.connect(master);
  so.start();
  lfo.start();
  sirenVoice = { sg };

  // One decaying noise buffer, reused for every gunshot.
  const len = Math.floor(ctx.sampleRate * 0.18);
  noiseBuffer = ctx.createBuffer(1, len, ctx.sampleRate);
  const data = noiseBuffer.getChannelData(0);
  for (let i = 0; i < len; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / len);
}

/** Track the revs: louder and higher as the throttle opens, silent on foot. */
export function setEngine(revs, driving) {
  if (!engine || !ctx) return;
  const t = ctx.currentTime;
  const r = Math.max(0, Math.min(1.4, revs));
  engine.g.gain.setTargetAtTime(driving ? 0.035 + r * 0.05 : 0.0001, t, 0.1);
  const freq = 46 + r * 128;
  engine.o1.frequency.setTargetAtTime(freq, t, 0.08);
  engine.o2.frequency.setTargetAtTime(freq * 1.5, t, 0.08);
  engine.f.frequency.setTargetAtTime(260 + r * 900, t, 0.1);
}

/** The siren wails while cruisers chase; louder when they are near. */
export function siren(on, near) {
  if (!sirenVoice || !ctx) return;
  sirenVoice.sg.gain.setTargetAtTime(on ? (near ? 0.13 : 0.055) : 0, ctx.currentTime, 0.22);
}

/** A short filtered noise burst — the pistol, fired. */
export function gunshot() {
  if (!ctx || !noiseBuffer) return;
  const src = ctx.createBufferSource();
  src.buffer = noiseBuffer;
  const hp = ctx.createBiquadFilter();
  hp.type = 'highpass';
  hp.frequency.value = 420;
  const g = ctx.createGain();
  g.gain.setValueAtTime(0.5, ctx.currentTime);
  g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.16);
  src.connect(hp);
  hp.connect(g);
  g.connect(master);
  src.start();
}

/** A three-note cash arpeggio: mission money in the bank. */
export function chime() {
  if (!ctx) return;
  const notes = [523.25, 659.25, 783.99];
  notes.forEach((freq, i) => {
    const o = ctx.createOscillator();
    o.type = 'triangle';
    o.frequency.value = freq;
    const g = ctx.createGain();
    const t0 = ctx.currentTime + i * 0.09;
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(0.22, t0 + 0.02);
    g.gain.exponentialRampToValueAtTime(0.001, t0 + 0.3);
    o.connect(g);
    g.connect(master);
    o.start(t0);
    o.stop(t0 + 0.34);
  });
}

/** A low impact — chrome meeting flesh, flesh meeting the pavement. */
export function thud() {
  if (!ctx) return;
  const o = ctx.createOscillator();
  o.type = 'sine';
  const g = ctx.createGain();
  const t = ctx.currentTime;
  o.frequency.setValueAtTime(105, t);
  o.frequency.exponentialRampToValueAtTime(36, t + 0.22);
  g.gain.setValueAtTime(0.4, t);
  g.gain.exponentialRampToValueAtTime(0.001, t + 0.24);
  o.connect(g);
  g.connect(master);
  o.start(t);
  o.stop(t + 0.26);
}
