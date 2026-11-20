// Sound, all synthesized: engine hum that tracks the revs, gunshots, sirens with the doppler-ish
// wail, cash chimes and the thud of impact. WebAudio only, no files, no network.
let ctx = null;
let engine = null;

export function initAudio() {
  ctx = new (window.AudioContext || window.webkitAudioContext)();
  // A persistent engine voice: two detuned saws through a lowpass, its pitch the revs' own.
  const oscA = ctx.createOscillator();
  const oscB = ctx.createOscillator();
  const gain = ctx.createGain();
  const filter = ctx.createBiquadFilter();
  filter.type = 'lowpass';
  filter.frequency.value = 420;
  oscA.type = 'sawtooth';
  oscB.type = 'sawtooth';
  oscA.frequency.value = 55;
  oscB.frequency.value = 57;
  gain.gain.value = 0;
  oscA.connect(filter);
  oscB.connect(filter);
  filter.connect(gain);
  gain.connect(ctx.destination);
  oscA.start();
  oscB.start();
  engine = { oscA, oscB, gain, filter };
}

export function setEngine(revs, driving) {
  if (!engine) return;
  const t = ctx.currentTime;
  const pitch = 46 + revs * 130;
  engine.oscA.frequency.setTargetAtTime(pitch, t, 0.06);
  engine.oscB.frequency.setTargetAtTime(pitch * 1.03, t, 0.06);
  engine.gain.gain.setTargetAtTime(driving ? 0.05 + revs * 0.09 : 0, t, 0.12);
}

export function siren(on, near) {
  if (!ctx) return;
  if (!siren.osc) {
    siren.osc = ctx.createOscillator();
    siren.lfo = ctx.createOscillator();
    siren.lfoGain = ctx.createGain();
    siren.gain = ctx.createGain();
    siren.osc.type = 'triangle';
    siren.osc.frequency.value = 640;
    siren.lfo.frequency.value = 0.9;
    siren.lfoGain.gain.value = 180;
    siren.lfo.connect(siren.lfoGain);
    siren.lfoGain.connect(siren.osc.frequency);
    siren.gain.gain.value = 0;
    siren.osc.connect(siren.gain);
    siren.gain.connect(ctx.destination);
    siren.osc.start();
    siren.lfo.start();
  }
  siren.gain.gain.setTargetAtTime(on ? Math.min(0.06, 3.4 / Math.max(6, near)) : 0, ctx.currentTime, 0.2);
}

export function gunshot() {
  if (!ctx) return;
  const t = ctx.currentTime;
  const noise = ctx.createBufferSource();
  const buf = ctx.createBuffer(1, 2205, ctx.sampleRate);
  const data = buf.getChannelData(0);
  for (let i = 0; i < data.length; i++) data[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / data.length, 3);
  noise.buffer = buf;
  const gain = ctx.createGain();
  gain.gain.value = 0.3;
  noise.connect(gain);
  gain.connect(ctx.destination);
  noise.start(t);
}

export function chime() {
  if (!ctx) return;
  const t = ctx.currentTime;
  for (const [note, at] of [[880, 0], [1174, 0.09], [1568, 0.18]]) {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.value = note;
    gain.gain.setValueAtTime(0.12, t + at);
    gain.gain.exponentialRampToValueAtTime(0.001, t + at + 0.4);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(t + at);
    osc.stop(t + at + 0.45);
  }
}

export function thud() {
  if (!ctx) return;
  const t = ctx.currentTime;
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.type = 'sine';
  osc.frequency.setValueAtTime(120, t);
  osc.frequency.exponentialRampToValueAtTime(38, t + 0.16);
  gain.gain.setValueAtTime(0.24, t);
  gain.gain.exponentialRampToValueAtTime(0.001, t + 0.2);
  osc.connect(gain);
  gain.connect(ctx.destination);
  osc.start(t);
  osc.stop(t + 0.22);
}
