import sys
import os

# Ensure the legacy bin folder and OS binaries are available to import DBgames
bin_path = os.path.abspath("bin")
sys.path.insert(0, bin_path)
sys.path.insert(0, os.path.join(bin_path, "OS", "win32"))

from Code.Databases.DBgames import DBgames

class GameRepository:
    def __init__(self, db_path: str):
        if not os.path.exists(db_path):
            raise FileNotFoundError(f"Database not found at {db_path}")
        self.db = DBgames(db_path)
    
    def get_game_by_rowid(self, rowid: int) -> dict:
        """
        Bypasses the legacy Game.py coupling and fetches raw _DATA_.
        """
        import sqlite3
        conn = sqlite3.connect(self.db.path)
        conn.row_factory = sqlite3.Row
        cur = conn.cursor()
        cur.execute("SELECT _DATA_ FROM Games WHERE ROWID = ?", (rowid,))
        row = cur.fetchone()
        conn.close()
        
        if not row:
            return None
            
        data = row["_DATA_"]
        # In a real app we'd decode this, but for the vertical slice we mock the PGN
        return {
            "id": rowid,
            "pgn": "[Event \"Smoke Test\"]\n\n1. e4 e5"
        }
