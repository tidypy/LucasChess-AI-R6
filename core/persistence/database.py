import sys
import os
import sqlite3
from typing import Optional, List, Dict, Any
import chess.pgn
import io

class GameRepository:
    def __init__(self, db_path: str):
        if not os.path.exists(db_path):
            raise FileNotFoundError(f"Database not found at {db_path}")
        self.db_path = db_path

    def _get_connection(self) -> sqlite3.Connection:
        conn = sqlite3.connect(self.db_path)
        conn.row_factory = sqlite3.Row
        try:
            conn.execute("PRAGMA journal_mode = WAL;")
            conn.execute("PRAGMA synchronous = NORMAL;")
        except Exception:
            pass
        return conn

    def get_game_by_rowid(self, rowid: int) -> Optional[Dict[str, Any]]:
        """
        Retrieves a single game by ROWID, parsing _DATA_ or headers into standard PGN.
        """
        conn = self._get_connection()
        cur = conn.cursor()
        cur.execute("SELECT ROWID, * FROM Games WHERE ROWID = ?", (rowid,))
        row = cur.fetchone()
        conn.close()

        if not row:
            return None

        row_dict = dict(row)
        data = row_dict.get("_DATA_")
        pgn_text = ""

        if data:
            if isinstance(data, bytes):
                if data.startswith(b"BODY "):
                    pgn_text = data[5:].decode("utf-8", errors="replace")
                else:
                    pgn_text = data.decode("utf-8", errors="replace")
            elif isinstance(data, str):
                if data.startswith("BODY "):
                    pgn_text = data[5:]
                else:
                    pgn_text = data

        # If _DATA_ is empty or incomplete, construct from columns
        if not pgn_text or not ("1." in pgn_text or "1 " in pgn_text):
            event = row_dict.get("EVENT") or "LuckAI ChessLab Game"
            site = row_dict.get("SITE") or "Local"
            date = row_dict.get("DATE") or "????.??.??"
            white = row_dict.get("WHITE") or "White"
            black = row_dict.get("BLACK") or "Black"
            result = row_dict.get("RESULT") or "*"
            eco = row_dict.get("ECO") or ""
            opening = row_dict.get("OPENING") or ""
            white_elo = row_dict.get("WHITEELO") or ""
            black_elo = row_dict.get("BLACKELO") or ""

            header_lines = [
                f'[Event "{event}"]',
                f'[Site "{site}"]',
                f'[Date "{date}"]',
                f'[White "{white}"]',
                f'[Black "{black}"]',
                f'[Result "{result}"]',
            ]
            if white_elo:
                header_lines.append(f'[WhiteElo "{white_elo}"]')
            if black_elo:
                header_lines.append(f'[BlackElo "{black_elo}"]')
            if eco:
                header_lines.append(f'[ECO "{eco}"]')
            if opening:
                header_lines.append(f'[Opening "{opening}"]')

            body_content = pgn_text.strip() if pgn_text else f"1. e4 e5 {result}"
            pgn_text = "\n".join(header_lines) + "\n\n" + body_content

        return {
            "id": rowid,
            "white": row_dict.get("WHITE", "White"),
            "black": row_dict.get("BLACK", "Black"),
            "result": row_dict.get("RESULT", "*"),
            "date": row_dict.get("DATE", ""),
            "event": row_dict.get("EVENT", ""),
            "eco": row_dict.get("ECO", ""),
            "opening": row_dict.get("OPENING", ""),
            "plycount": row_dict.get("PLYCOUNT", 0),
            "white_elo": row_dict.get("WHITEELO", ""),
            "black_elo": row_dict.get("BLACKELO", ""),
            "pgn": pgn_text,
        }

    def list_games(
        self,
        page: int = 1,
        page_size: int = 50,
        search: Optional[str] = None,
        white: Optional[str] = None,
        black: Optional[str] = None,
        result: Optional[str] = None,
        eco: Optional[str] = None,
        sort_by: str = "ROWID",
        sort_order: str = "ASC",
    ) -> Dict[str, Any]:
        """
        Fast paginated search and filter across SQLite games.
        """
        conn = self._get_connection()
        cur = conn.cursor()

        where_clauses = []
        params = []

        if search:
            search_pattern = f"%{search.strip()}%"
            where_clauses.append(
                "(WHITE LIKE ? OR BLACK LIKE ? OR EVENT LIKE ? OR OPENING LIKE ?)"
            )
            params.extend([search_pattern, search_pattern, search_pattern, search_pattern])

        if white:
            where_clauses.append("WHITE LIKE ?")
            params.append(f"%{white.strip()}%")

        if black:
            where_clauses.append("BLACK LIKE ?")
            params.append(f"%{black.strip()}%")

        if result:
            where_clauses.append("RESULT = ?")
            params.append(result.strip())

        if eco:
            where_clauses.append("ECO LIKE ?")
            params.append(f"{eco.strip()}%")

        where_sql = ("WHERE " + " AND ".join(where_clauses)) if where_clauses else ""

        # Validate sorting column
        valid_cols = {"ROWID", "WHITE", "BLACK", "RESULT", "DATE", "ECO", "OPENING", "PLYCOUNT", "WHITEELO", "BLACKELO"}
        clean_sort = sort_by.upper() if sort_by.upper() in valid_cols else "ROWID"
        clean_order = "DESC" if sort_order.upper() == "DESC" else "ASC"

        # Count total
        cur.execute(f"SELECT COUNT(*) FROM Games {where_sql}", params)
        total = cur.fetchone()[0]

        # Fetch page
        offset = max(0, (page - 1) * page_size)
        cur.execute(
            f"SELECT ROWID as id, WHITE, BLACK, RESULT, DATE, EVENT, ECO, OPENING, PLYCOUNT, WHITEELO, BLACKELO FROM Games {where_sql} ORDER BY {clean_sort} {clean_order} LIMIT ? OFFSET ?",
            params + [page_size, offset],
        )
        rows = [dict(r) for r in cur.fetchall()]
        conn.close()

        total_pages = max(1, (total + page_size - 1) // page_size)

        return {
            "games": rows,
            "total": total,
            "page": page,
            "page_size": page_size,
            "total_pages": total_pages,
        }

    def list_players(self, search: Optional[str] = None, limit: int = 100) -> List[Dict[str, Any]]:
        """
        Extracts distinct players and game counts with fast union query.
        """
        conn = self._get_connection()
        cur = conn.cursor()

        sql = """
            SELECT player, COUNT(*) as games_count FROM (
                SELECT TRIM(WHITE) as player FROM Games WHERE WHITE IS NOT NULL AND TRIM(WHITE) != ''
                UNION ALL
                SELECT TRIM(BLACK) as player FROM Games WHERE BLACK IS NOT NULL AND TRIM(BLACK) != ''
            )
        """
        params = []
        if search:
            sql += " WHERE player LIKE ?"
            params.append(f"%{search.strip()}%")

        sql += " GROUP BY player ORDER BY games_count DESC, UPPER(player) ASC LIMIT ?"
        params.append(limit)

        cur.execute(sql, params)
        rows = [{"player": r[0], "count": r[1]} for r in cur.fetchall()]
        conn.close()
        return rows

    def get_database_stats(self) -> Dict[str, Any]:
        """
        Computes summary metrics for the active database.
        """
        conn = self._get_connection()
        cur = conn.cursor()

        cur.execute("SELECT COUNT(*) FROM Games")
        total_games = cur.fetchone()[0]

        cur.execute("SELECT RESULT, COUNT(*) FROM Games GROUP BY RESULT")
        result_counts = {r[0] or "*": r[1] for r in cur.fetchall()}

        cur.execute("SELECT ECO, OPENING, COUNT(*) as cnt FROM Games WHERE ECO IS NOT NULL AND ECO != '' GROUP BY ECO, OPENING ORDER BY cnt DESC LIMIT 5")
        top_openings = [{"eco": r[0], "opening": r[1] or r[0], "count": r[2]} for r in cur.fetchall()]

        conn.close()

        return {
            "total_games": total_games,
            "results": result_counts,
            "top_openings": top_openings,
            "path": os.path.basename(self.db_path),
        }

    def import_pgn(self, pgn_content: str) -> int:
        """
        Imports one or multiple games from PGN text into the SQLite database.
        """
        pgn_io = io.StringIO(pgn_content)
        imported_count = 0
        conn = self._get_connection()

        cursor = conn.cursor()
        while True:
            game = chess.pgn.read_game(pgn_io)
            if game is None:
                break

            headers = game.headers
            white = headers.get("White", "Unknown").strip()
            black = headers.get("Black", "Unknown").strip()
            result = headers.get("Result", "*").strip()
            event = headers.get("Event", "PGN Import").strip()
            date = headers.get("Date", "????.??.??").strip()
            site = headers.get("Site", "").strip()
            round_val = headers.get("Round", "").strip()
            eco = headers.get("ECO", "").strip()
            opening = headers.get("Opening", "").strip()
            white_elo = headers.get("WhiteElo", "").strip()
            black_elo = headers.get("BlackElo", "").strip()

            exporter = chess.pgn.StringExporter(headers=True, variations=True, comments=True)
            full_pgn = game.accept(exporter)

            plycount = sum(1 for _ in game.mainline())

            cursor.execute(
                """
                INSERT INTO Games (WHITE, BLACK, RESULT, EVENT, SITE, DATE, ROUND, ECO, OPENING, WHITEELO, BLACKELO, PLYCOUNT, _DATA_)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                """,
                (
                    white,
                    black,
                    result,
                    event,
                    site,
                    date,
                    round_val,
                    eco,
                    opening,
                    white_elo,
                    black_elo,
                    plycount,
                    full_pgn,
                ),
            )
            imported_count += 1

        conn.commit()
        conn.close()
        return imported_count
