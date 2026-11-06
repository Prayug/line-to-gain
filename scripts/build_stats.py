#!/usr/bin/env python3
"""Build data/stats.json from nflverse + the committed data/legends.json.

Regular season only, stdlib only (this runs in the scheduled GitHub Action).

Career totals come from three sources, each covering what the others can't:
  nflverse season files   every player, 1999 -> today (including active players)
  nflverse draft_picks    official career totals, players drafted since 1980
  data/legends.json       older legends and undrafted stars (see fetch_legends.py)

Summed season files drift slightly from official totals (Brees comes out 70
yards high), so retired players use the official figure and only active
players, whose official figures are stale, use the running sum.

Usage: build_stats.py <cache_dir> <legends.json> <out.json>
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

# stat key -> nflverse season column, draft_picks column
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
    out = []
    for r in player_rows(path):
        vals = [num(r.get(STATS[k][0])) for k in KEYS]
        out.append([r["player_display_name"], pos_of(r["position"]), r["recent_team"]] + vals)
    out.sort(key=lambda x: norm(x[0]))
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


def main():
    cache_dir, legends_path, out_path = sys.argv[1:4]
    os.makedirs(cache_dir, exist_ok=True)
    current, last = find_seasons(cache_dir)
    fetch(cache_dir, "stats_player", f"stats_player_reg_{last}.csv")
    people, by_name = careers(cache_dir, current)
    add_legends(legends_path, people, by_name)
    all_time, lookups = career_table(people, current)
    # fetch_legends.py reads this to look these players up on Wikipedia.
    with open(os.path.join(cache_dir, "partial_players.json"), "w", encoding="utf8") as f:
        json.dump(lookups, f, ensure_ascii=False)
    data = {
        "meta": {
            "keys": KEYS,
            "current": current,
            "last": last,
            "progress": progress(cache_dir, current),
        },
        "pools": {
            "cur": season_table(os.path.join(cache_dir, f"stats_player_reg_{current}.csv")),
            "last": season_table(os.path.join(cache_dir, f"stats_player_reg_{last}.csv")),
            "all": all_time,
        },
    }
    with open(out_path, "w", encoding="utf8") as f:
        json.dump(data, f, ensure_ascii=False, separators=(",", ":"))
    print(f"{data['meta']} -> {out_path} ({os.path.getsize(out_path) // 1024} KB)")


if __name__ == "__main__":
    main()
