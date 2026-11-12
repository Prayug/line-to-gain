// Run with: node tests/rules.test.js
// Loads app.js with a stub DOM and a disk-backed fetch, so the tests exercise
// the real game code against the real data files.
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const root = path.join(__dirname, '..');
const source = fs.readFileSync(path.join(root, 'app.js'), 'utf8').replace(/\nboot\(\);\s*$/, '\n');
const readJson = rel => JSON.parse(fs.readFileSync(path.join(root, rel), 'utf8'));
const ctx = {
  console,
  document: { getElementById: () => ({}) },
  window: { matchMedia: () => ({ matches: true }) },
  fetch: async url => ({ ok: true, json: async () => readJson(url) }),
};
vm.createContext(ctx);
vm.runInContext(`${source}
  META = __meta;
  Object.assign(globalThis, { draftOrder, niceTarget, newChallenge, outcome, search, norm, statOf, loadPool,
    options, CATS, POOLS, setState: v => { S = { ...S, ...v }; }, getState: () => S });
`.replace('__meta', JSON.stringify(readJson('data/meta.json'))), ctx);
const { draftOrder, niceTarget, newChallenge, outcome, search, norm, statOf, loadPool, options, CATS, POOLS, setState, getState } = ctx;
const META = readJson('data/meta.json');
const plain = v => JSON.parse(JSON.stringify(v));
const settings = over => ({ names: [], style: 'snake', cats: CATS.map(c => c.id), eras: META.eras.map(e => e.id),
  min: 2, max: 6, handoff: true, ...over });

(async () => {
  // Turn order
  assert.deepStrictEqual(plain(draftOrder(2, 3, 'snake', 0)), [0, 1, 1, 0, 0, 1]);
  assert.deepStrictEqual(plain(draftOrder(2, 3, 'normal', 0)), [0, 1, 0, 1, 0, 1]);
  assert.deepStrictEqual(plain(draftOrder(3, 2, 'snake', 0)), [0, 1, 2, 2, 1, 0]);
  assert.deepStrictEqual(plain(draftOrder(2, 2, 'snake', 1)), [1, 0, 0, 1]);
  for (const style of ['snake', 'normal']) {
    for (let n = 2; n <= 6; n++) {
      for (let k = 1; k <= 20; k++) {
        const counts = Array(n).fill(0);
        draftOrder(n, k, style, 1 % n).forEach(i => counts[i]++);
        assert(counts.every(c => c === k), 'everyone gets the same number of picks');
      }
    }
  }

  // Scoring
  const game = (target, picks) => ({ target, picks: picks.map(([by, value]) => ({ by, value })) });
  setState({ players: ['A', 'B'] });
  setState({ game: game(100, [[0, 90], [1, 120]]) });
  assert.deepStrictEqual(plain(outcome()), { best: 10, winners: [0], margin: 10 });
  setState({ game: game(100, [[0, 90], [1, 110]]) });
  assert.deepStrictEqual(plain(outcome()).winners, [0, 1], 'over and under by the same amount tie');
  setState({ game: game(10, [[0, 7.5], [0, 2.5], [1, 3]]) });
  assert.strictEqual(outcome().best, 0, 'half sacks add up exactly');
  setState({ game: game(791.6, [[0, 416.6], [0, 375], [1, 0.1], [1, 0.2]]) });
  assert.strictEqual(outcome().best, 0, 'fantasy decimals add up without float drift');
  setState({ game: game(50, [[0, -20], [1, 0]]) });
  assert.deepStrictEqual(plain(outcome()).winners, [1], 'negative totals count');

  // Data: meta's counts match the pools, and the all-time pool only offers career stats
  for (const era of META.eras) {
    const pool = await loadPool(era.id);
    assert(pool.rows.length > 100, `${era.id} has rows`);
    for (const [k, n] of Object.entries(era.counts)) {
      const cat = CATS.find(c => c.id === k);
      assert.strictEqual(pool.rows.filter(r => statOf(r, cat, pool) > 0).length, n, `${era.id}/${k} count`);
    }
  }
  assert(!META.eras.find(e => e.id === 'all').keys.includes('ppr'), 'no PPR all-time');

  // Every stat/timeframe pair, at every size, gives a sane round that fits the pool
  const table = [];
  let cappedRounds = 0;
  for (const era of META.eras) {
    for (const cat of CATS) {
      for (const people of [2, 6]) {
        for (const each of [1, 5, 20]) {
          setState({ players: Array(people).fill('x'), round: 1,
            settings: settings({ cats: [cat.id], eras: [era.id], min: each, max: each }) });
          if (!options().length) continue; // stat not tracked in this timeframe
          const g = await newChallenge(null);
          assert(g.target > 0 && Number.isFinite(g.target), `${cat.id}/${era.id} target ${g.target}`);
          assert.strictEqual(g.order.length, people * g.picksEach);
          assert(g.picksEach * people <= era.counts[cat.id], `${cat.id}/${era.id}: enough players to fill rosters`);
          if (g.picksEach < each) { assert(g.capped, 'a shrunken round says why'); cappedRounds++; }
          else assert.strictEqual(g.picksEach, each);
          if (people === 2 && each === 5) table.push(`${era.id.padEnd(8)} ${cat.id.padEnd(9)} ${g.target}`);
        }
      }
    }
  }
  console.log(`sample 5-each targets:\n  ${table.filter((_, i) => i % 9 === 0).join('\n  ')}`);
  console.log(`${cappedRounds} oversized rounds were capped to fit their pool`);

  // A range gives a new size each round and never repeats the last one
  setState({ players: ['A', 'B'], round: 1, settings: settings({ min: 3, max: 8 }) });
  let prev = null;
  const sizes = new Set();
  for (let i = 0; i < 80; i++) {
    const g = await newChallenge(prev);
    if (!g.capped) assert(g.picksEach >= 3 && g.picksEach <= 8, `size ${g.picksEach} in range`);
    if (prev && !g.capped && !prev.capped) assert.notStrictEqual(g.picksEach, prev.picksEach, 'size changes');
    if (prev) assert(!(g.cat === prev.cat && g.era === prev.era), 'stat and timeframe change');
    sizes.add(g.picksEach);
    prev = g;
  }
  assert(sizes.size >= 5, `sizes vary: ${[...sizes]}`);

  // No valid pair: new-only stats with All-time only
  setState({ settings: settings({ cats: ['ppr', 'tackles'], eras: ['all'] }) });
  assert.strictEqual(options().length, 0);
  await assert.rejects(() => newChallenge(null));

  // Search must not reveal stat order
  await loadPool('last');
  const idx = search('last', norm('williams'));
  const rush = idx.map(i => POOLS.last.rows[i][POOLS.last.col.rush_yds]);
  assert(idx.length > 5);
  assert.notDeepStrictEqual(plain(rush), plain([...rush].sort((a, b) => b - a)), 'results not ranked by stat');
  assert.strictEqual(POOLS.last.rows[search('last', norm('mahmoes'))[0]][0], 'Patrick Mahomes');

  console.log('\nall rule checks passed');
})().catch(err => { console.error(err); process.exit(1); });
