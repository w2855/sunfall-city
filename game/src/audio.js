// All-synthesised sound for Sunfall City: engine, siren, gunshot, cash and impacts.
// WebAudio only - no files, no network.
let ctx = null;
let engine = null;
let sirenVoice = null;
let noiseBuf = null;

export function initAudio() {
  if (ctx) {
    if (ctx.state === 'suspended') ctx.resume();
    return;
  }
  const AC = window.AudioContext || window.webkitAudioContext;
  if (!AC) return;
  ctx = new AC();

  // The engine: two detuned saws through a lowpass, opened up by the revs.
  const osc1 = ctx.createOscillator();
  osc1.type = 'sawtooth';
  osc1.frequency.value = 55;
  const osc2 = ctx.createOscillator();
  osc2.type = 'sawtooth';
  osc2.frequency.value = 62;
  const filter = ctx.createBiquadFilter();
  filter.type = 'lowpass';
  filter.frequency.value = 420;
  filter.Q.value = 2;
  const gain = ctx.createGain();
  gain.gain.value = 0;
  osc1.connect(filter);
  osc2.connect(filter);
  filter.connect(gain);
  gain.connect(ctx.destination);
  osc1.start();
  osc2.start();
  engine = { osc1, osc2, filter, gain };

  // The siren: a triangle whose pitch a slow LFO swings, so it wails.
  const osc = ctx.createOscillator();
  osc.type = 'triangle';
  osc.frequency.value = 640;
  const lfo = ctx.createOscillator();
  lfo.type = 'sine';
  lfo.frequency.value = 0.72;
  const lfoGain = ctx.createGain();
  lfoGain.gain.value = 175;
  lfo.connect(lfoGain);
  lfoGain.connect(osc.frequency);
  const sGain = ctx.createGain();
  sGain.gain.value = 0;
  osc.connect(sGain);
  sGain.connect(ctx.destination);
  osc.start();
  lfo.start();
  sirenVoice = { gain: sGain };
}

export function setEngine(revs, driving) {
  if (!engine) return;
  const t = ctx.currentTime;
  const base = 42 + Math.max(0, Math.min(1, revs)) * 150;
  engine.osc1.frequency.setTargetAtTime(base, t, 0.08);
  engine.osc2.frequency.setTargetAtTime(base * 1.13, t, 0.08);
  engine.filter.frequency.setTargetAtTime(360 + revs * 980, t, 0.1);
  engine.gain.gain.setTargetAtTime(driving ? 0.04 + revs * 0.075 : 0, t, 0.15);
}

export function siren(on, near) {
  if (!sirenVoice) return;
  const t = ctx.currentTime;
  sirenVoice.gain.gain.setTargetAtTime(on ? 0.018 + near * 0.05 : 0, t, 0.25);
}

export function gunshot() {
  if (!ctx) return;
  if (!noiseBuf) {
    noiseBuf = ctx.createBuffer(1, (ctx.sampleRate * 0.15) | 0, ctx.sampleRate);
    const data = noiseBuf.getChannelData(0);
    for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
  }
  const t = ctx.currentTime;
  const src = ctx.createBufferSource();
  src.buffer = noiseBuf;
  const filter = ctx.createBiquadFilter();
  filter.type = 'lowpass';
  filter.frequency.value = 1150;
  const gain = ctx.createGain();
  gain.gain.setValueAtTime(0.45, t);
  gain.gain.exponentialRampToValueAtTime(0.001, t + 0.14);
  src.connect(filter);
  filter.connect(gain);
  gain.connect(ctx.destination);
  src.start(t);
  src.stop(t + 0.16);
}

export function chime() {
  if (!ctx) return;
  // A rising three-note cash arpeggio.
  [523.25, 659.25, 783.99].forEach((freq, i) => {
    const t = ctx.currentTime + i * 0.09;
    const osc = ctx.createOscillator();
    osc.type = 'sine';
    osc.frequency.value = freq;
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.14, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + 0.4);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(t);
    osc.stop(t + 0.42);
  });
}

export function thud() {
  if (!ctx) return;
  const t = ctx.currentTime;
  const osc = ctx.createOscillator();
  osc.type = 'sine';
  osc.frequency.setValueAtTime(105, t);
  osc.frequency.exponentialRampToValueAtTime(38, t + 0.16);
  const gain = ctx.createGain();
  gain.gain.setValueAtTime(0.4, t);
  gain.gain.exponentialRampToValueAtTime(0.001, t + 0.2);
  osc.connect(gain);
  gain.connect(ctx.destination);
  osc.start(t);
  osc.stop(t + 0.22);
}
