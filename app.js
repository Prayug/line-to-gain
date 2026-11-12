'use strict';

const SAVE_KEY = 'line-to-gain.v2';
const MAX_PLAYERS = 6;
const MAX_EACH = 20;
const MIN_QUERY = 3; // shorter searches would let you browse names for free
const MAX_RESULTS = 8;
// A timeframe needs this many players with the stat for every pick, so the
// last picks of a big draft aren't forced onto players who never recorded one.
const SLACK = 1.3;
const STICK_AT = 75; // the line sits here on every track, so its position leaks nothing
const COLORS = ['#5cb3ff', '#ff7482', '#ffd23f', '#c9a0ff', '#39e3c3', '#ffa3d9'];
const REDUCED = !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);

// depth: how many of a single season's top players the target is drawn from.
const CATS = [
  { id: 'pass_yds', group: 'Passing', name: 'Passing yards', chip: 'Pass yds', one: 'yd', many: 'yds', depth: 32 },
  { id: 'pass_td', group: 'Passing', name: 'Passing TDs', chip: 'Pass TDs', one: 'TD', many: 'TDs', depth: 32 },
  { id: 'cmp', group: 'Passing', name: 'Completions', chip: 'Completions', one: 'completion', many: 'completions', depth: 32 },
  { id: 'pass_int', group: 'Passing', name: 'Interceptions thrown', chip: 'INTs thrown', one: 'INT', many: 'INTs', depth: 32 },
  { id: 'rush_yds', group: 'Rushing', name: 'Rushing yards', chip: 'Rush yds', one: 'yd', many: 'yds', depth: 48 },
  { id: 'rush_td', group: 'Rushing', name: 'Rushing TDs', chip: 'Rush TDs', one: 'TD', many: 'TDs', depth: 40 },
  { id: 'carries', group: 'Rushing', name: 'Carries', chip: 'Carries', one: 'carry', many: 'carries', depth: 48 },
  { id: 'rec_yds', group: 'Receiving', name: 'Receiving yards', chip: 'Rec yds', one: 'yd', many: 'yds', depth: 72 },
  { id: 'rec_td', group: 'Receiving', name: 'Receiving TDs', chip: 'Rec TDs', one: 'TD', many: 'TDs', depth: 50 },
  { id: 'rec', group: 'Receiving', name: 'Receptions', chip: 'Receptions', one: 'catch', many: 'catches', depth: 72 },
  { id: 'targets', group: 'Receiving', name: 'Targets', chip: 'Targets', one: 'target', many: 'targets', depth: 72 },
  { id: 'scrim_yds', group: 'Combined', name: 'Scrimmage yards', chip: 'Scrimmage yds', one: 'yd', many: 'yds', depth: 72,
    parts: ['rush_yds', 'rec_yds'], note: 'Rushing + receiving' },
  { id: 'total_td', group: 'Combined', name: 'Total TDs', chip: 'Total TDs', one: 'TD', many: 'TDs', depth: 60,
    parts: ['rush_td', 'rec_td'], note: 'Rushing + receiving' },
  { id: 'ppr', group: 'Combined', name: 'Fantasy points', chip: 'Fantasy PPR', one: 'pt', many: 'pts', depth: 72, note: 'PPR scoring' },
  { id: 'sacks', group: 'Defense', name: 'Sacks', chip: 'Sacks', one: 'sack', many: 'sacks', depth: 40 },
  { id: 'ints', group: 'Defense', name: 'Interceptions', chip: 'INTs caught', one: 'INT', many: 'INTs', depth: 30, note: 'Caught by defenders' },
  { id: 'tackles', group: 'Defense', name: 'Tackles', chip: 'Tackles', one: 'tackle', many: 'tackles', depth: 60, note: 'Solo + assisted' },
  { id: 'ff', group: 'Defense', name: 'Forced fumbles', chip: 'Forced fumbles', one: 'forced fumble', many: 'forced fumbles', depth: 40 },
  { id: 'fg', group: 'Kicking', name: 'Field goals made', chip: 'FGs made', one: 'FG', many: 'FGs', depth: 24 },
];
const CLASSIC = ['pass_yds', 'pass_td', 'rush_yds', 'rush_td', 'rec_yds', 'rec_td', 'rec', 'scrim_yds', 'total_td', 'sacks', 'ints'];
const PRESETS = [['Quick', 1, 3], ['Standard', 3, 6], ['Big', 6, 12], ['Huge', 12, 20]];

const app = document.getElementById('app');
let META = null;
const POOLS = {};
const searchIndex = {};
let handoffTimer = null;

let S = {
  screen: 'setup',
  settings: { names: ['', ''], style: 'snake', cats: CATS.map(c => c.id), eras: null, min: 2, max: 6, handoff: true },
  players: [],
  wins: [],
  round: 1,
  game: null,
};

/* ---------- helpers ---------- */

const esc = s => String(s).replace(/[&<>"']/g, c => `&#${c.charCodeAt(0)};`);
const pick = list => list[Math.floor(Math.random() * list.length)];
const randInt = (a, b) => a + Math.floor(Math.random() * (b - a + 1));
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const color = i => COLORS[i % COLORS.length];
const catOf = id => CATS.find(c => c.id === id);
const eraOf = id => META.eras.find(e => e.id === id);
const r1 = v => Math.round(v * 10) / 10; // fantasy points carry one decimal
const fmt = v => r1(v).toLocaleString('en-US', { maximumFractionDigits: 1 });
const unit = (v, cat) => (Math.abs(v) === 1 ? cat.one : cat.many);
const available = (cat, era) => (cat.parts || [cat.id]).every(k => era.keys.includes(k));

function shuffled(list) {
  const a = [...list];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function statOf(row, cat, pool) {
  return r1((cat.parts || [cat.id]).reduce((sum, k) => sum + row[pool.col[k]], 0));
}

function save() {
  try { localStorage.setItem(SAVE_KEY, JSON.stringify(S)); } catch { /* private mode: game still works */ }
}

function restore() {
  try {
    localStorage.removeItem('line-to-gain.v1');
    const saved = JSON.parse(localStorage.getItem(SAVE_KEY));
    if (saved && saved.settings) S = { ...S, ...saved, settings: { ...S.settings, ...saved.settings } };
  } catch { /* corrupt or blocked storage: start fresh */ }
  const s = S.settings;
  const known = new Set(META.eras.map(e => e.id));
  s.eras = (s.eras || [...known]).filter(id => known.has(id));
  s.cats = s.cats.filter(id => catOf(id));
}

async function loadPool(id) {
  if (!POOLS[id]) {
    const res = await fetch(`data/pool-${id}.json`);
    if (!res.ok) throw new Error(`pool ${id}: ${res.status}`);
    const pool = await res.json();
    pool.col = Object.fromEntries(pool.keys.map((k, i) => [k, i + 3]));
    POOLS[id] = pool;
  }
  return POOLS[id];
}

/* ---------- the rules ---------- */

function draftOrder(playerCount, picksEach, style, first) {
  const base = Array.from({ length: playerCount }, (_, i) => (i + first) % playerCount);
  const order = [];
  for (let round = 0; round < picksEach; round++) {
    order.push(...(style === 'snake' && round % 2 ? [...base].reverse() : base));
  }
  return order;
}

function niceTarget(v) {
  const step = v >= 100000 ? 1000 : v >= 20000 ? 250 : v >= 5000 ? 50 : v >= 1000 ? 25 : v >= 300 ? 10 : v >= 100 ? 5 : 1;
  return Math.max(step, Math.round(v / step) * step);
}

function depthFor(cat, era) {
  if (era.id === 'post') return Math.ceil(cat.depth * 0.45); // one postseason, few teams
  if (era.group === 'Seasons') return cat.depth;
  return Math.ceil(cat.depth * 1.6); // decades, careers
}

// Every stat/timeframe pair the settings allow, with how many players hold it.
function options() {
  const s = S.settings;
  const out = [];
  for (const era of META.eras) {
    if (!s.eras.includes(era.id)) continue;
    for (const cat of CATS) {
      if (s.cats.includes(cat.id) && available(cat, era)) out.push({ era, cat, cap: era.counts[cat.id] || 0 });
    }
  }
  return out;
}

function rollCount(previous) {
  const { min, max } = S.settings;
  let n = randInt(min, max);
  // "Random" should feel random: don't serve the same size twice running.
  for (let i = 0; i < 6 && max > min && previous && n === previous.picksEach; i++) n = randInt(min, max);
  return n;
}

// The target is the real total of a random set of good players, so it is
// always reachable and scales itself to the stat, the timeframe and the week.
async function newChallenge(previous) {
  const people = S.players.length;
  let n = rollCount(previous);
  const all = options();
  if (!all.length) throw new Error('No stat fits the chosen timeframes');
  const isNew = o => !previous || o.cat.id !== previous.cat || o.era.id !== previous.era;
  const preferNew = list => (list.some(isNew) ? list.filter(isNew) : list);

  let choice;
  let capped = '';
  const fits = preferNew(all.filter(o => o.cap >= Math.ceil(n * people * SLACK)));
  if (fits.length) {
    // Timeframe first, then stat, so All-time's shorter stat list doesn't skew the odds.
    const eraId = pick([...new Set(fits.map(o => o.era.id))]);
    choice = pick(fits.filter(o => o.era.id === eraId));
  } else {
    choice = preferNew(all).reduce((a, b) => (b.cap > a.cap ? b : a));
    n = Math.max(1, Math.floor(choice.cap / (people * SLACK)));
    const stat = choice.cat.name[0].toLowerCase() + choice.cat.name.slice(1); // keeps "TDs" capitalised
    capped = `Capped at ${n} each. Not enough players have ${stat} in this timeframe for more.`;
  }

  const pool = await loadPool(choice.era.id);
  const values = pool.rows.map(r => statOf(r, choice.cat, pool)).filter(v => v > 0).sort((a, b) => b - a);
  const depth = Math.min(values.length, Math.max(depthFor(choice.cat, choice.era), Math.ceil(n * people * SLACK)));
  const total = shuffled(values.slice(0, depth)).slice(0, n).reduce((a, b) => a + b, 0);
  const first = (S.round - 1) % people;
  return {
    cat: choice.cat.id, era: choice.era.id, picksEach: n, capped, first,
    target: niceTarget(total),
    order: draftOrder(people, n, S.settings.style, first),
    picks: [], revealed: 0, scored: false, fresh: true,
  };
}

function totals(upTo) {
  const t = S.players.map(() => 0);
  S.game.picks.slice(0, upTo).forEach(p => { t[p.by] = r1(t[p.by] + p.value); });
  return t;
}

function outcome() {
  const g = S.game;
  const off = totals(g.picks.length).map(v => r1(Math.abs(v - g.target)));
  const best = Math.min(...off);
  const winners = off.flatMap((d, i) => (d === best ? [i] : []));
  const rest = off.filter(d => d !== best);
  return { best, winners, margin: rest.length ? r1(Math.min(...rest) - best) : 0 };
}

/* ---------- search ---------- */

function norm(s) {
  return s.normalize('NFKD').replace(/[̀-ͯ]/g, '').toLowerCase()
    .replace(/-/g, ' ').replace(/[^a-z0-9 ]/g, '')
    .replace(/\b(jr|sr|ii|iii|iv|v)\b/g, '').replace(/\s+/g, ' ').trim();
}

function indexFor(era) {
  if (!searchIndex[era]) {
    searchIndex[era] = POOLS[era].rows.map((row, i) => {
      const n = norm(row[0]);
      const parts = n.split(' ');
      const last = parts[parts.length - 1];
      return { i, n, parts, last, squashed: n.replace(/ /g, ''), sort: `${last} ${n}` };
    });
  }
  return searchIndex[era];
}

// Edit distance where swapping two neighbouring letters counts as one typo,
// because that's the usual thumb slip (mahmoes -> mahomes).
function distance(a, b, limit) {
  if (Math.abs(a.length - b.length) > limit) return limit + 1;
  let before = [];
  let prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    const cur = [i];
    for (let j = 1; j <= b.length; j++) {
      cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) {
        cur[j] = Math.min(cur[j], before[j - 2] + 1);
      }
    }
    before = prev;
    prev = cur;
  }
  return prev[b.length];
}

function matchRank(e, q, tokens) {
  if (e.n === q) return 0;
  if (e.last.startsWith(q)) return 1;
  if (e.n.startsWith(q)) return 2;
  if (e.parts.some(p => p.startsWith(q))) return 3;
  if (tokens.length > 1 && tokens.every(t => e.parts.some(p => p.startsWith(t)))) return 4;
  if (e.squashed.startsWith(q.replace(/ /g, ''))) return 5; // "ja marr" -> Ja'Marr
  return -1;
}

// Sorted by match quality then alphabetically. Never by stat: the order of
// this list must not hint at who is good for the current category.
function search(era, q) {
  const tokens = q.split(' ');
  const byRank = (a, b) => a.rank - b.rank || a.e.sort.localeCompare(b.e.sort);
  const hits = [];
  for (const e of indexFor(era)) {
    const rank = matchRank(e, q, tokens);
    if (rank >= 0) hits.push({ e, rank });
  }
  if (!hits.length && q.length >= 4) {
    const slack = q.length >= 6 ? 2 : 1;
    for (const e of indexFor(era)) {
      const d = Math.min(distance(q, e.n, 2), distance(q, e.last, slack));
      if (d <= slack) hits.push({ e, rank: d });
    }
  }
  return hits.sort(byRank).map(h => h.e.i);
}

/* ---------- motion ---------- */

function countUp(el, from, to, ms = 650) {
  if (REDUCED || from === to) { el.textContent = fmt(to); return; }
  const start = performance.now();
  let done = false;
  const step = now => {
    if (done) return;
    const t = Math.min(1, (now - start) / ms);
    el.textContent = fmt(from + (to - from) * (1 - (1 - t) ** 3));
    if (t < 1) requestAnimationFrame(step);
  };
  requestAnimationFrame(step);
  // Frames stop firing on a locked or backgrounded phone, so the true number
  // can't depend on the last frame arriving.
  setTimeout(() => { done = true; el.textContent = fmt(to); }, ms);
}

// Digits sit on vertical strips, so the number can roll in like a scoreboard.
function odometer(v) {
  const strip = Array.from({ length: 30 }, (_, i) => `<span>${i % 10}</span>`).join('');
  return [...fmt(v)].map(ch => (/\d/.test(ch)
    ? `<span class="odo-d" data-d="${ch}" aria-hidden="true"><span class="odo-strip">${strip}</span></span>`
    : `<span class="odo-s" aria-hidden="true">${ch}</span>`)).join('');
}

function rollOdometer(root, animate) {
  const digits = [...root.querySelectorAll('.odo-d')];
  digits.forEach((el, i) => {
    const strip = el.firstElementChild;
    const to = `translateY(${-(20 + Number(el.dataset.d))}em)`; // land on the third lap
    if (!animate) { strip.style.transform = to; return; }
    strip.style.transform = 'translateY(0)';
    requestAnimationFrame(() => requestAnimationFrame(() => {
      strip.style.transition = `transform ${900 + i * 160}ms cubic-bezier(.12,.75,.2,1) 380ms`;
      strip.style.transform = to;
    }));
  });
}

// Flick through other stat names before landing, like a slot reel.
function spinText(el, finalText, choices, ms) {
  if (REDUCED) { el.textContent = finalText; return; }
  const t0 = performance.now();
  el.classList.add('spinning');
  const tick = () => {
    if (performance.now() - t0 >= ms) {
      el.textContent = finalText;
      el.classList.remove('spinning');
      el.classList.add('landed');
      return;
    }
    el.textContent = pick(choices);
    setTimeout(tick, 60);
  };
  tick();
}

function replay(el, cls) {
  el.classList.remove(cls);
  void el.offsetWidth;
  el.classList.add(cls);
}

function confetti(hex) {
  const cv = document.getElementById('confetti');
  if (REDUCED || !cv || !cv.getContext) return;
  const ctx = cv.getContext('2d');
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  const W = (cv.width = innerWidth * dpr);
  const H = (cv.height = innerHeight * dpr);
  const colors = [hex, hex, '#f5f2e7', '#ff6a1a'];
  const bits = Array.from({ length: 160 }, (_, i) => ({
    x: W / 2 + (Math.random() - 0.5) * W * 0.35,
    y: H * 0.38,
    vx: (Math.random() - 0.5) * 15 * dpr,
    vy: (-Math.random() * 17 - 6) * dpr,
    w: (6 + Math.random() * 7) * dpr,
    h: (3 + Math.random() * 4) * dpr,
    r: Math.random() * 6,
    vr: (Math.random() - 0.5) * 0.35,
    c: pick(colors),
    ball: i % 9 === 0, // a few footballs in the mix
  }));
  const t0 = performance.now();
  const life = 2800;
  const frame = now => {
    const t = now - t0;
    ctx.clearRect(0, 0, W, H);
    ctx.globalAlpha = Math.max(0, 1 - t / life);
    for (const b of bits) {
      b.vy += 0.42 * dpr;
      b.vx *= 0.99;
      b.x += b.vx;
      b.y += b.vy;
      b.r += b.vr;
      ctx.save();
      ctx.translate(b.x, b.y);
      ctx.rotate(b.r);
      if (b.ball) {
        ctx.fillStyle = '#8a4a22';
        ctx.beginPath();
        ctx.ellipse(0, 0, 9 * dpr, 5.5 * dpr, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = '#f5f2e7';
        ctx.fillRect(-3 * dpr, -0.6 * dpr, 6 * dpr, 1.2 * dpr);
      } else {
        ctx.fillStyle = b.c;
        ctx.fillRect(-b.w / 2, -b.h / 2, b.w, b.h);
      }
      ctx.restore();
    }
    if (t < life) requestAnimationFrame(frame);
    else ctx.clearRect(0, 0, W, H);
  };
  requestAnimationFrame(frame);
}

/* ---------- setup screen ---------- */

function renderSetup() {
  const s = S.settings;
  const groups = list => [...new Set(list.map(x => x.group))];
  app.onclick = onSetupClick;
  app.oninput = e => {
    if (e.target.dataset.name !== undefined) { s.names[+e.target.dataset.name] = e.target.value; save(); }
  };
  app.onchange = e => {
    if (e.target.id === 'handoff') { s.handoff = e.target.checked; save(); }
  };

  app.innerHTML = `
    <header class="hero">
      <div class="yardnum" aria-hidden="true">50</div>
      <h1><span class="w">Line</span> <span class="w">to</span> <span class="w gain">Gain</span></h1>
      <p>Get a stat and a number. Take turns naming real NFL players, and the combined total closest to the line wins. Nobody sees a stat until the end.</p>
    </header>
    <div class="yardline"></div>

    <section class="field">
      <h2 class="label">Who's playing</h2>
      <div class="names" id="names"></div>
      <button type="button" class="btn-quiet add" id="add">+ Add a player</button>
    </section>

    <section class="field">
      <h2 class="label">Players each</h2>
      <div class="range">
        <div class="stepper">
          <span>From</span>
          <button type="button" data-step="min" data-d="-1" aria-label="Lower the minimum">−</button>
          <output id="minv"></output>
          <button type="button" data-step="min" data-d="1" aria-label="Raise the minimum">+</button>
        </div>
        <div class="stepper">
          <span>To</span>
          <button type="button" data-step="max" data-d="-1" aria-label="Lower the maximum">−</button>
          <output id="maxv"></output>
          <button type="button" data-step="max" data-d="1" aria-label="Raise the maximum">+</button>
        </div>
      </div>
      <div class="rangebar" id="rangebar" aria-hidden="true">${Array.from({ length: MAX_EACH }, (_, i) => `<i data-n="${i + 1}"></i>`).join('')}</div>
      <div class="chips presets">${PRESETS.map(([label, a, b]) =>
        `<button type="button" class="chip" data-preset="${a}-${b}">${label} <small>${a}–${b}</small></button>`).join('')}</div>
      <p class="hint" id="rangeHint"></p>
    </section>

    <section class="field">
      <h2 class="label">Draft style</h2>
      <div class="split">
        <button type="button" class="chip" data-style="snake">Snake</button>
        <button type="button" class="chip" data-style="normal">Normal</button>
      </div>
      <div class="order-preview" id="preview"></div>
    </section>

    <section class="field">
      <div class="label-row">
        <h2 class="label">Stats</h2>
        <span class="tally" id="catTally"></span>
        <span class="tools"><button type="button" data-cats="all">All</button><button type="button" data-cats="classic">Classic</button></span>
      </div>
      ${groups(CATS).map(gr => `
        <div class="group"><h3>${gr}</h3><div class="chips">${CATS.filter(c => c.group === gr).map(c =>
          `<button type="button" class="chip" data-cat="${c.id}">${esc(c.chip)}</button>`).join('')}</div></div>`).join('')}
    </section>

    <section class="field">
      <div class="label-row">
        <h2 class="label">Timeframes</h2>
        <span class="tally" id="eraTally"></span>
        <span class="tools"><button type="button" data-eras="all">All</button></span>
      </div>
      ${groups(META.eras).map(gr => `
        <div class="group"><h3>${gr}</h3><div class="chips">${META.eras.filter(e => e.group === gr).map(e =>
          `<button type="button" class="chip" data-era="${e.id}">${esc(e.label)}</button>`).join('')}</div></div>`).join('')}
      <p class="hint">Seasons and decades count regular-season games. All-time covers careers back to the 1930s for the classic stats. Newer stats like targets and tackles start in 1999, so they skip All-time.</p>
    </section>

    <section class="field">
      <label class="switch">
        <input type="checkbox" id="handoff" ${s.handoff ? 'checked' : ''}>
        <span class="knob" aria-hidden="true"></span>
        <span>Show a “pass the phone” screen between turns</span>
      </label>
    </section>

    <p class="warn" id="warn" hidden></p>
    <div class="cta"><button class="btn" id="start">Get the number</button></div>
    <p class="small-print">Stats from nflverse, plus Wikipedia for older careers. ${esc(eraOf('cur').label)} runs ${esc(eraOf('cur').note || 'to date')}.</p>`;

  renderNames();
  refreshSetup();
}

function renderNames() {
  const s = S.settings;
  document.getElementById('names').innerHTML = s.names.map((n, i) => `
    <div class="name-row" style="--c:${color(i)}">
      <span class="dot"></span>
      <input data-name="${i}" value="${esc(n)}" placeholder="Player ${i + 1}" aria-label="Player ${i + 1} name" maxlength="16" autocomplete="off" autocapitalize="words">
      ${s.names.length > 2 ? `<button type="button" data-remove="${i}" aria-label="Remove player ${i + 1}">×</button>` : ''}
    </div>`).join('');
  document.getElementById('add').hidden = s.names.length >= MAX_PLAYERS;
}

function refreshSetup() {
  const s = S.settings;
  const press = (sel, on) => app.querySelectorAll(sel).forEach(b => b.setAttribute('aria-pressed', String(on(b.dataset))));
  press('[data-cat]', d => s.cats.includes(d.cat));
  press('[data-era]', d => s.eras.includes(d.era));
  press('[data-style]', d => s.style === d.style);
  press('[data-preset]', d => d.preset === `${s.min}-${s.max}`);
  app.querySelectorAll('[data-cat]').forEach(b => {
    const usable = s.eras.some(id => available(catOf(b.dataset.cat), eraOf(id)));
    b.classList.toggle('na', !usable);
    b.title = usable ? '' : 'Not tracked in the timeframes you picked';
  });

  document.getElementById('minv').textContent = s.min;
  document.getElementById('maxv').textContent = s.max;
  app.querySelectorAll('#rangebar i').forEach(i => i.classList.toggle('on', +i.dataset.n >= s.min && +i.dataset.n <= s.max));
  const people = s.names.length;
  document.getElementById('rangeHint').textContent = s.min === s.max
    ? `Always ${s.min} each, ${s.min * people} picks a round.`
    : `A new random size every round, ${s.min} to ${s.max} each (${s.min * people}–${s.max * people} picks).`;

  document.getElementById('catTally').textContent = `${s.cats.length} of ${CATS.length}`;
  document.getElementById('eraTally').textContent = `${s.eras.length} of ${META.eras.length}`;

  const preview = document.getElementById('preview');
  const sig = `${s.style}${people}`;
  if (preview.dataset.sig !== sig) {
    preview.dataset.sig = sig;
    preview.innerHTML = '<b>Pick order</b>' + draftOrder(people, 3, s.style, 0).slice(0, 10)
      .map((i, n) => `<i style="--c:${color(i)};--n:${n}"></i>`).join('');
  }

  const warn = document.getElementById('warn');
  let problem = '';
  if (!s.cats.length) problem = 'Turn on at least one stat.';
  else if (!s.eras.length) problem = 'Turn on at least one timeframe.';
  else if (!options().length) problem = 'None of those stats go back to All-time. Add another timeframe or a classic stat.';
  warn.hidden = !problem;
  warn.textContent = problem;
  document.getElementById('start').disabled = !!problem;
}

function onSetupClick(e) {
  const b = e.target.closest('button');
  if (!b) return;
  const s = S.settings;
  const d = b.dataset;
  const toggle = (list, id) => (list.includes(id) ? list.splice(list.indexOf(id), 1) : list.push(id));
  if (d.cat) toggle(s.cats, d.cat);
  else if (d.era) toggle(s.eras, d.era);
  else if (d.cats) s.cats = d.cats === 'all' ? CATS.map(c => c.id) : [...CLASSIC];
  else if (d.eras) s.eras = META.eras.map(x => x.id);
  else if (d.preset) [s.min, s.max] = d.preset.split('-').map(Number);
  else if (d.step === 'min') {
    s.min = clamp(s.min + Number(d.d), 1, MAX_EACH);
    s.max = Math.max(s.max, s.min);
  } else if (d.step === 'max') {
    s.max = clamp(s.max + Number(d.d), 1, MAX_EACH);
    s.min = Math.min(s.min, s.max);
  } else if (d.style) s.style = d.style;
  else if (d.remove !== undefined) { s.names.splice(+d.remove, 1); renderNames(); }
  else if (b.id === 'add') {
    s.names.push('');
    renderNames();
    app.querySelector(`[data-name="${s.names.length - 1}"]`).focus();
  } else if (b.id === 'start') { startGame(b); return; }
  else return;
  if (d.cat || d.era || d.preset || d.style) replay(b, 'pop');
  save();
  refreshSetup();
}

async function startGame(btn) {
  S.players = S.settings.names.map((n, i) => n.trim() || `Player ${i + 1}`);
  S.wins = S.players.map(() => 0);
  S.round = 1;
  await spin(null, btn);
}

async function spin(previous, btn) {
  const label = btn.textContent;
  btn.disabled = true;
  btn.textContent = 'Spinning…';
  try {
    S.game = await newChallenge(previous);
    go('line');
  } catch {
    btn.disabled = false;
    const warn = document.getElementById('warn');
    if (warn) {
      btn.textContent = label;
      warn.hidden = false;
      warn.textContent = 'Couldn’t load the stats for that round. Check your connection and try again.';
    } else {
      btn.textContent = 'Couldn’t load. Try again';
    }
  }
}

function go(screen) {
  S.screen = screen;
  save();
  render();
  window.scrollTo(0, 0);
}

/* ---------- the number ---------- */

function scoreboard(bump) {
  return `
    <div class="board">
      <span class="board-round">Round ${S.round}</span>
      <div class="board-teams">${S.players.map((p, i) => `
        <span class="board-team" style="--c:${color(i)}"><b>${esc(p)}</b><span class="board-num${i === bump ? ' bump' : ''}">${S.wins[i]}</span></span>`).join('')}
      </div>
    </div>`;
}

function renderLine() {
  const g = S.game;
  const cat = catOf(g.cat);
  const era = eraOf(g.era);
  const animate = g.fresh && !REDUCED;
  g.fresh = false;
  save();
  app.onclick = null;
  app.oninput = null;
  const notes = [cat.note, era.note].filter(Boolean).map(esc).join(' · ');
  app.innerHTML = `
    ${S.round > 1 ? scoreboard() : ''}
    <div class="marker${animate ? ' enter' : ''}">
      <div class="sign">
        <span class="label">The line</span>
        <span class="num" style="--chars:${fmt(g.target).length}" aria-label="${fmt(g.target)}">${odometer(g.target)}</span>
      </div>
      <div class="pole"></div>
      <div class="chain"></div>
    </div>
    <div class="brief${animate ? ' enter' : ''}">
      <h2 id="statName">${esc(cat.name)}</h2>
      <p class="era"><span id="eraName">${esc(era.label)}</span></p>
      ${notes ? `<p class="note">${notes}</p>` : ''}
      <div class="count"><b>${g.picksEach}</b><span>${g.picksEach === 1 ? 'player' : 'players'} each</span></div>
      ${g.capped ? `<p class="capped">${esc(g.capped)}</p>` : ''}
      <p class="rules">${S.settings.style === 'snake' ? 'Snake' : 'Normal'} draft, ${g.order.length} picks.
        <b style="color:${color(g.first)}">${esc(S.players[g.first])}</b> picks first.</p>
    </div>
    <div class="stack">
      <button class="btn" id="draft">Start the draft</button>
      <button class="btn-quiet" id="reroll">Spin again</button>
      <button class="btn-quiet" id="quit">End game</button>
    </div>`;
  rollOdometer(app.querySelector('.num'), animate);
  if (animate) {
    spinText(document.getElementById('statName'), cat.name, CATS.map(c => c.name), 750);
    spinText(document.getElementById('eraName'), era.label, META.eras.map(e => e.label), 950);
  }
  document.getElementById('draft').addEventListener('click', () => {
    g.intro = true;
    go('draft');
  });
  document.getElementById('reroll').addEventListener('click', e => spin(g, e.currentTarget));
  bindQuit();
}

/* ---------- draft ---------- */

function renderDraft() {
  const g = S.game;
  const cat = catOf(g.cat);
  app.onclick = null;
  app.oninput = null;
  app.innerHTML = `
    <header class="mini">
      <div class="tag">${fmt(g.target)}</div>
      <div class="mini-text"><strong>${esc(cat.name)}</strong><span class="sub">${esc(eraOf(g.era).label)} · ${g.picksEach} each</span></div>
    </header>
    <div class="progress" id="progress" aria-hidden="true"><i></i></div>
    <div class="band" id="band" aria-live="polite"></div>
    <div class="search" id="search">
      <input id="q" type="search" placeholder="Name a player" aria-label="Search for a player"
        autocomplete="off" autocorrect="off" autocapitalize="words" spellcheck="false" enterkeyhint="done">
      <ul class="results" id="results"></ul>
    </div>
    <div class="stack" id="finish" hidden><button class="btn" id="measure">Bring out the chains</button></div>
    <div class="rosters" id="rosters"></div>
    <div class="foot">
      <button class="btn-quiet" id="undo">Undo last pick</button>
      <button class="btn-quiet" id="quit">End game</button>
    </div>
    <div class="handoff" id="handoff" hidden></div>`;

  const q = document.getElementById('q');
  q.addEventListener('input', showResults);
  // Enter drafts only an unambiguous match: with three Gronkowskis in the
  // 2010s, grabbing the alphabetically-first one would burn the pick.
  q.addEventListener('keydown', e => {
    if (e.key !== 'Enter') return;
    e.preventDefault();
    const open = [...document.querySelectorAll('#results button:not(:disabled)')];
    const exact = open.filter(b => b.dataset.exact);
    const only = open.length === 1 ? open[0] : exact.length === 1 ? exact[0] : null;
    if (only) only.click();
    else if (open.length) replay(document.getElementById('results'), 'nudge');
  });
  document.getElementById('results').addEventListener('click', e => {
    const btn = e.target.closest('button[data-row]');
    if (btn && !btn.disabled) makePick(+btn.dataset.row);
  });
  document.getElementById('undo').addEventListener('click', () => {
    g.picks.pop();
    save();
    updateDraft(false);
    q.focus();
  });
  document.getElementById('measure').addEventListener('click', () => go('reveal'));
  document.getElementById('handoff').addEventListener('click', hideHandoff);
  bindQuit();
  updateDraft(false);

  if (g.picks.length < g.order.length) {
    q.focus();
    if (g.intro && S.settings.handoff) showHandoff(g.order[0], null, 'You’re up');
  }
  if (g.intro) { g.intro = false; save(); }
}

function showHandoff(by, locked, label) {
  const el = document.getElementById('handoff');
  if (!el) return;
  const g = S.game;
  el.style.setProperty('--c', color(by));
  el.innerHTML = `
    ${locked ? `<p class="locked">Locked in<span>${esc(locked)}</span></p>` : ''}
    <p class="pass">${label || 'Pass to'}</p>
    <p class="who">${esc(S.players[by])}</p>
    <p class="tap">Pick ${g.picks.length + 1} of ${g.order.length} · tap to start</p>`;
  el.hidden = false;
  el.classList.remove('out');
  replay(el, 'in');
  clearTimeout(handoffTimer);
  handoffTimer = setTimeout(hideHandoff, 1500);
}

function hideHandoff() {
  const el = document.getElementById('handoff');
  if (!el || el.hidden) return;
  clearTimeout(handoffTimer);
  el.classList.add('out');
  handoffTimer = setTimeout(() => { el.hidden = true; el.classList.remove('in', 'out'); }, 240);
}

function updateDraft(picked) {
  const g = S.game;
  const at = g.picks.length;
  const done = at === g.order.length;
  const band = document.getElementById('band');
  const by = g.order[at];

  document.querySelector('#progress i').style.width = `${(at / g.order.length) * 100}%`;
  if (done) {
    band.style.setProperty('--c', 'var(--chalk)');
    band.innerHTML = '<p class="clock">Draft complete</p><div class="who">Draft’s in</div><div class="meta"><span>Time to measure</span></div>';
  } else {
    band.style.setProperty('--c', color(by));
    const next = g.order[at + 1];
    band.innerHTML = `
      <p class="clock">On the clock</p>
      <div class="who">${esc(S.players[by])}</div>
      <div class="meta">
        <span>Pick ${at + 1} of ${g.order.length}</span>
        <span>${next === undefined ? 'Last pick' : next === by ? 'Picks again next' : `${esc(S.players[next])} next`}</span>
      </div>`;
  }
  if (picked) replay(band, 'pop');

  document.getElementById('search').hidden = done;
  document.getElementById('finish').hidden = !done;
  document.getElementById('undo').disabled = at === 0;
  document.getElementById('q').value = '';
  document.getElementById('results').innerHTML = '';

  document.getElementById('rosters').innerHTML = S.players.map((p, i) => {
    const mine = g.picks.map((x, n) => ({ ...x, n })).filter(x => x.by === i);
    const open = g.picksEach - mine.length;
    return `
      <section class="roster" style="--c:${color(i)}">
        <h3>${esc(p)} <small>${mine.length}/${g.picksEach}</small></h3>
        <ol>
          ${mine.map(x => `<li class="${picked && x.n === at - 1 ? 'fresh' : ''}">${esc(x.name)} <small>${esc(x.pos)}</small></li>`).join('')}
          ${open ? `<li class="open">${open} open</li>` : ''}
        </ol>
      </section>`;
  }).join('');
}

function showResults() {
  const g = S.game;
  const list = document.getElementById('results');
  const q = norm(document.getElementById('q').value);
  if (q.length < MIN_QUERY) {
    list.innerHTML = q ? '<li class="msg">Keep typing…</li>' : '';
    return;
  }
  const hits = search(g.era, q);
  if (!hits.length) {
    list.innerHTML = `<li class="msg">No match in ${esc(eraOf(g.era).label)}.</li>`;
    return;
  }
  const rows = POOLS[g.era].rows;
  list.innerHTML = hits.slice(0, MAX_RESULTS).map((i, n) => {
    const [name, pos, tag] = rows[i];
    const taken = g.picks.find(p => p.row === i);
    const meta = taken ? `Taken by ${esc(S.players[taken.by])}` : [pos, tag].filter(Boolean).map(esc).join(' · ');
    const exact = norm(name) === q ? ' data-exact="1"' : '';
    return `<li style="--i:${n}"><button data-row="${i}"${exact} ${taken ? 'disabled' : ''}><span>${esc(name)}</span><span class="meta">${meta}</span></button></li>`;
  }).join('') + (hits.length > MAX_RESULTS ? '<li class="msg">More matches. Keep typing to narrow it down.</li>' : '');
}

function makePick(i) {
  const g = S.game;
  if (g.picks.length >= g.order.length || g.picks.some(p => p.row === i)) return;
  const pool = POOLS[g.era];
  const row = pool.rows[i];
  const by = g.order[g.picks.length];
  // Copy the value now: a stats refresh mid-game must not change a locked pick.
  g.picks.push({ by, row: i, name: row[0], pos: row[1], value: statOf(row, catOf(g.cat), pool) });
  save();
  updateDraft(true);
  if (g.picks.length < g.order.length) {
    document.getElementById('q').focus();
    const next = g.order[g.picks.length];
    if (S.settings.handoff && next !== by) showHandoff(next, row[0]);
  }
}

/* ---------- the measurement ---------- */

function renderReveal() {
  const g = S.game;
  const cat = catOf(g.cat);
  app.onclick = null;
  app.oninput = null;
  app.innerHTML = `
    <section class="reveal">
      <h1 class="chains-title">Bring out the chains</h1>
      <header class="mini">
        <div class="tag">${fmt(g.target)}</div>
        <div class="mini-text"><strong>${esc(cat.name)}</strong><span class="sub">${esc(eraOf(g.era).label)}</span></div>
      </header>
      <div class="stage" id="stage" aria-live="polite"></div>
      <div class="lanes" id="lanes">
        ${S.players.map((p, i) => `
          <div class="lane" id="lane${i}" style="--c:${color(i)}">
            <div class="row">
              <span class="name">${esc(p)}</span>
              <span class="total"><span id="total${i}">0</span><span class="off" id="off${i}"></span></span>
            </div>
            <div class="track">
              <div class="fill" id="fill${i}"></div>
              <div class="overfill" id="over${i}"></div>
              <div class="stick"></div>
            </div>
            <span class="past">Over the line</span>
          </div>`).join('')}
      </div>
      <div class="picks" id="picks"></div>
      <div class="action" id="action"></div>
      <div class="foot" id="after"></div>
    </section>
    <canvas class="confetti" id="confetti" aria-hidden="true"></canvas>`;
  updateReveal(false, 0);
}

function revealTo(n) {
  const g = S.game;
  const before = g.revealed;
  g.revealed = Math.min(g.picks.length, n);
  save();
  updateReveal(true, before);
}

function updateReveal(fresh, before) {
  const g = S.game;
  const cat = catOf(g.cat);
  const shown = g.revealed;
  const finished = shown === g.picks.length;
  const was = totals(before);
  const now = totals(shown);

  // The line sits at 75% until someone runs past it; then the chain stretches
  // (the stick slides left) so big overshoots still compare by length. It only
  // reacts to numbers already revealed, so it gives nothing away.
  const scale = Math.max(g.target / (STICK_AT / 100), Math.max(...now) / 0.97);
  const stick = (g.target / scale) * 100;
  document.getElementById('lanes').style.setProperty('--stick', `${stick}%`);
  S.players.forEach((_, i) => {
    const v = Math.max(0, now[i]);
    document.getElementById(`fill${i}`).style.width = `${(Math.min(v, g.target) / scale) * 100}%`;
    document.getElementById(`over${i}`).style.width = `${(Math.max(0, v - g.target) / scale) * 100}%`;
    const lane = document.getElementById(`lane${i}`);
    const over = now[i] > g.target;
    if (fresh && over && !lane.classList.contains('over')) replay(lane, 'cross');
    lane.classList.toggle('over', over);
    const total = document.getElementById(`total${i}`);
    if (fresh) countUp(total, was[i], now[i]); else total.textContent = fmt(now[i]);
    const off = r1(now[i] - g.target);
    document.getElementById(`off${i}`).textContent = !finished ? ''
      : off === 0 ? 'on the line' : `${fmt(Math.abs(off))} ${off > 0 ? 'over' : 'short'}`;
  });

  document.getElementById('picks').innerHTML = S.players.map((p, i) => `
    <section class="roster" style="--c:${color(i)}">
      <h3>${esc(p)}</h3>
      <ol>${g.picks.map((x, n) => (x.by !== i ? '' : `
        <li class="${n >= shown ? 'hidden' : n >= before && fresh ? 'now' : ''}" style="--k:${Math.min(Math.max(0, n - before), 16)}">
          <span>${esc(x.name)}</span><b>${n >= shown ? '?' : fmt(x.value)}</b>
        </li>`)).join('')}</ol>
    </section>`).join('');

  const stage = document.getElementById('stage');
  const action = document.getElementById('action');
  const after = document.getElementById('after');
  if (finished) {
    showResult(stage, action, after, cat, fresh);
    return;
  }

  if (shown === 0) {
    stage.innerHTML = `
      <div class="stage-note">
        <p class="by">All ${g.picks.length} picks are in</p>
        <p class="player">Nobody’s seen a number yet</p>
      </div>`;
  } else {
    const last = g.picks[shown - 1];
    stage.innerHTML = `
      <div class="card${fresh ? '' : ' flipped'}" id="card" style="--c:${color(last.by)}">
        <div class="face front">
          <p class="by">${esc(S.players[last.by])}’s pick</p>
          <p class="player">${esc(last.name)}</p>
          <p class="q">?</p>
        </div>
        <div class="face back">
          <p class="by">${esc(S.players[last.by])}’s pick</p>
          <p class="player">${esc(last.name)}</p>
          <p class="value"><span id="count">${fresh ? '0' : fmt(last.value)}</span> <small>${esc(unit(last.value, cat))}</small></p>
        </div>
      </div>`;
    if (fresh) {
      const card = document.getElementById('card');
      setTimeout(() => {
        card.classList.add('flipped');
        countUp(document.getElementById('count'), 0, last.value);
      }, REDUCED ? 0 : 160);
    }
  }

  const size = S.players.length;
  const roundEnd = Math.min(g.picks.length, (Math.floor(shown / size) + 1) * size);
  action.innerHTML = `<button class="btn" id="next">Measure ${esc(g.picks[shown].name)}</button>`;
  after.innerHTML = `
    ${roundEnd - shown > 1 && roundEnd < g.picks.length ? '<button class="btn-quiet" id="round">Rest of this round</button>' : ''}
    <button class="btn-quiet" id="all">Show everything</button>`;
  document.getElementById('next').addEventListener('click', () => revealTo(shown + 1));
  const round = document.getElementById('round');
  if (round) round.addEventListener('click', () => revealTo(roundEnd));
  document.getElementById('all').addEventListener('click', () => revealTo(g.picks.length));
}

function showResult(stage, action, after, cat, fresh) {
  const g = S.game;
  const { best, winners, margin } = outcome();
  let bump = -1;
  if (!g.scored) {
    g.scored = true;
    if (winners.length === 1) { S.wins[winners[0]]++; bump = winners[0]; }
    save();
  }
  const offBy = best === 0 ? 'Dead on the number.' : `${fmt(best)} ${unit(best, cat)} off the line.`;
  if (winners.length === 1) {
    stage.innerHTML = `
      <div class="result${fresh ? ' slam' : ''}" style="--c:${color(winners[0])}">
        <h2>${esc(S.players[winners[0]])} wins</h2>
        <p>By ${fmt(margin)} ${unit(margin, cat)}. ${offBy}</p>
      </div>`;
    document.getElementById(`lane${winners[0]}`).classList.add('winner');
    if (fresh) setTimeout(() => confetti(color(winners[0])), 250);
  } else {
    stage.innerHTML = `
      <div class="result tie${fresh ? ' slam' : ''}">
        <h2>Dead heat</h2>
        <p>${winners.map(i => esc(S.players[i])).join(' and ')} tie. ${offBy}</p>
      </div>`;
  }
  action.innerHTML = '<button class="btn" id="again">Next round</button>';
  after.innerHTML = `${scoreboard(fresh ? bump : -1)}<button class="btn-quiet" id="quit">End game</button>`;
  document.getElementById('again').addEventListener('click', e => {
    S.round++;
    spin(g, e.currentTarget).then(() => { if (S.game === g) S.round--; });
  });
  bindQuit();
}

/* ---------- shell ---------- */

// Two taps, so a stray thumb while passing the phone can't end the game.
function bindQuit() {
  const btn = document.getElementById('quit');
  if (!btn) return;
  const label = btn.textContent;
  let armed = null;
  btn.addEventListener('click', () => {
    if (armed) {
      clearTimeout(armed);
      S.game = null;
      go('setup');
      return;
    }
    btn.textContent = 'Tap again to end';
    armed = setTimeout(() => { btn.textContent = label; armed = null; }, 2500);
  });
}

function render() {
  if (!S.game) S.screen = 'setup';
  ({ setup: renderSetup, line: renderLine, draft: renderDraft, reveal: renderReveal })[S.screen]();
}

function failed(message) {
  app.innerHTML = `<div class="failed"><p>${esc(message)}</p><button class="btn-quiet" id="retry">Try again</button></div>`;
  document.getElementById('retry').addEventListener('click', () => location.reload());
}

async function boot() {
  try {
    const res = await fetch('data/meta.json');
    if (!res.ok) throw new Error(res.status);
    META = await res.json();
  } catch {
    failed('Couldn’t load the stats. Check your connection and try again.');
    return;
  }
  restore();
  if (S.game) {
    try {
      await loadPool(S.game.era);
    } catch {
      failed('Couldn’t load the stats for this game. Check your connection and try again.');
      return;
    }
  }
  render();
}

boot();
