import { MODES } from '../catalog.js';
import { standings } from '../engine.js';
import { esc, fmt, plural, r1 } from '../util.js';
import { fieldSvg } from './art.js';
import { avatar, headshot, teamChip, scorebug, badgeFor, countUp, confetti, toast, copyText, modal, replay, ICONS } from './components.js';
import { store } from '../store.js';
import { finishRound, nextRound, seriesOver, endMatch, newMatch } from '../game.js';
import { shareResult, challengeUrl, resultText } from '../share.js';
import { themeOf } from './reveal.js';

export function render(ctx) {
  const { D } = ctx;
  const root = ctx.root;
  const match = store.state.match;
  const r = match.round;
  const team = r.entity === 'team';
  const P = match.players.length;
  const unit = v => plural(v, r.stat.one, r.stat.many);
  const timers = [];

  root.innerHTML = `
    <div class="wrap res" style="--theme:${themeOf(r)}">
      <header class="res-head">
        <div>
          <h1>Bring out the chains</h1>
          <div class="what"><span class="tag">${fmt(r.target)}</span><strong>${esc(r.stat.label)}</strong>${badgeFor(r)}<span class="badge">${esc(r.scope.label)}</span>${r.rules.map(x => `<span class="rule-chip">${esc(x.label)}</span>`).join('')}</div>
        </div>
        ${P > 1 || match.mode === 'gauntlet' ? `<div id="bug">${scorebug(match)}</div>` : ''}
      </header>
      <div class="field-wrap" id="field">
        ${fieldSvg({ id: 'res', height: Math.max(220, P * 52 + 40) })}
        <div class="drives"><div class="drives-inner" id="drives">
          <div class="fd-line" id="fd" data-label="THE LINE · ${fmt(r.target)}"></div>
          ${match.players.map((p, i) => `<div class="drive" id="drive${i}" style="--c:${p.color}">
            <span class="lane-name">${esc(p.name)}</span>
            <div class="path" id="path${i}"></div><div class="over" id="over${i}"></div>
            <div class="runner" id="run${i}">${avatar(p, D)}<span class="tot" id="tot${i}">0</span></div>
          </div>`).join('')}
        </div></div>
      </div>
      <section class="stage" id="stage" aria-live="polite"></section>
      <aside class="lb" id="lb"></aside>
      <section class="res-picks" id="picks"></section>
      <div class="res-actions" id="actions" style="grid-column:1/-1"></div>
    </div>`;

  const $ = s => root.querySelector(s);

  // ---------------------------------------------------------------- field

  function totals(n) {
    const t = Array.from({ length: P }, () => 0);
    r.picks.slice(0, n).forEach(pk => { t[pk.by] = r1(t[pk.by] + pk.value); });
    return t;
  }

  function paintField(before, fresh) {
    const now = totals(r.revealed);
    const was = totals(before);
    // The line sits at 70% until someone drives past it; then the field
    // rescales so big overshoots still compare by length.
    const scale = Math.max(r.target / 0.7, ...now.map(v => v / 0.96));
    const line = (r.target / scale) * 100;
    $('#fd').style.left = `${line}%`;
    $('#fd').classList.toggle('flip', line > 55); // keep the tag on the side with room
    match.players.forEach((_, i) => {
      const v = Math.max(0, now[i]);
      $(`#path${i}`).style.width = `${(Math.min(v, r.target) / scale) * 100}%`;
      const over = $(`#over${i}`);
      over.style.left = `${line}%`;
      over.style.width = `${(Math.max(0, v - r.target) / scale) * 100}%`;
      $(`#run${i}`).style.left = `${(v / scale) * 100}%`;
      const tot = $(`#tot${i}`);
      if (fresh) countUp(tot, was[i], now[i]); else tot.textContent = fmt(now[i]);
      const busted = r.scoring === 'under' && now[i] > r.target;
      if (busted && !(was[i] > r.target) && fresh) throwFlag(i, (v / scale) * 100);
      else if (busted && !fresh && !$(`#drive${i} .flag-throw`)) throwFlag(i, (v / scale) * 100, true);
    });
  }

  function throwFlag(i, leftPct, quiet) {
    const lane = $(`#drive${i}`);
    const f = document.createElement('span');
    f.className = 'flag-throw';
    f.style.left = `calc(${leftPct}% + 18px)`;
    f.style.top = '-6px';
    lane.append(f);
    if (!quiet) { ctx.sfx.bust(); toast(`Flag! ${match.players[i].name} went over the line.`); }
  }

  // ---------------------------------------------------------------- side panels

  function renderBoard(st, final) {
    const shown = r.revealed;
    const per = Array.from({ length: P }, () => []);
    r.picks.slice(0, shown).forEach(pk => per[pk.by].push(pk));
    const rows = final ? st.ranked : [...st.rows].sort((a, b) => ((a.bust ? 1e12 : 0) + a.off) - ((b.bust ? 1e12 : 0) + b.off));
    $('#lb').innerHTML = `<h3>${final ? 'Final standings' : 'Live standings'}</h3>${rows.map((row, n) => {
      const p = match.players[row.i];
      const tag = row.bust ? 'BUST' : row.off === 0 ? 'Dead on' : `${fmt(row.off)} ${row.diff > 0 ? 'over' : 'short'}`;
      const sum = per[row.i].reduce((s, x) => s + Math.max(0, x.value), 0) || 1;
      return `<div class="lb-row ${n === 0 && final ? 'lead' : ''}" style="--c:${p.color}">
        <span class="pl">${final ? row.place : n + 1}</span>${avatar(p, D, 'sm')}
        <span class="nm"><b>${esc(p.name)}</b><small>${per[row.i].length}/${r.n} measured</small></span>
        <span class="tot">${fmt(row.total)}<small class="${row.bust ? 'bust' : ''}">${tag}</small></span>
        <span class="bar">${per[row.i].map(x => `<i style="flex:${Math.max(0.02, Math.max(0, x.value) / sum)}" title="${esc(x.name)}"></i>`).join('')}</span>
      </div>`;
    }).join('')}${final ? highlights(st) : ''}`;
  }

  function highlights(st) {
    const mvp = st.mvp;
    const winner = st.ranked[0];
    const flop = [...r.picks].sort((a, b) => a.value - b.value)[0];
    const cell = (k, b, s) => `<div class="hl"><p class="kicker">${k}</p><b>${esc(b)}</b><span>${esc(s)}</span></div>`;
    return `<div class="highlights">
      ${mvp ? cell('Best pick', mvp.name, `${fmt(mvp.value)} ${unit(mvp.value)} for ${match.players[mvp.by].name}`) : ''}
      ${winner ? cell('Closest roster', match.players[winner.i].name, winner.off === 0 ? 'Dead on the line' : `${fmt(winner.off)} ${unit(winner.off)} ${winner.diff > 0 ? 'over' : 'short'}`) : ''}
      ${flop && r.picks.length > 1 ? cell('Quietest pick', flop.name, `${fmt(flop.value)} ${unit(flop.value)}`) : ''}
      ${cell('Picks drafted', String(r.picks.length), `${r.n} each · line ${fmt(r.target)}`)}
    </div>`;
  }

  function renderPicks(before, fresh) {
    const shown = r.revealed;
    const st = standings(r, r.scoring);
    const mvpId = shown === r.picks.length ? st.mvp?.id : null;
    $('#picks').innerHTML = match.players.map((p, i) => `
      <div class="board-col" style="--c:${p.color}">
        <header>${avatar(p, D, 'sm')}<b>${esc(p.name)}</b></header>
        <ol>${r.picks.map((x, n) => (x.by !== i ? '' : `
          <li class="${n >= shown ? 'hidden' : n >= before && fresh ? 'now' : ''} ${x.id === mvpId ? 'mvp' : ''}" style="--k:${Math.min(Math.max(0, n - before), 16)}">
            ${team ? teamChip(x.id, D) : headshot(D.byId.get(x.id) || { name: x.name }, 80)}<span>${esc(x.name)}</span><b>${n >= shown ? '?' : fmt(x.value)}</b>
          </li>`)).join('')}</ol>
      </div>`).join('');
  }

  // ---------------------------------------------------------------- stage

  function renderCard(pk, fresh) {
    const p = match.players[pk.by];
    const person = team ? null : D.byId.get(pk.id);
    const before = totals(r.revealed - 1)[pk.by];
    const art = team ? `<span class="headshot" style="background:${D.team(pk.id)?.color};color:#fff">${esc(pk.id)}</span>` : headshot(person || { name: pk.name }, 200);
    $('#stage').innerHTML = `
      <div class="card ${fresh ? '' : 'flipped'}" id="card" style="--c:${p.color}">
        <div class="face front">${art}<div><span class="by">${esc(p.name)}’s pick</span><p class="player">${esc(pk.name)}</p><p class="q">?</p></div></div>
        <div class="face back">${art}<div><span class="by">${esc(p.name)}’s pick</span><p class="player">${esc(pk.name)}</p>
          <p class="value"><span id="val">${fresh ? '0' : fmt(pk.value)}</span> <small>${esc(unit(pk.value))}</small></p>
          <p class="after">${esc(p.name)}: ${fmt(before)} → ${fmt(r1(before + pk.value))}</p></div></div>
      </div>`;
    if (fresh) {
      ctx.sfx.flip();
      timers.push(setTimeout(() => {
        $('#card')?.classList.add('flipped');
        countUp($('#val'), 0, pk.value, 800);
      }, 180));
    }
  }

  // What the last pick needs, given everyone else's final total.
  function finalCall() {
    const last = r.picks[r.picks.length - 1];
    const i = last.by;
    const now = totals(r.picks.length - 1);
    const t = now[i];
    const T = r.target;
    const others = now.map((v, j) => ({ j, v })).filter(o => o.j !== i);
    const p = match.players[i];
    let line;
    if (!others.length) {
      line = `${fmt(Math.max(0, T - t))} ${unit(T - t)} would hit the line exactly.`;
    } else if (r.scoring === 'under') {
      const safe = others.filter(o => o.v <= T).map(o => T - o.v);
      const m = safe.length ? Math.min(...safe) : Infinity;
      const lo = Math.max(0, T - m - t);
      const hi = T - t;
      line = hi < 0 ? `${p.name} is already over. Only a miracle zero keeps the flag away… and it won’t.`
        : m === Infinity ? `Anything up to ${fmt(hi)} wins it. One more and it’s a bust.`
          : lo > hi ? `${p.name} can’t catch the leader anymore.` : `Needs more than ${fmt(lo)} and no more than ${fmt(hi)} to win.`;
    } else {
      const m = Math.min(...others.map(o => Math.abs(o.v - T)));
      const lo = Math.max(0, T - m - t);
      const hi = T + m - t;
      line = hi <= 0 ? `${p.name} is already past every winning number. Hoping for a zero.`
        : `Needs more than ${fmt(lo)} and less than ${fmt(hi)} ${r.stat.many} to win.`;
    }
    $('#stage').innerHTML = `<div class="final-call" style="--c:${p.color}">
      <p class="kicker">Final measurement</p>
      <h3>${esc(p.name)}: ${esc(last.name)}</h3>
      <p>${esc(line)}</p>
    </div>`;
    ctx.sfx.crowd();
  }

  function renderVerdict(st, unlocked) {
    const [w] = st.winners;
    const solo = P === 1;
    let html;
    if (solo) {
      const row = st.rows[0];
      const pct = r.target ? (100 * row.off) / r.target : 0;
      const head = row.bust ? 'Bust' : row.off === 0 ? 'Dead on!' : pct <= 2 ? 'Moved the chains' : pct <= 10 ? 'Close call' : 'Short of the sticks';
      html = `<div class="verdict ${row.bust ? 'tie' : ''}" style="--c:${match.players[0].color}"><h2>${head}</h2>
        <p>${fmt(row.total)} vs the line of ${fmt(r.target)}: ${row.off === 0 ? 'exactly right.' : `${fmt(row.off)} ${unit(row.off)} ${row.diff > 0 ? 'over' : 'short'} (${pct.toFixed(1)}% off).`}</p>${titlesHtml(unlocked)}</div>`;
    } else if (st.winners.length === 1) {
      const p = match.players[w];
      const row = st.rows[w];
      const restBust = r.scoring === 'under' && !st.allBust && st.ranked.slice(1).every(x => x.bust);
      const margin = st.allBust ? 'Everybody busted; the smallest overshoot takes it.'
        : restBust ? `${P === 2 ? 'The other roster' : 'Everyone else'} went over the line.` : `Won by ${fmt(st.margin)}.`;
      html = `<div class="verdict" style="--c:${p.color}"><h2>${esc(p.name)} wins</h2>
        <p>${row.off === 0 ? 'Dead on the number. ' : `${fmt(row.off)} ${unit(row.off)} ${row.diff > 0 ? 'over' : 'short'}. `}${margin}</p>${titlesHtml(unlocked)}</div>`;
    } else {
      html = `<div class="verdict tie"><h2>Dead heat</h2><p>${st.winners.map(i => esc(match.players[i].name)).join(' and ')} tie at ${fmt(st.rows[w].off)} off. No point awarded.</p>${titlesHtml(unlocked)}</div>`;
    }
    $('#stage').innerHTML = html;
  }

  function titlesHtml(unlocked) {
    const items = Object.entries(unlocked || {}).flatMap(([i, names]) => names.map(n => `${match.players[i].name}: ${n}`));
    return items.length ? `<div class="titles">${items.map(t => `<span>Unlocked · ${esc(t)}</span>`).join('')}</div>` : '';
  }

  // ---------------------------------------------------------------- actions

  function renderActions(final) {
    const a = $('#actions');
    if (!final) {
      const size = P;
      const shown = r.revealed;
      const roundEnd = Math.min(r.picks.length, (Math.floor(shown / size) + 1) * size);
      const next = r.picks[shown];
      const isLast = shown === r.picks.length - 1;
      a.innerHTML = `<button class="btn" id="next">${isLast && P > 1 && !r.finalCalled ? 'Final measurement' : `Measure ${esc(next.name)}`}</button>
        ${roundEnd - shown > 1 && roundEnd < r.picks.length ? '<button class="btn-quiet" id="round">Rest of this round</button>' : ''}
        <button class="btn-quiet" id="all">Show everything</button>`;
      return;
    }
    const over = seriesOver(match);
    a.innerHTML = `
      ${over ? '<button class="btn" id="series">See final results</button>' : `<button class="btn" id="again">Next round</button>`}
      <button class="btn-ghost" id="share">Share result</button>
      <button class="btn-quiet" id="code">Challenge a friend</button>
      <button class="btn-quiet" id="home">Home</button>`;
  }

  function reveal(to) {
    const before = r.revealed;
    r.revealed = Math.min(r.picks.length, to);
    store.save();
    step(before, true);
  }

  function step(before, fresh) {
    const done = r.revealed === r.picks.length;
    paintField(before, fresh);
    renderPicks(before, fresh);
    if (!done) {
      const st = standings({ ...r, picks: r.picks.slice(0, r.revealed) }, r.scoring);
      renderBoard(st, false);
      if (r.revealed > 0) renderCard(r.picks[r.revealed - 1], fresh);
      else {
        $('#stage').innerHTML = `<div class="stage-note"><p class="kicker">All ${r.picks.length} picks are in</p><h3>Nobody’s seen a number yet</h3><p class="reveal-sub">Measure one pick at a time, round by round, or all at once.</p></div>`;
      }
      renderActions(false);
      return;
    }
    // Round over.
    const already = r.done;
    const { st, unlocked } = finishRound(match);
    if (!already) {
      store.state.recent = [{
        when: new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
        headline: P === 1 ? `${match.players[0].name}: ${fmt(st.rows[0].off)} off` : st.winners.length === 1 ? `${match.players[st.winners[0]].name} won` : 'Dead heat',
        winner: match.players[st.winners[0]], stat: r.stat.label, scope: r.scope.label, target: r.target,
      }, ...(store.state.recent || [])].slice(0, 8);
    }
    let seriesUnlocked = {};
    if (seriesOver(match) && !match.finished) seriesUnlocked = endMatch(match);
    store.save();
    renderBoard(st, true);
    renderVerdict(st, { ...unlocked, ...mergeUnlocked(unlocked, seriesUnlocked) });
    renderActions(true);
    if (P > 1 || match.mode === 'gauntlet') {
      const bump = !already && st.winners.length === 1 ? st.winners[0] : -1;
      const bug = $('#bug');
      if (bug) bug.innerHTML = scorebug(match, bump);
    }
    if (fresh && !already) {
      st.winners.forEach(i => $(`#drive${i}`)?.classList.add('won'));
      const solo = P === 1;
      const good = solo ? st.rows[0].off / r.target <= 0.05 && !st.rows[0].bust : st.winners.length === 1;
      if (good) {
        timers.push(setTimeout(() => {
          confetti([match.players[st.winners[0]].color]);
          ctx.sfx.win();
        }, 300));
      } else ctx.sfx.crowd();
    } else st.winners.forEach(i => $(`#drive${i}`)?.classList.add('won'));
  }

  function mergeUnlocked(a, b) {
    const out = {};
    for (const [i, names] of Object.entries(b || {})) out[i] = [...(a[i] || []), ...names];
    return out;
  }

  // ---------------------------------------------------------------- series end

  function renderSeries() {
    const nums = match.mode === 'gauntlet' ? match.points : match.wins;
    const w = match.winners;
    const trophy = `<span class="trophy">${ICONS.trophy}</span>`;
    const title = w.length === 1 ? `${match.players[w[0]].name} takes it` : 'Shared title';
    modal(`
      <div class="series-end">${trophy}<p class="kicker">${match.mode === 'gauntlet' ? 'Gridiron Gauntlet complete' : match.length > 1 ? `Best of ${match.length} complete` : 'Game over'}</p>
        <h2>${esc(title)}</h2>
        <table class="series-table"><thead><tr><th>Player</th><th>${match.mode === 'gauntlet' ? 'Points' : 'Rounds won'}</th></tr></thead>
        <tbody>${match.players.map((p, i) => ({ p, i })).sort((a, b) => nums[b.i] - nums[a.i]).map(({ p, i }) => `<tr><td style="color:${p.color}">${esc(p.name)}</td><td>${nums[i]}</td></tr>`).join('')}</tbody></table>
        <table class="series-table"><thead><tr><th>Round</th><th>Winner</th></tr></thead><tbody>${match.history.map(h => `<tr><td>${h.roundNo}. ${esc(h.stat)} · ${esc(h.scope)}</td><td>${h.winners.length === 1 ? esc(match.players[h.winners[0]].name) : 'Tie'}</td></tr>`).join('')}</tbody></table>
      </div>
      <div class="actions"><button class="btn" id="rematch">Rematch</button><button class="btn-quiet" id="lobby">Change setup</button><button class="btn-quiet" id="gohome">Home</button></div>`, { label: 'Final results' });
    if (w.length === 1) confetti([match.players[w[0]].color]);
    ctx.sfx.win();
    const layer = document.getElementById('layer');
    layer.querySelector('#rematch').addEventListener('click', async e => {
      e.currentTarget.disabled = true;
      layer.querySelector('.overlay')?.remove();
      const m2 = newMatch(store.state.lobby, { mode: match.mode });
      store.state.match = m2;
      try { await nextRound(D, m2); store.save(); ctx.go('reveal'); } catch (err) { ctx.fail(err); }
    });
    layer.querySelector('#lobby').addEventListener('click', () => { layer.querySelector('.overlay')?.remove(); ctx.go('lobby'); });
    layer.querySelector('#gohome').addEventListener('click', () => { layer.querySelector('.overlay')?.remove(); ctx.go('home'); });
  }

  // ---------------------------------------------------------------- events

  root.addEventListener('click', async e => {
    const b = e.target.closest('button');
    if (!b) return;
    const shown = r.revealed;
    if (b.id === 'next') {
      if (shown === r.picks.length - 1 && P > 1 && !r.finalCalled) {
        r.finalCalled = true;
        store.save();
        finalCall();
        renderActions(false);
        b.blur();
        return;
      }
      reveal(shown + 1);
    } else if (b.id === 'round') {
      const roundEnd = Math.min(r.picks.length, (Math.floor(shown / P) + 1) * P);
      reveal(roundEnd);
    } else if (b.id === 'all') reveal(r.picks.length);
    else if (b.id === 'again') {
      b.disabled = true;
      b.textContent = 'Setting the line…';
      try { await nextRound(D, match); store.save(); ctx.go('reveal'); } catch (err) { b.disabled = false; b.textContent = 'Next round'; ctx.fail(err); }
    } else if (b.id === 'series') renderSeries();
    else if (b.id === 'share') {
      const how = await shareResult(match, r, standings(r, r.scoring));
      if (how === 'downloaded') toast('Result image saved');
    } else if (b.id === 'code') {
      const url = challengeUrl(r);
      const ok = await copyText(url);
      modal(`<h2>Challenge a friend</h2><p>Same stat, timeframe, rules and line. ${ok ? 'The link is copied.' : 'Copy the link below.'}</p>
        <input type="text" readonly value="${esc(url)}" onclick="this.select()"><p>Or share the text summary:</p><textarea rows="6" readonly onclick="this.select()">${esc(resultText(match, r, standings(r, r.scoring)))}</textarea>`, { label: 'Challenge link' });
    } else if (b.id === 'home') ctx.go('home');
  });

  // ---------------------------------------------------------------- start

  step(r.revealed, false);
  if (r.finalCalled && r.revealed === r.picks.length - 1) finalCall();
  return () => timers.forEach(clearTimeout);
}
