import { MODES, MODE_ORDER, PACKS, DIFFICULTIES, STATS, TEAM_STATS } from '../catalog.js';
import { decodeChallenge, MAX_EACH } from '../engine.js';
import { esc, clamp } from '../util.js';
import { modeArt, packIcon } from './art.js';
import { avatar } from './components.js';
import { store, PLAYER_COLORS, peekProfile, avgPct } from '../store.js';
import { newMatch, nextRound } from '../game.js';

const MAX_PLAYERS = 6;

export function render(ctx, opts = {}) {
  const { D } = ctx;
  const root = ctx.root;
  const L = store.state.lobby;
  if (opts.mode) L.mode = opts.mode;
  let challenge = null;
  if (opts.challenge) {
    try {
      challenge = { code: opts.challenge, info: decodeChallenge(opts.challenge) };
      L.mode = MODES[challenge.info.m] && challenge.info.m !== 'daily' ? challenge.info.m : 'classic';
    } catch {
      challenge = null;
    }
  }
  store.save();

  root.innerHTML = `
    <div class="wrap screen">
      <div class="lobby-head" id="head"></div>
      ${challenge ? challengeBanner(challenge.info, D) : ''}
      <div class="lobby">
        <section>
          <div class="sec-title" style="margin-top:4px"><h2>Who’s playing</h2><span class="kicker" id="pcount"></span></div>
          <div class="slots" id="slots"></div>
          <datalist id="known">${Object.values(store.profiles).map(p => `<option value="${esc(p.name)}">`).join('')}</datalist>
        </section>
        <section>
          <div class="sec-title" style="margin-top:4px"><h2>Game setup</h2></div>
          <div class="cfg" id="cfg"></div>
        </section>
      </div>
      <div class="preview-card"><div class="summary" id="summary"></div><button class="btn" id="start">Kick off</button></div>
    </div>`;

  const head = root.querySelector('#head');
  const slots = root.querySelector('#slots');
  const cfg = root.querySelector('#cfg');

  function renderHead() {
    const mode = MODES[L.mode];
    head.innerHTML = `${modeArt(L.mode)}<div><p class="kicker">Game lobby</p><h1>${esc(mode.name)}</h1><p>${esc(mode.blurb)}</p></div>`;
  }

  function renderSlots() {
    slots.innerHTML = L.players.map((p, i) => {
      const prof = peekProfile(p.name);
      const rec = prof && prof.rounds ? `${prof.wins}–${prof.losses}${prof.ties ? `–${prof.ties}` : ''} lifetime · ${avgPct(prof)}% avg off` : 'New to the league';
      return `<div class="slot" style="--c:${p.color}">
        ${L.players.length > 1 ? `<button class="rm" data-rm="${i}" aria-label="Remove ${esc(p.name || `player ${i + 1}`)}">×</button>` : ''}
        <div class="slot-top">${avatar(p, D, 'lg')}<input type="text" data-name="${i}" value="${esc(p.name)}" placeholder="Player ${i + 1}" maxlength="14" list="known" aria-label="Player ${i + 1} name" autocomplete="off"></div>
        <div class="swatches" role="group" aria-label="Color">${PLAYER_COLORS.map(c => `<button data-color="${i}" data-c="${c}" style="--sw:${c}" aria-label="Color ${c}" aria-pressed="${p.color === c}"></button>`).join('')}</div>
        <select data-team="${i}" aria-label="Favorite team for the helmet">
          <option value="">Helmet: my color</option>
          ${D.teams.map(t => `<option value="${t.id}" ${p.team === t.id ? 'selected' : ''}>Helmet: ${esc(t.name)}</option>`).join('')}
        </select>
        <p class="record">${esc(rec)}</p>
      </div>`;
    }).join('') + (L.players.length < MAX_PLAYERS ? '<button class="slot-add" data-add>+ Add a player</button>' : '');
    root.querySelector('#pcount').textContent = L.players.length === 1 ? 'Solo vs the line' : `${L.players.length} players`;
  }

  function seg(group, items, current) {
    return `<div class="seg" role="group">${items.map(([value, label, small]) =>
      `<button data-${group}="${value}" aria-pressed="${String(current) === String(value)}">${esc(label)}${small ? `<small>${esc(small)}</small>` : ''}</button>`).join('')}</div>`;
  }

  function renderCfg() {
    const mode = MODES[L.mode];
    const fixed = L.mode === 'daily' || !!challenge;
    const diff = DIFFICULTIES[L.difficulty];
    const each = L.custom ? L.each : diff.each;
    const parts = [];
    parts.push(`<div class="cfg-group"><h3>Mode</h3>${seg('mode', MODE_ORDER.map(id => [id, MODES[id].name]), L.mode)}</div>`);
    if (!fixed) {
      parts.push(`<div class="cfg-group"><h3>Difficulty</h3>${seg('diff', Object.entries(DIFFICULTIES).map(([id, d]) => [id, d.name, d.blurb]), L.difficulty)}</div>`);
      if (!mode.packs) {
        parts.push(`<div class="cfg-group"><h3>Category packs</h3><div class="packs">${PACKS.map(p =>
          `<button class="pack" data-pack="${p.id}" aria-pressed="${L.packs.includes(p.id)}">${packIcon(p.id)}<b>${esc(p.name)}</b><small>${esc(p.blurb)}</small></button>`).join('')}</div></div>`);
      } else {
        parts.push(`<div class="cfg-group"><h3>Category packs</h3><p class="kicker" style="letter-spacing:.06em;text-transform:none;font-size:15px">${esc(mode.name)} uses its own packs: ${mode.packs.map(id => PACKS.find(p => p.id === id).name).join(' + ')}.</p></div>`);
      }
      if (L.mode !== 'gauntlet') {
        parts.push(`<div class="cfg-group"><h3>Series</h3>${seg('series', [[1, 'One round'], [3, 'Best of 3'], [5, 'Best of 5'], [7, 'Best of 7']], L.series)}</div>`);
      }
    }
    parts.push(`<div class="cfg-group"><h3>Draft order</h3>${seg('style', [['snake', 'Snake', 'Order flips each round'], ['normal', 'Normal', 'Same order every round']], L.style)}</div>`);
    if (mode.timer === 'pick') parts.push(`<div class="cfg-group"><h3>Shot clock per pick</h3>${seg('pick', [[15, '15 sec'], [20, '20 sec'], [30, '30 sec']], L.pickSeconds)}</div>`);
    if (mode.timer === 'bank') parts.push(`<div class="cfg-group"><h3>Clock per player</h3>${seg('bank', [[60, '1:00'], [120, '2:00'], [180, '3:00']], L.bankSeconds)}</div>`);
    if (!fixed) {
      parts.push(`<button class="btn-quiet advanced-toggle" data-adv aria-expanded="${!!L.advanced}">${L.advanced ? 'Hide' : 'Show'} advanced options</button>`);
      if (L.advanced) {
        parts.push(`<div class="advanced">
          <div class="cfg-group"><h3>Players each</h3>
            <label class="switch"><input type="checkbox" data-custom ${L.custom ? 'checked' : ''}><span class="knob"></span><span>Set my own range (otherwise ${diff.name}: ${diff.each[0]}–${diff.each[1]})</span></label>
            ${L.custom ? `<div class="range-row" style="margin-top:10px">
              <span class="stepper"><span>From</span><button data-step="0" data-d="-1" aria-label="Fewer">−</button><output>${each[0]}</output><button data-step="0" data-d="1" aria-label="More">+</button></span>
              <span class="stepper"><span>To</span><button data-step="1" data-d="-1" aria-label="Fewer">−</button><output>${each[1]}</output><button data-step="1" data-d="1" aria-label="More">+</button></span>
            </div>
            <div class="rangebar" aria-hidden="true">${Array.from({ length: MAX_EACH }, (_, i) => `<i class="${i + 1 >= each[0] && i + 1 <= each[1] ? 'on' : ''}"></i>`).join('')}</div>` : ''}
          </div>
          ${mode.scoring === 'closest' ? `<div class="cfg-group"><h3>Scoring</h3>${seg('scoring', [['closest', 'Closest wins', 'Over or under'], ['under', 'No going over', 'Price Is Right rules']], L.scoring)}</div>` : ''}
          <label class="switch"><input type="checkbox" data-handoff ${L.handoff ? 'checked' : ''}><span class="knob"></span><span>“Pass the phone” screen between turns</span></label>
        </div>`);
      }
    }
    cfg.innerHTML = parts.join('');
    renderSummary();
  }

  function renderSummary() {
    const mode = MODES[L.mode];
    const diff = DIFFICULTIES[L.difficulty];
    const each = L.custom ? L.each : diff.each;
    const packs = mode.packs || L.packs;
    let text;
    if (L.mode === 'daily') text = `<b>Daily Drive</b> · today’s fixed challenge · ${L.players.length === 1 ? 'solo' : `${L.players.length} players`} · ${L.style} draft`;
    else if (challenge) text = `<b>Challenge</b> · ${esc(challengeTitle(challenge.info))} · ${challenge.info.n} each · ${L.players.length} ${L.players.length === 1 ? 'player' : 'players'}`;
    else {
      const len = L.mode === 'gauntlet' ? '5 rounds, getting harder' : L.series === 1 ? 'one round' : `best of ${L.series}`;
      text = `<b>${esc(mode.name)}</b> · ${esc(diff.name)} · ${len} · ${each[0] === each[1] ? each[0] : `${each[0]}–${each[1]}`} picks each · ${packs.map(id => PACKS.find(p => p.id === id).name).join(', ')}`;
    }
    const problem = !packs.length ? 'Turn on at least one category pack.' : '';
    root.querySelector('#summary').innerHTML = problem ? `<span class="warn">${problem}</span>` : text;
    root.querySelector('#start').disabled = !!problem;
  }

  renderHead();
  renderSlots();
  renderCfg();

  root.addEventListener('input', e => {
    const i = e.target.dataset.name;
    if (i !== undefined) {
      L.players[+i].name = e.target.value;
      store.save();
      const prof = peekProfile(e.target.value);
      const rec = e.target.closest('.slot').querySelector('.record');
      rec.textContent = prof && prof.rounds ? `${prof.wins}–${prof.losses} lifetime · ${avgPct(prof)}% avg off` : 'New to the league';
    }
  });
  root.addEventListener('change', e => {
    const t = e.target;
    if (t.dataset.team !== undefined) { L.players[+t.dataset.team].team = t.value; renderSlots(); }
    else if (t.dataset.custom !== undefined) { L.custom = t.checked; if (L.custom) L.each = [...DIFFICULTIES[L.difficulty].each]; renderCfg(); }
    else if (t.dataset.handoff !== undefined) { L.handoff = t.checked; }
    store.save();
  });
  root.addEventListener('click', async e => {
    const b = e.target.closest('button');
    if (!b) return;
    const d = b.dataset;
    if (d.add !== undefined) {
      const used = new Set(L.players.map(p => p.color));
      L.players.push({ name: '', color: PLAYER_COLORS.find(c => !used.has(c)) || PLAYER_COLORS[0], team: '' });
      renderSlots();
      slots.querySelector(`[data-name="${L.players.length - 1}"]`)?.focus();
    } else if (d.rm !== undefined) { L.players.splice(+d.rm, 1); renderSlots(); }
    else if (d.color !== undefined) { L.players[+d.color].color = d.c; renderSlots(); }
    else if (d.mode) { L.mode = d.mode; renderHead(); renderCfg(); }
    else if (d.diff) { L.difficulty = d.diff; if (L.custom) L.each = [...DIFFICULTIES[L.difficulty].each]; renderCfg(); }
    else if (d.pack) {
      const i = L.packs.indexOf(d.pack);
      if (i >= 0) L.packs.splice(i, 1); else L.packs.push(d.pack);
      b.setAttribute('aria-pressed', String(i < 0));
      renderSummary();
    } else if (d.series) { L.series = Number(d.series); renderCfg(); }
    else if (d.style) { L.style = d.style; renderCfg(); }
    else if (d.pick) { L.pickSeconds = Number(d.pick); renderCfg(); }
    else if (d.bank) { L.bankSeconds = Number(d.bank); renderCfg(); }
    else if (d.scoring) { L.scoring = d.scoring; renderCfg(); }
    else if (d.adv !== undefined) { L.advanced = !L.advanced; renderCfg(); }
    else if (d.step !== undefined) {
      const k = Number(d.step);
      L.each[k] = clamp(L.each[k] + Number(d.d), 1, MAX_EACH);
      if (k === 0) L.each[1] = Math.max(L.each[1], L.each[0]); else L.each[0] = Math.min(L.each[0], L.each[1]);
      renderCfg();
    } else if (b.id === 'start') {
      await start(b);
      return;
    } else return;
    store.save();
  });

  async function start(btn) {
    btn.disabled = true;
    btn.textContent = 'Setting the line…';
    try {
      const match = newMatch(L, { mode: L.mode, challenge: challenge?.code });
      store.state.match = match;
      await nextRound(D, match);
      store.save();
      ctx.sfx.whistle();
      ctx.go('reveal');
    } catch (err) {
      btn.disabled = false;
      btn.textContent = 'Kick off';
      ctx.fail(err);
    }
  }
}

function challengeTitle(o) {
  const def = o.e === 'team' ? TEAM_STATS[o.st] : STATS[o.st];
  return def ? def.label.replace('{Y}', o.sp || '') : 'Shared round';
}

function challengeBanner(o, D) {
  return `<div class="daily-feature" style="margin-bottom:18px">
    <p class="kicker">You’ve been challenged</p>
    <h3>${esc(challengeTitle(o))}</h3>
    <p class="kicker" style="color:var(--chalk)">${o.n} each · same stat, timeframe, rules and line as the round that was shared. Add your players and kick off.</p>
  </div>`;
}
