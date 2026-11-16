// App state and lifetime progression, kept in this browser's localStorage.
// Every read and write is guarded: a private window or blocked storage just
// means nothing is remembered, never a broken game.

import { norm, r1, todayKey } from './util.js';
import { TITLES } from './catalog.js';

const STATE_KEY = 'ltg2.state';
const PROFILE_KEY = 'ltg2.profiles';

export const PLAYER_COLORS = ['#5cb3ff', '#ff7482', '#ffd23f', '#c9a0ff', '#39e3c3', '#ffa65c', '#ff9fd6', '#b6e35a', '#7ea7ff', '#f5f2e7'];

export function defaultLobby() {
  return {
    mode: 'classic',
    difficulty: 'pro',
    packs: ['classic', 'deep', 'playoffs', 'history'],
    style: 'snake',
    each: [3, 5],
    custom: false,
    series: 3,
    pickSeconds: 20,
    bankSeconds: 120,
    scoring: 'closest',
    handoff: true,
    players: [
      { name: '', color: PLAYER_COLORS[0], team: '' },
      { name: '', color: PLAYER_COLORS[1], team: '' },
    ],
  };
}

function read(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch { return fallback; }
}

function write(key, value) {
  try { localStorage.setItem(key, JSON.stringify(value)); return true; } catch { return false; }
}

export const store = {
  state: { screen: 'home', lobby: defaultLobby(), match: null, settings: { sound: true, onboarded: false } },
  profiles: {},
  load() {
    const s = read(STATE_KEY, null);
    if (s && s.lobby) {
      this.state = { ...this.state, ...s, lobby: { ...defaultLobby(), ...s.lobby }, settings: { ...this.state.settings, ...s.settings } };
    }
    this.profiles = read(PROFILE_KEY, {});
    try { localStorage.removeItem('line-to-gain.v2'); localStorage.removeItem('line-to-gain.v1'); } catch { /* old saves */ }
  },
  save() {
    if (!write(STATE_KEY, this.state)) {
      // Storage full: drop old snapshots, keep the live round.
      const m = this.state.match;
      if (m) m.history = (m.history || []).slice(-3);
      write(STATE_KEY, this.state);
    }
  },
  saveProfiles() { write(PROFILE_KEY, this.profiles); },
};

// ---------------------------------------------------------------- profiles

function blankProfile(name) {
  return {
    name, rounds: 0, wins: 0, losses: 0, ties: 0, games: 0, exact: 0,
    pctTotal: 0, bestPct: Infinity, streak: 0, bestStreak: 0, modeWins: {},
    gauntletWins: 0, seriesWins: 0, pbs: {}, h2h: {}, history: [], titles: [], dailies: {},
  };
}

export function profileFor(name) {
  const key = norm(name);
  if (!key) return null;
  if (!store.profiles[key]) store.profiles[key] = blankProfile(name);
  store.profiles[key].name = name;
  return store.profiles[key];
}

export function peekProfile(name) {
  return store.profiles[norm(name)] || null;
}

// Record a finished round. Returns { [playerIndex]: [new title names] }.
export function recordRound(match, round, result) {
  const unlocked = {};
  const players = match.players;
  const named = players.map(p => profileFor(p.name));
  const winners = new Set(result.winners);
  const solo = players.length === 1;
  result.rows.forEach((row, i) => {
    const prof = named[i];
    if (!prof) return;
    const before = new Set(prof.titles);
    const pct = round.target ? r1((100 * row.off) / round.target) : 0;
    const won = solo ? pct <= 5 && !row.bust : winners.has(i) && winners.size === 1;
    const tied = !solo && winners.has(i) && winners.size > 1;
    prof.rounds++;
    prof.pctTotal = r1(prof.pctTotal + pct);
    prof.bestPct = Math.min(prof.bestPct, pct);
    if (row.off === 0) prof.exact++;
    if (won) {
      prof.wins++;
      prof.streak++;
      prof.bestStreak = Math.max(prof.bestStreak, prof.streak);
      prof.modeWins[round.mode] = (prof.modeWins[round.mode] || 0) + 1;
    } else if (tied) {
      prof.ties++;
    } else {
      prof.losses++;
      prof.streak = 0;
    }
    const pbKey = round.stat.id;
    const pb = prof.pbs[pbKey];
    if (!row.bust && (!pb || pct < pb.pct)) {
      prof.pbs[pbKey] = { pct, label: round.stat.label, scope: round.scope.label, total: row.total, target: round.target, date: todayKey() };
    }
    players.forEach((other, j) => {
      if (j === i || !named[j]) return;
      const key = norm(other.name);
      const rec = prof.h2h[key] || (prof.h2h[key] = { name: other.name, w: 0, l: 0, t: 0 });
      const me = result.rows[i];
      const them = result.rows[j];
      const mine = (me.bust ? 1e12 : 0) + me.off;
      const theirs = (them.bust ? 1e12 : 0) + them.off;
      if (mine < theirs) rec.w++;
      else if (mine > theirs) rec.l++;
      else rec.t++;
    });
    prof.history.unshift({
      date: todayKey(), mode: round.mode, stat: round.stat.label, scope: round.scope.label,
      target: round.target, total: row.total, pct, won, tied, bust: row.bust,
      vs: players.filter((_, j) => j !== i).map(p => p.name).join(', '),
    });
    prof.history = prof.history.slice(0, 40);
    if (round.mode === 'daily' && round.dailyKey && !prof.dailies[round.dailyKey]) {
      prof.dailies[round.dailyKey] = { pct, total: row.total, target: round.target };
    }
    unlocked[i] = checkTitles(prof, before);
  });
  store.saveProfiles();
  return unlocked;
}

export function recordMatchEnd(match, winnerIndexes, kind) {
  const unlocked = {};
  match.players.forEach((p, i) => {
    const prof = profileFor(p.name);
    if (!prof) return;
    const before = new Set(prof.titles);
    prof.games++;
    if (winnerIndexes.length === 1 && winnerIndexes[0] === i) {
      if (kind === 'gauntlet') prof.gauntletWins++;
      if (kind === 'series') prof.seriesWins++;
    }
    unlocked[i] = checkTitles(prof, before);
  });
  store.saveProfiles();
  return unlocked;
}

function checkTitles(prof, before) {
  const s = { ...prof, bestPct: prof.bestPct === Infinity ? 999 : prof.bestPct };
  const fresh = [];
  for (const t of TITLES) {
    if (!before.has(t.id) && t.test(s)) {
      prof.titles.push(t.id);
      fresh.push(t.name);
    }
  }
  return fresh;
}

export function avgPct(prof) {
  return prof.rounds ? r1(prof.pctTotal / prof.rounds) : null;
}
