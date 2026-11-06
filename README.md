# Line to Gain

Pass-the-phone NFL trivia. You get a stat, a timeframe, and a number. Players take turns naming real NFL players, and whoever's combined total lands closest to the number wins. Nobody sees a stat until the draft is over.

- **Stats:** passing, rushing and receiving yards and TDs, receptions, scrimmage yards, total TDs, sacks, interceptions
- **Timeframes:** this season so far, last season, all-time
- **Draft styles:** snake or normal
- **Players:** 2 to 6 on one device

## How the number is picked

The target is the real combined total of a random set of good players for that stat and timeframe, rounded to a clean number. That keeps it reachable, and it scales itself from Week 1 to all-time.

## Data

Regular season only.

| Source | Covers |
| --- | --- |
| [nflverse](https://github.com/nflverse/nflverse-data) season files | Every player since 1999, including active players |
| nflverse `draft_picks` | Official career totals for players drafted since 1980 |
| Wikipedia | Older legends and undrafted stars, stored in `data/legends.json` |

Summed season files drift slightly from official totals, so retired players use the official figure and active players use the running sum.

About 70 obscure players who debuted before 1999 are left out of all-time mode because only part of their career could be verified. Older players outside the Hall of Fame and the career leader lists are missing too.

## Updates

`.github/workflows/deploy.yml` runs daily. It rebuilds `data/stats.json` from nflverse, runs the rule tests, and deploys to GitHub Pages. If the tests fail, the last good version stays live.

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
python3 scripts/build_stats.py /tmp/nflverse data/legends.json data/stats.json
```

`scripts/fetch_legends.py` regenerates `data/legends.json` from Wikipedia. Retired players' numbers don't change, so it rarely needs to run. It needs `beautifulsoup4`.
