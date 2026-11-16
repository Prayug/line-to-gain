import { STATS, TEAM_STATS, MODES } from '../catalog.js';
import { esc, fmt, plural } from '../util.js';
import { groupIcon, playDiagram } from './art.js';
import { scorebug, badgeFor, odometer, rollOdometer, REDUCED } from './components.js';
import { store } from '../store.js';
import { nextRound } from '../game.js';

const THEME = {
  pass: '#7ec8ff', rush: '#ff8a3d', rec: '#3ee0b0', skill: '#ffd23a', def: '#c9a0ff',
  kick: '#f4f1e8', ret: '#ff9fd6', all: '#ffd23a', team: '#9ad1ff', honors: '#ffd23a',
};

export function themeOf(round) {
  if (round.scope.kind === 'superbowl') return '#ffd23a';
  if (round.badge === 'Postseason') return '#dfe6ee';
  if (round.entity === 'team') return THEME.team;
  if (round.scope.kind === 'honors') return THEME.honors;
  return THEME[STATS[round.stat.id]?.group] || THEME.all;
}

export function groupOf(round) {
  if (round.entity === 'team') return 'team';
  if (round.scope.kind === 'honors') return 'honors';
  return STATS[round.stat.id]?.group || 'all';
}

export function render(ctx) {
  const { D } = ctx;
  const root = ctx.root;
  const match = store.state.match;
  const r = match.round;
  const animate = !r.revealSeen && !REDUCED;
  const mode = MODES[match.mode];
  const first = match.players[r.order[0]];
  const fixed = match.mode === 'daily' || (match.challenge && match.roundNo === 1);
  const roundTag = match.mode === 'daily'
    ? `Daily Drive · ${new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}`
    : match.mode === 'gauntlet' ? `Gauntlet · Round ${match.roundNo} of 5`
      : `${mode.name} · Round ${match.roundNo}${match.length > 1 ? ` · Best of ${match.length}` : ''}`;
  const numText = fmt(r.target);
  const numSize = numText.length > 7 ? 'clamp(64px, 8vw, 104px)' : numText.length > 5 ? 'clamp(84px, 10vw, 128px)' : 'clamp(104px, 13vw, 160px)';

  root.innerHTML = `
    <section class="reveal" style="--theme:${themeOf(r)}">
      <div class="bg-glow"></div>
      <div class="bg-play">${playDiagram(r.seed || 7)}</div>
      <div class="wrap">
        <div class="reveal-top" style="padding-top:18px">${match.players.length > 1 || match.mode === 'gauntlet' ? scorebug(match) : ''}</div>
        <div class="reveal-grid">
          <div>
            <p class="round-tag">${esc(roundTag)}</p>
            <div class="reel-wrap">${groupIcon(groupOf(r), 66)}<h1 class="reel" id="reel" aria-live="polite">${esc(r.stat.label)}</h1></div>
            <div class="reveal-scope seq" id="s1"><span class="tf">${esc(r.scope.label)}</span>${badgeFor(r)}</div>
            <p class="reveal-sub seq" id="s2">${esc([r.scope.sub, r.stat.note, r.coverage].filter(Boolean).join(' · '))}</p>
            ${r.rules.length ? `<div class="reveal-rules seq" id="s3">${r.rules.map(x => `<span class="rule-chip">${esc(x.label)}</span>`).join('')}${r.rules.some(x => x.note) ? `<span class="reveal-sub" style="margin:0">${esc(r.rules.map(x => x.note).filter(Boolean).join(' · '))}</span>` : ''}</div>` : ''}
            ${r.banned.length ? `<div class="reveal-banned seq" id="s4"><span class="kicker" style="color:var(--danger)">Banned</span>${r.banned.map(b => `<span class="ban-chip">${esc(b.name)}</span>`).join('')}</div>` : ''}
          </div>
          <div class="reveal-right">
            <div class="marker-wrap" id="marker">
              <div class="sign"><span class="label">The line</span><span class="num" style="--num-size:${numSize}" aria-label="${numText}">${odometer(r.target)}</span></div>
              <div class="pole"></div>
              <div class="chain"></div>
            </div>
            <div class="count seq" id="s5"><b>${r.n}</b><span>${plural(r.n, 'player', 'players')} each</span></div>
            <p class="order-line seq" id="s6">${r.P > 1 ? `${r.style === 'snake' ? 'Snake' : 'Normal'} draft · ${r.order.length} picks · <b style="color:${first.color}">${esc(first.name)}</b> picks first` : `Solo · ${r.n} picks · ${r.scoring === 'under' ? 'get close without going over' : 'get as close as you can'}`}${r.timer ? ` · ${r.timer.kind === 'pick' ? `${r.timer.seconds}s per pick` : `${Math.round(r.timer.banks[0] / 1000)}s on each clock`}` : ''}</p>
            <div class="reveal-actions seq" id="s7">
              <button class="btn btn-xl" id="go" ${animate ? 'disabled' : ''}>Start the draft</button>
              ${fixed ? '' : '<button class="btn-ghost" id="reroll">Spin again</button>'}
            </div>
            ${animate ? '<p class="skip-hint" id="skip">Tap anywhere to skip</p>' : ''}
          </div>
        </div>
      </div>
    </section>`;

  const reel = root.querySelector('#reel');
  const seqs = ['#s1', '#s2', '#s3', '#s4', '#marker', '#s5', '#s6', '#s7'].map(s => root.querySelector(s)).filter(Boolean);
  const go = root.querySelector('#go');
  const timers = [];
  let finished = false;

  // Show the true round. Called when the sequence ends or the user skips; the
  // draft button stays locked until then, so nobody drafts off a spinning reel.
  const finish = () => {
    if (finished) return;
    finished = true;
    timers.forEach(clearTimeout);
    reel.classList.remove('spinning');
    reel.textContent = r.stat.label;
    seqs.forEach(el => el.classList.add('on'));
    rollOdometer(root.querySelector('.num'), false);
    go.disabled = false;
    root.querySelector('#skip')?.remove();
    r.revealSeen = true;
    store.save();
    go.focus({ preventScroll: true });
  };

  if (!animate) finish();
  else {
    const pool = r.entity === 'team' ? Object.values(TEAM_STATS).map(s => s.label.replace('{Y}', '')) : Object.values(STATS).map(s => s.label);
    reel.classList.add('spinning');
    ctx.sfx.reel();
    let t = 0;
    const spinUntil = 1000;
    const flick = () => {
      if (finished) return;
      if (t >= spinUntil) {
        reel.classList.remove('spinning');
        reel.textContent = r.stat.label;
        reel.classList.add('landed');
        ctx.sfx.thud();
        return;
      }
      reel.textContent = pool[Math.floor(Math.random() * pool.length)];
      t += 70;
      timers.push(setTimeout(flick, 70));
    };
    flick();
    let at = 1150;
    for (const el of seqs) {
      const isMarker = el.id === 'marker';
      timers.push(setTimeout(() => {
        el.classList.add('on');
        if (isMarker) {
          rollOdometer(root.querySelector('.num'), true, 350);
          ctx.sfx.roll();
        }
        if (el.id === 's3') ctx.sfx.whistle();
      }, at));
      at += isMarker ? 1500 : 260;
    }
    timers.push(setTimeout(finish, at + 200));
    root.addEventListener('click', e => { if (!e.target.closest('button')) finish(); });
  }

  go.addEventListener('click', () => {
    if (!finished) return;
    ctx.sfx.whistle();
    r.intro = true;
    store.save();
    ctx.go('draft');
  });
  root.querySelector('#reroll')?.addEventListener('click', async e => {
    const b = e.currentTarget;
    b.disabled = true;
    go.disabled = true;
    b.textContent = 'Spinning…';
    const before = match.roundNo;
    try {
      match.roundNo--;
      await nextRound(D, match);
      store.save();
      ctx.go('reveal');
    } catch (err) {
      match.roundNo = before;
      b.disabled = false;
      go.disabled = false;
      b.textContent = 'Spin again';
      ctx.fail(err);
    }
  });

  return () => timers.forEach(clearTimeout);
}
