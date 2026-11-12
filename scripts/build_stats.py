#!/usr/bin/env python3
"""Build the game's stat pools from nflverse + the committed data/legends.json.

Stdlib only (this runs in the scheduled GitHub Action). Writes one small file
per timeframe so the page only downloads the pool a round actually uses:

  meta.json          timeframe list, labels, and per-stat player counts
  pool-cur.json      this season so far          pool-last.json   last season
  pool-post.json     latest postseason           pool-postall.json playoffs since 1999
  pool-dec2000.json  2000-2009 (likewise 2010s and 2020s, regular season)
  pool-all.json      regular season careers, classic stats only

All-time careers come from three sources, each covering what the others can't:
  nflverse season files   every player, 1999 -> today (including active players)
  nflverse draft_picks    official career totals, players drafted since 1980
  data/legends.json       older legends and undrafted stars (see fetch_legends.py)

Summed season files drift slightly from official totals (Brees comes out 70
yards high), so retired players use the official figure and only active
players, whose official figures are stale, use the running sum.

Usage: build_stats.py <cache_dir> <legends.json> <out_dir>
"""
import csv
import json
import os
import re
import sys
import time
import unicodedata
import urllib.error
import urllib.request

BASE = "https://github.com/nflverse/nflverse-data/releases/download"
FIRST_SEASON = 1999

# Career stats: key -> nflverse season column, draft_picks column. Only these
# can be traced back past 1999, so they're the only ones offered all-time.
STATS = {
    "pass_yds": ("passing_yards", "pass_yards"),
    "pass_td": ("passing_tds", "pass_tds"),
    "rush_yds": ("rushing_yards", "rush_yards"),
    "rush_td": ("rushing_tds", "rush_tds"),
    "rec_yds": ("receiving_yards", "rec_yards"),
    "rec_td": ("receiving_tds", "rec_tds"),
    "rec": ("receptions", "receptions"),
    "sacks": ("def_sacks", "def_sacks"),
    "ints": ("def_interceptions", "def_ints"),
}
KEYS = list(STATS)

# Everything nflverse tracks per season: key -> columns summed into it.
SEASON_STATS = {
    "pass_yds": ["passing_yards"], "pass_td": ["passing_tds"],
    "pass_int": ["passing_interceptions"], "cmp": ["completions"],
    "rush_yds": ["rushing_yards"], "rush_td": ["rushing_tds"], "carries": ["carries"],
    "rec_yds": ["receiving_yards"], "rec_td": ["receiving_tds"], "rec": ["receptions"],
    "targets": ["targets"], "sacks": ["def_sacks"], "ints": ["def_interceptions"],
    "tackles": ["def_tackles_solo", "def_tackle_assists"], "ff": ["def_fumbles_forced"],
    "fg": ["fg_made"], "ppr": ["fantasy_points_ppr"],
}
SEASON_KEYS = list(SEASON_STATS)
# Stats the game builds from two others; meta.json counts them too.
DERIVED = {"scrim_yds": ("rush_yds", "rec_yds"), "total_td": ("rush_td", "rec_td")}

# Fold inconsistent position labels so the search rows read cleanly.
POS_FIX = {"HB": "RB", "BACK": "RB", "NT": "DT", "OLB": "LB", "ILB": "LB",
           "MLB": "LB", "SAF": "S", "FS": "S", "SS": "S", "T": "OL", "G": "OL",
           "C": "OL", "OT": "OL", "OG": "OL", "DL": "DE", "EDGE": "DE"}


def fetch(cache_dir, tag, name):
    """Download a release asset once. Returns its path, or None on a 404."""
    path = os.path.join(cache_dir, name)
    if os.path.exists(path) and os.path.getsize(path):
        return path
    try:
        with urllib.request.urlopen(f"{BASE}/{tag}/{name}", timeout=90) as r:
            body = r.read()
    except urllib.error.HTTPError as e:
        if e.code == 404:
            return None
        raise
    with open(path, "wb") as f:
        f.write(body)
    return path


def rows(path):
    with open(path, encoding="utf8", newline="") as f:
        return [r for r in csv.DictReader(f)]


def check_columns(path):
    """Fail loudly if nflverse renames a column, instead of writing zeros."""
    with open(path, encoding="utf8", newline="") as f:
        header = set(next(csv.reader(f)))
    needed = {c for cols in SEASON_STATS.values() for c in cols}
    missing = needed - header
    if missing:
        raise SystemExit(f"{os.path.basename(path)} is missing columns: {sorted(missing)}")


def tidy(v):
    """Round away float noise (fantasy points) and keep whole numbers ints."""
    v = round(v, 1)
    return int(v) if v == int(v) else v


def season_values(r):
    return [tidy(sum(num(r.get(c)) for c in cols)) for cols in SEASON_STATS.values()]


def player_rows(path):
    """Season rows, minus the unattributed rows nflverse leaves with no id."""
    return [r for r in rows(path) if r["player_id"] and r["player_display_name"]]


def num(v):
    try:
        x = float(v)
    except (TypeError, ValueError):
        return 0
    return int(x) if x == int(x) else x


def norm(name):
    s = unicodedata.normalize("NFKD", name)
    s = "".join(c for c in s if not unicodedata.combining(c)).lower()
    s = re.sub(r"[^a-z0-9 ]", "", s.replace("-", " "))
    s = re.sub(r"\b(jr|sr|ii|iii|iv|v)\b", "", s)
    return re.sub(r"\s+", " ", s).strip()


def pos_of(p):
    p = (p or "").strip().upper()
    return POS_FIX.get(p, p) or "—"


def pos_group(pos):
    for group in ("QB", "RB FB", "WR TE", "DE DT LB", "CB S DB", "K P LS", "OL"):
        if pos in group.split():
            return group
    return pos


def find_seasons(cache_dir):
    """Newest season with regular-season rows, plus the one before it."""
    year = time.gmtime().tm_year
    for y in (year, year - 1):
        path = fetch(cache_dir, "stats_player", f"stats_player_reg_{y}.csv")
        if path and player_rows(path):
            return y, y - 1
    raise SystemExit("no current season file found")


def progress(cache_dir, season):
    """Describe how far the season has got, e.g. 'through Week 8'."""
    path = fetch(cache_dir, "stats_player", f"stats_player_week_{season}.csv")
    if not path:
        return ""
    per_week = {}
    for r in rows(path):
        if r.get("season_type") == "REG":
            w = int(r["week"])
            per_week[w] = per_week.get(w, 0) + 1
    if not per_week:
        return ""
    last = max(per_week)
    # Thursday's game alone is a fraction of a normal week's rows.
    if last > 1 and per_week[last] < 0.5 * per_week[last - 1]:
        return f"through part of Week {last}"
    return f"through Week {last}"


def season_table(path):
    """Everyone who appeared, zeros included: a 0-sack linebacker is a legal
    (bad) pick, and hiding him would tell players he has no stats."""
    check_columns(path)
    out = [[r["player_display_name"], pos_of(r["position"]), r["recent_team"]] + season_values(r)
           for r in player_rows(path)]
    out.sort(key=lambda x: norm(x[0]))
    return out


def span_table(paths):
    """Totals across several seasons ({year: file}), tagged with the years played."""
    people = {}
    for year in sorted(paths):
        check_columns(paths[year])
        for r in player_rows(paths[year]):
            p = people.setdefault(r["player_id"], {"from": year, "sums": [0] * len(SEASON_KEYS)})
            p["to"], p["name"], p["pos"] = year, r["player_display_name"], pos_of(r["position"])
            p["sums"] = [a + b for a, b in zip(p["sums"], season_values(r))]
    out = []
    for p in people.values():
        span = f"{p['from']}–{str(p['to'])[2:]}" if p["to"] > p["from"] else str(p["from"])
        out.append([p["name"], p["pos"], span] + [tidy(v) for v in p["sums"]])
    out.sort(key=lambda x: norm(x[0]))
    return out


def counts(table, keys):
    """How many players have a positive total for each stat, so the game can
    tell before downloading a pool whether it holds enough for a big draft."""
    col = {k: i + 3 for i, k in enumerate(keys)}
    out = {k: sum(1 for r in table if r[col[k]] > 0) for k in keys}
    for k, parts in DERIVED.items():
        if all(p in col for p in parts):
            out[k] = sum(1 for r in table if sum(r[col[p]] for p in parts) > 0)
    return out


def new_person(name, pos, start, end):
    return {"name": name, "pos": pos, "from": start, "to": end,
            "sums": dict.fromkeys(KEYS, 0), "draft": None, "draft_to": 0,
            "legend": None, "active": False, "partial": False}


def careers(cache_dir, current):
    people = {}  # player id -> record
    for y in range(FIRST_SEASON, current + 1):
        path = fetch(cache_dir, "stats_player", f"stats_player_reg_{y}.csv")
        if not path:
            continue
        for r in player_rows(path):
            p = people.get(r["player_id"])
            if p is None:
                p = people[r["player_id"]] = new_person(
                    r["player_display_name"], pos_of(r["position"]), y, y)
            p["to"] = y
            p["name"] = r["player_display_name"]
            p["active"] = y == current
            for k in KEYS:
                p["sums"][k] += num(r.get(STATS[k][0]))

    # Anyone who debuted before 1999 is missing seasons until another source
    # supplies the full career.
    debut = {}
    for r in rows(fetch(cache_dir, "players", "players.csv")):
        try:
            debut[r["gsis_id"]] = int(float(r["rookie_season"]))
        except ValueError:
            pass
    for pid, p in people.items():
        d = debut.get(pid)
        p["partial"] = d < FIRST_SEASON if d else p["from"] <= FIRST_SEASON + 2
        p["pre99"] = p["partial"]

    by_name = {}
    for p in people.values():
        by_name.setdefault(norm(p["name"]), []).append(p)

    for r in rows(fetch(cache_dir, "draft_picks", "draft_picks.csv")):
        vals = {k: num(r.get(STATS[k][1])) for k in KEYS}
        if not any(vals.values()):
            continue
        start, end = int(r["season"]), int(float(r["to"] or r["season"]))
        p = people.get(r["gsis_id"])
        if p is None:
            # No id to join on. Same name and era isn't enough (a 1992 DB and
            # the Broncos WR are both Rod Smith), so the position must fit too.
            group = pos_group(pos_of(r["position"]))
            for c in by_name.get(norm(r["pfr_player_name"]), []):
                if (c["draft"] is None and c["from"] <= end + 1 and c["to"] >= start - 1
                        and pos_group(c["pos"]) == group):
                    p = c
                    break
        if p is None:
            p = people[f"draft:{r['pfr_player_id'] or r['pfr_player_name']}:{start}"] = new_person(
                r["pfr_player_name"], pos_of(r["position"]), start, end)
            by_name.setdefault(norm(p["name"]), []).append(p)
        p["draft"], p["draft_to"], p["partial"] = vals, end, False
        p["from"], p["to"] = min(p["from"], start), max(p["to"], end)
    return people, by_name


def legend_match(L, candidates):
    """Find L's record among same-named players, or None if there isn't one.

    Name alone isn't enough: draft_picks has a 1992 nose tackle called Reggie
    White with 4.5 sacks, who must not absorb the 198-sack Hall of Famer. His
    real 2000 season, by contrast, sits in a season-only record that does
    belong to the legend. So records with their own draft row must have
    plausible numbers, and season-only records must fit inside the career.
    """
    start, end = L.get("from"), L.get("to")
    best, best_score = None, -1
    for c in candidates:
        if start and end and not (c["from"] <= end + 1 and c["to"] >= start - 1):
            continue
        if c["draft"] is not None:
            have = {k: max(c["sums"][k], c["draft"][k]) for k in KEYS}
            ok = all(have[k] >= 0.8 * v for k, v in L["stats"].items() if v >= 5)
        else:
            ok = not (start and end) or (start <= c["from"] and c["to"] <= end)
        if ok:
            score = sum(abs(c["sums"][k]) for k in KEYS)
            if score > best_score:
                best, best_score = c, score
    return best


def add_legends(path, people, by_name):
    with open(path, encoding="utf8") as f:
        legends = json.load(f)
    matched = added = 0
    for L in legends:
        start, end = L.get("from"), L.get("to")
        p = legend_match(L, by_name.get(norm(L["name"]), []))
        if p is None:
            p = people[f"legend:{L['name']}"] = new_person(
                L["name"], pos_of(L.get("pos")), start or 0, end or 0)
            by_name.setdefault(norm(L["name"]), []).append(p)
            added += 1
        else:
            matched += 1
        p["legend"], p["partial"] = L["stats"], False
        if start:
            p["from"] = min(p["from"] or start, start)
            p["to"] = max(p["to"], end or 0)
    print(f"legends: {matched} matched, {added} added")


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


def career_table(people, current):
    out, lookups, dropped = [], [], 0
    for p in people.values():
        vals = [career_value(p, k) for k in KEYS]
        if not any(vals):
            continue
        # A leader-list match may only cover one stat, so even matched players
        # get looked up if their other stats would come from 1999+ seasons.
        if p.get("pre99") and p["draft"] is None:
            lookups.append({"name": p["name"], "pos": p["pos"], "from": p["from"],
                            "to": p["to"], "sums": p["sums"]})
        if p["partial"]:
            dropped += 1  # a wrong career total is worse than a missing player
            continue
        if p["active"]:
            span = f"{p['from']}–"
        elif p["from"]:
            span = f"{p['from']}–{p['to']}" if p["to"] > p["from"] else str(p["from"])
        else:
            span = ""
        out.append([p["name"], p["pos"], span] + vals)
    out.sort(key=lambda x: norm(x[0]))
    print(f"careers: {len(out)} kept, {dropped} dropped as incomplete")
    return out, lookups


def latest_postseason(cache_dir, current):
    for y in (current, current - 1):
        path = fetch(cache_dir, "stats_player", f"stats_player_post_{y}.csv")
        if path and player_rows(path):
            return y
    raise SystemExit("no postseason file found")


def season_files(cache_dir, kind, first, last):
    paths = {}
    for y in range(first, last + 1):
        path = fetch(cache_dir, "stats_player", f"stats_player_{kind}_{y}.csv")
        if path:
            paths[y] = path
    return paths


def main():
    cache_dir, legends_path, out_dir = sys.argv[1:4]
    os.makedirs(cache_dir, exist_ok=True)
    os.makedirs(out_dir, exist_ok=True)
    current, last = find_seasons(cache_dir)
    post = latest_postseason(cache_dir, current)
    people, by_name = careers(cache_dir, current)
    add_legends(legends_path, people, by_name)
    all_time, lookups = career_table(people, current)
    # fetch_legends.py reads this to look these players up on Wikipedia.
    with open(os.path.join(cache_dir, "partial_players.json"), "w", encoding="utf8") as f:
        json.dump(lookups, f, ensure_ascii=False)

    reg = season_files(cache_dir, "reg", FIRST_SEASON, current)
    posts = season_files(cache_dir, "post", FIRST_SEASON, post)
    prog = progress(cache_dir, current)
    done = prog.endswith("Week 18")
    span = lambda a, b: {y: p for y, p in reg.items() if a <= y <= b}

    eras = [
        ("cur", f"{current} {'season' if done else 'so far'}", "Seasons", prog,
         season_table(reg[current]), SEASON_KEYS),
        ("last", f"{last} season", "Seasons", "", season_table(reg[last]), SEASON_KEYS),
        ("dec2020", "2020s", "Decades", f"2020–{current} regular seasons",
         span_table(span(2020, current)), SEASON_KEYS),
        ("dec2010", "2010s", "Decades", "2010–2019 regular seasons",
         span_table(span(2010, 2019)), SEASON_KEYS),
        ("dec2000", "2000s", "Decades", "2000–2009 regular seasons",
         span_table(span(2000, 2009)), SEASON_KEYS),
        ("post", f"{post} playoffs", "Playoffs", "Postseason games only",
         season_table(posts[post]), SEASON_KEYS),
        ("postall", "Playoffs since 1999", "Playoffs", f"Every postseason, 1999–{post}",
         span_table(posts), SEASON_KEYS),
        ("all", "All-time", "Careers", "Regular season careers", all_time, KEYS),
    ]
    meta = {"current": current, "last": last, "post": post, "eras": []}
    for era_id, label, group, note, table, keys in eras:
        meta["eras"].append({"id": era_id, "label": label, "group": group, "note": note,
                             "keys": keys, "players": len(table), "counts": counts(table, keys)})
        with open(os.path.join(out_dir, f"pool-{era_id}.json"), "w", encoding="utf8") as f:
            json.dump({"keys": keys, "rows": table}, f, ensure_ascii=False, separators=(",", ":"))
    with open(os.path.join(out_dir, "meta.json"), "w", encoding="utf8") as f:
        json.dump(meta, f, ensure_ascii=False, indent=1)
    for e in meta["eras"]:
        size = os.path.getsize(os.path.join(out_dir, f"pool-{e['id']}.json")) // 1024
        print(f"{e['id']:8} {e['label']:22} {e['players']:6} players  {size:5} KB  {e['note']}")


if __name__ == "__main__":
    main()
