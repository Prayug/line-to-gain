#!/usr/bin/env python3
"""One-time snapshot of franchise records nflverse doesn't cover (pre-1999).

Writes data/wiki_teams.json:
  champions   {season: franchise} for every Super Bowl
  franchises  {franchise: {sb_apps, sb_wins, po_wins_alltime}}

Re-run after each Super Bowl; the daily build reads the committed file.
Usage: fetch_wiki_teams.py <cache_dir> <out.json>     (needs beautifulsoup4)
"""
import json
import os
import re
import sys
import urllib.parse
import urllib.request

from bs4 import BeautifulSoup

UA = "line-to-gain-data-build/2.0 (https://github.com/Prayug/line-to-gain)"
NICK = {
    "Cardinals": "ARI", "Falcons": "ATL", "Ravens": "BAL", "Bills": "BUF", "Panthers": "CAR",
    "Bears": "CHI", "Bengals": "CIN", "Browns": "CLE", "Cowboys": "DAL", "Broncos": "DEN",
    "Lions": "DET", "Packers": "GB", "Texans": "HOU", "Colts": "IND", "Jaguars": "JAX",
    "Chiefs": "KC", "Rams": "LA", "Chargers": "LAC", "Raiders": "LV", "Dolphins": "MIA",
    "Vikings": "MIN", "Patriots": "NE", "Saints": "NO", "Giants": "NYG", "Jets": "NYJ",
    "Eagles": "PHI", "Steelers": "PIT", "Seahawks": "SEA", "49ers": "SF", "Buccaneers": "TB",
    "Titans": "TEN", "Oilers": "TEN", "Commanders": "WAS", "Redskins": "WAS", "Football Team": "WAS",
}


def get(cache_dir, title):
    path = os.path.join(cache_dir, "wiki_" + re.sub(r"\W", "_", title) + ".json")
    if not os.path.exists(path):
        q = urllib.parse.urlencode({"action": "parse", "page": title, "prop": "text", "format": "json",
                                    "formatversion": 2, "redirects": 1})
        req = urllib.request.Request(f"https://en.wikipedia.org/w/api.php?{q}", headers={"User-Agent": UA})
        with urllib.request.urlopen(req, timeout=40) as r:
            open(path, "wb").write(r.read())
    return BeautifulSoup(json.load(open(path))["parse"]["text"], "html.parser")


def text(cell):
    return re.sub(r"\[[^\]]*\]", "", cell.get_text(" ", strip=True)).strip()


def grid(table):
    """Expand rowspans/colspans into a rectangular list of rows of cells."""
    out, carry = [], {}
    for tr in table.find_all("tr"):
        row, col, cells, i = [], 0, tr.find_all(["th", "td"], recursive=False), 0
        while i < len(cells) or col in carry:
            if col in carry:
                cell, left = carry.pop(col)
                row.append(cell)
                if left > 1:
                    carry[col] = (cell, left - 1)
                col += 1
                continue
            cell = cells[i]
            i += 1
            span = int(re.sub(r"\D", "", cell.get("colspan", "1")) or 1)
            down = int(re.sub(r"\D", "", cell.get("rowspan", "1")) or 1)
            for _ in range(span):
                row.append(cell)
                if down > 1:
                    carry[col] = (cell, down - 1)
                col += 1
        out.append(row)
    return out


def code(name):
    hits = [c for nick, c in NICK.items() if nick in name]
    if len(set(hits)) != 1:
        raise SystemExit(f"can't map franchise name: {name!r}")
    return hits[0]


def main():
    cache_dir, out = sys.argv[1:3]
    os.makedirs(cache_dir, exist_ok=True)
    sb = get(cache_dir, "List of Super Bowl champions")
    tables = sb.select("table.wikitable")
    games, franchise_table = None, None
    for t in tables:
        head = [text(c) for c in t.find("tr").find_all(["th", "td"])]
        if head[:3] == ["Game", "Date ( season)", "Winning team"]:
            games = t
        if head and head[0] == "Franchise" and "Appearances" in head:
            franchise_table = t
    champions = {}
    for cells in grid(games)[1:]:
        if len(cells) < 5:
            continue
        season = re.search(r"\(\s*(\d{4})", text(cells[1]))
        if season:
            champions[int(season.group(1))] = code(text(cells[2]))
    fr = {}
    head = [text(c) for c in franchise_table.find("tr").find_all(["th", "td"])]
    wi, ai = head.index("Wins"), head.index("Appearances")
    for row in grid(franchise_table)[1:]:
        cells = [text(c) for c in row]
        if len(cells) <= ai:
            continue
        c = code(cells[0])
        fr.setdefault(c, {})
        fr[c]["sb_wins"] = int(cells[wi]) if cells[wi].isdigit() else 0
        fr[c]["sb_apps"] = int(cells[ai]) if cells[ai].isdigit() else 0

    rec = get(cache_dir, "List of all-time NFL win–loss records")
    for t in rec.select("table.wikitable"):
        head = [text(c) for c in t.find("tr").find_all(["th", "td"])]
        if "Last playoff appearance" in head:
            ti, wi = head.index("Team"), head.index("Won")
            for row in grid(t)[1:]:
                cells = [text(c) for c in row]
                if len(cells) > wi and cells[wi].replace(",", "").isdigit():
                    fr.setdefault(code(cells[ti]), {})["po_wins_alltime"] = int(cells[wi].replace(",", ""))
    snap = {"source": "Wikipedia: List of Super Bowl champions; List of all-time NFL win–loss records",
            "throughSeason": max(champions), "champions": {str(k): v for k, v in sorted(champions.items())},
            "franchises": dict(sorted(fr.items()))}
    with open(out, "w", encoding="utf8") as f:
        json.dump(snap, f, indent=1, ensure_ascii=False)
    print(f"{len(champions)} champions through {max(champions)}, {len(fr)} franchises -> {out}")


if __name__ == "__main__":
    main()
