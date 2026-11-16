// Small shared helpers. No DOM access here, so the engine and tests can use them.

export const esc = s => String(s ?? '').replace(/[&<>"']/g, c => `&#${c.charCodeAt(0)};`);
export const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
export const r1 = v => Math.round(v * 10) / 10; // fantasy points and half sacks carry one decimal
export const fmt = v => r1(v).toLocaleString('en-US', { maximumFractionDigits: 1 });
export const plural = (n, one, many) => (Math.abs(n) === 1 ? one : many);
export const sleep = ms => new Promise(r => setTimeout(r, ms));

export function norm(s) {
  return String(s || '').normalize('NFKD').replace(/[̀-ͯ]/g, '').toLowerCase()
    .replace(/-/g, ' ').replace(/[^a-z0-9 ]/g, '')
    .replace(/\b(jr|sr|ii|iii|iv|v)\b/g, '').replace(/\s+/g, ' ').trim();
}

// Seeded PRNG (mulberry32): the Daily Drive and challenge codes must replay
// identically on every device.
export function makeRng(seed) {
  let a = seed >>> 0;
  const next = () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  const rng = {
    seed,
    next,
    int: (lo, hi) => lo + Math.floor(next() * (hi - lo + 1)),
    pick: list => list[Math.floor(next() * list.length)],
    chance: p => next() < p,
    shuffle(list) {
      const a2 = [...list];
      for (let i = a2.length - 1; i > 0; i--) {
        const j = Math.floor(next() * (i + 1));
        [a2[i], a2[j]] = [a2[j], a2[i]];
      }
      return a2;
    },
    weighted(list, weightOf) {
      const total = list.reduce((s, x) => s + weightOf(x), 0);
      let r = next() * total;
      for (const x of list) {
        r -= weightOf(x);
        if (r <= 0) return x;
      }
      return list[list.length - 1];
    },
  };
  return rng;
}

export function hashSeed(str) {
  let h = 2166136261;
  for (const ch of String(str)) {
    h ^= ch.charCodeAt(0);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

export const randomSeed = () => Math.floor(Math.random() * 2 ** 32);
export const uid = () => Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4);

export function b64urlEncode(text) {
  const bytes = new TextEncoder().encode(text);
  let bin = '';
  bytes.forEach(b => { bin += String.fromCharCode(b); });
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export function b64urlDecode(code) {
  const b64 = code.replace(/-/g, '+').replace(/_/g, '/') + '==='.slice((code.length + 3) % 4);
  const bin = atob(b64);
  return new TextDecoder().decode(Uint8Array.from(bin, c => c.charCodeAt(0)));
}

export const todayKey = (d = new Date()) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
