import { MODES } from '../catalog.js';
import { eligibility } from '../engine.js';
import { buildIndex, search } from '../search.js';
import { esc, fmt } from '../util.js';
import { avatar, headshot, teamChip, years, badgeFor, ICONS, replay, toast } from './components.js';
import { store } from '../store.js';
import { makePick, undoPick, autoPick } from '../game.js';
import { themeOf } from './reveal.js';

let INDEX = null;
let INDEX_V = null;
function playerIndex(D) {
  if (INDEX_V !== D.version) {
    INDEX = buildIndex(D.players.map(p => ({ i: p.i, name: p.name })));
    INDEX_V = D.version;
  }
  return INDEX;
}

const MAX_RESULTS = 8;

export function render(ctx) {
  const { D } = ctx;
  const root = ctx.root;
  const match = store.state.match;
  const r = match.round;
  const team = r.entity === 'team';
  const mode = MODES[match.mode];
  let scope = null;
  let active = -1; // highlighted result for keyboard picking
  let hits = [];
  let handoffTimer = null;
  let ticker = null;
  let lastTickSecond = null;
  let paused = false;

  root.innerHTML = `
    <div class="wrap draft" style="--theme:${themeOf(r)}">
      <header class="d-bug">
        <div class="tag" aria-label="The line">${fmt(r.target)}</div>
        <div class="title">
          <strong>${esc(r.stat.label)}</strong>
          <span>${esc(r.scope.label)} ${badgeFor(r)} ${r.rules.map(x => `<span class="rule-chip">${esc(x.label)}</span>`).join('')}${r.banned.length ? `<span class="ban-chip">${r.banned.length} banned</span>` : ''}</span>
        </div>
        <div class="d-meta">${match.players.length > 1 ? match.players.map((p, i) => `<span class="badge" style="background:${p.color}">${esc(p.name)} ${match.mode === 'gauntlet' ? match.points[i] : match.wins[i]}</span>`).join('') : ''}<span class="badge">${esc(mode.name)} · R${match.roundNo}</span></div>
        <div class="d-progress"><i id="prog"></i></div>
      </header>
      <section class="clock-panel" id="clock" aria-live="polite"></section>
      <section class="search-panel" id="searchPanel">
        ${team ? '<p class="search-help">Tap a franchise to draft it. Every team is eligible; values stay hidden until the chains come out.</p><div class="team-grid" id="teams"></div>' : `
        <div class="search-box">${ICONS.search}<input id="q" type="search" placeholder="Search players or nicknames" aria-label="Search for a player" autocomplete="off" autocorrect="off" autocapitalize="words" spellcheck="false" enterkeyhint="go"></div>
        <p class="search-help">↑ ↓ to choose · Enter to draft · Results are alphabetical, never by stat.</p>
        <ul class="results-list" id="results" role="listbox" aria-label="Matching players"></ul>
        ${r.banned.length ? `<p class="search-help"><b style="color:var(--danger)">Banned:</b> ${r.banned.map(b => esc(b.name)).join(', ')}</p>` : ''}`}
        <div class="finish-panel" id="finish" hidden>
          <p class="kicker">Draft complete</p>
          <h2>Bring out the chains</h2>
          <button class="btn btn-xl btn-yellow" id="measure">Measure</button>
        </div>
      </section>
      <section class="boards" id="boards"></section>
      <section class="timeline"><h3>Draft board</h3><ol id="timeline"></ol>
        <div class="d-foot"><button class="btn-quiet" id="undo">Undo last pick</button><button class="btn-quiet" id="quit">End game</button></div>
      </section>
    </div>
    <div class="handoff" id="handoff" hidden></div>`;

  const $ = s => root.querySelector(s);
  const q = $('#q');

  // ---------------------------------------------------------------- render parts

  function renderClock(picked) {
    const at = r.picks.length;
    const done = at === r.order.length;
    const el = $('#clock');
    if (done) {
      el.classList.add('done');
      el.style.setProperty('--c', 'var(--chalk)');
      el.innerHTML = '<p class="otc">Draft complete</p><div class="who-row"><div class="who">Draft’s in</div></div><div class="meta"><span>Time to measure</span></div>';
      return;
    }
    el.classList.remove('done');
    const by = r.order[at];
    const p = match.players[by];
    const next = r.order[at + 1];
    el.style.setProperty('--c', p.color);
    el.innerHTML = `
      <p class="otc">On the clock</p>
      ${r.timer ? `<div class="timer" id="timer"><svg viewBox="0 0 58 58"><circle class="track" cx="29" cy="29" r="25"/><circle class="bar" id="tbar" cx="29" cy="29" r="25" stroke-dasharray="157" stroke-dashoffset="0"/></svg><b id="tnum"></b></div>` : ''}
      <div class="who-row">${avatar(p, D)}<div class="who">${esc(p.name)}</div></div>
      <div class="meta"><span>Pick ${at + 1} of ${r.order.length}</span><span>${next === undefined ? 'Last pick' : next === by ? 'Picks again next' : `${esc(match.players[next].name)} next`}</span></div>`;
    if (picked) replay(el, 'pop');
    requestAnimationFrame(() => el.classList.add('ready')); // no color fade on first paint
    paintTimer();
  }

  function renderBoards(picked) {
    const at = r.picks.length;
    const now = r.order[at];
    $('#boards').innerHTML = match.players.map((p, i) => {
      const mine = r.picks.map((x, n) => ({ ...x, n })).filter(x => x.by === i);
      const open = r.n - mine.length;
      const bank = r.timer?.kind === 'bank' ? r.timer.banks[i] : null;
      return `<div class="board-col ${i === now ? 'active' : ''}" style="--c:${p.color}">
        <header>${avatar(p, D, 'sm')}<b>${esc(p.name)}</b><small>${mine.length}/${r.n}</small></header>
        ${bank !== null ? `<p class="bank ${bank < 15000 ? 'low' : ''}" data-bank="${i}">${clockText(bank)} left</p>` : ''}
        <ol>
          ${mine.map(x => `<li class="${picked && x.n === at - 1 ? 'fresh' : ''} ${x.auto ? 'auto' : ''}">${team ? teamChip(x.id, D) : headshot(D.byId.get(x.id) || { name: x.name }, 80)}<span>${esc(x.name)}</span><small>${esc(x.pos || '')}</small></li>`).join('')}
          ${open > 0 ? `<li class="open">${open} open</li>` : ''}
        </ol>
      </div>`;
    }).join('');
  }

  function renderTimeline() {
    const at = r.picks.length;
    $('#timeline').innerHTML = r.order.map((by, n) => {
      const p = match.players[by];
      const pk = r.picks[n];
      return `<li class="${pk ? 'made' : ''} ${n === at ? 'now' : ''}" style="--c:${p.color}"><b>${n + 1}</b><i></i><span>${pk ? esc(pk.name) : n === at ? `${esc(p.name)} on the clock` : esc(p.name)}</span></li>`;
    }).join('');
    const nowEl = $('#timeline li.now');
    if (nowEl) nowEl.scrollIntoView({ block: 'nearest' });
  }

  function renderTeams() {
    const taken = new Map(r.picks.map(p => [p.id, p.by]));
    $('#teams').innerHTML = D.teams.map(t => {
      const by = taken.get(t.id);
      const banned = r.banned.some(b => b.id === t.id);
      const done = r.picks.length >= r.order.length;
      return `<button class="team-btn ${by !== undefined ? 'taken' : ''}" style="--tc:${t.color};${by !== undefined ? `--c:${match.players[by].color}` : ''}" data-team="${t.id}" ${by !== undefined || banned || done ? 'disabled' : ''}>${esc(t.nick)}<small>${by !== undefined ? `Taken by ${esc(match.players[by].name)}` : banned ? 'Banned' : esc(t.name.replace(` ${t.nick}`, ''))}</small></button>`;
    }).join('');
  }

  function update(picked) {
    const at = r.picks.length;
    const done = at === r.order.length;
    $('#prog').style.width = `${(at / r.order.length) * 100}%`;
    renderClock(picked);
    renderBoards(picked);
    renderTimeline();
    if (team) renderTeams();
    $('#finish').hidden = !done;
    root.querySelectorAll('.search-help').forEach(el => { el.hidden = done; });
    if (!team) {
      root.querySelector('.search-box').hidden = done;
      $('#results').hidden = done;
      q.value = '';
      $('#results').innerHTML = '';
      hits = [];
      active = -1;
    }
    $('#undo').disabled = at === 0;
    if (done) $('#measure').focus({ preventScroll: true });
  }

  // ---------------------------------------------------------------- search

  function showResults() {
    const list = $('#results');
    const raw = q.value;
    if (raw.trim().length < 2) {
      list.innerHTML = raw.trim() ? '<li class="msg">Keep typing…</li>' : '';
      hits = [];
      return;
    }
    hits = search(playerIndex(D), raw).slice(0, 60);
    if (!hits.length) {
      list.innerHTML = '<li class="msg">No player by that name. Check the spelling, or try a last name.</li>';
      return;
    }
    const takenBy = new Map(r.picks.map(p => [p.id, p.by]));
    const shown = hits.slice(0, MAX_RESULTS);
    const rows = shown.map(h => {
      const p = D.players[h.i];
      const el = eligibility(D, r, scope, p, takenBy.get(p.id));
      return { h, p, el };
    });
    const open = rows.filter(x => x.el.ok);
    const exact = open.filter(x => x.h.exact);
    if (active < 0 || active >= rows.length || !rows[active].el.ok) {
      active = open.length === 1 ? rows.indexOf(open[0]) : exact.length === 1 ? rows.indexOf(exact[0]) : -1;
    }
    list.innerHTML = rows.map(({ p, el }, n) => {
      const why = el.ok ? '' : el.reason === 'taken' ? `Taken by ${esc(match.players[el.by].name)}` : esc(el.reason);
      return `<li style="--i:${n}"><button class="result-row ${n === active ? 'active' : ''}" role="option" aria-selected="${n === active}" data-n="${n}" ${el.ok ? '' : 'disabled'} style="${el.reason === 'taken' ? `--c:${match.players[el.by].color}` : ''}">
        ${headshot(p, 96)}
        <span><span class="nm">${esc(p.name)}</span><span class="sub">${esc(p.pos)} · ${esc(years(p))} ${p.teams.slice(0, 4).map(t => teamChip(t, D)).join('')}${p.teams.length > 4 ? `+${p.teams.length - 4}` : ''}</span></span>
        <span class="why ${el.reason === 'taken' ? 'taken' : ''}">${why}</span>
      </button></li>`;
    }).join('') + (hits.length > MAX_RESULTS ? '<li class="msg">More players match. Keep typing to narrow it down.</li>' : '');
    list.dataset.ids = rows.map(x => x.p.i).join(',');
  }

  function pickRow(n) {
    const ids = ($('#results').dataset.ids || '').split(',').map(Number);
    const p = D.players[ids[n]];
    if (!p) return;
    const el = eligibility(D, r, scope, p, r.picks.find(x => x.id === p.id)?.by);
    if (!el.ok) return;
    draftIt(p.id, p.name, p.pos);
  }

  function draftIt(id, name, pos) {
    const by = r.order[r.picks.length];
    if (!makePick(match, id, name, pos)) return;
    ctx.sfx.lock();
    store.save();
    update(true);
    const next = r.order[r.picks.length];
    if (r.picks.length < r.order.length) {
      q?.focus({ preventScroll: true });
      if (match.cfg.handoff && match.players.length > 1 && next !== by) showHandoff(next, name);
    }
  }

  // ---------------------------------------------------------------- handoff

  function showHandoff(by, locked, label) {
    const el = $('#handoff');
    const p = match.players[by];
    el.style.setProperty('--c', p.color);
    el.innerHTML = `${locked ? `<p class="locked">Locked in<span>${esc(locked)}</span></p>` : ''}
      ${avatar(p, D, 'lg')}
      <p class="pass">${label || 'Pass to'}</p>
      <p class="who">${esc(p.name)}</p>
      <p class="tap">Pick ${r.picks.length + 1} of ${r.order.length} · tap to start${r.timer ? ' · clock paused' : ''}</p>`;
    el.hidden = false;
    el.classList.remove('out');
    replay(el, 'in');
    paused = true;
    clearTimeout(handoffTimer);
    handoffTimer = setTimeout(hideHandoff, 1700);
  }

  function hideHandoff() {
    const el = $('#handoff');
    if (!el || el.hidden) return;
    clearTimeout(handoffTimer);
    el.classList.add('out');
    handoffTimer = setTimeout(() => { el.hidden = true; el.classList.remove('in', 'out'); paused = false; }, 240);
  }

  // ---------------------------------------------------------------- clocks

  function clockText(ms) {
    const s = Math.max(0, Math.ceil(ms / 1000));
    return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
  }

  function paintTimer() {
    if (!r.timer || r.picks.length >= r.order.length) return;
    const by = r.order[r.picks.length];
    const left = r.timer.kind === 'pick' ? r.timer.left : r.timer.banks[by];
    const total = r.timer.kind === 'pick' ? r.timer.seconds * 1000 : match.cfg.bankSeconds * 1000;
    const num = $('#tnum');
    const bar = $('#tbar');
    if (num) num.textContent = r.timer.kind === 'pick' ? Math.max(0, Math.ceil(left / 1000)) : clockText(left);
    if (bar) bar.setAttribute('stroke-dashoffset', String(157 * (1 - Math.max(0, left) / total)));
    $('#timer')?.classList.toggle('low', left <= 5000);
    const bankEl = root.querySelector(`[data-bank="${by}"]`);
    if (bankEl) { bankEl.textContent = `${clockText(left)} left`; bankEl.classList.toggle('low', left < 15000); }
  }

  function tick(dt) {
    if (!r.timer || paused || r.picks.length >= r.order.length) return;
    const by = r.order[r.picks.length];
    if (r.timer.kind === 'pick') r.timer.left -= dt;
    else r.timer.banks[by] = Math.max(0, r.timer.banks[by] - dt);
    const left = r.timer.kind === 'pick' ? r.timer.left : r.timer.banks[by];
    const sec = Math.ceil(left / 1000);
    if (left <= 5000 && left > 0 && sec !== lastTickSecond) { lastTickSecond = sec; ctx.sfx.tick(); }
    if (left <= 0) {
      lastTickSecond = null;
      const name = autoPick(match, D);
      ctx.sfx.bust();
      toast(name ? `Delay of game! The commish drafted ${name} for ${match.players[by].name}.` : 'Delay of game!');
      store.save();
      update(true);
      const next = r.order[r.picks.length];
      if (r.picks.length < r.order.length && match.cfg.handoff && match.players.length > 1 && next !== by) showHandoff(next, name);
      return;
    }
    paintTimer();
  }

  // ---------------------------------------------------------------- events

  root.addEventListener('click', e => {
    const row = e.target.closest('.result-row');
    if (row && !row.disabled) { pickRow(Number(row.dataset.n)); return; }
    const tb = e.target.closest('[data-team]');
    if (tb && !tb.disabled) { const t = D.team(tb.dataset.team); draftIt(t.id, t.name, 'TEAM'); return; }
    if (e.target.closest('#handoff')) { hideHandoff(); return; }
    if (e.target.closest('#measure')) { ctx.sfx.whistle(); ctx.go('results'); return; }
    if (e.target.closest('#undo')) {
      const p = undoPick(match);
      if (p) toast(`Undid ${p.name}`);
      store.save();
      update(false);
      q?.focus();
      return;
    }
    const quit = e.target.closest('#quit');
    if (quit) {
      if (quit.dataset.armed) { store.state.match = null; store.save(); ctx.go('home'); return; }
      quit.dataset.armed = '1';
      quit.textContent = 'Tap again to end';
      setTimeout(() => { if (quit.isConnected) { delete quit.dataset.armed; quit.textContent = 'End game'; } }, 2500);
    }
  });

  if (q) {
    q.addEventListener('input', () => { active = -1; showResults(); });
    q.addEventListener('keydown', e => {
      const rows = [...root.querySelectorAll('.result-row')];
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        e.preventDefault();
        if (!rows.length) return;
        const dir = e.key === 'ArrowDown' ? 1 : -1;
        let n = active;
        for (let k = 0; k < rows.length; k++) {
          n = (n + dir + rows.length) % rows.length;
          if (!rows[n].disabled) break;
        }
        active = n;
        rows.forEach((el, i) => { el.classList.toggle('active', i === n); el.setAttribute('aria-selected', String(i === n)); });
        rows[n]?.scrollIntoView({ block: 'nearest' });
      } else if (e.key === 'Enter') {
        e.preventDefault();
        if (active >= 0 && rows[active] && !rows[active].disabled) pickRow(active);
        else if (rows.length) replay($('#results'), 'nudge');
      } else if (e.key === 'Escape') {
        q.value = '';
        showResults();
      }
    });
  }

  // ---------------------------------------------------------------- start

  const ready = team ? Promise.resolve(null) : D.scope(r.scope.id);
  ready.then(s => {
    scope = s;
    update(false);
    if (r.picks.length < r.order.length) {
      q?.focus({ preventScroll: true });
      if (r.intro && match.cfg.handoff && match.players.length > 1) showHandoff(r.order[0], null, 'You’re up');
    }
    if (r.intro) { r.intro = false; store.save(); }
    if (r.timer) {
      let last = performance.now();
      let saved = 0;
      ticker = setInterval(() => {
        const now = performance.now();
        const dt = Math.min(1000, now - last);
        last = now;
        tick(dt);
        if ((saved += dt) > 2000) { saved = 0; store.save(); }
      }, 200);
    }
  }).catch(ctx.fail);

  return () => {
    clearInterval(ticker);
    clearTimeout(handoffTimer);
  };
}
