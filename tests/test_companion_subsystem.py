"""
Unit and Integration Tests for Companion Subsystem (Kibitzer, Tutor, Sparring)
Validates Step 1 (Data Layer & Joins) and Step 2 (Tag Classifier Math & Heuristics).
"""

import os
import shutil
import tempfile
import unittest
import chess

from core.persistence.companion_repositories import (
    SparringGamesRepository,
    KibitzerAnalysisRepository,
    TutorGamesRepository,
    CompanionDataManager,
)
from core.features.engine.tag_classifier import (
    cp_to_win_probability,
    score_to_cp,
    classify_variation_tags,
    classify_multipv,
    is_piece_sacrifice,
    is_tactical_forcing,
)

class TestCompanionDataLayer(unittest.TestCase):
    def setUp(self):
        self.test_dir = tempfile.mkdtemp()
        self.sparring_db = os.path.join(self.test_dir, "Sparring_Games.sqlite")
        self.kibitzer_db = os.path.join(self.test_dir, "Kibitzer_Analysis.sqlite")
        self.tutor_db = os.path.join(self.test_dir, "Tutor_Games.sqlite")

        self.sparring_repo = SparringGamesRepository(self.sparring_db)
        self.kibitzer_repo = KibitzerAnalysisRepository(self.kibitzer_db)
        self.tutor_repo = TutorGamesRepository(self.tutor_db)
        self.manager = CompanionDataManager(self.test_dir)

    def tearDown(self):
        shutil.rmtree(self.test_dir, ignore_errors=True)

    def test_shared_join_contract(self):
        """Validates minting game_id and joining across all 3 SQLite stores."""
        # 1. Sparring module starts a game
        game = self.sparring_repo.create_game(
            opponent_engine="Stockfish 18",
            user_time_control="10+0",
            tutor_interrupt_mode="freeze_on_flag",
        )
        game_id = game["game_id"]
        self.assertIsNotNone(game_id)

        # 2. At move 15 (ply 30), Tutor flags a tactical error
        fen_ply30 = "r1bqk2r/pp2bppp/2n1pn2/2pp4/3P4/2N1PN2/PPP1BPPP/R1BQK2R w KQkq - 0 1"
        flag_id = self.tutor_repo.log_flag(
            game_id=game_id,
            ply=30,
            fen=fen_ply30,
            flag_type="tactic",
            engine="Stockfish @2500",
            centipawn_data={"cp_loss": 85, "win_prob_delta": -0.12},
            suggested_variations=[{"pv_san": "dxc5", "score_cp": 45, "tags": ["best", "tactical"]}],
            tutor_outcome="accepted_suggestion",
        )
        self.assertGreater(flag_id, 0)

        # 3. At move 22 (ply 44), user asks Kibitzer for advice ("Roads not taken")
        fen_ply44 = "4rrk1/pp1b1ppp/2n5/2pB4/8/2N2N2/PPP2PPP/R4RK1 w - - 0 1"
        var_id = self.kibitzer_repo.log_variation(
            game_id=game_id,
            ply=44,
            fen=fen_ply44,
            engine="Patricia",
            pgn_fragment="22. Bxc6 Bxc6 23. Ne5",
            eval_data={"score_cp": 120, "depth": 18},
            trigger_source="get_advise",
            logged_by="user_save",
            was_played=False,
        )
        self.assertGreater(var_id, 0)

        # 4. End of game: update PGN and Result
        updated = self.sparring_repo.update_game_pgn(
            game_id=game_id,
            pgn="1. e4 e5 ... 1-0",
            result="1-0",
        )
        self.assertTrue(updated)

        # 5. Query unified game dossier and verify join on (game_id, ply, fen)
        dossier = self.manager.get_full_game_dossier(game_id)
        self.assertEqual(dossier["game"]["result"], "1-0")
        self.assertEqual(dossier["total_tutor_flags"], 1)
        self.assertEqual(dossier["total_kibitzer_variations"], 1)

        timeline = dossier["timeline"]
        self.assertEqual(len(timeline), 2)
        self.assertEqual(timeline[0]["ply"], 30)
        self.assertEqual(len(timeline[0]["tutor_flags"]), 1)
        self.assertEqual(timeline[1]["ply"], 44)
        self.assertEqual(len(timeline[1]["kibitzer_variations"]), 1)


class TestTagClassifierMath(unittest.TestCase):
    def test_win_probability_logistic_model(self):
        # 0 cp = 50% win probability
        self.assertAlmostEqual(cp_to_win_probability(0), 0.50, places=2)
        # +400 cp = ~90.9% win probability (1 / (1 + 10^-1) = 1/1.1 = 0.909)
        self.assertAlmostEqual(cp_to_win_probability(400), 0.909, places=2)
        # -400 cp = ~9.1% win probability
        self.assertAlmostEqual(cp_to_win_probability(-400), 0.091, places=2)
        # Mate in 2 = 100%
        self.assertEqual(cp_to_win_probability(10000, is_mate=True, mate_in=2), 1.0)
        # Mate in -1 = 0%
        self.assertEqual(cp_to_win_probability(-10000, is_mate=True, mate_in=-1), 0.0)

    def test_classification_bandings(self):
        board = chess.Board()
        e2e4 = chess.Move.from_uci("e2e4")

        # Best move (0 cp delta)
        tags_best = classify_variation_tags(board, e2e4, cp=30, best_cp=30)
        self.assertIn("best", tags_best)

        # Inaccuracy (-35 cp delta)
        tags_inacc = classify_variation_tags(board, e2e4, cp=-5, best_cp=30)
        self.assertIn("inaccuracy", tags_inacc)

        # Mistake (-100 cp delta)
        tags_mistake = classify_variation_tags(board, e2e4, cp=-70, best_cp=30)
        self.assertIn("mistake", tags_mistake)

        # Blunder (-300 cp delta)
        tags_blunder = classify_variation_tags(board, e2e4, cp=-270, best_cp=30)
        self.assertIn("blunder", tags_blunder)

    def test_greek_gift_brilliant_sacrifice(self):
        """
        Classic Greek Gift bishop sacrifice on h7:
        Position: White has Bishop on d3, Knight on f3, Queen on d1. Black has King on g8.
        Bxh7+ is a piece sacrifice that delivers check and winning attack.
        """
        fen = "r1bq1rk1/ppp1nppp/4p3/3p4/3P4/2PBPN2/PP1N1PPP/R2QK2R w KQ - 0 8"
        board = chess.Board(fen)
        bxh7 = chess.Move.from_uci("d3h7")

        self.assertTrue(is_piece_sacrifice(board, bxh7))
        self.assertTrue(is_tactical_forcing(board, bxh7))

        # Bishop sac that wins: cp is +250, best is +250
        tags = classify_variation_tags(board, bxh7, cp=250, best_cp=250)
        self.assertIn("best", tags)
        self.assertIn("brilliant", tags)
        self.assertIn("tactical", tags)

    def test_pinned_attacker_not_sacrifice(self):
        """
        If a piece lands on a square where the only attacker is pinned to the king,
        it cannot legally be captured, so it is NOT a sacrifice.
        """
        # White has Queen on e1, Black has King on e8 and Queen on e4 (pinned to King).
        # White plays Be3 (attacked by Black Queen on e4, but Queen is pinned to e8).
        fen = "4k3/8/8/8/4q3/8/8/4R1BK w - - 0 1"
        board = chess.Board(fen)
        be3 = chess.Move.from_uci("g1e3")
        # Attacked by e4 queen, but e4 queen is pinned along the e-file to the king on e8!
        self.assertFalse(is_piece_sacrifice(board, be3))

    def test_multipv_classification(self):
        board = chess.Board()
        multipv_data = [
            {"pv_uci": "e2e4", "score": {"cp": 30}, "depth": 16},
            {"pv_uci": "d2d4", "score": {"cp": 25}, "depth": 16},
            {"pv_uci": "g1f3", "score": {"cp": 20}, "depth": 16},
            {"pv_uci": "a2a3", "score": {"cp": -15}, "depth": 16},
            {"pv_uci": "g2g4", "score": {"cp": -140}, "depth": 16},
        ]
        classified = classify_multipv(board, multipv_data)
        self.assertEqual(len(classified), 5)
        self.assertIn("best", classified[0]["tags"])
        self.assertIn("best", classified[1]["tags"]) # cp_delta = -5 -> within threshold
        self.assertIn("excellent", classified[2]["tags"]) # cp_delta = -10
        self.assertIn("inaccuracy", classified[3]["tags"]) # cp_delta = -45
        self.assertIn("blunder", classified[4]["tags"]) # cp_delta = -170 -> blunder

if __name__ == "__main__":
    unittest.main()
