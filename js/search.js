// Fuzzy name search. Results are ranked by match quality and then
// alphabetically, never by stat, so the list can't hint at who's good.

import { norm } from './util.js';
import { NICKNAMES } from './catalog.js';

export function buildIndex(items) {
  // items: [{ i, name, aliases? }]
  const entries = items.map(({ i, name, aliases = [] }) => {
    const n = norm(name);
    const parts = n.split(' ');
    const last = parts[parts.length - 1];
    return { i, n, parts, last, squashed: n.replace(/ /g, ''), sort: `${last} ${n}`, aliases: aliases.map(norm) };
  });
  const byName = new Map();
  for (const e of entries) {
    if (!byName.has(e.n)) byName.set(e.n, []);
    byName.get(e.n).push(e);
  }
  return { entries, byName };
}

// Edit distance where swapping two neighbouring letters counts as one typo.
export function distance(a, b, limit) {
  if (Math.abs(a.length - b.length) > limit) return limit + 1;
  let before = [];
  let prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    const cur = [i];
    for (let j = 1; j <= b.length; j++) {
      cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) cur[j] = Math.min(cur[j], before[j - 2] + 1);
    }
    before = prev;
    prev = cur;
  }
  return prev[b.length];
}

function rank(e, q, tokens) {
  if (e.n === q) return 0;
  if (e.aliases.includes(q)) return 0;
  if (e.last.startsWith(q)) return 1;
  if (e.n.startsWith(q)) return 2;
  if (e.parts.some(p => p.startsWith(q))) return 3;
  if (tokens.length > 1 && tokens.every(t => e.parts.some(p => p.startsWith(t)))) return 4;
  if (e.squashed.startsWith(q.replace(/ /g, ''))) return 5; // "ja marr" -> Ja'Marr
  if (e.aliases.some(a => a.startsWith(q))) return 3;
  return -1;
}

// Returns [{ i, rank, exact }] best first.
export function search(index, raw, { minLength = 2 } = {}) {
  const q = norm(raw);
  if (q.length < minLength) return [];
  const tokens = q.split(' ');
  const hits = new Map();
  const nick = NICKNAMES[q];
  if (nick) for (const e of index.byName.get(norm(nick)) || []) hits.set(e.i, { e, rank: 0 });
  for (const e of index.entries) {
    if (hits.has(e.i)) continue;
    const r = rank(e, q, tokens);
    if (r >= 0) hits.set(e.i, { e, rank: r });
  }
  if (!hits.size && q.length >= 4) {
    const slack = q.length >= 6 ? 2 : 1;
    for (const e of index.entries) {
      const d = Math.min(distance(q, e.n, 2), distance(q, e.last, slack));
      if (d <= slack) hits.set(e.i, { e, rank: 6 + d });
    }
  }
  return [...hits.values()]
    .sort((a, b) => a.rank - b.rank || a.e.sort.localeCompare(b.e.sort))
    .map(h => ({ i: h.e.i, rank: h.rank, exact: h.rank === 0 }));
}
