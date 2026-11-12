# Line to Gain

Pass-the-phone NFL trivia. You get a stat, a timeframe, and a number. Players take turns naming real NFL players, and whoever's combined total lands closest to the number wins. Nobody sees a stat until the draft is over.

- **Stats:** 19 in all: passing, rushing and receiving yards and TDs, completions, interceptions thrown, carries, receptions, targets, scrimmage yards, total TDs, fantasy points (PPR), sacks, interceptions, tackles, forced fumbles and field goals
- **Timeframes:** this season so far, last season, the 2000s, 2010s and 2020s, last postseason, every postseason since 1999, and all-time careers
- **Round size:** 1 to 20 players each, fixed or a fresh random size every round
- **Draft styles:** snake or normal
- **Players:** 2 to 6 on one device

Pick any mix of stats and timeframes, and each round draws a random pair from them.

## How the number is picked

The target is the real combined total of a random set of good players for that stat and timeframe, rounded to a clean number. That keeps it reachable, and it scales itself from Week 1 to all-time.

A round only uses a stat and timeframe with at least 1.3 players per pick, so a big draft never runs dry. If nothing you picked is deep enough, for example 20 each in one postseason, the round is capped and says so.

## Data

Seasons, decades and all-time count regular-season games. The playoff timeframes count postseason games only.

| Source | Covers |
| --- | --- |
| [nflverse](https://github.com/nflverse/nflverse-data) season files | Every player since 1999, regular season and playoffs |
| nflverse `draft_picks` | Official career totals for players drafted since 1980 |
| Wikipedia | Older legends and undrafted stars, stored in `data/legends.json` |

Summed season files drift slightly from official totals, so retired players use the official figure and active players use the running sum.

All-time offers the classic stats only, since targets, tackles, fantasy points and the like can't be traced before 1999. About 70 obscure players who debuted before 1999 are left out of all-time mode because only part of their career could be verified. Older players outside the Hall of Fame and the career leader lists are missing too.

## Updates

`.github/workflows/deploy.yml` runs daily. It rebuilds `data/meta.json` and the `data/pool-*.json` files from nflverse, runs the rule tests, and deploys to GitHub Pages. If the tests fail, the last good version stays live.

The new season is picked up automatically once nflverse publishes it. GitHub pauses scheduled workflows after 60 days without a commit, so after a quiet offseason you may need to re-enable the workflow in the Actions tab.

## Running it locally

```bash
python3 -m http.server 8123
```

```bash
node tests/rules.test.js
```

To rebuild the stats (the first argument is a download cache folder):

```bash
python3 scripts/build_stats.py /tmp/nflverse data/legends.json data
```

`scripts/fetch_legends.py` regenerates `data/legends.json` from Wikipedia. Retired players' numbers don't change, so it rarely needs to run. It needs `beautifulsoup4`.
