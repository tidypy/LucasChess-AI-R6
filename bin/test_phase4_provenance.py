import os
import sqlite3
import tempfile
import unittest

from Code.Databases.analysis_provenance import (
    AnalysisProvenance,
    filter_recnos_for_analysis,
    get_analysis_provenance,
    is_analysis_stale,
    record_analysis_provenance,
)
from Code.Databases.db_migration import apply_phase2_schema
from Code.Databases.game_validator import save_validation_result, validate_game_data


class TestPhase4AnalysisProvenance(unittest.TestCase):
    def setUp(self):
        self.temp_dir = tempfile.TemporaryDirectory()
        self.db_path = os.path.join(self.temp_dir.name, "test_p4.lcdb")

        self.conn = sqlite3.connect(self.db_path)
        apply_phase2_schema(self.conn)

        # Game 1: Tier 3 (Fresh analysis)
        self.res1 = validate_game_data(
            '[White "Magnus"]\n[Black "Hikaru"]\n[Result "1-0"]\n[WhiteElo "2850"]\n[BlackElo "2780"]\n[WhiteAccuracy "95.0"]\n[BlackAccuracy "90.0"]\n[%eval 0.35] 1. e4 e5',
            game_id="uuid-game-1",
        )
        save_validation_result(self.conn, row_id=101, res=self.res1)

        # Game 2: Tier 1 (Missing analysis)
        self.res2 = validate_game_data(
            '[White "PlayerA"]\n[Black "PlayerB"]\n[Result "0-1"]\n1. e4 e5',
            game_id="uuid-game-2",
        )
        save_validation_result(self.conn, row_id=102, res=self.res2)

    def tearDown(self):
        self.conn.close()
        self.temp_dir.cleanup()

    def test_record_and_get_provenance(self):
        prov = AnalysisProvenance(
            game_id="uuid-game-1",
            engine_name="Stockfish",
            engine_version="16.1",
            depth=20,
            worker_count=4,
            analyzed_hash=self.res1.clean_hash,
        )
        record_analysis_provenance(self.conn, prov)
        self.conn.commit()

        retrieved = get_analysis_provenance(self.conn, "uuid-game-1")
        self.assertIsNotNone(retrieved)
        self.assertEqual(retrieved.engine_name, "Stockfish")
        self.assertEqual(retrieved.engine_version, "16.1")
        self.assertEqual(retrieved.depth, 20)
        self.assertEqual(retrieved.analyzed_hash, self.res1.clean_hash)

    def test_is_analysis_stale(self):
        prov = AnalysisProvenance(
            game_id="uuid-game-1",
            engine_name="Stockfish",
            engine_version="16.1",
            depth=20,
            worker_count=4,
            analyzed_hash="hash_v1",
        )
        self.assertFalse(is_analysis_stale("hash_v1", prov))
        self.assertTrue(is_analysis_stale("hash_v2_modified", prov))
        self.assertTrue(is_analysis_stale("hash_v1", None))

    def test_filter_recnos_missing_only(self):
        # Record fresh provenance for Game 1
        prov = AnalysisProvenance(
            game_id="uuid-game-1",
            engine_name="Stockfish",
            engine_version="16.1",
            depth=20,
            worker_count=4,
            analyzed_hash=self.res1.clean_hash,
        )
        record_analysis_provenance(self.conn, prov)
        self.conn.commit()

        # Candidate recnos: [101 (Tier 3 fresh), 102 (Tier 1 missing)]
        filtered, counts = filter_recnos_for_analysis(
            self.conn, [101, 102], mode="MISSING_ONLY"
        )
        self.assertEqual(filtered, [102])
        self.assertEqual(counts["total_candidates"], 2)
        self.assertEqual(counts["to_analyze"], 1)
        self.assertEqual(counts["skipped_already_tier3"], 1)

    def test_filter_recnos_overwrite(self):
        filtered, counts = filter_recnos_for_analysis(
            self.conn, [101, 102], mode="OVERWRITE"
        )
        self.assertEqual(filtered, [101, 102])
        self.assertEqual(counts["to_analyze"], 2)


if __name__ == "__main__":
    unittest.main()
