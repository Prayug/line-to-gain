// Round generation, eligibility and scoring. Pure functions over the data
// object from data.js, so the same code runs in the browser and in tests.

import { STATS, TEAM_STATS, ALL_TIME_STATS, SCOPE_KINDS, RESTRICTIONS, PACKS, DIFFICULTIES, MODES } from './catalog.js';
import { FRANCHISES } from './data.js';
import { r1, makeRng, hashSeed, b64urlEncode, b64urlDecode, uid } from './util.js';

// A round needs this many players with a nonzero value per pick, so the last
// picks of a big draft aren't forced onto players with nothing.
export const SLACK = 1.3;
export const MAX_EACH = 20;

// ---------------------------------------------------------------- basics

export function draftOrder(playerCount, picksEach, style, first) {
  const base = Array.from({ length: playerCount }, (_, i) => (i + first) % playerCount);
  const order = [];
  for (let round = 0; round < picksEach; round++) {
    order.push(...(style === 'snake' && round % 2 ? [...base].reverse() : base));
  }
  return order;
}

export function niceTarget(v) {
  const step = v >= 100000 ? 1000 : v >= 20000 ? 250 : v >= 5000 ? 50 : v >= 1000 ? 25 : v >= 300 ? 10 : v >= 100 ? 5 : 1;
  return Math.max(step, Math.round(v / step) * step);
}

export function statValue(scope, statId, idx) {
  const parts = STATS[statId]?.parts;
  return r1(parts ? parts.reduce((s, k) => s + scope.raw(k, idx), 0) : scope.raw(statId, idx));
}

const teamLabel = (D, f) => D.team(f)?.name || f;

// ---------------------------------------------------------------- scopes

function scopeSeasons(D) {
  const m = D.meta;
  const live = !m.seasonOver && m.weekDone >= 4; // a few weeks in, "so far" is a real stat
  return { first: 1999, lastDone: m.lastDone, current: m.current, live, lastPost: m.lastPost };
}

// Turn a pack rule's scope form into a concrete scope with labels.
export function resolveScope(form, D, rng, opts = {}) {
  const S = scopeSeasons(D);
  const [kind, flavor] = form.split(':');
  const season = y => {
    const now = y === S.current && !D.meta.seasonOver;
    return {
      id: `season-${y}`, kind: 'season', param: y,
      label: now ? `${y} season so far` : `${y} season`,
      sub: now ? `Regular season, ${D.meta.progress}` : 'Regular season',
    };
  };
  switch (kind) {
    case 'season': {
      let y;
      if (flavor === 'recent') y = S.live && !opts.stable && rng.chance(0.5) ? S.current : S.lastDone;
      else if (flavor === 'old') y = rng.int(1999, 2015);
      else y = rng.int(1999, S.lastDone);
      return season(y);
    }
    case 'post': {
      const y = flavor === 'last' ? S.lastPost : rng.int(1999, S.lastPost);
      return { id: `post-${y}`, kind: 'post', param: y, label: `${y} playoffs`, sub: `Postseason games of the ${y} season` };
    }
    case 'decade': {
      const d = rng.pick(opts.stable ? ['2000s', '2010s'] : ['2000s', '2010s', '2020s']);
      const end = d === '2020s' ? S.current : Number(d.slice(0, 4)) + 9;
      return { id: `decade-${d}`, kind: 'decade', param: d, label: `The ${d}`, sub: `${d.slice(0, 4)}–${end} regular seasons` };
    }
    case 'franchise': {
      const f = rng.pick(FRANCHISES);
      return { id: `franchise-${f}`, kind: 'franchise', param: f, label: `With the ${teamLabel(D, f)}`, sub: 'Regular-season games for them since 1999' };
    }
    case 'career': return { id: 'career', kind: 'career', label: 'Career', sub: 'Regular season, all-time' };
    case 'postcareer': return { id: 'postcareer', kind: 'postcareer', label: 'Playoff career', sub: 'Postseason games since 1999' };
    case 'superbowl': return { id: 'superbowl', kind: 'superbowl', label: 'Super Bowls', sub: `Every Super Bowl from the 1999 season to ${S.lastPost}` };
    case 'rookie': return { id: 'rookie', kind: 'rookie', label: 'Rookie season', sub: 'Rookies from 1999 on' };
    case 'final': return { id: 'final', kind: 'final', label: 'Final season', sub: `Last season played, 1999–${S.lastDone}` };
    case 'peak': return { id: 'peak', kind: 'peak', label: 'Best single season', sub: 'Regular seasons since 1999' };
    case 'bestgame': return { id: 'bestgame', kind: 'bestgame', label: 'Best single game', sub: 'Regular-season games since 1999' };
    case 'honors': return { id: 'honors', kind: 'honors', label: 'Career honors', sub: '' };
    case 'team': {
      if (flavor === 'season') {
        const y = rng.int(1999, S.lastDone);
        return { id: `team-${y}`, kind: 'team', param: y, label: `${y} season`, sub: 'Regular season' };
      }
      return { id: 'team', kind: 'team', label: 'Franchise history', sub: '' };
    }
    default: throw new Error(`unknown scope form ${form}`);
  }
}

// Career-scope stats beyond the classic set count games since 1999; the
// round says so instead of calling it a career total.
function relabelForStat(scope, statId) {
  if (scope.kind === 'career' && !ALL_TIME_STATS.has(statId)) {
    return { ...scope, label: 'Since 1999', sub: 'Regular-season games since 1999' };
  }
  if (scope.kind === 'honors') {
    const sub = statId === 'rings' ? 'Titles won from the 1999 season on' : 'Players drafted since 1980';
    return { ...scope, sub };
  }
  return scope;
}

// Who a stat can honestly be counted for, beyond appearing in the scope.
const COVERAGE = {
  probowls: { test: p => p.probowls >= 0, why: 'Pro Bowl records cover players drafted since 1980' },
  allpro: { test: p => p.allpro >= 0, why: 'All-Pro records cover players drafted since 1980' },
  rec_yds_30: { test: p => p.birthYear >= 1969, why: 'Turned 30 before 1999, outside our game logs' },
  rush_yds_30: { test: p => p.birthYear >= 1969, why: 'Turned 30 before 1999, outside our game logs' },
  seasons: { test: p => p.from >= 1999, why: 'Career began before 1999' },
  franchises: { test: p => p.from >= 1999, why: 'Career began before 1999' },
};

const NOT_IN_SCOPE = {
  season: s => `Didn’t play in the ${s.param} season`,
  post: s => `Didn’t play in the ${s.param} playoffs`,
  decade: s => `Didn’t play in the ${s.param}`,
  franchise: s => `Never played for them since 1999`,
  career: () => 'No verified career totals',
  postcareer: () => 'No playoff games since 1999',
  superbowl: () => 'No Super Bowl appearance since 1999',
  rookie: () => 'Rookie season before 1999',
  final: () => 'Still active, or retired before 1999',
  peak: () => 'No seasons since 1999',
  bestgame: () => 'No games since 1999',
  honors: () => 'No record',
};

function ruleText(rule, D, key = 'label') {
  const R = RESTRICTIONS[rule.id];
  const p = R.param === 'team' ? teamLabel(D, rule.param) : rule.param;
  return R[key].replace('{P}', p);
}

// ---------------------------------------------------------------- rules

function compatibleRules(scopeKind, statId) {
  const group = STATS[statId]?.group;
  return Object.entries(RESTRICTIONS).filter(([, R]) =>
    (!R.scopes || R.scopes.includes(scopeKind)) && (!R.groups || R.groups.includes(group))).map(([id]) => id);
}

function ruleParam(id, D, rng) {
  const R = RESTRICTIONS[id];
  if (R.param === 'draftClass') return rng.int(2000, D.meta.lastDone - 4);
  if (R.param === 'team') return rng.pick(FRANCHISES);
  return undefined;
}

// ---------------------------------------------------------------- building

// Build a round from a fully specified spec. Returns null when the pool can't
// support the draft (too few players with the stat).
export async function buildRound(D, spec, rng) {
  if (spec.entity === 'team') return buildTeamRound(D, spec, rng);
  const statDef = STATS[spec.stat];
  const scope = await D.scope(spec.scope.id);
  if (!scope.has(statDef.parts ? statDef.parts[0] : spec.stat)) return null;
  const cover = COVERAGE[spec.stat];
  const tests = spec.rules.map(r => ({ test: RESTRICTIONS[r.id].test, param: r.param }));
  const pool = [];
  let unrestricted = 0;
  for (const idx of scope.members) {
    const p = D.players[idx];
    if (cover && !cover.test(p)) continue;
    const v = statValue(scope, spec.stat, idx);
    if (v <= 0) continue;
    unrestricted++;
    if (tests.every(t => t.test(p, t.param))) pool.push([p, v]);
  }
  pool.sort((a, b) => b[1] - a[1]);
  const banned = pool.slice(0, spec.ban || 0);
  const open = pool.slice(banned.length);
  const need = Math.ceil(spec.n * (spec.capacityFor || spec.P) * SLACK);
  if (open.length < need || open.length < 2) return null;

  let target = spec.target;
  if (!target) {
    // Draw from the players a fan would call "good" at this: the stat's usual
    // depth, scaled by timeframe and difficulty, and shrunk in proportion when
    // a rule narrows the pool (so "Saints only" doesn't reach into scrubs).
    const kindDepth = SCOPE_KINDS[spec.scope.kind]?.depth || 1;
    const share = Math.min(1, pool.length / Math.max(1, unrestricted));
    const K = Math.min(open.length, Math.max(need, spec.n + 2, Math.round(statDef.depth * kindDepth * (spec.depthMult || 1) * share)));
    const total = rng.shuffle(open.slice(0, K)).slice(0, spec.n).reduce((s, [, v]) => s + v, 0);
    target = niceTarget(total);
  }
  const scopeLabels = relabelForStat(spec.scope, spec.stat);
  return finish(D, spec, rng, {
    stat: { id: spec.stat, label: statDef.label, one: statDef.one, many: statDef.many, note: statDef.note || '' },
    scope: scopeLabels,
    badge: SCOPE_KINDS[spec.scope.kind].badge,
    rules: spec.rules.map(r => ({ ...r, label: ruleText(r, D), fail: ruleText(r, D, 'fail'), note: RESTRICTIONS[r.id].note || '' })),
    coverage: cover ? cover.why : '',
    target,
    values: Object.fromEntries(open.map(([p, v]) => [p.id, v])),
    banned: banned.map(([p]) => ({ id: p.id, name: p.name, pos: p.pos })),
    depth: open.length,
  });
}

function buildTeamRound(D, spec, rng) {
  const def = TEAM_STATS[spec.stat];
  const y = spec.scope.param;
  const vals = D.teams.map(t => {
    let v;
    if (def.season) {
      const rec = D.teamSeasons[String(y)]?.[t.id];
      v = rec ? { season_wins: rec[0], season_pf: rec[1], season_pa: rec[2] }[spec.stat] : 0;
    } else v = D.teamStats[spec.stat]?.[t.id] || 0;
    return [t, v];
  });
  const pool = vals.filter(([, v]) => v > 0).sort((a, b) => b[1] - a[1]);
  const banned = pool.slice(0, spec.ban ? Math.min(spec.ban, 4) : 0);
  const open = pool.slice(banned.length);
  const need = Math.ceil(spec.n * (spec.capacityFor || spec.P) * SLACK);
  if (open.length < need) return null;
  const target = spec.target || niceTarget(rng.shuffle(open).slice(0, spec.n).reduce((s, [, v]) => s + v, 0));
  return finish(D, spec, rng, {
    stat: { id: spec.stat, label: def.label.replace('{Y}', y), one: def.one, many: def.many, note: def.note || '' },
    scope: { ...spec.scope, sub: spec.scope.sub || 'Regular-season and playoff games from 1999 on, plus Super Bowl and playoff history from Wikipedia' },
    badge: SCOPE_KINDS.team.badge,
    rules: [],
    coverage: '',
    target,
    values: Object.fromEntries(vals.map(([t, v]) => [t.id, v])), // every franchise is eligible, zeros included
    banned: banned.map(([t]) => ({ id: t.id, name: t.name, pos: 'TEAM' })),
    depth: open.length,
  });
}

function finish(D, spec, rng, built) {
  const order = draftOrder(spec.P, spec.n, spec.style || 'snake', spec.first || 0);
  return {
    id: uid(), v: 2, created: Date.now(), dataVersion: D.version,
    mode: spec.mode, pack: spec.pack, tier: spec.tier, difficulty: spec.difficulty,
    entity: spec.entity, seed: rng.seed,
    spec: {
      entity: spec.entity, scope: spec.scope, stat: spec.stat,
      rules: spec.rules.map(r => ({ id: r.id, param: r.param })), ban: spec.ban || 0,
    },
    ...built,
    n: spec.n, P: spec.P, style: spec.style || 'snake', first: spec.first || 0, order,
    picks: [], revealed: 0, done: false,
  };
}

// ---------------------------------------------------------------- generation

function rollCount([lo, hi], previous, rng) {
  let n = rng.int(lo, hi);
  // A range should feel random: don't serve the same size twice running.
  for (let i = 0; i < 6 && hi > lo && previous && n === previous.n; i++) n = rng.int(lo, hi);
  return n;
}

const STABLE_KINDS = new Set(['season', 'post', 'decade', 'superbowl', 'team']);

// cfg: { mode, difficulty, packs, P, each:[lo,hi], style, first, tierCap?, restrictChance?, daily? }
export async function generateRound(D, cfg, rng, previous) {
  const mode = MODES[cfg.mode] || MODES.classic;
  const diff = DIFFICULTIES[cfg.difficulty] || DIFFICULTIES.pro;
  const packIds = mode.packs || cfg.packs;
  const tierCap = cfg.tierCap || diff.tier;
  const restrictChance = cfg.restrictChance ?? diff.restrict;
  const rules = [];
  for (const pack of PACKS) {
    if (!packIds.includes(pack.id)) continue;
    for (const rule of pack.rules) {
      if (rule.tier > tierCap && !(mode.packs && rule.tier <= 5)) continue;
      if (cfg.daily && !STABLE_KINDS.has(rule.scope.split(':')[0])) continue;
      rules.push({ ...rule, pack: pack.id, entity: pack.entity || 'player' });
    }
  }
  if (!rules.length) throw new Error('No round types match these settings');

  for (let attempt = 0; attempt < 40; attempt++) {
    const n = Math.min(MAX_EACH, Math.max(1, attempt > 25 ? Math.max(1, cfg.each[0] - 1) : rollCount(cfg.each, previous, rng)));
    const rule = rng.weighted(rules, r => r.weight);
    const stat = rng.pick(rule.stats);
    const scope = resolveScope(rule.scope, D, rng, { stable: !!cfg.daily });
    let chosen = [];
    if (rule.restrict) {
      chosen = [rng.pick(rule.restrict), ...(rule.extra || [])];
    } else if (rule.entity === 'player' && rng.chance(restrictChance)) {
      const fits = compatibleRules(scope.kind, stat);
      if (fits.length) chosen = [rng.pick(fits)];
    }
    const ruleSpecs = chosen.map(id => ({ id, param: ruleParam(id, D, rng) }));
    const key = `${rule.entity}|${scope.id}|${stat}|${ruleSpecs.map(r => r.id).join('+')}`;
    if (previous && previous.key === key) continue;
    const spec = {
      entity: rule.entity, scope, stat, rules: ruleSpecs, n, P: cfg.P,
      capacityFor: cfg.daily ? 6 : cfg.P, // the Daily is identical for any group size
      mode: cfg.mode, difficulty: cfg.difficulty, pack: rule.pack, tier: rule.tier,
      ban: mode.ban ? Math.max(3, Math.min(8, n + 2)) : 0,
      depthMult: diff.depth, style: cfg.style, first: cfg.first || 0,
    };
    const round = await buildRound(D, spec, rng);
    if (round) {
      round.key = key;
      return round;
    }
  }
  throw new Error('Couldn’t find a round deep enough for this many picks. Try fewer players each.');
}

export function dailyRng(dateKey) {
  return makeRng(hashSeed(`line-to-gain/daily/${dateKey}`));
}

export async function dailyRound(D, dateKey, P, style) {
  const rng = dailyRng(dateKey);
  const each = rng.int(3, 4);
  return generateRound(D, {
    mode: 'daily', difficulty: 'pro', packs: ['classic', 'deep', 'playoffs', 'history', 'teams'],
    P, each: [each, each], style, daily: true, restrictChance: 0.2,
  }, rng, null);
}

// Gridiron Gauntlet: round k (1..5) climbs in tier, size and rule odds.
export function gauntletConfig(base, k) {
  return {
    ...base, mode: 'gauntlet', tierCap: Math.min(5, k + 1),
    each: [[2, 3], [3, 4], [3, 5], [4, 6], [5, 7]][k - 1],
    restrictChance: [0.05, 0.2, 0.35, 0.5, 0.7][k - 1],
    difficulty: ['rookie', 'pro', 'pro', 'allpro', 'hof'][k - 1],
  };
}

// ---------------------------------------------------------------- eligibility

// Why a player can or can't be drafted this round. Never reveals a value.
export function eligibility(D, round, scope, player, takenBy) {
  if (takenBy !== undefined) return { ok: false, reason: 'taken', by: takenBy };
  if (round.banned.some(b => b.id === player.id)) return { ok: false, reason: 'Banned this round' };
  if (round.entity === 'team') return { ok: true };
  if (player.id in round.values) return { ok: true };
  if (!scope.members.has(player.i)) {
    const why = NOT_IN_SCOPE[round.scope.kind];
    return { ok: false, reason: why ? why(round.scope) : 'Not eligible' };
  }
  const cover = COVERAGE[round.stat.id];
  if (cover && !cover.test(player)) return { ok: false, reason: cover.why };
  for (const r of round.rules) {
    if (!RESTRICTIONS[r.id].test(player, r.param)) return { ok: false, reason: r.fail };
  }
  return { ok: true }; // eligible with 0
}

export function valueOf(round, id) {
  return round.values[id] || 0;
}

// ---------------------------------------------------------------- scoring

// scoring: closest | under (Price Is Right) | points (Gauntlet, closest per round)
export function standings(round, scoring = 'closest') {
  const totals = Array.from({ length: round.P }, () => 0);
  const best = Array.from({ length: round.P }, () => null);
  for (const pk of round.picks) {
    totals[pk.by] = r1(totals[pk.by] + pk.value);
    if (!best[pk.by] || pk.value > best[pk.by].value) best[pk.by] = pk;
  }
  const rows = totals.map((total, i) => {
    const diff = r1(total - round.target);
    return { i, total, diff, off: Math.abs(diff), bust: scoring === 'under' && diff > 0, best: best[i] };
  });
  const key = r => (r.bust ? 1e12 : 0) + r.off;
  const ranked = [...rows].sort((a, b) => key(a) - key(b));
  const top = key(ranked[0]);
  const winners = ranked.filter(r => key(r) === top).map(r => r.i);
  const allBust = rows.every(r => r.bust);
  const next = ranked.find(r => key(r) !== top);
  const margin = next ? r1(next.off - ranked[0].off) : 0;
  let place = 0;
  ranked.forEach((r, n) => { if (n === 0 || key(r) !== key(ranked[n - 1])) place = n + 1; r.place = place; });
  const mvp = [...round.picks].sort((a, b) => b.value - a.value)[0] || null;
  return { rows, ranked, winners, margin, allBust, mvp, pct: ranked.map(r => (round.target ? (100 * r.off) / round.target : 0)) };
}

export function gauntletPoints(off, target, won) {
  const accuracy = target > 0 ? Math.max(0, Math.round(100 - (100 * off) / target)) : 0;
  return accuracy + (won ? 25 : 0) + (off === 0 ? 50 : 0);
}

// ---------------------------------------------------------------- challenge codes

export function encodeChallenge(round) {
  const s = round.spec;
  const scope = s.scope;
  const o = {
    v: 1, m: round.mode, e: s.entity, k: scope.kind, sc: scope.id, sp: scope.param, st: s.stat,
    r: s.rules.map(r => [r.id, r.param ?? null]), b: s.ban, n: round.n, T: round.target,
  };
  return b64urlEncode(JSON.stringify(o));
}

export function decodeChallenge(code) {
  const o = JSON.parse(b64urlDecode(code.trim()));
  if (o.v !== 1 || !o.sc || !o.st || !o.T) throw new Error('Not a Line to Gain challenge code');
  return o;
}

// Rebuild a shared round: same stat, timeframe, rules, size and line.
export async function roundFromChallenge(D, code, P, style, first = 0) {
  const o = decodeChallenge(code);
  const rng = makeRng(hashSeed(code));
  let scope;
  if (o.e === 'team') scope = o.k === 'team' && o.sp ? { id: o.sc, kind: 'team', param: o.sp, label: `${o.sp} season`, sub: 'Regular season' } : { id: 'team', kind: 'team', label: 'Franchise history', sub: '' };
  else scope = rebuildScope(D, o);
  const round = await buildRound(D, {
    entity: o.e, scope, stat: o.st, rules: o.r.map(([id, param]) => ({ id, param: param ?? undefined })),
    n: o.n, P, capacityFor: 1, mode: o.m, ban: o.b, target: o.T, style, first,
  }, rng);
  if (!round) throw new Error('That challenge doesn’t fit the current data');
  round.key = `challenge|${code}`;
  round.challenge = code;
  return round;
}

function rebuildScope(D, o) {
  const fake = { int: () => o.sp, pick: () => o.sp, chance: () => false };
  const form = { season: 'season:any', post: 'post:any', decade: 'decade', franchise: 'franchise' }[o.k] || o.k;
  const s = resolveScope(form, D, fake);
  return { ...s, id: o.sc };
}
