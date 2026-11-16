import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadDiskData } from './helpers.js';
import { PACKS, MODES, DIFFICULTIES, STATS, TEAM_STATS, RESTRICTIONS } from '../js/catalog.js';
import { draftOrder, niceTarget, buildRound, generateRound, resolveScope, standings, eligibility, encodeChallenge,
  decodeChallenge, roundFromChallenge, dailyRound, gauntletConfig, gauntletPoints, SLACK } from '../js/engine.js';
import { makeRng } from '../js/util.js';

const D = loadDiskData();
const plain = v => JSON.parse(JSON.stringify(v));

test('draft order: snake, normal, rotation, equal picks', () => {
  assert.deepEqual(draftOrder(2, 3, 'snake', 0), [0, 1, 1, 0, 0, 1]);
  assert.deepEqual(draftOrder(2, 3, 'normal', 0), [0, 1, 0, 1, 0, 1]);
  assert.deepEqual(draftOrder(3, 2, 'snake', 0), [0, 1, 2, 2, 1, 0]);
  assert.deepEqual(draftOrder(3, 2, 'normal', 2), [2, 0, 1, 2, 0, 1]);
  assert.deepEqual(draftOrder(1, 4, 'snake', 0), [0, 0, 0, 0]);
  for (const style of ['snake', 'normal']) for (let P = 1; P <= 6; P++) for (let n = 1; n <= 20; n++) {
    const counts = Array(P).fill(0);
    draftOrder(P, n, style, (n + P) % P).forEach(i => counts[i]++);
    assert.ok(counts.every(c => c === n));
  }
});

test('nice targets round to clean numbers', () => {
  assert.equal(niceTarget(3), 3);
  assert.equal(niceTarget(2613), 2625);
  assert.equal(niceTarget(161154), 161000);
});

test('scoring: closest, price is right, ties, decimals, negatives', () => {
  const round = (target, picks) => ({ target, P: 2, picks: picks.map(([by, value]) => ({ by, value })) });
  let s = standings(round(100, [[0, 90], [1, 120]]));
  assert.deepEqual([s.winners, s.margin], [[0], 10]);
  s = standings(round(100, [[0, 90], [1, 110]]));
  assert.deepEqual(s.winners, [0, 1], 'equal distance over and under ties');
  s = standings(round(100, [[0, 80], [1, 105]]), 'under');
  assert.deepEqual(s.winners, [0], 'price is right: 5 over busts, 20 under wins');
  assert.equal(s.rows[1].bust, true);
  s = standings(round(100, [[0, 130], [1, 105]]), 'under');
  assert.deepEqual([s.winners, s.allBust], [[1], true], 'everyone busts: smallest bust wins');
  s = standings(round(791.6, [[0, 416.6], [0, 375], [1, 0.1], [1, 0.2]]));
  assert.equal(s.rows[0].off, 0, 'fantasy decimals add without float drift');
  s = standings(round(50, [[0, -20], [1, 0]]));
  assert.deepEqual(s.winners, [1]);
  assert.equal(gauntletPoints(0, 100, true), 175);
  assert.equal(gauntletPoints(250, 100, false), 0);
});

test('every pack rule can produce a valid round for 2 players', async () => {
  const failures = [];
  for (const pack of PACKS) {
    for (const rule of pack.rules) {
      for (const stat of rule.stats) {
        const rng = makeRng(1234);
        let made = null;
        for (let t = 0; t < 6 && !made; t++) {
          const scope = resolveScope(rule.scope, D, rng);
          const rules = (rule.restrict ? [rule.restrict[0], ...(rule.extra || [])] : []).map(id => ({ id, param: RESTRICTIONS[id].param === 'team' ? 'SEA' : RESTRICTIONS[id].param ? 2010 : undefined }));
          made = await buildRound(D, { entity: pack.entity || 'player', scope, stat, rules, n: 3, P: 2, mode: 'classic' }, rng);
        }
        if (!made) failures.push(`${pack.id} ${rule.scope} ${stat}`);
        else {
          assert.ok(made.target > 0);
          assert.ok(made.depth >= Math.ceil(3 * 2 * SLACK));
          assert.ok(made.stat.label && made.scope.label && made.badge);
        }
      }
    }
  }
  assert.deepEqual(failures, []);
});

test('generated rounds respect size range, capacity and immutability', async () => {
  const rng = makeRng(99);
  let prev = null;
  for (let k = 0; k < 60; k++) {
    const cfg = { mode: 'classic', difficulty: 'allpro', packs: PACKS.map(p => p.id), P: 3, each: [2, 6], style: 'snake' };
    const r = await generateRound(D, cfg, rng, prev);
    assert.ok(r.n >= 1 && r.n <= 6);
    assert.equal(r.order.length, r.n * 3);
    assert.ok(Object.keys(r.values).length >= Math.ceil(r.n * 3 * SLACK), `${r.key} deep enough`);
    assert.ok(r.dataVersion === D.version);
    if (prev) assert.notEqual(r.key, prev.key);
    prev = r;
  }
});

test('eligibility explains every refusal without revealing values', async () => {
  const scope = resolveScope('season:any', D, { int: () => 2007, pick: x => x[0], chance: () => false });
  const round = await buildRound(D, { entity: 'player', scope, stat: 'rec_yds', rules: [{ id: 'first-round' }], n: 2, P: 2, mode: 'classic' }, makeRng(5));
  const S = await D.scope(round.scope.id);
  const by = name => D.players.find(p => p.name === name);
  const moss = by('Randy Moss'); // 2007, first-round pick
  const welker = by('Wes Welker'); // 2007, undrafted
  const rice = by('Jerry Rice'); // retired 2004
  assert.equal(eligibility(D, round, S, moss).ok, true);
  assert.equal(eligibility(D, round, S, welker).reason, 'Not a first-round pick');
  assert.equal(eligibility(D, round, S, rice).reason, 'Didn’t play in the 2007 season');
  assert.equal(eligibility(D, round, S, moss, 1).reason, 'taken');
  assert.ok(round.values[moss.id] > 1400, 'Moss 2007: 1,493 yds');
});

test('restrictions filter correctly', async () => {
  const career = await D.scope('career');
  const undrafted = [...career.members].map(i => D.players[i]).filter(p => RESTRICTIONS.undrafted.test(p));
  const names = new Set(undrafted.map(p => p.name));
  for (const n of ['Wes Welker', 'Antonio Gates', 'Tony Romo', 'Kurt Warner', 'Arian Foster']) assert.ok(names.has(n), n);
  assert.ok(!names.has('Tom Brady'));
  const sea = D.players.filter(p => RESTRICTIONS.franchise.test(p, 'SEA')).map(p => p.name);
  for (const n of ['Steve Largent', 'Marshawn Lynch', 'Russell Wilson', 'Shaun Alexander']) assert.ok(sea.includes(n), n);
  const qbs = D.players.filter(p => RESTRICTIONS['pos-qb'].test(p));
  assert.ok(qbs.every(p => p.pos === 'QB'));
});

test('challenge codes rebuild the same round', async () => {
  const r = await generateRound(D, { mode: 'pir', difficulty: 'pro', packs: ['classic', 'sicko'], P: 2, each: [3, 4], style: 'snake' }, makeRng(7), null);
  const code = encodeChallenge(r);
  assert.equal(decodeChallenge(code).T, r.target);
  const again = await roundFromChallenge(D, code, 4, 'normal');
  assert.equal(again.target, r.target);
  assert.equal(again.stat.id, r.stat.id);
  assert.equal(again.scope.id, r.scope.id);
  assert.deepEqual(again.rules.map(x => x.id), r.rules.map(x => x.id));
  assert.equal(again.P, 4);
  assert.throws(() => decodeChallenge('bm90IGEgY29kZQ'));
});

test('daily drive is identical for any group size and only uses settled data', async () => {
  for (const day of ['2026-11-16', '2026-11-17', '2026-12-25']) {
    const a = await dailyRound(D, day, 1, 'snake');
    const b = await dailyRound(D, day, 6, 'normal');
    assert.deepEqual([a.stat.id, a.scope.id, a.target, a.n], [b.stat.id, b.scope.id, b.target, b.n]);
    assert.ok(!/so far/.test(a.scope.label), 'daily avoids the live season');
    assert.ok(['season', 'post', 'decade', 'superbowl', 'team'].includes(a.scope.kind));
  }
});

test('gauntlet climbs in difficulty', () => {
  const cfgs = [1, 2, 3, 4, 5].map(k => gauntletConfig({ packs: ['classic'], P: 2 }, k));
  assert.ok(cfgs[4].each[0] > cfgs[0].each[0]);
  assert.ok(cfgs[4].restrictChance > cfgs[0].restrictChance);
});

test('no easy answers bans the top players and keeps them out', async () => {
  const r = await generateRound(D, { mode: 'noeasy', difficulty: 'pro', packs: ['classic'], P: 2, each: [3, 3], style: 'snake' }, makeRng(3), null);
  assert.ok(r.banned.length >= 3);
  for (const b of r.banned) assert.ok(!(b.id in r.values));
});

test('labels match the games behind them', async () => {
  const rng = makeRng(11);
  for (let k = 0; k < 40; k++) {
    const r = await generateRound(D, { mode: 'classic', difficulty: 'hof', packs: PACKS.map(p => p.id), P: 2, each: [2, 4], style: 'snake' }, rng, null);
    const kind = r.scope.kind;
    if (['post', 'postcareer'].includes(kind)) assert.equal(r.badge, 'Postseason');
    if (['season', 'decade', 'career', 'peak', 'bestgame', 'rookie', 'final', 'franchise'].includes(kind)) assert.equal(r.badge, 'Regular season');
    if (kind === 'career' && !['pass_yds', 'pass_td', 'rush_yds', 'rush_td', 'rec_yds', 'rec_td', 'rec', 'scrim_yds', 'total_td', 'sacks', 'ints'].includes(r.stat.id)) {
      assert.equal(r.scope.label, 'Since 1999', `${r.stat.id} is labelled since 1999`);
    }
  }
});
