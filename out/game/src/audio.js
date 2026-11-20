// Everything you hear is synthesized in the browser: a two-saw engine voice through a
// lowpass tracks the revs, the siren wails an LFO-bent triangle, and hits, chimes and
// gunshots are short envelopes. No files, no network, no external assets.
let ctx = null;
let master = null;
let eng = null;
let sirenNodes = null;

export function initAudio() {
  if (ctx) {
    if (ctx.state === 'suspended') ctx.resume().catch(() => {});
    return;
  }
  const AC = window.AudioContext || window.webkitAudioContext;
  if (!AC) return;
  ctx = new AC();
  master = ctx.createGain();
  master.gain.value = 0.4;
  master.connect(ctx.destination);

  // the engine: two detuned saws through a lowpass, silent until the player drives
  const o1 = ctx.createOscillator();
  o1.type = 'sawtooth';
  o1.frequency.value = 55;
  const o2 = ctx.createOscillator();
  o2.type = 'sawtooth';
  o2.frequency.value = 84;
  const lp = ctx.createBiquadFilter();
  lp.type = 'lowpass';
  lp.frequency.value = 320;
  lp.Q.value = 1.4;
  const g = ctx.createGain();
  g.gain.value = 0;
  o1.connect(lp);
  o2.connect(lp);
  lp.connect(g);
  g.connect(master);
  o1.start();
  o2.start();
  eng = { o1, o2, lp, g };

  // browsers suspend audio until a gesture: wake it on the first input
  const wake = () => {
    if (ctx && ctx.state === 'suspended') ctx.resume().catch(() => {});
  };
  window.addEventListener('pointerdown', wake, { once: true });
  window.addEventListener('keydown', wake, { once: true });
}

export function setEngine(revs, driving) {
  if (!ctx || !eng) return;
  const t = ctx.currentTime;
  const r = Math.max(0, Math.min(1, revs));
  eng.o1.frequency.setTargetAtTime(52 + r * 165, t, 0.08);
  eng.o2.frequency.setTargetAtTime((52 + r * 165) * 1.52, t, 0.08);
  eng.lp.frequency.setTargetAtTime(280 + r * 2100, t, 0.1);
  eng.g.gain.setTargetAtTime(driving ? 0.045 + r * 0.075 : 0, t, 0.12);
}

export function siren(on, near) {
  if (!ctx || !master) return;
  if (!sirenNodes) {
    const o = ctx.createOscillator();
    o.type = 'triangle';
    o.frequency.value = 640;
    const lfo = ctx.createOscillator();
    lfo.type = 'sine';
    lfo.frequency.value = 0.65;
    const depth = ctx.createGain();
    depth.gain.value = 190;
    lfo.connect(depth);
    depth.connect(o.frequency);
    const g = ctx.createGain();
    g.gain.value = 0;
    o.connect(g);
    g.connect(master);
    o.start();
    lfo.start();
    sirenNodes = { g };
  }
  sirenNodes.g.gain.setTargetAtTime(on ? (near ? 0.13 : 0.045) : 0, ctx.currentTime, 0.25);
}

export function gunshot() {
  if (!ctx || !master) return;
  const t = ctx.currentTime;
  const len = 0.13;
  const buf = ctx.createBuffer(1, Math.ceil(ctx.sampleRate * len), ctx.sampleRate);
  const data = buf.getChannelData(0);
  for (let i = 0; i < data.length; i++) {
    data[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / data.length, 2);
  }
  const src = ctx.createBufferSource();
  src.buffer = buf;
  const bp = ctx.createBiquadFilter();
  bp.type = 'bandpass';
  bp.frequency.value = 1500;
  bp.Q.value = 0.7;
  const g = ctx.createGain();
  g.gain.setValueAtTime(0.5, t);
  g.gain.exponentialRampToValueAtTime(0.001, t + len);
  src.connect(bp);
  bp.connect(g);
  g.connect(master);
  src.start(t);
}

export function chime() {
  if (!ctx || !master) return;
  const notes = [880, 1174.7, 1568]; // a small cash arpeggio
  notes.forEach((f, i) => {
    const t = ctx.currentTime + i * 0.09;
    const o = ctx.createOscillator();
    o.type = 'triangle';
    o.frequency.value = f;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.22, t + 0.02);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.3);
    o.connect(g);
    g.connect(master);
    o.start(t);
    o.stop(t + 0.32);
  });
}

export function thud() {
  if (!ctx || !master) return;
  const t = ctx.currentTime;
  const o = ctx.createOscillator();
  o.type = 'sine';
  o.frequency.setValueAtTime(95, t);
  o.frequency.exponentialRampToValueAtTime(38, t + 0.16);
  const g = ctx.createGain();
  g.gain.setValueAtTime(0.4, t);
  g.gain.exponentialRampToValueAtTime(0.001, t + 0.18);
  o.connect(g);
  g.connect(master);
  o.start(t);
  o.stop(t + 0.2);
}
