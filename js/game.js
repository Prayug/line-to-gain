// Match flow: series length, rounds, timers and scoring. No DOM here.

import { MODES, DIFFICULTIES } from './catalog.js';
import { generateRound, dailyRound, roundFromChallenge, gauntletConfig, standings, gauntletPoints, valueOf } from './engine.js';
import { makeRng, randomSeed, uid, todayKey } from './util.js';
import { store, recordRound, recordMatchEnd } from './store.js';

export function scoringFor(match) {
  const mode = MODES[match.mode];
  if (mode.scoring === 'under' || match.cfg.scoring === 'under') return 'under';
  return 'closest';
}

export function newMatch(lobby, extra = {}) {
  const players = lobby.players.map((p, i) => ({ name: p.name.trim() || `Player ${i + 1}`, color: p.color, team: p.team }));
  const mode = extra.mode || lobby.mode;
  const length = mode === 'gauntlet' ? 5 : (mode === 'daily' || extra.challenge) ? 1 : lobby.series;
  const diff = DIFFICULTIES[lobby.difficulty] || DIFFICULTIES.pro;
  return {
    id: uid(), mode, players, length, roundNo: 0,
    wins: players.map(() => 0), points: players.map(() => 0),
    cfg: {
      difficulty: lobby.difficulty, packs: lobby.packs, style: lobby.style,
      each: lobby.custom ? lobby.each : diff.each, scoring: lobby.scoring,
      pickSeconds: lobby.pickSeconds, bankSeconds: lobby.bankSeconds, handoff: lobby.handoff,
    },
    challenge: extra.challenge || null,
    dailyKey: mode === 'daily' ? (extra.dailyKey || todayKey()) : null,
    round: null, history: [], finished: false, winners: [],
  };
}

export async function nextRound(D, match) {
  const prev = match.round;
  match.roundNo++;
  const P = match.players.length;
  const first = (match.roundNo - 1) % P;
  let round;
  if (match.dailyKey) {
    round = await dailyRound(D, match.dailyKey, P, match.cfg.style);
    round.dailyKey = match.dailyKey;
  } else if (match.challenge && match.roundNo === 1) {
    round = await roundFromChallenge(D, match.challenge, P, match.cfg.style, first);
  } else {
    let cfg = { mode: match.mode, difficulty: match.cfg.difficulty, packs: match.cfg.packs, P, each: match.cfg.each, style: match.cfg.style, first };
    if (match.mode === 'gauntlet') cfg = gauntletConfig(cfg, match.roundNo);
    round = await generateRound(D, cfg, makeRng(randomSeed()), prev);
  }
  round.mode = match.mode;
  round.scoring = scoringFor(match);
  round.roundNo = match.roundNo;
  const mode = MODES[match.mode];
  if (mode.timer === 'pick') round.timer = { kind: 'pick', seconds: match.cfg.pickSeconds, left: match.cfg.pickSeconds * 1000 };
  if (mode.timer === 'bank') round.timer = { kind: 'bank', banks: match.players.map(() => match.cfg.bankSeconds * 1000) };
  match.round = round;
  return round;
}

// Draft a player (or franchise). Returns false if the pick isn't allowed.
export function makePick(match, id, name, pos, auto = false) {
  const r = match.round;
  if (r.picks.length >= r.order.length) return false;
  if (r.picks.some(p => p.id === id)) return false;
  const by = r.order[r.picks.length];
  // Copy the value now: the round is frozen, whatever the data does later.
  r.picks.push({ by, id, name, pos, value: valueOf(r, id), auto });
  if (r.timer?.kind === 'pick') r.timer.left = r.timer.seconds * 1000;
  return true;
}

export function undoPick(match) {
  const r = match.round;
  const p = r.picks.pop();
  if (r.timer?.kind === 'pick') r.timer.left = r.timer.seconds * 1000;
  return p;
}

// Delay of game: the commish picks a random player who has the stat.
export function autoPick(match, D) {
  const r = match.round;
  const taken = new Set(r.picks.map(p => p.id));
  const open = Object.keys(r.values).filter(id => !taken.has(id) && r.values[id] > 0);
  if (!open.length) return null;
  const id = open[Math.floor(Math.random() * open.length)];
  const p = r.entity === 'team' ? D.team(id) : D.byId.get(id);
  const name = p ? p.name : id;
  makePick(match, id, name, r.entity === 'team' ? 'TEAM' : p?.pos || '', true);
  return name;
}

export function finishRound(match) {
  const r = match.round;
  const st = standings(r, r.scoring);
  if (r.done) return { st, unlocked: {} };
  r.done = true;
  if (st.winners.length === 1 && match.players.length > 1) match.wins[st.winners[0]]++;
  if (match.mode === 'gauntlet') {
    st.rows.forEach(row => {
      const won = st.winners.length === 1 && st.winners[0] === row.i;
      match.points[row.i] += row.bust ? 0 : gauntletPoints(row.off, r.target, won);
    });
  }
  match.history.push({
    roundNo: r.roundNo, stat: r.stat.label, scope: r.scope.label, target: r.target,
    totals: st.rows.map(x => x.total), winners: st.winners,
  });
  const unlocked = recordRound(match, r, st);
  return { st, unlocked };
}

export function seriesOver(match) {
  if (match.mode === 'gauntlet') return match.roundNo >= 5;
  if (match.length <= 1) return true;
  if (match.players.length === 1) return match.roundNo >= match.length;
  const need = Math.ceil(match.length / 2);
  return match.wins.some(w => w >= need) || match.roundNo >= match.length + 3;
}

export function seriesWinners(match) {
  const nums = match.mode === 'gauntlet' ? match.points : match.wins;
  const best = Math.max(...nums);
  return nums.flatMap((n, i) => (n === best ? [i] : []));
}

export function endMatch(match) {
  if (match.finished) return {};
  match.finished = true;
  match.winners = seriesWinners(match);
  const kind = match.mode === 'gauntlet' ? 'gauntlet' : match.length > 1 ? 'series' : 'single';
  return recordMatchEnd(match, match.winners, kind);
}

export function persist() {
  store.save();
}
