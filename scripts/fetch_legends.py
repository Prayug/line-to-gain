#!/usr/bin/env python3
"""One-time extract of career stats for players nflverse can't cover.

nflverse season files start in 1999 and its draft table starts in 1980, so
anyone older (or undrafted before 1999) needs another source. This pulls:

  1. Wikipedia's "List of NFL career ... leaders" tables
  2. "Career NFL statistics" infoboxes of Pro Football Hall of Fame inductees
  3. The same infoboxes for pre-1999 players build_stats.py couldn't complete

and writes data/legends.json. Retired players' numbers don't change, so the
output is committed and the weekly refresh never needs to call Wikipedia.

Usage: fetch_legends.py <cache_dir> <out.json>     (needs beautifulsoup4)
"""
import json
import os
import re
import sys
import time
import unicodedata
import urllib.parse
import urllib.request

from bs4 import BeautifulSoup

UA = "line-to-gain-data-build/1.0 (https://github.com/Prayug/line-to-gain)"
API = "https://en.wikipedia.org/w/api.php"
CURRENT_YEAR = time.gmtime().tm_year

# page suffix -> [(table index, {stat key: column header})]
LISTS = {
    "passing_yards": [(1, {"pass_yds": "Yds"})],
    "passing_touchdowns": [(1, {"pass_td": "TDs"})],
    "rushing_yards": [(1, {"rush_yds": "Yards"})],
    "rushing_touchdowns": [(1, {"rush_td": "Touchdowns"})],
    "receiving_yards": [(1, {"rec_yds": "Yards", "rec": "Receptions"})],
    "receiving_touchdowns": [(1, {"rec_td": "Touchdowns"})],
    "receptions": [(1, {"rec": "Receptions"}), (3, {"rec": "Receptions"})],
    "sacks": [(1, {"sacks": "Sacks"}), (3, {"sacks": "Unofficial sack total"})],
    "interceptions": [(1, {"ints": "Ints"})],
}
DEFAULT_POS = {
    "passing_yards": "QB", "passing_touchdowns": "QB",
    "rushing_yards": "RB", "rushing_touchdowns": "RB",
    "receiving_yards": "WR", "receiving_touchdowns": "WR", "receptions": "WR",
    "sacks": "DE", "interceptions": "DB",
}
POS_WORDS = [
    ("quarterback", "QB"), ("fullback", "FB"), ("halfback", "RB"),
    ("running back", "RB"), ("wide receiver", "WR"), ("flanker", "WR"),
    ("split end", "WR"), ("end", "WR"), ("tight end", "TE"),
    ("defensive end", "DE"), ("defensive tackle", "DT"), ("linebacker", "LB"),
    ("cornerback", "CB"), ("safety", "S"), ("defensive back", "DB"),
    ("offensive tackle", "OL"), ("guard", "OL"), ("center", "OL"),
    ("tackle", "OL"), ("placekicker", "K"), ("kicker", "K"), ("punter", "P"),
]
LABELS = {
    "passing yards": "pass_yds", "yards passing": "pass_yds",
    "passing touchdowns": "pass_td", "touchdown passes": "pass_td",
    "td passes": "pass_td", "passing tds": "pass_td",
    "rushing yards": "rush_yds", "yards rushing": "rush_yds",
    "rushing touchdowns": "rush_td", "rushing tds": "rush_td",
    "receiving yards": "rec_yds", "yards receiving": "rec_yds",
    "receiving touchdowns": "rec_td", "receiving tds": "rec_td",
    "receptions": "rec", "sacks": "sacks", "interceptions": "ints",
}


# Names a list uses for someone who also appears under their page title.
ALIASES = ["Dick Lane"]
# Pages whose team list includes a later non-playing date.
LAST_SEASON_FIX = {"Bob Griese": 1980}


def get(cache_dir, name, params):
    """GET the Wikipedia API once, caching the JSON response on disk."""
    path = os.path.join(cache_dir, name)
    if os.path.exists(path):
        with open(path, encoding="utf8") as f:
            return json.load(f)
    url = API + "?" + urllib.parse.urlencode({**params, "format": "json", "formatversion": 2})
    req = urllib.request.Request(url, headers={"User-Agent": UA})
    with urllib.request.urlopen(req, timeout=40) as r:
        data = json.load(r)
    with open(path, "w", encoding="utf8") as f:
        json.dump(data, f)
    time.sleep(0.5)
    return data


def norm(name):
    s = unicodedata.normalize("NFKD", name)
    s = "".join(c for c in s if not unicodedata.combining(c)).lower()
    s = re.sub(r"[^a-z0-9 ]", "", s.replace("-", " "))
    s = re.sub(r"\b(jr|sr|ii|iii|iv|v)\b", "", s)
    return re.sub(r"\s+", " ", s).strip()


def num(text):
    m = re.search(r"\d[\d,]*(?:\.\d+)?", text or "")
    if not m:
        return None
    v = float(m.group().replace(",", ""))
    return int(v) if v == int(v) else v


def clean(text):
    text = re.sub(r"\[[^\]]*\]", "", text)
    return re.sub(r"\s+", " ", text.replace("\xad", "")).strip()


def grid(table):
    """Expand a wikitable into a rectangular list of rows of <td>/<th> tags."""
    out, carry = [], {}
    for tr in table.find_all("tr"):
        row, col = [], 0
        cells = tr.find_all(["th", "td"], recursive=False)
        i = 0
        while i < len(cells) or col in carry:
            if col in carry:
                cell, left = carry[col]
                row.append(cell)
                if left > 1:
                    carry[col] = (cell, left - 1)
                else:
                    del carry[col]
                col += 1
                continue
            cell = cells[i]
            i += 1
            span = int(re.sub(r"\D", "", cell.get("colspan", "1")) or 1)
            rows = int(re.sub(r"\D", "", cell.get("rowspan", "1")) or 1)
            for _ in range(span):
                row.append(cell)
                if rows > 1:
                    carry[col] = (cell, rows - 1)
                col += 1
        out.append(row)
    return out


def player_name(cell):
    a = cell.find("a")
    return clean(a.get_text(" ", strip=True) if a else cell.get_text(" ", strip=True)).rstrip("†^* ").strip()


def years_of(text, into):
    for y in re.findall(r"\b(19[2-9]\d|20[0-3]\d)\b", text):
        y = int(y)
        into["from"] = min(into.get("from", 9999), y)
        into["to"] = max(into.get("to", 0), y)
    if re.search(r"present", text, re.I):
        into["to"] = CURRENT_YEAR


def pos_from(text):
    t = text.lower()
    for word, code in sorted(POS_WORDS, key=lambda p: -len(p[0])):
        if word in t:
            return code
    up = text.strip().upper()
    return up if re.fullmatch(r"[A-Z]{1,4}", up) else None


def from_lists(cache_dir, players):
    for page, tables in LISTS.items():
        d = get(cache_dir, f"wiki_{page}.json", {
            "action": "parse", "prop": "text",
            "page": f"List of NFL career {page.replace('_', ' ')} leaders"})
        soup = BeautifulSoup(d["parse"]["text"], "html.parser")
        wikitables = soup.select("table.wikitable")
        count = 0
        for idx, cols in tables:
            rows = grid(wikitables[idx])
            head = [clean(c.get_text(" ", strip=True)) for c in rows[0]]
            pi = head.index("Player")
            stat_cols = {k: next(i for i, h in enumerate(head) if h.startswith(v))
                         for k, v in cols.items()}
            pos_i = next((i for i, h in enumerate(head) if h.startswith("Pos")), None)
            ctx_cols = [i for i, h in enumerate(head) if h.startswith(("Team", "Seasons"))]
            for r in rows[1:]:
                if len(r) <= max(stat_cols.values()):
                    continue
                name = player_name(r[pi])
                if not name or name == "Player":
                    continue
                key = norm(name)
                p = players.setdefault(key, {"name": name, "stats": {}})
                if pos_i is not None and "pos" not in p:
                    p["pos"] = pos_from(r[pos_i].get_text(" ", strip=True)) or DEFAULT_POS[page]
                p.setdefault("pos", DEFAULT_POS[page])
                for c in ctx_cols:
                    if c < len(r):
                        years_of(r[c].get_text(" ", strip=True), p)
                for k, c in stat_cols.items():
                    v = num(r[c].get_text(" ", strip=True))
                    if v is not None:
                        p["stats"][k] = max(p["stats"].get(k, 0), v)
                        count += 1
        print(f"  {page}: {count} values")


def unlink(text):
    """[[Target|shown]] -> shown, [[Target]] -> Target."""
    return re.sub(r"\[\[(?:[^\]|]*\|)?([^\]]*)\]\]", r"\1", text)


def wiki_field(text, field):
    m = re.search(rf"\|\s*{field}\s*=\s*(.+)", text)
    return m.group(1).strip() if m else ""


def parse_infobox(text):
    """Pull (position, career stats, {from, to}) from a player page's wikitext."""
    # QBs' "Interceptions" are thrown, not caught, so position matters.
    pos = pos_from(unlink(wiki_field(text, "position")).split("/")[0].split("<")[0][:40])
    found = {}
    for m in re.finditer(r"\|\s*stat_?label(\d+)\s*=\s*(.+)", text):
        label = unlink(m.group(2)).replace("'", "").strip().lower()
        val = re.search(rf"\|\s*stat_?value{m.group(1)}\s*=\s*(.+)", text)
        if not val:
            continue
        v = num(re.sub(r"\{\{[^}]*\}\}|<[^>]*>", "", val.group(1)))
        if v is None:
            continue
        if re.fullmatch(r"(td|tds|touchdowns?)\s*[–-]\s*(int|ints|interceptions?)", label):
            found["pass_td"] = v
        elif label in LABELS:
            k = LABELS[label]
            if not (k == "ints" and pos == "QB"):
                found[k] = v
    # Citations carry access dates, which would read as seasons played.
    bare = re.sub(r"<ref[^>]*/>|<ref.*?</ref>", "", text, flags=re.S)
    span = {}
    teams = re.search(r"\|\s*past_teams\s*=(.*?)\n\s*\|", bare, re.S)
    years_of(teams.group(1) if teams else "", span)
    for field in ("debutyear", "finalyear"):
        years_of(wiki_field(bare, field), span)
    return pos, found, span


def from_hall_of_fame(cache_dir, players):
    titles, cont, n = [], {}, 0
    while True:
        d = get(cache_dir, f"wiki_hof_members_{n}.json", {
            "action": "query", "list": "categorymembers", "cmlimit": 500,
            "cmtitle": "Category:Pro Football Hall of Fame inductees", **cont})
        titles += [m["title"] for m in d["query"]["categorymembers"] if m["ns"] == 0]
        if "continue" not in d:
            break
        cont = {"cmcontinue": d["continue"]["cmcontinue"]}
        n += 1
    print(f"  hall of fame pages: {len(titles)}")
    added = filled = 0
    for i in range(0, len(titles), 40):
        d = get(cache_dir, f"wiki_hof_pages_{i}.json", {
            "action": "query", "prop": "revisions", "rvprop": "content",
            "rvslots": "main", "redirects": 1, "titles": "|".join(titles[i:i + 40])})
        for page in d["query"]["pages"]:
            if "revisions" not in page:
                continue
            pos, found, span = parse_infobox(page["revisions"][0]["slots"]["main"]["content"])
            if not found:
                continue
            name = re.sub(r"\s*\(.*\)$", "", page["title"])
            key = norm(name)
            p = players.get(key)
            if p is None:
                p = players[key] = {"name": name, "stats": {}}
                added += 1
            p.setdefault("pos", pos or "—")
            if "from" not in p:
                p.update(span)
            for k, v in found.items():
                if k not in p["stats"]:
                    p["stats"][k] = v
                    filled += 1
    print(f"  hall of fame: {added} new players, {filled} stats filled in")


def from_partial_careers(cache_dir, players):
    """Late-90s undrafted players: nflverse only has their 1999+ seasons.

    Common names land on the wrong page (James Stewart the actor), so a page
    only counts if it's a football infobox whose years overlap the player's
    and whose totals are at least what nflverse already shows for 1999+.
    Infoboxes often omit minor stats, so only reported stats are compared.
    """
    path = os.path.join(cache_dir, "partial_players.json")
    if not os.path.exists(path):
        print("  no partial_players.json yet; run build_stats.py first")
        return
    with open(path, encoding="utf8") as f:
        partial = json.load(f)
    words = {"QB": "quarterback", "RB": "running back", "FB": "fullback",
             "WR": "wide receiver", "TE": "tight end", "LB": "linebacker",
             "CB": "cornerback", "S": "safety", "DB": "defensive back",
             "DE": "defensive end", "DT": "defensive tackle"}
    titles = []
    for p in partial:
        n = p["name"]
        titles += [f"{n} (American football)", f"{n} (gridiron football)", n]
        if p["pos"] in words:
            titles.append(f"{n} ({words[p['pos']]})")
    pages = {}  # normalized player name -> parsed infoboxes
    for i in range(0, len(titles), 45):
        d = get(cache_dir, f"wiki_partial_{i}.json", {
            "action": "query", "prop": "revisions", "rvprop": "content",
            "rvslots": "main", "redirects": 1, "titles": "|".join(titles[i:i + 45])})
        came_from = {r["to"]: r["from"] for r in d["query"].get("redirects", [])}
        for page in d["query"]["pages"]:
            if "revisions" not in page:
                continue
            text = page["revisions"][0]["slots"]["main"]["content"]
            if not re.search(r"\{\{Infobox (NFL|gridiron football)", text, re.I):
                continue
            parsed = parse_infobox(text)
            for title in (page["title"], came_from.get(page["title"], page["title"])):
                pages.setdefault(norm(re.sub(r"\s*\(.*\)$", "", title)), []).append(parsed)
    found = 0
    for p in partial:
        for pos, stats, span in pages.get(norm(p["name"]), []):
            if not stats or "from" not in span:
                continue
            if not (span["from"] <= p["to"] and span["to"] >= p["from"]):
                continue
            if any(k in stats and stats[k] < 0.95 * v for k, v in p["sums"].items() if v >= 20):
                continue
            key = norm(p["name"])
            other = players.get(key)
            if other and "from" in other and not (other["from"] <= span["to"] and other["to"] >= span["from"]):
                key += f"|{span['from']}"  # same name, different player (two Dave Browns)
            entry = players.setdefault(key, {
                "name": p["name"], "pos": p["pos"], "stats": {}, **span})
            for k, v in stats.items():
                entry["stats"].setdefault(k, v)
            found += 1
            break
    print(f"  partial careers: {found} of {len(partial)} completed")


def main():
    cache_dir, out = sys.argv[1], sys.argv[2]
    players = {}
    from_lists(cache_dir, players)
    from_hall_of_fame(cache_dir, players)
    from_partial_careers(cache_dir, players)
    for alias in ALIASES:
        players.pop(norm(alias), None)
    for name, last_year in LAST_SEASON_FIX.items():
        players[norm(name)]["to"] = last_year
    rows = sorted(players.values(), key=lambda p: p["name"])
    with open(out, "w", encoding="utf8") as f:
        json.dump(rows, f, ensure_ascii=False, indent=0, sort_keys=True)
    print(f"wrote {len(rows)} players -> {out}")


if __name__ == "__main__":
    main()
