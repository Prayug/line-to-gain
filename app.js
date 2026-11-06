'use strict';

const SAVE_KEY = 'line-to-gain.v1';
const MAX_PLAYERS = 6;
const MIN_QUERY = 3; // shorter searches would let you browse names for free
const MAX_RESULTS = 8;
const COLORS = ['#5cb3ff', '#ff7482', '#ffd23f', '#c9a0ff', '#39e3c3', '#ffa3d9'];
const STICK_AT = 75; // the line sits here on every track, so its position leaks nothing

// depth: [season, all-time] = how many top players the target is sampled from.
const CATS = [
  { id: 'pass_yds', name: 'Passing yards', one: 'yd', many: 'yds', depth: [32, 70] },
  { id: 'pass_td', name: 'Passing TDs', one: 'TD', many: 'TDs', depth: [32, 70] },
  { id: 'rush_yds', name: 'Rushing yards', one: 'yd', many: 'yds', depth: [48, 80] },
  { id: 'rush_td', name: 'Rushing TDs', one: 'TD', many: 'TDs', depth: [40, 80] },
  { id: 'rec_yds', name: 'Receiving yards', one: 'yd', many: 'yds', depth: [72, 100] },
  { id: 'rec_td', name: 'Receiving TDs', one: 'TD', many: 'TDs', depth: [50, 80] },
  { id: 'rec', name: 'Receptions', one: 'catch', many: 'catches', depth: [72, 100] },
  { id: 'scrim_yds', name: 'Scrimmage yards', one: 'yd', many: 'yds', depth: [72, 100],
    parts: ['rush_yds', 'rec_yds'], note: 'Rushing + receiving' },
  { id: 'total_td', name: 'Total TDs', one: 'TD', many: 'TDs', depth: [60, 100],
    parts: ['rush_td', 'rec_td'], note: 'Rushing + receiving' },
  { id: 'sacks', name: 'Sacks', one: 'sack', many: 'sacks', depth: [40, 80] },
  { id: 'ints', name: 'Interceptions', one: 'INT', many: 'INTs', depth: [30, 60], note: 'Caught by defenders' },
];
const ERAS = ['cur', 'last', 'all'];

const app = document.getElementById('app');
let DATA = null;
let COL = {};
const searchIndex = {};

let S = {
  screen: 'setup',
  settings: { names: ['', ''], style: 'snake', cat: 'random', era: 'random', picks: 'random' },
  players: [],
  wins: [],
  round: 1,
  game: null,
};

/* ---------- helpers ---------- */

const esc = s => String(s).replace(/[&<>"']/g, c => `&#${c.charCodeAt(0)};`);
const pick = list => list[Math.floor(Math.random() * list.length)];
const color = i => COLORS[i % COLORS.length];
const catOf = id => CATS.find(c => c.id === id);
const fmt = v => v.toLocaleString('en-US', { maximumFractionDigits: 1 });
const unit = (v, cat) => (Math.abs(v) === 1 ? cat.one : cat.many);
const seasonDone = () => /Week 18$/.test(DATA.meta.progress);

function shuffled(list) {
  const a = [...list];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function eraLabel(era) {
  if (era === 'cur') return `${DATA.meta.current} ${seasonDone() ? 'season' : 'so far'}`;
  if (era === 'last') return `${DATA.meta.last} season`;
  return 'All-time';
}

function statOf(row, cat) {
  return (cat.parts || [cat.id]).reduce((sum, k) => sum + row[COL[k]], 0);
}

function save() {
  try { localStorage.setItem(SAVE_KEY, JSON.stringify(S)); } catch { /* private mode: game still works */ }
}

function restore() {
  try {
    const saved = JSON.parse(localStorage.getItem(SAVE_KEY));
    if (saved && saved.settings) S = { ...S, ...saved };
  } catch { /* corrupt or blocked storage: start fresh */ }
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
  const step = v >= 20000 ? 250 : v >= 5000 ? 50 : v >= 1000 ? 25 : v >= 300 ? 10 : v >= 100 ? 5 : 1;
  return Math.max(step, Math.round(v / step) * step);
}

// The target is the real total of a random set of good players, so it is
// always reachable and scales itself to the stat, the era and the week.
function newChallenge(previous) {
  const { cat: catSetting, era: eraSetting, picks: picksSetting, style } = S.settings;
  let cat, era;
  for (let tries = 0; tries < 6; tries++) {
    cat = catSetting === 'random' ? pick(CATS) : catOf(catSetting);
    era = eraSetting === 'random' ? pick(ERAS) : eraSetting;
    if (!previous || cat.id !== previous.cat || era !== previous.era) break;
  }
  const picksEach = picksSetting === 'random' ? pick([2, 3, 3, 4, 5]) : Number(picksSetting);
  const ranked = DATA.pools[era].map(r => statOf(r, cat)).filter(v => v > 0).sort((a, b) => b - a);
  const depth = cat.depth[era === 'all' ? 1 : 0];
  const pool = ranked.slice(0, Math.max(depth, picksEach * S.players.length));
  const total = shuffled(pool).slice(0, picksEach).reduce((a, b) => a + b, 0);
  const first = (S.round - 1) % S.players.length;
  return {
    cat: cat.id, era, picksEach, first,
    target: niceTarget(total),
    order: draftOrder(S.players.length, picksEach, style, first),
    picks: [],
    revealed: 0,
    scored: false,
  };
}

function totals(upTo) {
  const t = S.players.map(() => 0);
  S.game.picks.slice(0, upTo).forEach(p => { t[p.by] += p.value; });
  return t;
}

function outcome() {
  const g = S.game;
  const t = totals(g.picks.length);
  const off = t.map(v => Math.abs(v - g.target));
  const best = Math.min(...off);
  const winners = off.flatMap((d, i) => (d === best ? [i] : []));
  const rest = off.filter(d => d !== best);
  return { best, winners, margin: rest.length ? Math.min(...rest) - best : 0 };
}

/* ---------- search ---------- */

function norm(s) {
  return s.normalize('NFKD').replace(/[\u0300-\u036f]/g, '').toLowerCase()
    .replace(/-/g, ' ').replace(/[^a-z0-9 ]/g, '')
    .replace(/\b(jr|sr|ii|iii|iv|v)\b/g, '').replace(/\s+/g, ' ').trim();
}

function indexFor(era) {
  if (!searchIndex[era]) {
    searchIndex[era] = DATA.pools[era].map((row, i) => {
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
  let hits = [];
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

/* ---------- setup screen ---------- */

function renderSetup() {
  const s = S.settings;
  const chip = (group, value, label) =>
    `<button type="button" class="chip" data-group="${group}" data-value="${value}" aria-pressed="${s[group] === value}">${esc(label)}</button>`;
  const preview = draftOrder(s.names.length, 3, s.style, 0).slice(0, 8)
    .map(i => `<i style="--c:${color(i)}"></i>`).join('');

  app.innerHTML = `
    <header class="title">
      <h1>Line to <span>Gain</span></h1>
      <p>You get a stat and a number. Take turns naming real NFL players. Closest combined total wins, and nobody sees the stats until the end.</p>
    </header>
    <div class="yardline"></div>

    <div class="field">
      <span class="label">Who's playing</span>
      <div class="names">
        ${s.names.map((n, i) => `
          <div class="name-row" style="--c:${color(i)}">
            <span class="dot"></span>
            <input data-name="${i}" value="${esc(n)}" placeholder="Player ${i + 1}" aria-label="Player ${i + 1} name" maxlength="16" autocomplete="off" autocapitalize="words">
            ${s.names.length > 2 ? `<button type="button" data-remove="${i}" aria-label="Remove player ${i + 1}">×</button>` : ''}
          </div>`).join('')}
      </div>
      ${s.names.length < MAX_PLAYERS ? '<button type="button" class="btn-quiet add" id="add">+ Add a player</button>' : ''}
    </div>

    <div class="field">
      <span class="label">Draft style</span>
      <div class="split">
        ${chip('style', 'snake', 'Snake')}
        ${chip('style', 'normal', 'Normal')}
      </div>
      <div class="order-preview"><b>Pick order</b>${preview}</div>
    </div>

    <div class="field">
      <span class="label">Stat</span>
      <div class="chips">
        ${chip('cat', 'random', 'Random')}
        ${CATS.map(c => chip('cat', c.id, c.name)).join('')}
      </div>
    </div>

    <div class="field">
      <span class="label">Timeframe</span>
      <div class="chips">
        ${chip('era', 'random', 'Random')}
        ${ERAS.map(e => chip('era', e, eraLabel(e))).join('')}
      </div>
      ${DATA.meta.progress && !seasonDone() ? `<p class="hint">${DATA.meta.current} stats run ${esc(DATA.meta.progress)}.</p>` : ''}
    </div>

    <div class="field">
      <span class="label">Players each</span>
      <div class="chips">
        ${chip('picks', 'random', 'Random')}
        ${['2', '3', '4', '5'].map(n => chip('picks', n, n)).join('')}
      </div>
    </div>

    <div class="cta"><button class="btn" id="start">Get the number</button></div>
    <p class="small-print">Regular season only. Stats from nflverse, plus Wikipedia for older careers.</p>`;

  app.querySelectorAll('[data-name]').forEach(input => {
    input.addEventListener('input', () => { s.names[+input.dataset.name] = input.value; save(); });
  });
  app.querySelectorAll('[data-group]').forEach(btn => {
    btn.addEventListener('click', () => {
      s[btn.dataset.group] = btn.dataset.value;
      save();
      keepScroll(renderSetup);
    });
  });
  app.querySelectorAll('[data-remove]').forEach(btn => {
    btn.addEventListener('click', () => {
      s.names.splice(+btn.dataset.remove, 1);
      save();
      keepScroll(renderSetup);
    });
  });
  const add = document.getElementById('add');
  if (add) add.addEventListener('click', () => { s.names.push(''); save(); keepScroll(renderSetup); });
  document.getElementById('start').addEventListener('click', startGame);
}

function keepScroll(render) {
  const y = window.scrollY;
  render();
  window.scrollTo(0, y);
}

function startGame() {
  S.players = S.settings.names.map((n, i) => n.trim() || `Player ${i + 1}`);
  S.wins = S.players.map(() => 0);
  S.round = 1;
  S.game = newChallenge(null);
  go('line');
}

function go(screen) {
  S.screen = screen;
  save();
  render();
  window.scrollTo(0, 0);
}

/* ---------- the number ---------- */

function scoreLine() {
  if (S.round === 1) return '';
  return `<p class="score">${S.players.map((p, i) =>
    `<span style="--c:${color(i)}"><b>${esc(p)}</b> ${S.wins[i]}</span>`).join('')}</p>`;
}

function renderLine() {
  const g = S.game;
  const cat = catOf(g.cat);
  app.innerHTML = `
    ${scoreLine()}
    <div class="marker">
      <div class="sign">
        <span class="label">The line</span>
        <span class="num">${fmt(g.target)}</span>
      </div>
      <div class="pole"></div>
      <div class="chain"></div>
    </div>
    <div class="brief">
      <h2>${esc(cat.name)}</h2>
      <p class="era">${esc(eraLabel(g.era))}</p>
      ${cat.note ? `<p class="note">${esc(cat.note)}</p>` : ''}
      <p class="rules">Draft <b>${g.picksEach} players each</b>, ${S.settings.style === 'snake' ? 'snake' : 'normal'} order.<br>
      <b style="color:${color(g.first)}">${esc(S.players[g.first])}</b> picks first.</p>
    </div>
    <div class="stack">
      <button class="btn" id="draft">Start the draft</button>
      <button class="btn-quiet" id="reroll">Give us a different number</button>
      <button class="btn-quiet" id="quit">End game</button>
    </div>`;
  document.getElementById('draft').addEventListener('click', () => go('draft'));
  document.getElementById('reroll').addEventListener('click', () => {
    S.game = newChallenge(S.game);
    save();
    render();
  });
  bindQuit();
}

/* ---------- draft ---------- */

function renderDraft() {
  const g = S.game;
  const cat = catOf(g.cat);
  app.innerHTML = `
    <header class="mini">
      <div class="tag">${fmt(g.target)}</div>
      <div><strong>${esc(cat.name)}</strong><span class="sub">${esc(eraLabel(g.era))} · ${g.picksEach} each</span></div>
    </header>
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
    </div>`;

  const q = document.getElementById('q');
  q.addEventListener('input', showResults);
  q.addEventListener('keydown', e => {
    if (e.key !== 'Enter') return;
    e.preventDefault();
    const first = document.querySelector('#results button:not(:disabled)');
    if (first) first.click();
  });
  document.getElementById('results').addEventListener('click', e => {
    const btn = e.target.closest('button[data-row]');
    if (btn && !btn.disabled) makePick(+btn.dataset.row);
  });
  document.getElementById('undo').addEventListener('click', () => {
    g.picks.pop();
    save();
    updateDraft();
    q.focus();
  });
  document.getElementById('measure').addEventListener('click', () => go('reveal'));
  bindQuit();
  updateDraft();
  if (g.picks.length < g.order.length) q.focus();
}

function updateDraft(animate) {
  const g = S.game;
  const at = g.picks.length;
  const done = at === g.order.length;
  const band = document.getElementById('band');
  const by = g.order[at];

  band.classList.remove('pop');
  if (done) {
    band.style.setProperty('--c', 'var(--chalk)');
    band.innerHTML = '<div class="who">Draft\'s in</div><div class="meta"><span>Time to measure</span></div>';
  } else {
    band.style.setProperty('--c', color(by));
    const again = g.order[at + 1] === by;
    const next = g.order[at + 1];
    band.innerHTML = `
      <div class="who">${esc(S.players[by])}</div>
      <div class="meta">
        <span>Pick ${at + 1} of ${g.order.length}</span>
        <span>${next === undefined ? 'Last pick' : again ? 'Picks twice' : `${esc(S.players[next])} next`}</span>
      </div>`;
    if (animate) { void band.offsetWidth; band.classList.add('pop'); }
  }

  document.getElementById('search').hidden = done;
  document.getElementById('finish').hidden = !done;
  document.getElementById('undo').disabled = at === 0;
  document.getElementById('q').value = '';
  document.getElementById('results').innerHTML = '';

  document.getElementById('rosters').innerHTML = S.players.map((p, i) => {
    const mine = g.picks.filter(x => x.by === i);
    const open = g.picksEach - mine.length;
    return `
      <section class="roster" style="--c:${color(i)}">
        <h3>${esc(p)}</h3>
        <ol>
          ${mine.map(x => `<li>${esc(x.name)} <small>${esc(x.pos)}</small></li>`).join('')}
          ${'<li class="open">—</li>'.repeat(open)}
        </ol>
      </section>`;
  }).join('');
}

function showResults() {
  const g = S.game;
  const list = document.getElementById('results');
  const raw = document.getElementById('q').value;
  const q = norm(raw);
  if (q.length < MIN_QUERY) {
    list.innerHTML = q ? '<li class="msg">Keep typing…</li>' : '';
    return;
  }
  const hits = search(g.era, q);
  if (!hits.length) {
    const book = { cur: DATA.meta.current, last: DATA.meta.last, all: 'all-time' }[g.era];
    list.innerHTML = `<li class="msg">No match in the ${book} stats.</li>`;
    return;
  }
  const rows = DATA.pools[g.era];
  list.innerHTML = hits.slice(0, MAX_RESULTS).map(i => {
    const [name, pos, tag] = rows[i];
    const taken = g.picks.find(p => p.row === i);
    const meta = taken ? `Taken by ${esc(S.players[taken.by])}` : [pos, tag].filter(Boolean).map(esc).join(' · ');
    return `<li><button data-row="${i}" ${taken ? 'disabled' : ''}><span>${esc(name)}</span><span class="meta">${meta}</span></button></li>`;
  }).join('') + (hits.length > MAX_RESULTS ? '<li class="msg">More matches. Keep typing to narrow it down.</li>' : '');
}

function makePick(i) {
  const g = S.game;
  if (g.picks.length >= g.order.length || g.picks.some(p => p.row === i)) return;
  const row = DATA.pools[g.era][i];
  // Copy the value now: a stats refresh mid-game must not change a locked pick.
  g.picks.push({
    by: g.order[g.picks.length], row: i, name: row[0], pos: row[1],
    value: statOf(row, catOf(g.cat)),
  });
  save();
  updateDraft(true);
  if (g.picks.length < g.order.length) document.getElementById('q').focus();
}

/* ---------- the measurement ---------- */

function renderReveal() {
  const g = S.game;
  const cat = catOf(g.cat);
  app.innerHTML = `
    <section class="reveal">
      <h1>Bring out the chains</h1>
      <header class="mini">
        <div class="tag">${fmt(g.target)}</div>
        <div><strong>${esc(cat.name)}</strong><span class="sub">${esc(eraLabel(g.era))}</span></div>
      </header>
      <div class="stage" id="stage" aria-live="polite"></div>
      <div class="lanes" id="lanes">
        ${S.players.map((p, i) => `
          <div class="lane" style="--c:${color(i)}">
            <div class="row"><span class="name">${esc(p)}</span><span class="total" id="total${i}">0</span></div>
            <div class="track"><div class="fill" id="fill${i}"></div><div class="stick"></div></div>
          </div>`).join('')}
      </div>
      <div class="picks" id="picks"></div>
      <div class="action" id="action"></div>
      <div class="foot" id="after"></div>
    </section>`;
  updateReveal(false);
}

function countUp(el, value) {
  const still = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  if (still || value <= 0) { el.textContent = fmt(value); return; }
  const start = performance.now();
  const ms = 650;
  let done = false;
  const step = now => {
    if (done) return;
    const t = Math.min(1, (now - start) / ms);
    el.textContent = fmt(Math.floor(value * (1 - (1 - t) ** 3)));
    if (t < 1) requestAnimationFrame(step);
  };
  requestAnimationFrame(step);
  // Frames stop firing on a locked or backgrounded phone, so the true number
  // can't depend on the last frame arriving.
  setTimeout(() => { done = true; el.textContent = fmt(value); }, ms);
}

function updateReveal(fresh) {
  const g = S.game;
  const cat = catOf(g.cat);
  const shown = g.revealed;
  const finished = shown === g.picks.length;
  const t = totals(shown);

  S.players.forEach((_, i) => {
    const pct = Math.max(0, Math.min(100, (t[i] / g.target) * STICK_AT));
    document.getElementById(`fill${i}`).style.width = `${pct}%`;
    const off = t[i] - g.target;
    const note = !finished ? '' : off === 0 ? 'on the line'
      : `${fmt(Math.abs(off))} ${off > 0 ? 'over' : 'short'}`;
    document.getElementById(`total${i}`).innerHTML = `${fmt(t[i])}${note ? `<span class="off">${note}</span>` : ''}`;
  });

  document.getElementById('picks').innerHTML = S.players.map((p, i) => `
    <section class="roster" style="--c:${color(i)}">
      <h3>${esc(p)}</h3>
      <ol>${g.picks.map((x, n) => (x.by !== i ? '' : `
        <li class="${n >= shown ? 'hidden' : n === shown - 1 ? 'now' : ''}">
          <span>${esc(x.name)}</span><b>${n >= shown ? '?' : fmt(x.value)}</b>
        </li>`)).join('')}</ol>
    </section>`).join('');

  const stage = document.getElementById('stage');
  const action = document.getElementById('action');
  const after = document.getElementById('after');

  if (finished) {
    showResult(stage, action, after, cat);
    return;
  }

  if (shown === 0) {
    stage.style.setProperty('--c', 'var(--stick)');
    stage.innerHTML = `<p class="by">All ${g.picks.length} picks are in</p><p class="player">Nobody's seen a number yet</p>`;
  } else {
    const last = g.picks[shown - 1];
    stage.style.setProperty('--c', color(last.by));
    stage.innerHTML = `
      <p class="by">${esc(S.players[last.by])}'s pick</p>
      <p class="player">${esc(last.name)}</p>
      <p class="value"><span id="count">${fresh ? '0' : fmt(last.value)}</span> <small>${esc(unit(last.value, cat))}</small></p>`;
    if (fresh) countUp(document.getElementById('count'), last.value);
  }

  const next = g.picks[shown];
  action.innerHTML = `<button class="btn" id="next">Measure ${esc(next.name)}</button>`;
  after.innerHTML = '<button class="btn-quiet" id="all">Show everything</button>';
  document.getElementById('next').addEventListener('click', () => {
    g.revealed++;
    save();
    updateReveal(true);
  });
  document.getElementById('all').addEventListener('click', () => {
    g.revealed = g.picks.length;
    save();
    updateReveal(true);
  });
}

function showResult(stage, action, after, cat) {
  const g = S.game;
  const { best, winners, margin } = outcome();
  if (!g.scored) {
    g.scored = true;
    if (winners.length === 1) S.wins[winners[0]]++;
    save();
  }
  const offBy = best === 0 ? 'Dead on the number.' : `${fmt(best)} ${unit(best, cat)} off the line.`;
  if (winners.length === 1) {
    stage.className = 'stage result';
    stage.style.setProperty('--c', color(winners[0]));
    stage.innerHTML = `
      <h2>${esc(S.players[winners[0]])} wins</h2>
      <p>By ${fmt(margin)} ${unit(margin, cat)}. ${offBy}</p>`;
  } else {
    stage.className = 'stage result tie';
    stage.innerHTML = `<h2>Dead heat</h2><p>${winners.map(i => esc(S.players[i])).join(' and ')} tie. ${offBy}</p>`;
  }
  action.innerHTML = '<button class="btn" id="again">Next round</button>';
  after.innerHTML = `
    <p class="score">${S.players.map((p, i) => `<span style="--c:${color(i)}"><b>${esc(p)}</b> ${S.wins[i]}</span>`).join('')}</p>
    <button class="btn-quiet" id="quit">End game</button>`;
  document.getElementById('again').addEventListener('click', () => {
    S.round++;
    S.game = newChallenge(S.game);
    go('line');
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

async function boot() {
  try {
    const res = await fetch('data/stats.json');
    if (!res.ok) throw new Error(res.status);
    DATA = await res.json();
  } catch {
    app.innerHTML = '<div class="failed"><p>Couldn\'t load the stats. Check your connection and try again.</p><button class="btn-quiet" id="retry">Try again</button></div>';
    document.getElementById('retry').addEventListener('click', () => location.reload());
    return;
  }
  DATA.meta.keys.forEach((k, i) => { COL[k] = i + 3; });
  restore();
  render();
}

boot();
