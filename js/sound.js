// Stadium sounds, synthesized with WebAudio (no audio files). Browsers only
// allow sound after a tap, so the context is created lazily on first use.

let ctx = null;
let enabled = true;

export function setSound(on) { enabled = on; }
export function soundOn() { return enabled; }

function ac() {
  if (!enabled) return null;
  if (!ctx) {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return null;
    try { ctx = new AC(); } catch { return null; }
  }
  if (ctx.state === 'suspended') ctx.resume().catch(() => {});
  return ctx;
}

function tone({ freq = 440, type = 'sine', dur = 0.15, vol = 0.18, at = 0, slide = 0, vibrato = 0 }) {
  const c = ac();
  if (!c) return;
  const t = c.currentTime + at;
  const osc = c.createOscillator();
  const gain = c.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, t);
  if (slide) osc.frequency.exponentialRampToValueAtTime(Math.max(30, freq + slide), t + dur);
  if (vibrato) {
    const lfo = c.createOscillator();
    const lg = c.createGain();
    lfo.frequency.value = vibrato;
    lg.gain.value = freq * 0.03;
    lfo.connect(lg).connect(osc.frequency);
    lfo.start(t);
    lfo.stop(t + dur);
  }
  gain.gain.setValueAtTime(0.0001, t);
  gain.gain.exponentialRampToValueAtTime(vol, t + 0.012);
  gain.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  osc.connect(gain).connect(c.destination);
  osc.start(t);
  osc.stop(t + dur + 0.02);
}

function noise({ dur = 0.4, vol = 0.12, at = 0, filter = 1200, q = 0.7, swell = false }) {
  const c = ac();
  if (!c) return;
  const t = c.currentTime + at;
  const len = Math.floor(c.sampleRate * dur);
  const buf = c.createBuffer(1, len, c.sampleRate);
  const data = buf.getChannelData(0);
  for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
  const src = c.createBufferSource();
  src.buffer = buf;
  const bp = c.createBiquadFilter();
  bp.type = 'bandpass';
  bp.frequency.value = filter;
  bp.Q.value = q;
  const gain = c.createGain();
  gain.gain.setValueAtTime(0.0001, t);
  gain.gain.exponentialRampToValueAtTime(vol, t + (swell ? dur * 0.35 : 0.01));
  gain.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  src.connect(bp).connect(gain).connect(c.destination);
  src.start(t);
}

export const sfx = {
  whistle() { tone({ freq: 2650, type: 'sine', dur: 0.42, vol: 0.12, vibrato: 32 }); },
  tick() { tone({ freq: 1800, type: 'square', dur: 0.03, vol: 0.05 }); },
  reel() { for (let i = 0; i < 9; i++) tone({ freq: 900 + i * 40, type: 'square', dur: 0.025, vol: 0.035, at: i * 0.07 }); },
  lock() { tone({ freq: 160, type: 'sine', dur: 0.18, vol: 0.32, slide: -90 }); noise({ dur: 0.12, vol: 0.12, filter: 500 }); },
  flip() { noise({ dur: 0.16, vol: 0.1, filter: 3000, q: 1.2 }); },
  thud() { tone({ freq: 90, type: 'sine', dur: 0.3, vol: 0.35, slide: -40 }); },
  roll() { for (let i = 0; i < 12; i++) tone({ freq: 600 + (i % 3) * 80, type: 'triangle', dur: 0.03, vol: 0.04, at: i * 0.06 }); },
  bust() { tone({ freq: 140, type: 'sawtooth', dur: 0.5, vol: 0.14, slide: -50 }); },
  win() {
    [523, 659, 784, 1047].forEach((f, i) => tone({ freq: f, type: 'triangle', dur: 0.32, vol: 0.14, at: i * 0.11 }));
    noise({ dur: 2.4, vol: 0.09, filter: 900, q: 0.4, swell: true, at: 0.1 });
  },
  crowd() { noise({ dur: 1.8, vol: 0.08, filter: 800, q: 0.35, swell: true }); },
};
