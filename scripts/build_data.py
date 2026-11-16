#!/usr/bin/env python3
"""Build Line to Gain's data files from nflverse + committed Wikipedia snapshots.

Stdlib only; runs daily in the GitHub Action. Output (all under <out_dir>):

  meta.json            version, seasons, every scope with its per-stat depth
  players.json         one row per player: identity, draft, teams, accolades
  teams.json           franchise records and per-season team stats
  scopes/<id>.json     sparse per-player stat values for one aggregation:
                         season-YYYY, post-YYYY, decade-2000s/2010s/2020s,
                         career, postcareer, superbowl, rookie, final, peak,
                         bestgame, franchise-XXX

Coverage rules (the client labels every round with these):
  - Per-game, per-season and team data start with the 1999 season.
  - "career" classic stats (yards, TDs, receptions, sacks, INTs) are complete
    all-time careers, merged from season files, draft_picks and legends.json.
  - Every other career-scope stat counts games since 1999 only, and the game
    says so in the label.

Usage: build_data.py <cache_dir> <legends.json> <wiki_teams.json> <out_dir>
"""
import csv
import hashlib
import json
import os
import re
import sys
import time
import unicodedata
import urllib.error
import urllib.request
from collections import defaultdict

BASE = "https://github.com/nflverse/nflverse-data/releases/download"
FIRST = 1999

# ---------------------------------------------------------------- stat columns

# Per-game/season stats: key -> nflverse columns summed into it.
GAME_STATS = {
    "pass_yds": ["passing_yards"], "pass_td": ["passing_tds"], "pass_int": ["passing_interceptions"],
    "cmp": ["completions"], "rush_yds": ["rushing_yards"], "rush_td": ["rushing_tds"],
    "carries": ["carries"], "rec_yds": ["receiving_yards"], "rec_td": ["receiving_tds"],
    "rec": ["receptions"], "targets": ["targets"], "sacks": ["def_sacks"],
    "ints": ["def_interceptions"], "tackles": ["def_tackles_solo", "def_tackle_assists"],
    "ff": ["def_fumbles_forced"], "fg": ["fg_made"], "ppr": ["fantasy_points_ppr"],
    "def_td": ["def_tds"], "st_td": ["special_teams_tds"],
    "ret_yds": ["punt_return_yards", "kickoff_return_yards"],
    "fum_lost": ["sack_fumbles_lost", "rushing_fumbles_lost", "receiving_fumbles_lost"],
    "sacks_taken": ["sacks_suffered"],
}
GKEYS = list(GAME_STATS) + ["games"]
GI = {k: i for i, k in enumerate(GKEYS)}

# Career stats traceable before 1999: key -> season column, draft_picks column.
CAREER_STATS = {
    "pass_yds": ("passing_yards", "pass_yards"), "pass_td": ("passing_tds", "pass_tds"),
    "rush_yds": ("rushing_yards", "rush_yards"), "rush_td": ("rushing_tds", "rush_tds"),
    "rec_yds": ("receiving_yards", "rec_yards"), "rec_td": ("receiving_tds", "rec_tds"),
    "rec": ("receptions", "receptions"), "sacks": ("def_sacks", "def_sacks"),
    "ints": ("def_interceptions", "def_ints"),
}
CKEYS = list(CAREER_STATS)

POS_FIX = {"HB": "RB", "BACK": "RB", "NT": "DT", "OLB": "LB", "ILB": "LB", "MLB": "LB",
           "SAF": "S", "FS": "S", "SS": "S", "T": "OL", "G": "OL", "C": "OL", "OT": "OL",
           "OG": "OL", "DL": "DE", "EDGE": "DE", "DB": "CB"}

# ---------------------------------------------------------------- franchises


def franchise(code, season):
    """Map any team code nflverse uses, in any season, to today's franchise."""
    c = (code or "").upper()
    if c in ("BAL",):
        return "IND" if season <= 1983 else "BAL"
    if c in ("HOU",):
        return "TEN" if season <= 1996 else "HOU"
    if c == "STL":
        return "ARI" if season <= 1987 else "LA"
    return {
        "ARZ": "ARI", "PHO": "ARI", "BLT": "BAL", "BOS": "NE", "CLV": "CLE", "HST": "HOU",
        "SL": "LA", "RAM": "LA", "LAR": "LA", "OAK": "LV", "RAI": "LV", "LVR": "LV",
        "SD": "LAC", "SDG": "LAC", "JAC": "JAX", "WSH": "WAS", "GNB": "GB", "KAN": "KC",
        "NWE": "NE", "NOR": "NO", "SFO": "SF", "TAM": "TB",
    }.get(c, c)


FRANCHISES = ["ARI", "ATL", "BAL", "BUF", "CAR", "CHI", "CIN", "CLE", "DAL", "DEN", "DET", "GB",
              "HOU", "IND", "JAX", "KC", "LA", "LAC", "LV", "MIA", "MIN", "NE", "NO", "NYG",
              "NYJ", "PHI", "PIT", "SEA", "SF", "TB", "TEN", "WAS"]

# ---------------------------------------------------------------- helpers


def fetch(cache_dir, tag, name, fresh=False):
    """Download a release asset once (or again when fresh). None on a 404."""
    path = os.path.join(cache_dir, name)
    if not fresh and os.path.exists(path) and os.path.getsize(path):
        return path
    try:
        with urllib.request.urlopen(f"{BASE}/{tag}/{name}", timeout=180) as r:
            body = r.read()
    except urllib.error.HTTPError as e:
        if e.code == 404:
            return None
        raise
    with open(path, "wb") as f:
        f.write(body)
    return path


def fetch_url(cache_dir, url, name, fresh=False):
    path = os.path.join(cache_dir, name)
    if not fresh and os.path.exists(path) and os.path.getsize(path):
        return path
    with urllib.request.urlopen(url, timeout=180) as r:
        body = r.read()
    with open(path, "wb") as f:
        f.write(body)
    return path


def rows(path):
    with open(path, encoding="utf8", newline="") as f:
        yield from csv.DictReader(f)


def num(v):
    try:
        x = float(v)
    except (TypeError, ValueError):
        return 0
    return int(x) if x == int(x) else x


def tidy(v):
    v = round(v, 1)
    return int(v) if v == int(v) else v


def norm(name):
    s = unicodedata.normalize("NFKD", name or "")
    s = "".join(c for c in s if not unicodedata.combining(c)).lower()
    s = re.sub(r"[^a-z0-9 ]", "", s.replace("-", " "))
    s = re.sub(r"\b(jr|sr|ii|iii|iv|v)\b", "", s)
    return re.sub(r"\s+", " ", s).strip()


def pos_of(p):
    p = (p or "").strip().upper()
    return POS_FIX.get(p, p) or "—"


def pos_group(pos):
    for group in ("QB", "RB FB", "WR TE", "DE DT LB", "CB S", "K P LS", "OL"):
        if pos in group.split():
            return group
    return pos


def check_columns(path):
    """Fail loudly if nflverse renames a column, instead of writing zeros."""
    with open(path, encoding="utf8", newline="") as f:
        header = set(next(csv.reader(f)))
    missing = {c for cols in GAME_STATS.values() for c in cols} - header
    if missing:
        raise SystemExit(f"{os.path.basename(path)} is missing columns: {sorted(missing)}")


def game_vector(r):
    v = [sum(num(r.get(c)) for c in cols) for cols in GAME_STATS.values()]
    v.append(1)  # games
    return v


def add_into(target, v):
    for i, x in enumerate(v):
        target[i] += x


def scored_tds(v):
    return v[GI["rush_td"]] + v[GI["rec_td"]] + v[GI["st_td"]] + v[GI["def_td"]]


def age_on_sept1(birth, season):
    """Age at the start of a season, from 'YYYY-MM-DD'; None if unknown."""
    try:
        y, m, d = (int(x) for x in birth.split("-"))
    except (ValueError, AttributeError):
        return None
    return season - y - (1 if (m, d) > (9, 1) else 0)


def headshot_key(url):
    """Shrink NFL CDN headshot URLs; the client rebuilds them."""
    m = re.match(r"https://static\.www\.nfl\.com/image/(private|upload)/f_auto,q_auto/league/([A-Za-z0-9_]+)$", url or "")
    if not m:
        return ""
    return ("u:" if m.group(1) == "upload" else "") + m.group(2)


# ---------------------------------------------------------------- weekly pass


def load_games(path):
    """games.csv -> {game_id: row} plus completed-game list."""
    games = {}
    for r in rows(path):
        r["season"] = int(r["season"])
        r["done"] = r["home_score"] != "" and r["away_score"] != ""
        games[r["game_id"]] = r
    return games


def aggregate_weekly(paths, games):
    """One pass over every weekly file (REG + POST). Returns all per-player tallies."""
    A = {
        "reg": defaultdict(lambda: [0] * len(GKEYS)),       # (pid, season)
        "post": defaultdict(lambda: [0] * len(GKEYS)),      # (pid, season)
        "sb": defaultdict(lambda: [0] * len(GKEYS)),        # pid
        "fran": defaultdict(lambda: [0] * len(GKEYS)),      # (pid, franchise)
        "cc": defaultdict(int),                             # pid -> conference title games
        "thresh": defaultdict(lambda: defaultdict(int)),    # pid -> {key: count}
        "best": defaultdict(lambda: defaultdict(float)),    # pid -> {key: best}
        "teams": defaultdict(set),                          # pid -> franchises
        "info": {},                                         # pid -> (name, pos)
    }
    for season in sorted(paths):
        check_columns(paths[season])
        for r in rows(paths[season]):
            pid = r["player_id"]
            if not pid or not r["player_display_name"]:
                continue
            g = games.get(r["game_id"])
            kind = g["game_type"] if g else ("REG" if r["season_type"] == "REG" else "POST")
            v = game_vector(r)
            fr = franchise(r["team"], season)
            A["info"][pid] = (r["player_display_name"], pos_of(r["position"]))
            A["teams"][pid].add(fr)
            if kind == "REG":
                add_into(A["reg"][(pid, season)], v)
                add_into(A["fran"][(pid, fr)], v)
                t, b = A["thresh"][pid], A["best"][pid]
                td = scored_tds(v)
                t["g100rec"] += v[GI["rec_yds"]] >= 100
                t["g100rush"] += v[GI["rush_yds"]] >= 100
                t["g300pass"] += v[GI["pass_yds"]] >= 300
                t["g400pass"] += v[GI["pass_yds"]] >= 400
                t["gmulti_td"] += td >= 2
                for key, val in (("best_rec_yds", v[GI["rec_yds"]]), ("best_rush_yds", v[GI["rush_yds"]]),
                                 ("best_pass_yds", v[GI["pass_yds"]]), ("best_td", td)):
                    b[key] = max(b[key], val)
            else:
                add_into(A["post"][(pid, season)], v)
                if kind == "SB":
                    add_into(A["sb"][pid], v)
                if kind == "CON":
                    A["cc"][pid] += 1
    return A


def qb_records(games):
    """Starting QB starts and wins, regular season and playoffs (1999+)."""
    out = defaultdict(lambda: defaultdict(int))
    for g in games.values():
        if not g["done"]:
            continue
        hs, as_ = int(g["home_score"]), int(g["away_score"])
        post = g["game_type"] != "REG"
        for qb, mine, theirs in ((g["home_qb_id"], hs, as_), (g["away_qb_id"], as_, hs)):
            if not qb:
                continue
            out[qb]["qb_po_starts" if post else "qb_starts"] += 1
            out[qb]["qb_po_wins" if post else "qb_wins"] += mine > theirs
    return out


def team_records(games, standings_path, wiki, last_done):
    """Franchise records. Every stat names its window in the client catalog."""
    t = {f: defaultdict(float) for f in FRANCHISES}
    by_season = defaultdict(lambda: {f: {"w": 0, "pf": 0, "pa": 0} for f in FRANCHISES})
    po_seasons = defaultdict(set)
    for g in games.values():
        if not g["done"]:
            continue
        s = g["season"]
        h, a = franchise(g["home_team"], s), franchise(g["away_team"], s)
        hs, as_ = int(g["home_score"]), int(g["away_score"])
        for me, them, pf, pa in ((h, a, hs, as_), (a, h, as_, hs)):
            won = pf > pa
            if g["game_type"] == "REG":
                rec = by_season[s][me]
                rec["w"] += won
                rec["pf"] += pf
                rec["pa"] += pa
                if s <= last_done:
                    t[me]["wins_since99"] += won
                    decade = f"wins_{s // 10 * 10}s"
                    t[me][decade] += won
                    if s > last_done - 5:
                        t[me]["wins_last5"] += won
            else:
                po_seasons[me].add(s)
                if s >= 2000:
                    t[me]["po_wins_since2000"] += won
                if g["game_type"] == "SB":
                    t[me]["sb_apps_since99"] += 1
                    t[me]["sb_wins_since99"] += won
    for f in FRANCHISES:
        seasons = po_seasons[f]
        t[f]["po_apps_since99"] = len([s for s in seasons if s <= last_done])
        t[f]["drought"] = last_done - max(seasons) if seasons else last_done - FIRST + 1
    for r in rows(standings_path):
        s = int(r["season"])
        if s <= last_done and r["div_rank"] == "1":
            t[franchise(r["team"], s)]["div_titles_since02"] += 1
    for f, rec in wiki.items():
        for k in ("sb_apps", "sb_wins", "po_wins_alltime"):
            if k in rec:
                t[f][k] = rec[k]
    return t, by_season


# ---------------------------------------------------------------- careers


def new_person(key, name, pos, start, end):
    return {"key": key, "name": name, "pos": pos, "from": start, "to": end, "gsis": "", "pfr": "",
            "sums": dict.fromkeys(CKEYS, 0), "draft": None, "draft_to": 0, "draft_meta": None,
            "legend": None, "active": False, "partial": False}


def build_careers(cache_dir, reg_paths, current, players_csv):
    people = {}
    for y in sorted(reg_paths):
        for r in rows(reg_paths[y]):
            pid = r["player_id"]
            if not pid or not r["player_display_name"]:
                continue
            p = people.get(pid)
            if p is None:
                p = people[pid] = new_person(pid, r["player_display_name"], pos_of(r["position"]), y, y)
                p["gsis"] = pid
            p["to"], p["name"] = y, r["player_display_name"]
            p["active"] = y == current
            for k in CKEYS:
                p["sums"][k] += num(r.get(CAREER_STATS[k][0]))
    for pid, p in people.items():
        d = players_csv.get(pid, {}).get("rookie")
        p["partial"] = d < FIRST if d else p["from"] <= FIRST + 2
        p["pre99"] = p["partial"]

    by_name = defaultdict(list)
    for p in people.values():
        by_name[norm(p["name"])].append(p)

    for r in rows(fetch(cache_dir, "draft_picks", "draft_picks.csv", fresh=True)):
        vals = {k: num(r.get(CAREER_STATS[k][1])) for k in CKEYS}
        start, end = int(r["season"]), int(float(r["to"] or r["season"]))
        meta = {"year": start, "round": int(r["round"] or 0), "pick": int(r["pick"] or 0),
                "team": franchise(r["team"], start), "probowls": int(num(r["probowls"])),
                "allpro": int(num(r["allpro"])), "hof": r["hof"] in ("TRUE", "True", "1")}
        p = people.get(r["gsis_id"])
        if p is None:
            group = pos_group(pos_of(r["position"]))
            for c in by_name.get(norm(r["pfr_player_name"]), []):
                if (c["draft_meta"] is None and c["from"] <= end + 1 and c["to"] >= start - 1
                        and pos_group(c["pos"]) == group):
                    p = c
                    break
        if p is None:
            if not any(vals.values()):
                continue
            key = f"d:{r['pfr_player_id'] or norm(r['pfr_player_name'])}:{start}"
            p = people[key] = new_person(key, r["pfr_player_name"], pos_of(r["position"]), start, end)
            by_name[norm(p["name"])].append(p)
        p["draft_meta"] = meta
        p["gsis"] = p["gsis"] or r["gsis_id"]
        p["pfr"] = r["pfr_player_id"]
        if any(vals.values()):
            p["draft"], p["draft_to"], p["partial"] = vals, end, False
        p["from"], p["to"] = min(p["from"], start), max(p["to"], end)
    return people, by_name


def legend_match(L, candidates):
    """A draft_picks 'Reggie White' nose tackle must not absorb the Hall of
    Famer, so drafted candidates need plausible numbers and season-only
    candidates must sit inside the legend's career."""
    start, end = L.get("from"), L.get("to")
    best, best_score = None, -1
    for c in candidates:
        if start and end and not (c["from"] <= end + 1 and c["to"] >= start - 1):
            continue
        if c["draft"] is not None:
            have = {k: max(c["sums"][k], c["draft"][k]) for k in CKEYS}
            ok = all(have[k] >= 0.8 * v for k, v in L["stats"].items() if v >= 5)
        else:
            ok = not (start and end) or (start <= c["from"] and c["to"] <= end)
        if ok:
            score = sum(abs(c["sums"][k]) for k in CKEYS)
            if score > best_score:
                best, best_score = c, score
    return best


def add_legends(path, people, by_name):
    with open(path, encoding="utf8") as f:
        legends = json.load(f)
    for L in legends:
        start, end = L.get("from"), L.get("to")
        p = legend_match(L, by_name.get(norm(L["name"]), []))
        if p is None:
            key = f"w:{norm(L['name'])}:{start or 0}"
            p = people[key] = new_person(key, L["name"], pos_of(L.get("pos")), start or 0, end or 0)
            by_name[norm(L["name"])].append(p)
        p["legend"], p["partial"] = L["stats"], False
        if start:
            p["from"] = min(p["from"] or start, start)
            p["to"] = max(p["to"], end or 0)


def career_value(p, k):
    sums = p["sums"][k]
    draft = p["draft"][k] if p["draft"] else 0
    legend = (p["legend"] or {}).get(k)
    if p["active"]:
        return max(sums, draft, legend or 0)
    if legend is not None:
        return legend
    if draft and p["draft_to"] >= p["to"]:
        return draft
    return max(sums, draft) if draft else sums


# ---------------------------------------------------------------- rosters


def roster_facts(cache_dir, current, last_post, champions, people):
    """Franchises played for (1966+) and Super Bowl titles (1999+) from rosters.

    Rosters carry player ids from about 1991; earlier rows are matched by name,
    and only when exactly one known player of that name fits the season.
    """
    by_gsis = {p["gsis"]: p for p in people.values() if p["gsis"]}
    by_name = defaultdict(list)
    for p in people.values():
        by_name[norm(p["name"])].append(p)
    teams = defaultdict(set)
    rings = defaultdict(int)
    for y in range(1966, current + 1):
        path = fetch(cache_dir, "rosters", f"roster_{y}.csv", fresh=y >= current - 1)
        if not path:
            continue
        champ = champions.get(y)
        for r in rows(path):
            fr = franchise(r["team"], y)
            p = by_gsis.get(r["gsis_id"]) if r["gsis_id"] else None
            if p is None and not r["gsis_id"]:
                cands = [c for c in by_name.get(norm(r["full_name"]), []) if c["from"] <= y <= c["to"]]
                if len(cands) == 1:
                    p = cands[0]
            if p is None:
                continue
            if r["status"] not in ("DEV", "CUT", "EXE", "NWT"):
                teams[p["key"]].add(fr)
            on_title_roster = r["status"] in ("ACT", "RES", "INA") and (y < 2002 or r.get("game_type") == "SB")
            if champ and fr == champ and y >= FIRST and on_title_roster:
                rings[p["key"]] += 1
    return teams, rings


def wiki_team_facts(path):
    """Super Bowl and playoff records per franchise from the committed snapshot."""
    if not path or not os.path.exists(path):
        return {}, {}
    with open(path, encoding="utf8") as f:
        snap = json.load(f)
    return snap.get("franchises", {}), {int(k): v for k, v in snap.get("champions", {}).items()}


# ---------------------------------------------------------------- output


def sparse(members_vals, keys, idx):
    """{key: [i, v, i, v, ...]} keeping only nonzero values."""
    out = {}
    for ki, k in enumerate(keys):
        flat = []
        for pid, vals in members_vals:
            v = vals[ki]
            if v:
                flat += [idx[pid], tidy(v)]
        out[k] = flat
    return out


def write_json(path, obj):
    os.makedirs(os.path.dirname(path), exist_ok=True)
    with open(path, "w", encoding="utf8") as f:
        json.dump(obj, f, ensure_ascii=False, separators=(",", ":"))


def find_seasons(cache_dir):
    year = time.gmtime().tm_year
    for y in (year, year - 1):
        path = fetch(cache_dir, "stats_player", f"stats_player_reg_{y}.csv", fresh=True)
        if path and os.path.getsize(path) > 1000:
            return y
    raise SystemExit("no current season file found")


def progress(cache_dir, season):
    path = fetch(cache_dir, "stats_player", f"stats_player_week_{season}.csv", fresh=True)
    per_week = defaultdict(int)
    for r in rows(path):
        if r.get("season_type") == "REG":
            per_week[int(r["week"])] += 1
    if not per_week:
        return 0, ""
    last = max(per_week)
    if last > 1 and per_week[last] < 0.5 * per_week[last - 1]:
        return last - 1, f"through part of Week {last}"
    return last, f"through Week {last}"


def main():
    cache_dir, legends_path, wiki_path, out_dir = sys.argv[1:5]
    os.makedirs(cache_dir, exist_ok=True)
    current = find_seasons(cache_dir)
    week_done, prog = progress(cache_dir, current)
    season_over = prog.endswith("Week 18")
    last_done = current if season_over else current - 1

    games = load_games(fetch(cache_dir, "schedules", "games.csv", fresh=True))
    standings = fetch_url(cache_dir, "https://raw.githubusercontent.com/nflverse/nfldata/master/data/standings.csv",
                          "standings.csv", fresh=True)
    teams_meta = list(rows(fetch(cache_dir, "teams", "teams_colors_logos.csv")))

    fresh = lambda y: y >= current - 1
    reg_paths = {y: p for y in range(FIRST, current + 1)
                 if (p := fetch(cache_dir, "stats_player", f"stats_player_reg_{y}.csv", fresh=fresh(y)))}
    week_paths = {y: p for y in range(FIRST, current + 1)
                  if (p := fetch(cache_dir, "stats_player", f"stats_player_week_{y}.csv", fresh=fresh(y)))}

    players_csv = {}
    by_pfr = {}
    for r in rows(fetch(cache_dir, "players", "players.csv", fresh=True)):
        rec = {"birth": r["birth_date"], "head": headshot_key(r["headshot"]), "status": r["status"],
               "rookie": int(num(r["rookie_season"])) or None, "last": int(num(r["last_season"])) or None,
               "draft_year": int(num(r["draft_year"])), "draft_round": int(num(r["draft_round"])),
               "draft_pick": int(num(r["draft_pick"])), "draft_team": r["draft_team"], "gsis": r["gsis_id"]}
        if r["gsis_id"]:
            players_csv[r["gsis_id"]] = rec
        if r["pfr_id"]:
            by_pfr[r["pfr_id"]] = rec

    print("weekly pass…", flush=True)
    A = aggregate_weekly(week_paths, games)
    qbs = qb_records(games)

    print("careers…", flush=True)
    people, by_name = build_careers(cache_dir, reg_paths, current, players_csv)
    add_legends(legends_path, people, by_name)

    wiki_fr, champions = wiki_team_facts(wiki_path)
    for g in games.values():  # nflverse is authoritative where it has the game
        if g["game_type"] == "SB" and g["done"]:
            s = g["season"]
            hs, as_ = int(g["home_score"]), int(g["away_score"])
            champions[s] = franchise(g["home_team"] if hs > as_ else g["away_team"], s)
    last_post = max(s for s in champions if s >= FIRST)

    # Every player who appears anywhere gets a row; weekly-only players too.
    for pid, (name, pos) in A["info"].items():
        if pid not in people:
            p = people[pid] = new_person(pid, name, pos, 0, 0)
            p["gsis"], p["partial"] = pid, True
            seasons = [s for (q, s) in A["reg"] if q == pid] or [s for (q, s) in A["post"] if q == pid]
            p["from"], p["to"] = min(seasons), max(seasons)

    print("rosters…", flush=True)
    roster_teams, rings = roster_facts(cache_dir, current, last_post, champions, people)

    reg_seasons = defaultdict(list)
    for (pid, s) in A["reg"]:
        reg_seasons[pid].append(s)

    keys = sorted(people, key=lambda k: (norm(people[k]["name"]), people[k]["from"]))
    idx = {k: i for i, k in enumerate(keys)}
    gsis_key = {people[k]["gsis"]: k for k in keys if people[k]["gsis"]}

    # ---- players.json
    prow = []
    for k in keys:
        p = people[k]
        pc = players_csv.get(p["gsis"]) or by_pfr.get(p["pfr"]) or {}
        dm = p["draft_meta"]
        if dm:
            dyear, dround, dpick, dteam = dm["year"], dm["round"], dm["pick"], dm["team"]
        elif pc.get("draft_round"):
            dyear, dround, dpick = pc["draft_year"], pc["draft_round"], pc["draft_pick"]
            dteam = franchise(pc.get("draft_team"), dyear)
        else:
            debut = pc.get("rookie") or p["from"]
            # Undrafted is knowable only where draft records exist (1980+).
            dyear, dround, dpick, dteam = (-1 if debut and debut >= 1980 else 0), 0, 0, ""
        gs = p["gsis"]
        tset = set(roster_teams.get(k, set())) | (A["teams"].get(gs, set()) if gs else set())
        active = bool(gs) and (current in reg_seasons.get(gs, []) or
                               (pc.get("status") in ("ACT", "RES", "INA", "PUP") and (pc.get("last") or 0) >= current))
        by = int(pc["birth"][:4]) if pc.get("birth") else 0
        prow.append([
            k,
            p["name"], p["pos"], p["from"], p["to"] if not active else current, int(active),
            dyear, dround, dpick, dteam, "|".join(sorted(tset)), pc.get("head", ""), by,
            dm["probowls"] if dm else -1, dm["allpro"] if dm else -1, int(dm["hof"]) if dm else 0,
            rings.get(k, 0),
        ])
    pcols = ["id", "name", "pos", "from", "to", "active", "draftYear", "draftRound", "draftPick",
             "draftTeam", "teams", "head", "birthYear", "probowls", "allpro", "hof", "rings"]

    scopes = {}

    def scope(sid, members_vals, keys_, label, kind, extra=None):
        mv = [(pid, vals) for pid, vals in members_vals if pid in idx]
        tags = (extra or {}).get("tags")
        scopes[sid] = {"label": label, "kind": kind, "keys": keys_, "m": [idx[p] for p, _ in mv],
                       "s": sparse(mv, keys_, idx), **({"tags": tags} if tags else {})}

    key_of = lambda pid: gsis_key.get(pid)

    # ---- seasons, postseasons, decades
    for s in sorted(reg_paths):
        mv = [(key_of(pid), v) for (pid, y), v in A["reg"].items() if y == s]
        scope(f"season-{s}", mv, GKEYS, f"{s} regular season", "season")
    post_years = sorted({y for (_, y) in A["post"]})
    for s in post_years:
        mv = [(key_of(pid), v) for (pid, y), v in A["post"].items() if y == s]
        scope(f"post-{s}", mv, GKEYS, f"{s} postseason", "post")
    for d in (2000, 2010, 2020):
        tot = defaultdict(lambda: [0] * len(GKEYS))
        for (pid, y), v in A["reg"].items():
            if d <= y <= d + 9:
                add_into(tot[pid], v)
        scope(f"decade-{d}s", [(key_of(p), v) for p, v in tot.items()], GKEYS, f"{d}s regular seasons", "decade")

    # ---- postseason career and Super Bowls
    pc_tot = defaultdict(lambda: [0] * len(GKEYS))
    for (pid, y), v in A["post"].items():
        add_into(pc_tot[pid], v)
    scope("postcareer", [(key_of(p), v) for p, v in pc_tot.items()], GKEYS, "Postseason since 1999", "postcareer")
    scope("superbowl", [(key_of(p), v) for p, v in A["sb"].items()], GKEYS, "Super Bowls since 1999", "superbowl")

    # ---- franchise totals
    for f in FRANCHISES:
        mv = [(key_of(pid), v) for (pid, fr), v in A["fran"].items() if fr == f]
        scope(f"franchise-{f}", mv, GKEYS, f"Regular season with {f} since 1999", "franchise")

    # ---- rookie, final, peak seasons
    rookie_mv, final_mv, peak_mv = [], [], []
    rookie_tags, final_tags = {}, {}
    for pid, seasons in reg_seasons.items():
        k = key_of(pid)
        if not k:
            continue
        rk = (players_csv.get(pid) or {}).get("rookie")
        if rk and rk >= FIRST and rk in seasons:
            rookie_mv.append((k, A["reg"][(pid, rk)]))
            rookie_tags[idx[k]] = rk
        last = max(seasons)
        if last < current and not prow[idx[k]][5]:
            final_mv.append((k, A["reg"][(pid, last)]))
            final_tags[idx[k]] = last
        best = [max(A["reg"][(pid, s)][i] for s in seasons) for i in range(len(GKEYS))]
        peak_mv.append((k, best))
    scope("rookie", rookie_mv, GKEYS, "Rookie season (1999+ rookies)", "rookie", {"tags": rookie_tags})
    scope("final", final_mv, GKEYS, "Final season played (1999+)", "final", {"tags": final_tags})
    scope("peak", peak_mv, GKEYS, "Best single season since 1999", "peak")

    best_keys = ["best_rec_yds", "best_rush_yds", "best_pass_yds", "best_td"]
    scope("bestgame", [(key_of(p), [b[k] for k in best_keys]) for p, b in A["best"].items()],
          best_keys, "Best single game since 1999", "bestgame")

    # ---- career: classic all-time + everything-since-1999
    extra_keys = ([k for k in GKEYS if k not in CKEYS] +
                  ["g100rec", "g100rush", "g300pass", "g400pass", "gmulti_td",
                   "s1000rec", "s1000rush", "s4000pass", "s10sack", "seasons",
                   "qb_starts", "qb_wins", "qb_po_starts", "qb_po_wins", "sb_games", "cc_games",
                   "franchises", "rec_yds_30", "rush_yds_30"])
    career_keys = CKEYS + extra_keys
    career_mv = []
    dropped = 0
    for k in keys:
        p = people[k]
        if p["partial"]:
            dropped += 1  # classic career can't be verified; still searchable elsewhere
            continue
        gs = p["gsis"]
        seasons = reg_seasons.get(gs, []) if gs else []
        tot = [0] * len(GKEYS)
        for s in seasons:
            add_into(tot, A["reg"][(gs, s)])
        t = A["thresh"].get(gs, {}) if gs else {}
        q = qbs.get(gs, {}) if gs else {}
        birth = (players_csv.get(gs) or {}).get("birth", "")
        r30 = [0, 0]
        for s in seasons:
            age = age_on_sept1(birth, s)
            if age is not None and age >= 30:
                v = A["reg"][(gs, s)]
                r30[0] += v[GI["rec_yds"]]
                r30[1] += v[GI["rush_yds"]]
        vals = [career_value(p, c) for c in CKEYS]
        vals += [tot[GI[x]] for x in GKEYS if x not in CKEYS]
        vals += [t.get("g100rec", 0), t.get("g100rush", 0), t.get("g300pass", 0), t.get("g400pass", 0),
                 t.get("gmulti_td", 0),
                 sum(A["reg"][(gs, s)][GI["rec_yds"]] >= 1000 for s in seasons),
                 sum(A["reg"][(gs, s)][GI["rush_yds"]] >= 1000 for s in seasons),
                 sum(A["reg"][(gs, s)][GI["pass_yds"]] >= 4000 for s in seasons),
                 sum(A["reg"][(gs, s)][GI["sacks"]] >= 10 for s in seasons),
                 len(seasons),
                 q.get("qb_starts", 0), q.get("qb_wins", 0), q.get("qb_po_starts", 0), q.get("qb_po_wins", 0),
                 A["sb"][gs][GI["games"]] if gs in A["sb"] else 0,
                 A["cc"].get(gs, 0),
                 len(prow[idx[k]][10].split("|")) if prow[idx[k]][10] else 0,
                 r30[0], r30[1]]
        career_mv.append((k, vals))
    scope("career", career_mv, career_keys, "Careers", "career")

    # ---- teams
    last_done_team = last_done
    trec, by_season = team_records(games, standings, wiki_fr, last_done_team)
    tm = {r["team_abbr"]: r for r in teams_meta}
    teams_out = {
        "teams": [{"id": f, "name": tm.get(f, {}).get("team_name", f), "nick": tm.get(f, {}).get("team_nick", f),
                   "conf": tm.get(f, {}).get("team_conf", ""), "div": tm.get(f, {}).get("team_division", ""),
                   "color": tm.get(f, {}).get("team_color", "#888888"),
                   "color2": tm.get(f, {}).get("team_color2", "#222222")} for f in FRANCHISES],
        "stats": {k: {f: tidy(trec[f].get(k, 0)) for f in FRANCHISES}
                  for k in sorted({k for f in FRANCHISES for k in trec[f]})},
        "seasons": {str(s): {f: [v["w"], v["pf"], v["pa"]] for f, v in recs.items()}
                    for s, recs in sorted(by_season.items())},
        "champions": {str(k): v for k, v in sorted(champions.items())},
        "lastDone": last_done,
    }

    # ---- write
    blob = json.dumps([prow, sorted(scopes)], separators=(",", ":"), ensure_ascii=False)
    version = hashlib.sha1((blob + json.dumps(teams_out, sort_keys=True)).encode()).hexdigest()[:10]
    write_json(os.path.join(out_dir, "players.json"), {"v": version, "cols": pcols, "rows": prow})
    write_json(os.path.join(out_dir, "teams.json"), {"v": version, **teams_out})
    meta_scopes = []
    for sid, sc in sorted(scopes.items()):
        counts = {k: len(sc["s"][k]) // 2 for k in sc["keys"]}
        derived = {}
        if all(x in sc["keys"] for x in ("rush_yds", "rec_yds")):
            members = set(sc["s"]["rush_yds"][::2]) | set(sc["s"]["rec_yds"][::2])
            derived["scrim_yds"] = len(members)
        if all(x in sc["keys"] for x in ("rush_td", "rec_td")):
            members = set(sc["s"]["rush_td"][::2]) | set(sc["s"]["rec_td"][::2])
            derived["total_td"] = len(members)
        write_json(os.path.join(out_dir, "scopes", f"{sid}.json"),
                   {"v": version, "keys": sc["keys"], "m": sc["m"], "s": sc["s"], **({"tags": sc["tags"]} if "tags" in sc else {})})
        meta_scopes.append({"id": sid, "kind": sc["kind"], "label": sc["label"], "players": len(sc["m"]),
                            "counts": {**counts, **derived}})
    meta = {"v": version, "built": time.strftime("%Y-%m-%d"), "current": current, "lastDone": last_done,
            "lastPost": last_post, "weekDone": week_done, "progress": prog, "seasonOver": season_over,
            "players": len(prow), "scopes": meta_scopes}
    write_json(os.path.join(out_dir, "meta.json"), meta)
    total = sum(os.path.getsize(os.path.join(dp, f)) for dp, _, fs in os.walk(out_dir) for f in fs)
    print(f"v{version}: {len(prow)} players, {len(scopes)} scopes, career dropped {dropped}, "
          f"{total // 1024} KB, current {current} ({prog}), last done {last_done}, last post {last_post}")


if __name__ == "__main__":
    main()
