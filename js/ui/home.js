import { MODES, MODE_ORDER } from '../catalog.js';
import { dailyRound } from '../engine.js';
import { esc, fmt, todayKey } from '../util.js';
import { fieldSvg, modeArt } from './art.js';
import { odometer, rollOdometer, badgeFor, avatar } from './components.js';
import { store } from '../store.js';

// Prompts in the style the game deals, rotating through the ticker.
const EXAMPLES = [
  ['Draft 4 former Seahawks', 'with 15,000 combined career receiving yards', 15000],
  ['3 undrafted players', '14,700 career receiving yards between them', 14700],
  ['5 quarterbacks taken after round 1', 'combined for 100,000 passing yards', 100000],
  ['4 franchises', '25 combined Super Bowl appearances', 25],
  ['3 rookies', '2,700 receiving yards in their first season', 2700],
  ['2 players', 'the most passing yards in a single game: 1,175 combined', 1175],
  ['3 tight ends from the 2000s', '7 receiving touchdowns. Exactly.', 7],
  ['4 quarterbacks', '74 career playoff touchdown passes', 74],
];

const MODE_COLOR = {
  classic: 'var(--stick)', daily: 'var(--first-down)', pir: 'var(--first-down)', redzone: 'var(--danger)',
  noeasy: '#ff9aa5', gauntlet: '#9ad1ff', twominute: 'var(--danger)', sicko: '#c9a0ff',
};

export function render(ctx) {
  const { D } = ctx;
  const app = ctx.root;
  const m = store.state.match;
  const live = m && !m.finished && m.round;
  const recent = store.state.recent || [];
  app.innerHTML = `
    <section class="hero">
      <div class="hero-field"><div class="field-3d">${fieldSvg({ id: 'hero' })}<div class="fd"></div></div></div>
      <div class="wrap hero-inner">
        <div>
          <p class="kicker">The NFL stat draft · Pass the phone</p>
          <h1 class="wordmark" aria-label="Line to Gain"><span>Line</span><span>to</span><span>Gain</span></h1>
          <p class="pitch">You get a stat and a number. Take turns drafting <b>real players</b>. Whoever lands closest to the line wins, and nobody sees a stat until the chains come out.</p>
          <div class="hero-cta">
            ${live ? '<button class="btn btn-xl" data-go="resume">Resume game</button>' : '<button class="btn btn-xl" data-mode="classic">Play now</button>'}
            <button class="btn-ghost" data-mode="daily">Today’s Daily Drive</button>
            ${live ? '<button class="btn-ghost" data-mode="classic">New game</button>' : ''}
          </div>
        </div>
        <div class="hero-marker" aria-hidden="true">
          <div class="sign"><span class="label">The line</span><span class="num" id="heroNum"></span></div>
          <div class="pole"></div>
          <p class="caption" id="heroCap"></p>
        </div>
      </div>
      <div class="ticker" aria-live="off">
        <div class="ticker-tag">Tonight’s card</div>
        <div class="ticker-body"><p id="tick"></p></div>
      </div>
    </section>

    <div class="wrap screen" style="padding-top:0">
      <div class="sec-title"><h2>Pick your game</h2></div>
      <div class="modes">
        ${MODE_ORDER.map((id, n) => {
          const mode = MODES[id];
          const cls = id === 'classic' ? 'feature' : id === 'daily' ? 'wide' : '';
          return `<button class="mode-card ${cls}" data-mode="${id}" style="--mc:${MODE_COLOR[id]}; animation: rise .5s ${0.05 * n}s both">
            ${modeArt(id)}
            <span class="tag">${esc(mode.tag)}</span>
            <h3>${esc(mode.name)}</h3>
            <p>${esc(mode.blurb)}</p>
            ${id === 'classic' ? '<span class="btn go" aria-hidden="true">Play</span>' : ''}
          </button>`;
        }).join('')}
      </div>

      <div class="home-row">
        <div>
          <div class="sec-title"><h2>Daily Drive</h2></div>
          <div class="daily-feature" id="daily">
            <p class="kicker">${new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })}</p>
            <h3>Loading today’s drive…</h3>
          </div>
        </div>
        <div>
          <div class="sec-title"><h2>Recent results</h2></div>
          <div class="recent">
            ${recent.length ? recent.slice(0, 5).map(r => `
              <div class="recent-item">
                ${avatar(r.winner, D, 'sm')}
                <div><b>${esc(r.headline)}</b><br><span>${esc(r.stat)} · ${esc(r.scope)} · line ${fmt(r.target)}</span></div>
                <span>${esc(r.when)}</span>
              </div>`).join('') : '<p class="empty">No games yet. Results land here after your first round.</p>'}
          </div>
        </div>
      </div>
      <p class="foot-credit">Stats from <a href="https://github.com/nflverse" target="_blank" rel="noopener">nflverse</a> and Wikipedia, refreshed daily (${esc(D.meta.current)} ${esc(D.meta.progress)}). Fan-made; not affiliated with the NFL. Headshots load from the league’s public image CDN.</p>
    </div>`;

  app.addEventListener('click', e => {
    const b = e.target.closest('[data-mode],[data-go]');
    if (!b) return;
    ctx.sfx.whistle();
    if (b.dataset.go === 'resume') ctx.go(store.state.match.round.picks.length || store.state.match.round.done ? (store.state.match.round.done ? 'results' : 'draft') : 'reveal');
    else ctx.go('lobby', { mode: b.dataset.mode });
  });

  // Hero marker and ticker cycle through example rounds.
  let k = 0;
  const num = document.getElementById('heroNum');
  const cap = document.getElementById('heroCap');
  const tick = document.getElementById('tick');
  const show = () => {
    const [who, what, n] = EXAMPLES[k % EXAMPLES.length];
    num.style.setProperty('--num-size', fmt(n).length > 6 ? 'clamp(54px, 6.4vw, 90px)' : 'clamp(72px, 9vw, 120px)');
    num.innerHTML = odometer(n);
    rollOdometer(num, true);
    cap.textContent = `${who}: ${what}`;
    tick.textContent = `${who} — ${what}`;
    tick.style.animation = 'none';
    void tick.offsetWidth;
    tick.style.animation = '';
    k++;
  };
  show();
  const timer = setInterval(show, 4200);

  // Today's daily: computed locally, identical for everyone today.
  const key = todayKey();
  dailyRound(D, key, 1, 'snake').then(r => {
    const el = document.getElementById('daily');
    if (!el) return;
    const played = Object.values(store.profiles).map(p => p.dailies?.[key] && { name: p.name, ...p.dailies[key] }).filter(Boolean);
    el.innerHTML = `
      <p class="kicker">${new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })} · Same for everyone</p>
      <h3>${esc(r.stat.label)}</h3>
      <div class="meta">${badgeFor(r)}<span class="badge">${esc(r.scope.label)}</span>${r.rules.map(x => `<span class="rule-chip">${esc(x.label)}</span>`).join('')}</div>
      <p class="kicker" style="color:var(--chalk)">${r.n} players · the line is hidden until you start</p>
      ${played.length ? `<p class="done" style="margin-top:12px">Played today: ${played.map(p => `${esc(p.name)} ${p.pct}% off`).join(' · ')}</p>` : ''}
      <button class="btn btn-yellow" data-mode="daily">${played.length ? 'Play again' : 'Start today’s drive'}</button>`;
  }).catch(() => {
    const el = document.getElementById('daily');
    if (el) el.querySelector('h3').textContent = 'Today’s drive couldn’t load. Try again later.';
  });

  return () => clearInterval(timer);
}
