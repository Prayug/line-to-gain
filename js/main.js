// App shell: boot, navigation, top bar.

import { loadData, StaleDataError } from './data.js';
import { store } from './store.js';
import { setSound, soundOn, sfx } from './sound.js';
import { ICONS, toast } from './ui/components.js';
import { esc } from './util.js';
import { downMarker } from './ui/art.js';
import * as home from './ui/home.js';
import * as lobby from './ui/lobby.js';
import * as reveal from './ui/reveal.js';
import * as draft from './ui/draft.js';
import * as results from './ui/results.js';
import * as locker from './ui/locker.js';
import { showOnboarding } from './ui/onboarding.js';

const app = document.getElementById('app');
const topbar = document.getElementById('topbar');
const SCREENS = { home, lobby, reveal, draft, results, locker };
let D = null;
let cleanup = null;

export const ctx = {
  get D() { return D; },
  app,
  root: null,
  store,
  sfx,
  go,
  fail,
  onboarding: () => showOnboarding(ctx),
};

function go(screen, opts = {}) {
  try { cleanup?.(); } catch { /* old screen already gone */ }
  cleanup = null;
  store.state.screen = screen;
  store.save();
  renderTopbar();
  // Each screen gets a fresh root, so its listeners die with it.
  ctx.root = document.createElement('div');
  app.replaceChildren(ctx.root);
  const result = SCREENS[screen].render(ctx, opts);
  cleanup = typeof result === 'function' ? result : null;
  if (!opts.keepScroll) window.scrollTo({ top: 0, behavior: 'instant' });
}

function fail(err) {
  if (err instanceof StaleDataError) {
    toast('The stats just updated. Reloading with your game saved…');
    store.save();
    setTimeout(() => location.reload(), 1200);
    return;
  }
  console.error(err);
  toast(err?.message || 'Something went wrong. Try again.');
}

function renderTopbar() {
  const s = store.state.screen;
  const cur = name => (s === name ? 'aria-current="page"' : '');
  topbar.innerHTML = `
    <button class="brand" data-nav="home" aria-label="Line to Gain home">${downMarker('1', 30)}<span>Line to <b>Gain</b></span></button>
    <nav class="nav" aria-label="Main">
      <button data-nav="lobby" ${cur('lobby')}>${ICONS.play}<span class="label">Play</span></button>
      <button data-nav="daily">${ICONS.cal}<span class="label">Daily</span></button>
      <button data-nav="locker" ${cur('locker')}>${ICONS.locker}<span class="label">Locker room</span></button>
      <button data-nav="help">${ICONS.help}<span class="label">How to play</span></button>
      <button data-nav="sound" aria-pressed="${soundOn()}" aria-label="${soundOn() ? 'Mute sounds' : 'Turn sounds on'}">${soundOn() ? ICONS.soundOn : ICONS.soundOff}</button>
    </nav>`;
}

topbar.addEventListener('click', e => {
  const b = e.target.closest('[data-nav]');
  if (!b || !D) return;
  const where = b.dataset.nav;
  if (where === 'sound') {
    store.state.settings.sound = !store.state.settings.sound;
    setSound(store.state.settings.sound);
    store.save();
    renderTopbar();
    if (store.state.settings.sound) sfx.whistle();
    return;
  }
  if (where === 'help') { ctx.onboarding(); return; }
  if (where === 'daily') { go('lobby', { mode: 'daily' }); return; }
  // A game in progress stays saved; Home offers to resume it.
  go(where);
});

window.addEventListener('unhandledrejection', e => fail(e.reason));

async function boot() {
  store.load();
  setSound(store.state.settings.sound);
  renderTopbar();
  try {
    D = await loadData();
  } catch (err) {
    app.innerHTML = `<div class="failed"><h2>Couldn’t load the stats</h2><p>${esc(err?.message || 'Check your connection and try again.')}</p><button class="btn" id="retry">Try again</button></div>`;
    document.getElementById('retry').addEventListener('click', () => location.reload());
    return;
  }
  const params = new URLSearchParams(location.search);
  const code = params.get('c');
  if (code) {
    history.replaceState(null, '', location.pathname);
    go('lobby', { challenge: code });
  } else {
    const m = store.state.match;
    const screen = store.state.screen;
    if (m && !m.finished && m.round && ['reveal', 'draft', 'results'].includes(screen)) {
      try {
        if (m.round.entity !== 'team' && screen === 'draft') await D.scope(m.round.scope.id);
        go(screen, { resume: true });
      } catch (err) {
        fail(err);
        go('home');
      }
    } else {
      go(['lobby', 'locker'].includes(screen) ? screen : 'home');
    }
  }
  if (!store.state.settings.onboarded) setTimeout(() => ctx.onboarding(), 700);
}

boot();
