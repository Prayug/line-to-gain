// Run with: node tests/rules.test.js
// Loads app.js with a stub DOM, so the tests exercise the real game code.
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const root = path.join(__dirname, '..');
const stats = JSON.parse(fs.readFileSync(path.join(root, 'data/stats.json'), 'utf8'));
const source = fs.readFileSync(path.join(root, 'app.js'), 'utf8').replace(/\nboot\(\);\s*$/, '\n');
const ctx = { document: { getElementById: () => ({}) }, window: {}, console };
vm.createContext(ctx);
vm.runInContext(`${source}
  DATA = __stats; DATA.meta.keys.forEach((k, i) => { COL[k] = i + 3; });
  Object.assign(globalThis, { draftOrder, niceTarget, newChallenge, outcome, search, norm, statOf, CATS, ERAS, setState: v => { S = { ...S, ...v }; }, getState: () => S });
`.replace('__stats', JSON.stringify(stats)), ctx);
const { draftOrder, niceTarget, newChallenge, outcome, search, norm, statOf, CATS, ERAS, setState, getState } = ctx;
const plain = v => JSON.parse(JSON.stringify(v));

// Turn order
assert.deepStrictEqual(plain(draftOrder(2, 3, 'snake', 0)), [0, 1, 1, 0, 0, 1]);
assert.deepStrictEqual(plain(draftOrder(2, 3, 'normal', 0)), [0, 1, 0, 1, 0, 1]);
assert.deepStrictEqual(plain(draftOrder(3, 2, 'snake', 0)), [0, 1, 2, 2, 1, 0]);
assert.deepStrictEqual(plain(draftOrder(2, 2, 'snake', 1)), [1, 0, 0, 1]);
assert.deepStrictEqual(plain(draftOrder(3, 2, 'normal', 2)), [2, 0, 1, 2, 0, 1]);
for (const style of ['snake', 'normal']) {
  for (let n = 2; n <= 6; n++) {
    for (let k = 2; k <= 5; k++) {
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
setState({ game: game(50, [[0, -20], [1, 0]]) });
assert.deepStrictEqual(plain(outcome()).winners, [1], 'negative totals count');
setState({ players: ['A', 'B', 'C'], game: game(100, [[0, 95], [1, 105], [2, 50]]) });
assert.deepStrictEqual(plain(outcome()), { best: 5, winners: [0, 1], margin: 45 });

// Every stat and timeframe yields a sane, reachable target
const table = [];
for (const cat of CATS) {
  for (const era of ERAS) {
    for (const players of [2, 6]) {
      for (const picks of ['2', '5']) {
        setState({ players: Array(players).fill('x'), round: 1,
          settings: { names: [], style: 'snake', cat: cat.id, era, picks } });
        const seen = [];
        for (let i = 0; i < 200; i++) {
          const g = newChallenge(null);
          assert(g.target > 0 && Number.isFinite(g.target), `${cat.id}/${era} target ${g.target}`);
          assert.strictEqual(g.order.length, players * Number(picks));
          seen.push(g.target);
        }
        // Reachable: enough players with the stat to fill every roster.
        const usable = stats.pools[era].filter(r => statOf(r, cat) > 0).length;
        assert(usable >= players * Number(picks), `${cat.id}/${era} has only ${usable} players`);
        if (players === 2 && picks === '2') {
          seen.sort((a, b) => a - b);
          table.push(`${cat.id.padEnd(10)} ${era.padEnd(5)} ${seen[0]} / ${seen[100]} / ${seen[199]}`);
        }
      }
    }
  }
}
console.log('2-pick targets (min / median / max):\n' + table.join('\n'));

// Search must not reveal stat order
const idx = search('last', norm('williams'));
const names = idx.map(i => stats.pools.last[i][0]);
const rushing = idx.map(i => stats.pools.last[i][3 + 2]);
assert(names.length > 5);
assert.notDeepStrictEqual(plain(rushing), plain([...rushing].sort((a, b) => b - a)), 'results not ranked by stat');

console.log('\nall rule checks passed');
