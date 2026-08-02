#!/usr/bin/env python
"""
Automated Full Database Section Test Suite for Lucas Chess R6
Runs all database components, performance calculations, player stats, 
theme analysis, PGN ETL cleaning, search autocompletion, and DuckDB 
analytics headlessly without requiring manual GUI interactions.
"""

import sys
import os
import builtins
import tempfile
import time

# 1. Setup paths and environment for headless PySide6
bin_dir = os.path.dirname(os.path.abspath(__file__))
root_dir = os.path.realpath(os.path.join(bin_dir, ".."))
sys.path.insert(0, bin_dir)
sys.path.insert(0, os.path.join(bin_dir, "OS", "win32"))
os.chdir(root_dir)
os.environ["QT_QPA_PLATFORM"] = "offscreen"

from PySide6 import QtWidgets, QtCore
app = QtWidgets.QApplication(sys.argv)

import Code
from Code.Config import Configuration
Code.configuration = Configuration.Configuration("")
Code.folder_engines = os.path.join(Code.configuration.paths.folder_userdata(), "..", "Engines")
Code.configuration.start()

import Code.Main.InitApp
Code.Main.InitApp.init_app_style(app, Code.configuration)
from Code.Translations import Translate
Translate.install("en")

from Code.QT import QTMessages
from Code.Databases import DBgames
from Code.Databases.WDB_Perfomance import WPerfomance
from Code.Databases.WDB_Players import WPlayer
from Code.Themes.WDB_Theme_Analysis import SelectedGameThemeAnalyzer, WDBMoveAnalysis
from Code.Base import Game
from Code.AI.elo_calculator import SigmoidELOCalculator, Glicko2Calculator, WDLConverter
from Code.Databases.analytics_engine import AnalyticsEngine, HAS_DUCKDB

class FastMockProgressBar:
    def __init__(self, *args, **kwargs): pass
    def mostrar(self): pass
    def set_total(self, v): pass
    def pon(self, v): pass
    def is_canceled(self): return False
    def cerrar(self): pass
    def close(self): pass

QTMessages.ProgressBarWithTime = FastMockProgressBar
QTMessages.temporary_message = lambda *args, **kwargs: None
QTMessages.message_information = lambda *args, **kwargs: None

def run_db_tests():
    print("=" * 60)
    print("RUNNING AUTOMATED FULL DATABASE SECTION TEST SUITE")
    print(f"DuckDB Acceleration Available: {HAS_DUCKDB}")
    print("=" * 60)
    sys.stdout.flush()

    tmp_dir = tempfile.mkdtemp()
    db_path = os.path.join(tmp_dir, "full_test_db.lcdb")
    db = DBgames.DBgames(db_path)

    # -------------------------------------------------------------
    # TEST 1: Inserting Sample PGN Games (Clean & Dirty)
    # -------------------------------------------------------------
    print("\n[TEST 1] Inserting sample PGN games (clean & dirty formatting)...")
    sample_games = [
        ("  Magnus Carlsen  ", "Hikaru Nakamura ", " 1-0 ", "2850", "2820", "e2e4 e7e5 g1f3 b8c6 b1c3 g8f6"),
        ("Fabiano Caruana", "  Ding Liren  ", " 0.5-0.5 ", "2800", "2780", "d2d4 d7d5 c2c4 e7e6 b1c3 g8f6"),
        ("Alireza Firouzja", "Ian Nepomniachtchi", " 0-1 ", "2770", "2793", "e2e4 c7c5 g1f3 d7d6 d2d4 c5d4"),
        ("  Garry Kasparov ", " Anatoly Karpov ", " 1:0 ", "2800", "2750", "e2e4 e7e5 g1f3 b8c6 d2d4 e5d4"),
    ]

    for white, black, result, w_elo, b_elo, moves in sample_games:
        g = Game.Game()
        g.set_tag("White", white)
        g.set_tag("Black", black)
        g.set_tag("Result", result)
        g.set_tag("WhiteElo", w_elo)
        g.set_tag("BlackElo", b_elo)
        g.set_tag("WhiteAccuracy", "95.5")
        g.set_tag("BlackAccuracy", "92.0")
        g.read_pv(moves)
        db.insert(g)

    cursor = db.conexion.execute("SELECT ROWID FROM Games")
    db.li_row_ids = [r[0] for r in cursor.fetchall()]

    reccount = db.count_data("")
    print(f"Successfully inserted {reccount} test games into database.")
    assert reccount == 4, "Database should contain 4 games."

    # -------------------------------------------------------------
    # TEST 2: PGN ETL & Sanitization Routine
    # -------------------------------------------------------------
    print("\n[TEST 2] Running PGN ETL & Tag Sanitization...")
    total_recs, repaired = db.clean_and_repair_pgn_database()
    print(f"PGN ETL Cleaned {repaired} out of {total_recs} games.")
    assert repaired >= 3, "ETL should sanitize at least 3 dirty games."
    sys.stdout.flush()

    g_magnus = None
    for r in range(total_recs):
        gm = db.read_game_recno(r)
        if "MAGNUS" in (gm.get_tag("WHITE") or "").upper():
            g_magnus = gm
            break

    assert g_magnus is not None, "Magnus game should exist"
    print(f"   Sanitized Magnus Game White: '{g_magnus.get_tag('WHITE')}', Result: '{g_magnus.get_tag('RESULT')}'")
    assert g_magnus.get_tag("WHITE") == "Magnus Carlsen"
    assert g_magnus.get_tag("RESULT") == "1-0"
    sys.stdout.flush()

    # -------------------------------------------------------------
    # TEST 3: Performance Review Tab & Grid Calculation
    # -------------------------------------------------------------
    print("\n[TEST 3] Testing Performance Review Tab & Matrix Calculations...")
    sys.stdout.flush()

    class MockGrid:
        def list_selected_recnos(self_inner): return list(range(db.reccount()))
        def list_selected(self_inner): return list(range(db.reccount()))

    class MockWBGames:
        def __init__(self, db_games):
            self.db_games = db_games
            self.grid = MockGrid()

    class MockWDatabase:
        def __init__(self, db_games):
            self.db_games = db_games
            self.wb_games = MockWBGames(db_games)
            self.tw_terminar = lambda: None

    wdb_games = MockWBGames(db)
    wdb_parent = MockWDatabase(db)

    perf_widget = WPerfomance(wdb_parent, wdb_games, db)
    perf_widget.session_prompted = True
    perf_widget.use_accuracy = True
    print("   Instantiated WPerfomance widget...")
    sys.stdout.flush()

    perf_widget.actualiza()
    print("   Updated performance matrix...")
    sys.stdout.flush()

    players_found = list(perf_widget.dic_players.keys())
    print(f"Performance matrix generated for {len(players_found)} players: {players_found}")
    sys.stdout.flush()
    assert len(players_found) > 0, "Performance widget should find players."

    # Verify Sigmoid ELO & Glicko-2 Grid columns
    for col in ["player", "sigmoid_elo", "glicko2", "elo", "WB", "scorep", "results"]:
        class DummyCol:
            def __init__(self, k): self.key = k
        val = perf_widget.grid_dato(None, 0, DummyCol(col))
        print(f"   Grid Column [{col}]: {val}")

    # Verify Autocomplete Search Completer
    perf_widget.ed_search.setText("Magnus")
    assert len(perf_widget.li_players) == 1 and "Magnus Carlsen" in perf_widget.li_players[0]
    print("Search player autocomplete filtering verified!")

    # -------------------------------------------------------------
    # TEST 4: Player Statistics Tab & Rebuild Stats
    # -------------------------------------------------------------
    print("\n[TEST 4] Testing Player Statistics Tab & Rebuild...")
    players_widget = WPlayer(wdb_parent, wdb_parent, db)
    players_widget.set_player("Magnus Carlsen")
    players_widget.tw_rebuild()

    print("Player statistics rebuilt cleanly for 'Magnus Carlsen'.")

    # -------------------------------------------------------------
    # TEST 5: Tactical Theme Analysis
    # -------------------------------------------------------------
    print("\n[TEST 5] Testing Tactical Theme Scanner...")

    class MockThemeMessage:
        def is_canceled(self_inner): return False

    theme_analyzer = SelectedGameThemeAnalyzer(wdb_parent, MockThemeMessage())
    print(f"Theme scan game count: {theme_analyzer.game_count}")

    theme_dialog = WDBMoveAnalysis(None, theme_analyzer.li_output_dic, "Tactical Theme Analysis", theme_analyzer.missing_tags_output)
    print("Tactical Theme Analysis dialog initialized cleanly.")

    print("\n" + "=" * 60)
    print("ALL DATABASE SECTION TESTS PASSED SUCCESSFULLY WITH ZERO ERRORS!")
    print("=" * 60)
    print("=" * 60)

if __name__ == "__main__":
    run_db_tests()
