import { TITLES, MODES } from '../catalog.js';
import { esc, fmt } from '../util.js';
import { avatar } from './components.js';
import { store, avgPct } from '../store.js';

export function render(ctx) {
  const { D } = ctx;
  const root = ctx.root;
  const profiles = Object.values(store.profiles).sort((a, b) => b.wins - a.wins || b.rounds - a.rounds);
  const lobbyColor = name => store.state.lobby.players.find(p => p.name.trim().toLowerCase() === name.toLowerCase());

  root.innerHTML = `
    <div class="wrap screen">
      <header class="locker-head"><p class="kicker">Lifetime records on this device</p><h1>Locker room</h1></header>
      ${profiles.length ? `<div class="profiles">${profiles.map(p => {
        const look = lobbyColor(p.name) || { color: '#a8bcb1', team: '' };
        const pct = avgPct(p);
        const h2h = Object.values(p.h2h).sort((a, b) => (b.w + b.l + b.t) - (a.w + a.l + a.t)).slice(0, 5);
        const pbs = Object.values(p.pbs).sort((a, b) => a.pct - b.pct).slice(0, 5);
        return `<article class="profile" style="--c:${look.color}">
          <header>${avatar({ ...look, name: p.name }, D, 'lg')}<div><h2>${esc(p.name)}</h2><small>${p.titles.length ? esc(TITLES.find(t => t.id === p.titles[p.titles.length - 1])?.name || '') : 'Rookie'}${p.streak > 1 ? ` · ${p.streak}-round win streak` : ''}</small></div></header>
          <div class="tiles">
            <div class="tile"><b>${p.wins}–${p.losses}${p.ties ? `–${p.ties}` : ''}</b><span>W–L${p.ties ? '–T' : ''}</span></div>
            <div class="tile"><b>${pct === null ? '—' : `${pct}%`}</b><span>Avg off</span></div>
            <div class="tile"><b>${p.bestStreak}</b><span>Best streak</span></div>
            <div class="tile"><b>${p.exact}</b><span>Dead on</span></div>
          </div>
          <div><p class="kicker" style="margin-bottom:6px">Titles</p><div class="titles-row">${TITLES.map(t => `<span class="title-pill ${p.titles.includes(t.id) ? 'on' : ''}" title="${esc(t.blurb)}">${esc(t.name)}</span>`).join('')}</div></div>
          ${h2h.length ? `<table class="mini-table"><thead><tr><th>Head to head</th><th>W–L–T</th></tr></thead><tbody>${h2h.map(x => `<tr><td>vs ${esc(x.name)}</td><td>${x.w}–${x.l}–${x.t}</td></tr>`).join('')}</tbody></table>` : ''}
          ${pbs.length ? `<table class="mini-table"><thead><tr><th>Personal bests</th><th>Off the line</th></tr></thead><tbody>${pbs.map(x => `<tr><td>${esc(x.label)} · ${esc(x.scope)}</td><td>${x.pct}%</td></tr>`).join('')}</tbody></table>` : ''}
          ${p.history.length ? `<details class="more"><summary>Match history (${p.history.length})</summary><div class="history" style="margin-top:8px">${p.history.slice(0, 15).map(h => `
            <div class="history-item"><span class="res-tag ${h.won ? 'w' : h.tied ? '' : 'l'}">${h.won ? 'W' : h.tied ? 'T' : 'L'}</span>
            <div><b>${esc(h.stat)} · ${esc(h.scope)}</b><br><span>${esc(MODES[h.mode]?.name || h.mode)}${h.vs ? ` vs ${esc(h.vs)}` : ''} · ${fmt(h.total)} vs ${fmt(h.target)}${h.bust ? ' · bust' : ''}</span></div>
            <span>${esc(h.date)}</span></div>`).join('')}</div></details>` : ''}
        </article>`;
      }).join('')}</div>` : `<p class="empty" style="margin-top:20px">Nobody has played on this device yet. Records start with your first finished round.</p>`}
      <div style="margin-top:22px"><button class="btn" id="play">Play now</button></div>
    </div>`;
  root.querySelector('#play').addEventListener('click', () => ctx.go('lobby'));
}
