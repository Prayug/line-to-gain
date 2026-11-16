// Loads the data files as one consistent version. Every file carries the
// build version; if a daily refresh lands mid-session, a mismatch is caught
// instead of silently mixing old player indexes with new stat files.

export class StaleDataError extends Error {}

const FRANCHISES = ['ARI', 'ATL', 'BAL', 'BUF', 'CAR', 'CHI', 'CIN', 'CLE', 'DAL', 'DEN', 'DET', 'GB', 'HOU', 'IND',
  'JAX', 'KC', 'LA', 'LAC', 'LV', 'MIA', 'MIN', 'NE', 'NO', 'NYG', 'NYJ', 'PHI', 'PIT', 'SEA', 'SF', 'TB', 'TEN', 'WAS'];
export { FRANCHISES };

function toPlayer(cols, row, i) {
  const r = Object.fromEntries(cols.map((c, j) => [c, row[j]]));
  return {
    i, id: r.id, name: r.name, pos: r.pos, from: r.from, to: r.to, active: !!r.active,
    draftYear: r.draftYear, draftRound: r.draftRound, draftPick: r.draftPick, draftTeam: r.draftTeam,
    teams: r.teams ? r.teams.split('|') : [], head: r.head, birthYear: r.birthYear,
    probowls: r.probowls, allpro: r.allpro, hof: !!r.hof, rings: r.rings,
  };
}

function wrapScope(raw) {
  const maps = {};
  for (const k of raw.keys) {
    const flat = raw.s[k] || [];
    const m = new Map();
    for (let i = 0; i < flat.length; i += 2) m.set(flat[i], flat[i + 1]);
    maps[k] = m;
  }
  return {
    keys: raw.keys,
    members: new Set(raw.m),
    tags: raw.tags || {},
    has: k => k in maps,
    raw: (k, idx) => (maps[k] ? maps[k].get(idx) || 0 : 0),
  };
}

// Pro Bowls, All-Pros and titles live on the player records.
function honorsScope(players) {
  const maps = { probowls: new Map(), allpro: new Map(), rings: new Map() };
  const members = new Set();
  for (const p of players) {
    members.add(p.i);
    if (p.probowls > 0) maps.probowls.set(p.i, p.probowls);
    if (p.allpro > 0) maps.allpro.set(p.i, p.allpro);
    if (p.rings > 0) maps.rings.set(p.i, p.rings);
  }
  return { keys: Object.keys(maps), members, tags: {}, has: k => k in maps, raw: (k, idx) => maps[k].get(idx) || 0 };
}

export function makeData(meta, playersJson, teamsJson, loadJson) {
  const players = playersJson.rows.map((row, i) => toPlayer(playersJson.cols, row, i));
  const byId = new Map(players.map(p => [p.id, p]));
  const scopes = new Map();
  const teamName = new Map(teamsJson.teams.map(t => [t.id, t]));
  return {
    meta,
    version: meta.v,
    players,
    byId,
    teams: teamsJson.teams,
    team: id => teamName.get(id),
    teamStats: teamsJson.stats,
    teamSeasons: teamsJson.seasons,
    champions: teamsJson.champions,
    scopeInfo: id => meta.scopes.find(s => s.id === id),
    scope(id) {
      if (!scopes.has(id)) {
        const p = id === 'honors'
          ? Promise.resolve(honorsScope(players))
          : loadJson(`scopes/${id}.json`).then(raw => {
            if (raw.v !== meta.v) throw new StaleDataError(id);
            return wrapScope(raw);
          });
        p.catch(() => scopes.delete(id));
        scopes.set(id, p);
      }
      return scopes.get(id);
    },
  };
}

// Browser loader: meta.json is always revalidated; everything else is keyed
// by version so the browser cache can never hand back a mixed set.
export async function loadData(root = 'data/') {
  const get = async (path, fresh) => {
    const res = await fetch(root + path, fresh ? { cache: 'no-cache' } : undefined);
    if (!res.ok) throw new Error(`${path}: ${res.status}`);
    return res.json();
  };
  const meta = await get(`meta.json?t=${Date.now()}`, true);
  const [players, teams] = await Promise.all([get(`players.json?v=${meta.v}`), get(`teams.json?v=${meta.v}`)]);
  if (players.v !== meta.v || teams.v !== meta.v) throw new StaleDataError('players');
  return makeData(meta, players, teams, path => get(`${path}?v=${meta.v}`));
}
