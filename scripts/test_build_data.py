"""Aggregation tests for build_data.py, on tiny fixture files.

Run: python3 -m unittest discover -s scripts -p 'test_*.py'
"""
import csv
import os
import sys
import tempfile
import unittest

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import build_data as B  # noqa: E402

STAT_COLS = sorted({c for cols in B.GAME_STATS.values() for c in cols})
WEEK_COLS = ["player_id", "player_display_name", "position", "season", "week", "season_type", "game_id", "team"] + STAT_COLS


def write_csv(path, cols, rows):
    with open(path, "w", newline="", encoding="utf8") as f:
        w = csv.DictWriter(f, fieldnames=cols)
        w.writeheader()
        for r in rows:
            w.writerow({c: r.get(c, 0) for c in cols})


def game(gid, season, kind, home, away, hs, as_, hqb="", aqb=""):
    return {"game_id": gid, "season": season, "game_type": kind, "home_team": home, "away_team": away,
            "home_score": str(hs), "away_score": str(as_), "done": True, "home_qb_id": hqb, "away_qb_id": aqb}


class Franchises(unittest.TestCase):
    def test_relocations_follow_the_season(self):
        self.assertEqual(B.franchise("BAL", 1975), "IND")  # Baltimore Colts
        self.assertEqual(B.franchise("BAL", 2000), "BAL")  # Ravens
        self.assertEqual(B.franchise("HOU", 1990), "TEN")  # Oilers
        self.assertEqual(B.franchise("HOU", 2010), "HOU")  # Texans
        self.assertEqual(B.franchise("STL", 1980), "ARI")  # St. Louis Cardinals
        self.assertEqual(B.franchise("STL", 2005), "LA")   # St. Louis Rams
        for code in ("OAK", "RAI", "LV"):
            self.assertEqual(B.franchise(code, 2000), "LV")
        self.assertEqual(B.franchise("SD", 2010), "LAC")
        self.assertEqual(B.franchise("PHO", 1990), "ARI")

    def test_age_at_season_start(self):
        self.assertEqual(B.age_on_sept1("1983-08-31", 2013), 30)  # birthday before Sept 1
        self.assertEqual(B.age_on_sept1("1983-09-02", 2013), 29)  # birthday after Sept 1
        self.assertIsNone(B.age_on_sept1("", 2013))


class Weekly(unittest.TestCase):
    def setUp(self):
        self.dir = tempfile.mkdtemp()
        rows = [
            # player A: two regular-season games, one 100-yard, one multi-TD; a playoff and a Super Bowl game
            {"player_id": "A", "player_display_name": "Ann Receiver", "position": "WR", "season": 2010, "week": 1, "season_type": "REG",
             "game_id": "g1", "team": "OAK", "receiving_yards": 120, "receiving_tds": 2, "receptions": 7},
            {"player_id": "A", "player_display_name": "Ann Receiver", "position": "WR", "season": 2010, "week": 2, "season_type": "REG",
             "game_id": "g2", "team": "OAK", "receiving_yards": 40, "receptions": 3},
            {"player_id": "A", "player_display_name": "Ann Receiver", "position": "WR", "season": 2010, "week": 20, "season_type": "POST",
             "game_id": "g3", "team": "OAK", "receiving_yards": 80, "receptions": 5},
            {"player_id": "A", "player_display_name": "Ann Receiver", "position": "WR", "season": 2010, "week": 21, "season_type": "POST",
             "game_id": "g4", "team": "OAK", "receiving_yards": 99, "receptions": 6, "receiving_tds": 1},
            # player Q: a QB with a 400-yard game
            {"player_id": "Q", "player_display_name": "Quinn Arm", "position": "QB", "season": 2010, "week": 1, "season_type": "REG",
             "game_id": "g1", "team": "OAK", "passing_yards": 412, "passing_tds": 3, "rushing_yards": 15},
        ]
        self.path = os.path.join(self.dir, "w2010.csv")
        write_csv(self.path, WEEK_COLS, rows)
        self.games = {
            "g1": game("g1", 2010, "REG", "OAK", "SD", 30, 20, hqb="Q"),
            "g2": game("g2", 2010, "REG", "SD", "OAK", 27, 24, aqb="Q"),
            "g3": game("g3", 2010, "CON", "OAK", "PIT", 21, 17, hqb="Q"),
            "g4": game("g4", 2010, "SB", "OAK", "NYG", 10, 13, hqb="Q"),
        }

    def test_totals_thresholds_and_game_types(self):
        A = B.aggregate_weekly({2010: self.path}, self.games)
        reg = A["reg"][("A", 2010)]
        self.assertEqual(reg[B.GI["rec_yds"]], 160)
        self.assertEqual(reg[B.GI["games"]], 2)
        self.assertEqual(A["post"][("A", 2010)][B.GI["rec_yds"]], 179)
        self.assertEqual(A["sb"]["A"][B.GI["rec_yds"]], 99, "only the Super Bowl game")
        self.assertEqual(A["cc"]["A"], 1, "conference title game counted")
        self.assertEqual(A["thresh"]["A"]["g100rec"], 1, "100-yard games are regular season only")
        self.assertEqual(A["thresh"]["A"]["gmulti_td"], 1)
        self.assertEqual(A["best"]["A"]["best_rec_yds"], 120)
        self.assertEqual(A["thresh"]["Q"]["g400pass"], 1)
        self.assertEqual(A["thresh"]["Q"]["g300pass"], 1)
        self.assertEqual(A["teams"]["A"], {"LV"}, "Oakland maps to today's franchise")
        self.assertEqual(A["fran"][("A", "LV")][B.GI["rec_yds"]], 160)

    def test_qb_records(self):
        q = B.qb_records(self.games)["Q"]
        self.assertEqual((q["qb_starts"], q["qb_wins"]), (2, 1))
        self.assertEqual((q["qb_po_starts"], q["qb_po_wins"]), (2, 1))

    def test_team_records(self):
        stand = os.path.join(self.dir, "standings.csv")
        write_csv(stand, ["season", "team", "div_rank"], [{"season": 2010, "team": "OAK", "div_rank": 1}])
        t, by_season = B.team_records(self.games, stand, {"LV": {"sb_apps": 5}}, 2010)
        self.assertEqual(t["LV"]["wins_since99"], 1)
        self.assertEqual(t["LV"]["po_wins_since2000"], 1)
        self.assertEqual(t["LV"]["sb_apps_since99"], 1)
        self.assertEqual(t["LV"]["sb_wins_since99"], 0)
        self.assertEqual(t["LV"]["div_titles_since02"], 1)
        self.assertEqual(t["LV"]["drought"], 0)
        self.assertEqual(t["LV"]["sb_apps"], 5, "Wikipedia snapshot fills all-time history")
        self.assertEqual(by_season[2010]["LV"]["pf"], 54)

    def test_renamed_column_fails_loudly(self):
        bad = os.path.join(self.dir, "bad.csv")
        write_csv(bad, [c for c in WEEK_COLS if c != "receiving_yards"], [])
        with self.assertRaises(SystemExit):
            B.check_columns(bad)


class Output(unittest.TestCase):
    def test_sparse_keeps_only_nonzero(self):
        out = B.sparse([("p1", [0, 5.25, 0]), ("p2", [3, 0, 0])], ["a", "b", "c"], {"p1": 0, "p2": 1})
        self.assertEqual(out, {"a": [1, 3], "b": [0, 5.2], "c": []})

    def test_headshot_keys(self):
        self.assertEqual(B.headshot_key("https://static.www.nfl.com/image/private/f_auto,q_auto/league/abc123"), "abc123")
        self.assertEqual(B.headshot_key("https://static.www.nfl.com/image/upload/f_auto,q_auto/league/xyz"), "u:xyz")
        self.assertEqual(B.headshot_key("https://example.com/x.png"), "")


if __name__ == "__main__":
    unittest.main()
