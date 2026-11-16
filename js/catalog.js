// Everything a round can be, as configuration. New round types come from
// adding entries here; the engine combines them and checks the data can
// support each combination before offering it.

// ---------------------------------------------------------------- stats

// group: which players accumulate it (drives which eligibility rules fit).
// depth: roughly how many players post a meaningful number in one season.
export const STATS = {
  pass_yds: { label: 'Passing yards', one: 'yd', many: 'yds', group: 'pass', depth: 32 },
  pass_td: { label: 'Passing TDs', one: 'TD', many: 'TDs', group: 'pass', depth: 32 },
  pass_int: { label: 'Interceptions thrown', one: 'INT', many: 'INTs', group: 'pass', depth: 32 },
  cmp: { label: 'Completions', one: 'completion', many: 'completions', group: 'pass', depth: 32 },
  sacks_taken: { label: 'Times sacked', one: 'sack', many: 'sacks', group: 'pass', depth: 32 },
  rush_yds: { label: 'Rushing yards', one: 'yd', many: 'yds', group: 'rush', depth: 48 },
  rush_td: { label: 'Rushing TDs', one: 'TD', many: 'TDs', group: 'rush', depth: 40 },
  carries: { label: 'Carries', one: 'carry', many: 'carries', group: 'rush', depth: 48 },
  rec_yds: { label: 'Receiving yards', one: 'yd', many: 'yds', group: 'rec', depth: 72 },
  rec_td: { label: 'Receiving TDs', one: 'TD', many: 'TDs', group: 'rec', depth: 56 },
  rec: { label: 'Receptions', one: 'catch', many: 'catches', group: 'rec', depth: 72 },
  targets: { label: 'Targets', one: 'target', many: 'targets', group: 'rec', depth: 72 },
  scrim_yds: { label: 'Scrimmage yards', one: 'yd', many: 'yds', group: 'skill', depth: 72, parts: ['rush_yds', 'rec_yds'], note: 'Rushing + receiving' },
  total_td: { label: 'Total touchdowns', one: 'TD', many: 'TDs', group: 'skill', depth: 64, parts: ['rush_td', 'rec_td'], note: 'Rushing + receiving' },
  ppr: { label: 'Fantasy points', one: 'pt', many: 'pts', group: 'skill', depth: 72, note: 'PPR scoring' },
  fum_lost: { label: 'Fumbles lost', one: 'fumble', many: 'fumbles', group: 'skill', depth: 60 },
  sacks: { label: 'Sacks', one: 'sack', many: 'sacks', group: 'def', depth: 40 },
  ints: { label: 'Interceptions', one: 'INT', many: 'INTs', group: 'def', depth: 30, note: 'Caught by defenders' },
  tackles: { label: 'Tackles', one: 'tackle', many: 'tackles', group: 'def', depth: 60, note: 'Solo + assisted' },
  ff: { label: 'Forced fumbles', one: 'forced fumble', many: 'forced fumbles', group: 'def', depth: 40 },
  def_td: { label: 'Defensive touchdowns', one: 'TD', many: 'TDs', group: 'def', depth: 30, note: 'Interception and fumble returns' },
  fg: { label: 'Field goals made', one: 'FG', many: 'FGs', group: 'kick', depth: 24 },
  ret_yds: { label: 'Kick and punt return yards', one: 'yd', many: 'yds', group: 'ret', depth: 40 },
  st_td: { label: 'Special teams touchdowns', one: 'TD', many: 'TDs', group: 'ret', depth: 24 },
  games: { label: 'Games played', one: 'game', many: 'games', group: 'all', depth: 120, note: 'Games with a recorded stat' },
  // career-only tallies (games since 1999)
  g100rec: { label: '100-yard receiving games', one: 'game', many: 'games', group: 'rec', depth: 48 },
  g100rush: { label: '100-yard rushing games', one: 'game', many: 'games', group: 'rush', depth: 40 },
  g300pass: { label: '300-yard passing games', one: 'game', many: 'games', group: 'pass', depth: 32 },
  g400pass: { label: '400-yard passing games', one: 'game', many: 'games', group: 'pass', depth: 24 },
  gmulti_td: { label: 'Games with 2+ touchdowns scored', one: 'game', many: 'games', group: 'skill', depth: 48 },
  s1000rec: { label: '1,000-yard receiving seasons', one: 'season', many: 'seasons', group: 'rec', depth: 40 },
  s1000rush: { label: '1,000-yard rushing seasons', one: 'season', many: 'seasons', group: 'rush', depth: 32 },
  s4000pass: { label: '4,000-yard passing seasons', one: 'season', many: 'seasons', group: 'pass', depth: 24 },
  s10sack: { label: '10-sack seasons', one: 'season', many: 'seasons', group: 'def', depth: 30 },
  seasons: { label: 'Seasons played', one: 'season', many: 'seasons', group: 'all', depth: 120 },
  qb_starts: { label: 'Starts at quarterback', one: 'start', many: 'starts', group: 'pass', depth: 32 },
  qb_wins: { label: 'Wins as a starting QB', one: 'win', many: 'wins', group: 'pass', depth: 32 },
  qb_po_wins: { label: 'Playoff wins as a starting QB', one: 'win', many: 'wins', group: 'pass', depth: 20 },
  sb_games: { label: 'Super Bowl appearances', one: 'appearance', many: 'appearances', group: 'all', depth: 80, note: 'Played in the game' },
  cc_games: { label: 'Conference championship games played', one: 'game', many: 'games', group: 'all', depth: 80 },
  franchises: { label: 'Franchises played for', one: 'franchise', many: 'franchises', group: 'all', depth: 120 },
  rec_yds_30: { label: 'Receiving yards after turning 30', one: 'yd', many: 'yds', group: 'rec', depth: 40, note: 'Seasons that began at age 30 or older' },
  rush_yds_30: { label: 'Rushing yards after turning 30', one: 'yd', many: 'yds', group: 'rush', depth: 24, note: 'Seasons that began at age 30 or older' },
  best_rec_yds: { label: 'Most receiving yards in one game', one: 'yd', many: 'yds', group: 'rec', depth: 72 },
  best_rush_yds: { label: 'Most rushing yards in one game', one: 'yd', many: 'yds', group: 'rush', depth: 48 },
  best_pass_yds: { label: 'Most passing yards in one game', one: 'yd', many: 'yds', group: 'pass', depth: 32 },
  best_td: { label: 'Most touchdowns scored in one game', one: 'TD', many: 'TDs', group: 'skill', depth: 64 },
  // honors (from player records)
  probowls: { label: 'Pro Bowl selections', one: 'selection', many: 'selections', group: 'all', depth: 60 },
  allpro: { label: 'First-team All-Pro selections', one: 'selection', many: 'selections', group: 'all', depth: 40 },
  rings: { label: 'Super Bowl titles', one: 'title', many: 'titles', group: 'all', depth: 80 },
};

// Career-scope stats that are complete all-time careers. Everything else in
// the career file counts games since 1999 and says so.
export const ALL_TIME_STATS = new Set(['pass_yds', 'pass_td', 'rush_yds', 'rush_td', 'rec_yds', 'rec_td', 'rec', 'scrim_yds', 'total_td', 'sacks', 'ints']);

export const TEAM_STATS = {
  wins_since99: { label: 'Regular-season wins since 1999', one: 'win', many: 'wins' },
  wins_2000s: { label: 'Regular-season wins in the 2000s', one: 'win', many: 'wins' },
  wins_2010s: { label: 'Regular-season wins in the 2010s', one: 'win', many: 'wins' },
  wins_2020s: { label: 'Regular-season wins in the 2020s', one: 'win', many: 'wins' },
  wins_last5: { label: 'Wins over the last five seasons', one: 'win', many: 'wins' },
  po_wins_since2000: { label: 'Playoff wins since 2000', one: 'win', many: 'wins' },
  po_wins_alltime: { label: 'All-time playoff wins', one: 'win', many: 'wins' },
  po_apps_since99: { label: 'Playoff appearances since 1999', one: 'appearance', many: 'appearances' },
  sb_apps: { label: 'Super Bowl appearances', one: 'appearance', many: 'appearances' },
  sb_wins: { label: 'Super Bowl wins', one: 'win', many: 'wins' },
  div_titles_since02: { label: 'Division titles since 2002', one: 'title', many: 'titles' },
  drought: { label: 'Seasons since their last playoff trip', one: 'season', many: 'seasons', note: '0 if they made the last playoffs' },
  season_wins: { label: 'Regular-season wins in {Y}', one: 'win', many: 'wins', season: true },
  season_pf: { label: 'Points scored in {Y}', one: 'pt', many: 'pts', season: true },
  season_pa: { label: 'Points allowed in {Y}', one: 'pt', many: 'pts', season: true },
};

// ---------------------------------------------------------------- scopes

// badge: regular season / postseason, shown on every round so the label
// always matches the games behind the number.
export const SCOPE_KINDS = {
  season: { badge: 'Regular season', depth: 1 },
  post: { badge: 'Postseason', depth: 0.45 },
  decade: { badge: 'Regular season', depth: 1.6 },
  career: { badge: 'Regular season', depth: 1.8 },
  postcareer: { badge: 'Postseason', depth: 1.3 },
  superbowl: { badge: 'Super Bowl', depth: 0.5 },
  franchise: { badge: 'Regular season', depth: 0.3 }, // one team's share of the league
  rookie: { badge: 'Regular season', depth: 0.8 },
  final: { badge: 'Regular season', depth: 0.8 },
  peak: { badge: 'Regular season', depth: 1.6 },
  bestgame: { badge: 'Regular season', depth: 1.6 },
  honors: { badge: 'Career honors', depth: 1.4 },
  team: { badge: 'Franchises', depth: 1 },
};

// ---------------------------------------------------------------- eligibility

// test(p, param): p is a player record from players.json.
// scopes/groups: which rounds the rule makes sense for.
export const RESTRICTIONS = {
  'drafted-2011': { fail: 'Drafted in 2010 or earlier', label: 'Drafted after 2010', test: p => p.draftYear > 2010, scopes: ['career', 'peak', 'bestgame', 'rookie', 'decade', 'postcareer', 'honors'] },
  undrafted: { fail: 'Was drafted', label: 'Undrafted players only', test: p => p.draftYear === -1, scopes: ['career', 'peak', 'bestgame', 'decade', 'season', 'postcareer'] },
  'first-round': { fail: 'Not a first-round pick', label: 'First-round picks only', test: p => p.draftRound === 1, scopes: ['career', 'peak', 'decade', 'season', 'rookie', 'honors', 'postcareer'] },
  'day-two-plus': { fail: 'First-round pick or undrafted', label: 'Drafted outside the first round', test: p => p.draftRound > 1, scopes: ['career', 'peak', 'decade', 'season', 'honors', 'postcareer', 'bestgame'] },
  'seventh-round': { fail: 'Not a seventh-round pick', label: 'Seventh-round picks only', test: p => p.draftRound === 7, scopes: ['career', 'decade'] },
  class: { fail: 'Not in the {P} draft class', label: 'The {P} draft class', param: 'draftClass', test: (p, y) => p.draftYear === y, scopes: ['career', 'rookie', 'peak', 'honors'] },
  franchise: { fail: 'Never played for the {P}', label: 'Played for the {P}', param: 'team', test: (p, f) => p.teams.includes(f), scopes: ['career', 'peak', 'bestgame', 'postcareer', 'honors'] },
  retired: { fail: 'Still active', label: 'Retired players only', test: p => !p.active, scopes: ['career', 'peak', 'bestgame', 'postcareer', 'honors', 'decade'] },
  active: { fail: 'Not active', label: 'Active players only', test: p => p.active, scopes: ['career', 'peak', 'bestgame', 'postcareer', 'honors', 'decade'] },
  'no-ring': { fail: 'Won a ring, or career began before 1999', label: 'Never won a Super Bowl', test: p => p.from >= 1999 && p.rings === 0, scopes: ['career', 'peak', 'bestgame', 'decade'], note: 'Careers that began in 1999 or later' },
  'no-qb': { fail: 'Quarterback', label: 'No quarterbacks', test: p => p.pos !== 'QB', groups: ['rush', 'skill'] },
  journeyman: { fail: 'Played for one franchise', label: 'Played for 2+ franchises', test: p => p.teams.length >= 2, scopes: ['career', 'peak'] },
  'four-teams': { fail: 'Played for fewer than 4 franchises', label: 'Played for 4+ franchises', test: p => p.teams.length >= 4, scopes: ['career'] },
  'no-probowl': { fail: 'Made a Pro Bowl, or no Pro Bowl record', label: 'Never made a Pro Bowl', test: p => p.draftYear >= 1980 && p.probowls === 0, scopes: ['career', 'peak', 'postcareer'], note: 'Drafted players, 1980 on' },
  'pos-qb': { fail: 'Not a quarterback', label: 'Quarterbacks only', test: p => p.pos === 'QB', groups: ['rush', 'skill', 'all'] },
  'pos-rb': { fail: 'Not a running back', label: 'Running backs only', test: p => p.pos === 'RB', groups: ['rec', 'skill', 'all'] },
  'pos-wr': { fail: 'Not a wide receiver', label: 'Wide receivers only', test: p => p.pos === 'WR', groups: ['rush', 'skill', 'all'] },
  'pos-te': { fail: 'Not a tight end', label: 'Tight ends only', test: p => p.pos === 'TE', groups: ['rec', 'skill', 'all'] },
  'pos-fb': { fail: 'Not a fullback', label: 'Fullbacks only', test: p => p.pos === 'FB', groups: ['rush', 'rec', 'skill', 'all'] },
  'pos-def': { fail: 'Not a defensive player', label: 'Defensive players only', test: p => ['DE', 'DT', 'LB', 'CB', 'S'].includes(p.pos), groups: ['all', 'ret'] },
};

// ---------------------------------------------------------------- packs

// A rule offers stats in a scope at a difficulty tier (1 easiest .. 5).
// scope forms: season:recent | season:any | season:old | post:last | post:any |
// decade | career | postcareer | superbowl | franchise | rookie | final |
// peak | bestgame | honors | team | team:season
// restrict: always attach one of these rules (Sicko).
const CLASSIC = ['pass_yds', 'pass_td', 'rush_yds', 'rush_td', 'rec_yds', 'rec_td', 'rec', 'scrim_yds', 'total_td', 'sacks', 'ints'];

export const PACKS = [
  {
    id: 'classic', name: 'Classic', blurb: 'Yards, touchdowns and the stats every fan knows.',
    rules: [
      { scope: 'season:recent', stats: [...CLASSIC, 'ppr'], tier: 1, weight: 3 },
      { scope: 'career', stats: CLASSIC, tier: 1, weight: 3 },
      { scope: 'decade', stats: CLASSIC, tier: 2, weight: 1 },
    ],
  },
  {
    id: 'deep', name: 'Deep Cuts', blurb: '100-yard games, career highs, return yards and other film-room numbers.',
    rules: [
      { scope: 'career', stats: ['g100rec', 'g100rush', 'g300pass', 'g400pass', 'gmulti_td', 's1000rec', 's1000rush', 's4000pass', 's10sack', 'qb_wins', 'qb_starts'], tier: 3, weight: 3 },
      { scope: 'career', stats: ['ret_yds', 'fum_lost', 'sacks_taken', 'def_td', 'cmp', 'carries', 'targets', 'tackles', 'ff', 'fg', 'seasons', 'franchises'], tier: 4, weight: 2 },
      { scope: 'peak', stats: ['pass_yds', 'pass_td', 'rec_yds', 'rush_yds', 'rush_td', 'rec_td', 'ppr', 'sacks'], tier: 2, weight: 3 },
      { scope: 'bestgame', stats: ['best_rec_yds', 'best_rush_yds', 'best_pass_yds', 'best_td'], tier: 3, weight: 2 },
      { scope: 'rookie', stats: ['pass_td', 'pass_yds', 'rec_yds', 'rush_yds', 'scrim_yds', 'sacks', 'ppr'], tier: 3, weight: 2 },
      { scope: 'final', stats: ['scrim_yds', 'pass_yds', 'rec_yds', 'rush_yds'], tier: 4, weight: 1 },
      { scope: 'season:any', stats: ['cmp', 'carries', 'targets', 'tackles', 'ff', 'fg', 'ret_yds', 'fum_lost', 'sacks_taken', 'def_td', 'pass_int'], tier: 4, weight: 2 },
    ],
  },
  {
    id: 'playoffs', name: 'Playoff Football', blurb: 'January legends: postseason runs, Super Bowls and rings.',
    rules: [
      { scope: 'post:any', stats: ['pass_yds', 'pass_td', 'rush_yds', 'rec_yds', 'rec', 'total_td', 'sacks'], tier: 3, weight: 2 },
      { scope: 'postcareer', stats: ['pass_td', 'pass_yds', 'rec', 'rec_yds', 'rush_yds', 'rush_td', 'sacks', 'ints', 'total_td', 'pass_int'], tier: 2, weight: 3 },
      { scope: 'superbowl', stats: ['rec_yds', 'rush_yds', 'pass_yds', 'total_td', 'rec'], tier: 3, weight: 2 },
      { scope: 'career', stats: ['qb_po_wins', 'sb_games', 'cc_games'], tier: 2, weight: 2 },
      { scope: 'honors', stats: ['rings'], tier: 2, weight: 1 },
    ],
  },
  {
    id: 'history', name: 'Historical', blurb: 'All-time careers, decades and seasons from the vault.',
    rules: [
      { scope: 'career', stats: CLASSIC, tier: 2, weight: 3 },
      { scope: 'decade', stats: [...CLASSIC, 'ppr'], tier: 2, weight: 3 },
      { scope: 'season:old', stats: [...CLASSIC, 'ppr'], tier: 3, weight: 3 },
      { scope: 'honors', stats: ['probowls', 'allpro'], tier: 2, weight: 2 },
    ],
  },
  {
    id: 'teams', name: 'Team Knowledge', blurb: 'Draft franchises, not players: wins, titles and droughts.',
    entity: 'team',
    rules: [
      { scope: 'team', stats: ['wins_since99', 'wins_2000s', 'wins_2010s', 'wins_2020s', 'wins_last5', 'po_wins_since2000', 'po_wins_alltime', 'po_apps_since99', 'sb_apps', 'sb_wins', 'div_titles_since02', 'drought'], tier: 2, weight: 3 },
      { scope: 'team:season', stats: ['season_pf', 'season_pa', 'season_wins'], tier: 3, weight: 2 },
    ],
  },
  {
    id: 'sicko', name: 'Sicko', blurb: 'Seventh-rounders, journeymen and fullbacks. For degenerates only.',
    rules: [
      { scope: 'career', stats: ['rush_yds'], restrict: ['seventh-round'], extra: ['no-qb'], tier: 5, weight: 1 },
      { scope: 'career', stats: ['total_td', 'rec_yds', 'rush_yds'], restrict: ['undrafted'], tier: 4, weight: 2 },
      { scope: 'career', stats: ['rec_yds', 'rec_td'], restrict: ['day-two-plus'], tier: 4, weight: 1 },
      { scope: 'career', stats: ['total_td', 'rec_yds'], restrict: ['four-teams'], tier: 5, weight: 1 },
      { scope: 'career', stats: ['rec_yds_30', 'rush_yds_30'], tier: 5, weight: 1 },
      { scope: 'career', stats: ['qb_starts', 'qb_wins'], restrict: ['day-two-plus'], tier: 5, weight: 1 },
      { scope: 'franchise', stats: ['rec_yds', 'rush_yds', 'pass_yds', 'total_td', 'sacks'], tier: 4, weight: 3 },
      { scope: 'career', stats: ['pass_yds', 'pass_td'], restrict: ['no-probowl'], tier: 5, weight: 1 },
      { scope: 'career', stats: ['total_td', 'rec', 'rush_yds'], restrict: ['pos-fb'], tier: 5, weight: 1 },
      { scope: 'decade', stats: ['rec_td', 'rec_yds'], restrict: ['pos-te'], tier: 4, weight: 1 },
      { scope: 'career', stats: ['rush_yds'], restrict: ['pos-qb'], tier: 3, weight: 1 },
      { scope: 'career', stats: ['rec_yds'], restrict: ['pos-rb'], tier: 3, weight: 1 },
      { scope: 'career', stats: ['def_td', 'ints'], restrict: ['pos-def'], tier: 4, weight: 1 },
    ],
  },
];

// ---------------------------------------------------------------- difficulty

// tier: highest pack tier offered. restrict: chance a random eligibility rule
// joins the round. depth: how deep into the leaderboard targets are drawn.
export const DIFFICULTIES = {
  rookie: { name: 'Rookie', blurb: 'Big names, small rosters.', tier: 2, restrict: 0.05, depth: 0.6, each: [2, 3] },
  pro: { name: 'Pro', blurb: 'The default. Some curveballs.', tier: 3, restrict: 0.25, depth: 1, each: [3, 5] },
  allpro: { name: 'All-Pro', blurb: 'Deeper stats, more rules.', tier: 4, restrict: 0.45, depth: 1.5, each: [3, 6] },
  hof: { name: 'Hall of Fame', blurb: 'Only true ball knowers survive.', tier: 5, restrict: 0.65, depth: 2.2, each: [4, 8] },
};

// ---------------------------------------------------------------- modes

export const MODES = {
  classic: { name: 'Classic', tag: 'The original', blurb: 'Closest to the line wins. Over or under, it doesn’t matter.', scoring: 'closest' },
  pir: { name: 'Price Is Right', tag: 'Don’t go over', blurb: 'Closest without going over. Overshoot and you bust.', scoring: 'under' },
  redzone: { name: 'RedZone', tag: 'Shot clock', blurb: 'Every pick is on a clock. Run out and the commish picks for you.', scoring: 'closest', timer: 'pick' },
  sicko: { name: 'Sicko Bowl', tag: 'Obscure only', blurb: 'Deep cuts, journeymen and seventh-rounders. No casuals.', scoring: 'closest', packs: ['sicko', 'deep'] },
  noeasy: { name: 'No Easy Answers', tag: 'Stars banned', blurb: 'The obvious top players are banned every round.', scoring: 'closest', ban: true },
  gauntlet: { name: 'Gridiron Gauntlet', tag: '5 rounds', blurb: 'Five rounds, each harder than the last. Points stack up.', scoring: 'points', rounds: 5 },
  daily: { name: 'Daily Drive', tag: 'Same for everyone', blurb: 'One challenge a day, identical for every player.', scoring: 'closest', daily: true },
  twominute: { name: 'Two-Minute Drill', tag: 'One clock', blurb: 'Two minutes on your clock for the whole draft.', scoring: 'closest', timer: 'bank' },
};
export const MODE_ORDER = ['classic', 'daily', 'pir', 'redzone', 'noeasy', 'gauntlet', 'twominute', 'sicko'];

// ---------------------------------------------------------------- titles

export const TITLES = [
  { id: 'rookie-card', name: 'Rookie Card', blurb: 'Finish your first game.', test: s => s.games >= 1 },
  { id: 'ball-knower', name: 'Ball Knower', blurb: 'Win 5 rounds.', test: s => s.wins >= 5 },
  { id: 'film-grinder', name: 'Film Grinder', blurb: 'Play 25 rounds.', test: s => s.rounds >= 25 },
  { id: 'stat-merchant', name: 'Stat Merchant', blurb: 'Finish within 1% of the line.', test: s => s.bestPct <= 1 },
  { id: 'dead-on', name: 'Dead On', blurb: 'Hit the line exactly.', test: s => s.exact >= 1 },
  { id: 'heater', name: 'On a Heater', blurb: 'Win 3 rounds in a row.', test: s => s.bestStreak >= 3 },
  { id: 'sicko', name: 'Certified Sicko', blurb: 'Win a Sicko Bowl round.', test: s => (s.modeWins.sicko || 0) >= 1 },
  { id: 'iron-man', name: 'Iron Man', blurb: 'Win a Gridiron Gauntlet.', test: s => s.gauntletWins >= 1 },
  { id: 'first-ballot', name: 'First Ballot', blurb: 'Win 25 rounds.', test: s => s.wins >= 25 },
  { id: 'franchise', name: 'Franchise Tag', blurb: 'Win a series.', test: s => s.seriesWins >= 1 },
];

// ---------------------------------------------------------------- nicknames

// Common nicknames resolve to the player's name in search.
export const NICKNAMES = {
  megatron: 'Calvin Johnson', 'beast mode': 'Marshawn Lynch', gronk: 'Rob Gronkowski', tb12: 'Tom Brady',
  'prime time': 'Deion Sanders', primetime: 'Deion Sanders', sweetness: 'Walter Payton', 'the bus': 'Jerome Bettis',
  cmc: 'Christian McCaffrey', obj: 'Odell Beckham Jr.', 'big ben': 'Ben Roethlisberger', 'matty ice': 'Matt Ryan',
  'the sheriff': 'Peyton Manning', ochocinco: 'Chad Johnson', to: 'Terrell Owens', 'beast': 'Marshawn Lynch',
  'night train': 'Night Train Lane', 'mean joe': 'Joe Greene', 'bo': 'Bo Jackson', 'pacman': 'Adam Jones',
  'revis island': 'Darrelle Revis', 'deebo': 'Deebo Samuel', 'hollywood': 'Marquise Brown', 'sauce': 'Ahmad Gardner',
  'jj watt': 'J.J. Watt', 'tj watt': 'T.J. Watt', 'dk': 'DK Metcalf', 'ajb': 'A.J. Brown', 'cj2k': 'Chris Johnson',
  'mjd': 'Maurice Jones-Drew', 'lt': 'LaDainian Tomlinson', 'ap': 'Adrian Peterson', 'purple jesus': 'Adrian Peterson',
  'the gunslinger': 'Brett Favre', 'joe cool': 'Joe Montana', 'broadway joe': 'Joe Namath', 'the fridge': 'William Perry', 'tyreek': 'Tyreek Hill', 'cheetah': 'Tyreek Hill', 'king henry': 'Derrick Henry', 'gronkowski': 'Rob Gronkowski',
  'boomer': 'Boomer Esiason', 'jet': 'Jahmyr Gibbs', 'saquon': 'Saquon Barkley', 'ja marr': "Ja'Marr Chase",
  'kitty': 'George Kittle', 'snacks': 'Damon Harrison', 'honey badger': 'Tyrann Mathieu',
};
