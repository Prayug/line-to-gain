import { odometer, rollOdometer, modal } from './components.js';
import { fieldSvg, helmet } from './art.js';
import { store } from '../store.js';

const STEPS = [
  {
    title: 'You get a line',
    body: 'Every round deals a stat, a timeframe and a number: say, 3,150 receiving yards in the 2025 season with 3 players each.',
    art: () => `<div><div class="sign"><span class="label">The line</span><span class="num" id="obNum">${odometer(3150)}</span></div></div>`,
  },
  {
    title: 'Draft real players',
    body: 'Take turns naming players. Search shows faces and careers, never stats, and tells you why someone doesn’t qualify.',
    art: () => `<div class="demo-search">${['Justin Jefferson', 'Ja’Marr Chase', 'Puka Nacua'].map((n, i) => `<div class="result-row ${i === 1 ? 'active' : ''}"><span class="headshot">${n.split(' ').map(w => w[0]).join('')}</span><span><span class="nm">${n}</span><span class="sub">WR</span></span><span class="why">${i === 0 ? 'Taken by Dude' : ''}</span></div>`).join('')}</div>`,
  },
  {
    title: 'Bring out the chains',
    body: 'Once everyone has drafted, the numbers come out one pick at a time. Closest combined total to the line wins the round.',
    art: () => `<div style="position:relative;width:100%;height:170px">${fieldSvg({ id: 'ob', height: 170, numbers: false })}<div style="position:absolute;top:0;bottom:0;left:62%;width:6px;background:var(--first-down);box-shadow:0 0 18px var(--first-down)"></div><div style="position:absolute;left:50%;top:40px">${helmet('#5cb3ff', '#0b1712')}</div><div style="position:absolute;left:70%;top:96px">${helmet('#ff7482', '#0b1712')}</div></div>`,
  },
];

export function showOnboarding(ctx) {
  let k = 0;
  const m = modal('<div id="ob"></div>', {
    label: 'How to play',
    onClose: () => { store.state.settings.onboarded = true; store.save(); },
  });
  const el = m.el.querySelector('#ob');
  const draw = () => {
    const s = STEPS[k];
    el.innerHTML = `<div class="onboard-step">
      <p class="kicker">How to play · ${k + 1} of ${STEPS.length}</p>
      <div class="onboard-art">${s.art()}</div>
      <h2>${s.title}</h2>
      <p>${s.body}</p>
      <div class="onboard-dots">${STEPS.map((_, i) => `<i class="${i === k ? 'on' : ''}"></i>`).join('')}</div>
      <div class="actions">${k < STEPS.length - 1
        ? '<button class="btn" data-ob="next">Next</button><button class="btn-quiet" data-ob="skip">Skip</button>'
        : '<button class="btn" data-ob="practice">Play a practice round</button><button class="btn-quiet" data-ob="skip">I’ve got it</button>'}</div>
    </div>`;
    const num = el.querySelector('#obNum');
    if (num) rollOdometer(num, true, 200);
    el.querySelector('.btn')?.focus();
  };
  el.addEventListener('click', e => {
    const b = e.target.closest('[data-ob]');
    if (!b) return;
    if (b.dataset.ob === 'next') { k++; draw(); return; }
    m.close();
    if (b.dataset.ob === 'practice') {
      const L = store.state.lobby;
      L.mode = 'classic';
      L.difficulty = 'rookie';
      L.series = 1;
      L.players = [L.players[0] || { name: '', color: '#5cb3ff', team: '' }];
      store.save();
      ctx.go('lobby', { mode: 'classic' });
    }
  });
  draw();
}
