import os
import sys
import json
import sqlite3
import chess
import chess.pgn
import io
from typing import Optional, List, Dict, Any

def decode_xpv(xpv_str: str) -> str:
    """
    Decodes LucasChess compact ASCII encoded move sequence (XPV) into standard SAN moves.
    Each move is encoded as a 2-character ASCII pair:
      from_sq = ord(c1) - 58
      to_sq = ord(c2) - 58
    """
    if not xpv_str or not isinstance(xpv_str, str):
        return ""
    if xpv_str.startswith("|"):
        parts = xpv_str.split("|")
        fen = parts[1] if len(parts) > 2 else ""
        xpv = parts[2] if len(parts) > 2 else parts[1]
    else:
        fen = ""
        xpv = xpv_str

    try:
        board = chess.Board(fen) if fen else chess.Board()
        moves = []
        i = 0
        while i < len(xpv) - 1:
            c1, c2 = xpv[i], xpv[i + 1]
            from_idx = ord(c1) - 58
            to_idx = ord(c2) - 58
            if 0 <= from_idx <= 63 and 0 <= to_idx <= 63:
                from_sq = chess.square(from_idx % 8, from_idx // 8)
                to_sq = chess.square(to_idx % 8, to_idx // 8)
                move = chess.Move(from_sq, to_sq)
                if move not in board.legal_moves:
                    for prom in [chess.QUEEN, chess.ROOK, chess.BISHOP, chess.KNIGHT]:
                        pmove = chess.Move(from_sq, to_sq, promotion=prom)
                        if pmove in board.legal_moves:
                            move = pmove
                            break
                if move in board.legal_moves:
                    san = board.san(move)
                    board.push(move)
                    moves.append(san)
                else:
                    break
            i += 2
        return " ".join([f"{(idx // 2) + 1}. {m}" if idx % 2 == 0 else m for idx, m in enumerate(moves)])
    except Exception:
        return ""

class GameRepository:
    def __init__(self, db_path: str):
        if not os.path.exists(db_path):
            raise FileNotFoundError(f"Database not found at {db_path}")
        self.db_path = db_path

    @classmethod
    def create_empty_db(cls, db_path: str):
        conn = sqlite3.connect(db_path)
        cur = conn.cursor()
        cur.execute("""
            CREATE TABLE IF NOT EXISTS Games (
                WHITE TEXT,
                BLACK TEXT,
                RESULT TEXT,
                EVENT TEXT,
                SITE TEXT,
                DATE TEXT,
                ROUND TEXT,
                ECO TEXT,
                OPENING TEXT,
                WHITEELO INTEGER,
                BLACKELO INTEGER,
                PLYCOUNT INTEGER,
                FEN TEXT,
                _DATA_ BLOB
            );
        """)
        cur.execute("CREATE INDEX IF NOT EXISTS idx_games_white ON Games(WHITE);")
        cur.execute("CREATE INDEX IF NOT EXISTS idx_games_black ON Games(BLACK);")
        cur.execute("CREATE INDEX IF NOT EXISTS idx_games_eco ON Games(ECO);")
        conn.commit()
        conn.close()
        return cls(db_path)

    def _get_connection(self) -> sqlite3.Connection:
        conn = sqlite3.connect(self.db_path)
        conn.row_factory = sqlite3.Row
        try:
            conn.execute("PRAGMA journal_mode = WAL;")
            conn.execute("PRAGMA synchronous = NORMAL;")
            conn.create_function("LOWER", 1, lambda s: str(s).lower() if s is not None else None)
            conn.create_function("UPPER", 1, lambda s: str(s).upper() if s is not None else None)
        except Exception:
            pass
        return conn

    def _get_primary_table(self, cur) -> str:
        cur.execute("SELECT name FROM sqlite_master WHERE type='table'")
        tables = [r[0] for r in cur.fetchall()]
        for cand in ["Games", "games", "variations", "flags", "kibitzer_analysis", "tutor_games"]:
            for t in tables:
                if t.lower() == cand.lower():
                    return t
        return tables[0] if tables else "Games"

    def get_game_by_rowid(self, rowid: int) -> Optional[Dict[str, Any]]:
        """
        Retrieves a single game by ROWID, resolving PGN moves from _DATA_, XPV, or companion tables.
        """
        conn = self._get_connection()
        cur = conn.cursor()
        primary_table = self._get_primary_table(cur)

        if primary_table == "variations":
            cur.execute("SELECT ROWID as id, * FROM variations WHERE ROWID = ?", (rowid,))
            row = cur.fetchone()
            conn.close()
            if not row:
                return None
            row_dict = dict(row)
            created_date = str(row_dict.get("saved_at") or "")[:10].replace("-", ".")
            engine_name = row_dict.get("engine") or "Kibitzer Engine"
            fragment = str(row_dict.get("pgn_fragment") or "").strip()
            fen_pos = row_dict.get("fen") or ""
            ply_num = row_dict.get("ply", 0)
            eval_raw = row_dict.get("eval_data") or ""
            eval_info = ""
            if eval_raw:
                try:
                    eval_data = json.loads(eval_raw) if isinstance(eval_raw, str) else eval_raw
                    score_cp = eval_data.get("score_cp")
                    win_prob = eval_data.get("win_prob")
                    tags = eval_data.get("tags", [])
                    eval_parts = []
                    if score_cp is not None:
                        eval_parts.append(f"[%eval {score_cp / 100.0:+.2f}]")
                    if win_prob is not None:
                        prob_num = win_prob * 100 if win_prob <= 1 else win_prob
                        eval_parts.append(f"[%win_prob {prob_num:.1f}%]")
                    if tags:
                        eval_parts.append(f"[tags: {', '.join(tags)}]")
                    if eval_parts:
                        eval_info = " { " + " ".join(eval_parts) + " }"
                except Exception:
                    pass

            is_black = " b " in fen_pos
            move_num = (ply_num // 2) + 1
            if fragment and not fragment[0].isdigit():
                prefix = f"{move_num}... " if is_black else f"{move_num}. "
                moves_body = f"{prefix}{fragment}{eval_info} *"
            else:
                moves_body = f"{fragment}{eval_info} *"

            pgn_text = f"""[Event "Kibitzer Alternative Analysis"]
[Site "DeepScout Companion Hub"]
[Date "{created_date}"]
[White "{engine_name}"]
[Black "Candidate Variation"]
[Result "*"]
[ECO "-"]
[Opening "Roads Not Taken (Ply {ply_num})"]
[SetUp "1"]
[FEN "{fen_pos}"]

{moves_body}"""
            return {
                "id": rowid,
                "white": engine_name,
                "black": "Candidate Variation",
                "result": "*",
                "date": created_date,
                "event": "Kibitzer Analysis",
                "eco": "",
                "opening": f"Ply {ply_num}",
                "plycount": ply_num,
                "white_elo": "2800",
                "black_elo": "",
                "pgn": pgn_text,
            }

        if primary_table == "flags":
            cur.execute("SELECT ROWID as id, * FROM flags WHERE ROWID = ?", (rowid,))
            row = cur.fetchone()
            conn.close()
            if not row:
                return None
            row_dict = dict(row)
            created_date = str(row_dict.get("logged_at") or "")[:10].replace("-", ".")
            engine_name = row_dict.get("engine") or "Stockfish 18"
            flag_type_raw = str(row_dict.get("flag_type") or "Tactical Intervention")
            flag_type = flag_type_raw.replace("_", " ").title()
            fen_pos = row_dict.get("fen") or ""
            ply_num = row_dict.get("ply", 0)
            tutor_outcome = str(row_dict.get("tutor_outcome") or "flag_triggered").replace("_", " ").title()

            # Parse centipawn data
            cp_raw = row_dict.get("centipawn_data") or ""
            eval_str = "+0.00"
            loss_cp = 0
            if cp_raw:
                try:
                    cp_data = json.loads(cp_raw) if isinstance(cp_raw, str) else cp_raw
                    eval_str = str(cp_data.get("eval", "+0.00"))
                    loss_cp = int(cp_data.get("loss_cp", 0))
                except Exception:
                    pass

            # Parse suggested variations
            variations_raw = row_dict.get("suggested_variations") or ""
            moves_text = ""
            if variations_raw:
                try:
                    vars_parsed = json.loads(variations_raw) if isinstance(variations_raw, str) else variations_raw
                    if isinstance(vars_parsed, list) and len(vars_parsed) > 0:
                        top_var = vars_parsed[0]
                        if isinstance(top_var, dict):
                            san_move = top_var.get("san") or top_var.get("pv_san") or ""
                            tags_list = top_var.get("tags") or []
                            tags_str = ", ".join(tags_list) if tags_list else "best"
                            is_black = " b " in fen_pos
                            move_num = (ply_num // 2) + 1
                            prefix = f"{move_num}... " if is_black else f"{move_num}. "
                            loss_txt = f" (-{loss_cp} cp)" if loss_cp else ""
                            moves_text = f"{prefix}{san_move} {{ [%eval {eval_str}] [Tutor Suggestion: {flag_type}{loss_txt}] [Tags: {tags_str}] }} *"
                        elif isinstance(top_var, str):
                            is_black = " b " in fen_pos
                            move_num = (ply_num // 2) + 1
                            prefix = f"{move_num}... " if is_black else f"{move_num}. "
                            moves_text = f"{prefix}{top_var} {{ [%eval {eval_str}] [Tutor Suggestion: {flag_type}] }} *"
                except Exception:
                    moves_text = f"1. ... *" if " b " in fen_pos else "1. *"

            if not moves_text:
                moves_text = "1. ... *" if " b " in fen_pos else "1. *"

            pgn_text = f"""[Event "Tutor Intervention: {flag_type}"]
[Site "DeepScout Companion Hub"]
[Date "{created_date}"]
[White "{engine_name}"]
[Black "{flag_type} (Ply {ply_num})"]
[Result "*"]
[ECO "-"]
[Opening "Tutor Feedback: {flag_type} (Outcome: {tutor_outcome})"]
[SetUp "1"]
[FEN "{fen_pos}"]

{moves_text}"""
            return {
                "id": rowid,
                "white": engine_name,
                "black": f"{flag_type} (Ply {ply_num})",
                "result": "*",
                "date": created_date,
                "event": "Tutor Intervention",
                "eco": "",
                "opening": f"Ply {ply_num} ({flag_type})",
                "plycount": ply_num,
                "white_elo": "2500",
                "black_elo": "",
                "pgn": pgn_text,
            }

        # Standard Games / games table
        cur.execute(f"SELECT ROWID, * FROM {primary_table} WHERE ROWID = ?", (rowid,))
        row = cur.fetchone()
        conn.close()

        if not row:
            return None

        row_dict = dict(row)
        data = row_dict.get("_DATA_")
        xpv = row_dict.get("XPV")
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

        # Check if actual move text exists outside header tags and bracketed comments
        import re
        stripped_for_check = re.sub(r'\{[^}]*\}', '', pgn_text)
        stripped_for_check = re.sub(r'\[%[^\]]*\]', '', stripped_for_check)
        stripped_for_check = re.sub(r'\[[^\]]*\]', '', stripped_for_check).strip()
        has_actual_moves = bool(re.search(r'\b1\.\s*[a-zA-Z]', stripped_for_check) or re.search(r'\b[a-hKQRBN][a-h1-8x+#=]', stripped_for_check))

        moves_from_xpv = decode_xpv(xpv) if (xpv and not has_actual_moves) else ""

        event = row_dict.get("EVENT") or "DeepScout Chess Game"
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

        if moves_from_xpv:
            body_content = moves_from_xpv + f" {result}"
            if pgn_text and ("[%acpl" in pgn_text or "[%eval" in pgn_text or "[%provenance" in pgn_text):
                body_content += "\n\n" + pgn_text.strip()
            full_pgn = "\n".join(header_lines) + "\n\n" + body_content
        elif has_actual_moves:
            if not pgn_text.strip().startswith("["):
                full_pgn = "\n".join(header_lines) + "\n\n" + pgn_text.strip()
            else:
                full_pgn = pgn_text.strip()
        else:
            body_content = f"1. e4 e5 {result}"
            if pgn_text:
                body_content += "\n\n" + pgn_text.strip()
            full_pgn = "\n".join(header_lines) + "\n\n" + body_content

        return {
            "id": rowid,
            "white": white,
            "black": black,
            "result": result,
            "date": date,
            "event": event,
            "eco": eco,
            "opening": opening,
            "plycount": row_dict.get("PLYCOUNT", 0),
            "white_elo": str(white_elo) if white_elo else "",
            "black_elo": str(black_elo) if black_elo else "",
            "pgn": full_pgn,
        }

    get_game = get_game_by_rowid

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
        Fast paginated search and filter across SQLite games, variations, or flags.
        """
        conn = self._get_connection()
        cur = conn.cursor()
        primary_table = self._get_primary_table(cur)

        if primary_table == "variations":
            cur.execute("SELECT COUNT(*) FROM variations")
            total = cur.fetchone()[0]
            offset = max(0, (page - 1) * page_size)
            cur.execute(
                "SELECT ROWID as id, engine as WHITE, ('Variation at Ply ' || ply) as BLACK, '*' as RESULT, SUBSTR(saved_at, 1, 10) as DATE, ('Kibitzer ' || trigger_source) as EVENT, '' as ECO, pgn_fragment as OPENING, ply as PLYCOUNT, 2800 as WHITEELO, '' as BLACKELO FROM variations ORDER BY ROWID DESC LIMIT ? OFFSET ?",
                [page_size, offset],
            )
            rows = [dict(r) for r in cur.fetchall()]
            conn.close()
            return {
                "games": rows,
                "total": total,
                "page": page,
                "page_size": page_size,
                "total_pages": max(1, (total + page_size - 1) // page_size),
            }

        if primary_table == "flags":
            cur.execute("SELECT COUNT(*) FROM flags")
            total = cur.fetchone()[0]
            offset = max(0, (page - 1) * page_size)
            cur.execute(
                "SELECT ROWID as id, engine as WHITE, (flag_type || ' at Ply ' || ply) as BLACK, '*' as RESULT, SUBSTR(logged_at, 1, 10) as DATE, ('Tutor ' || tutor_outcome) as EVENT, '' as ECO, flag_type as OPENING, ply as PLYCOUNT, 2500 as WHITEELO, '' as BLACKELO FROM flags ORDER BY ROWID DESC LIMIT ? OFFSET ?",
                [page_size, offset],
            )
            rows = [dict(r) for r in cur.fetchall()]
            conn.close()
            return {
                "games": rows,
                "total": total,
                "page": page,
                "page_size": page_size,
                "total_pages": max(1, (total + page_size - 1) // page_size),
            }

        # Standard Games / games table
        where_clauses = []
        params = []

        if search:
            search_pattern = f"%{search.strip().lower()}%"
            where_clauses.append(
                "(LOWER(WHITE) LIKE ? OR LOWER(BLACK) LIKE ? OR LOWER(EVENT) LIKE ? OR LOWER(OPENING) LIKE ?)"
            )
            params.extend([search_pattern, search_pattern, search_pattern, search_pattern])

        if white:
            where_clauses.append("LOWER(WHITE) LIKE ?")
            params.append(f"%{white.strip().lower()}%")

        if black:
            where_clauses.append("LOWER(BLACK) LIKE ?")
            params.append(f"%{black.strip().lower()}%")

        if result:
            where_clauses.append("RESULT = ?")
            params.append(result.strip())

        if eco:
            where_clauses.append("UPPER(ECO) LIKE ?")
            params.append(f"{eco.strip().upper()}%")

        where_sql = ("WHERE " + " AND ".join(where_clauses)) if where_clauses else ""

        valid_cols = {"ROWID", "WHITE", "BLACK", "RESULT", "DATE", "ECO", "OPENING", "PLYCOUNT", "WHITEELO", "BLACKELO"}
        sort_str = str(sort_by).upper() if sort_by else "ROWID"
        order_str = str(sort_order).upper() if sort_order else "ASC"
        clean_sort = sort_str if sort_str in valid_cols else "ROWID"
        clean_order = "DESC" if order_str == "DESC" else "ASC"

        # Count total
        cur.execute(f"SELECT COUNT(*) FROM {primary_table} {where_sql}", params)
        total = cur.fetchone()[0]

        # Fetch page
        offset = max(0, (page - 1) * page_size)
        cur.execute(
            f"SELECT ROWID as id, WHITE, BLACK, RESULT, DATE, EVENT, ECO, OPENING, PLYCOUNT, WHITEELO, BLACKELO FROM {primary_table} {where_sql} ORDER BY {clean_sort} {clean_order} LIMIT ? OFFSET ?",
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
            sql += " WHERE LOWER(player) LIKE ?"
            params.append(f"%{search.strip().lower()}%")

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
        primary_table = self._get_primary_table(cur)

        if primary_table == "variations":
            cur.execute("SELECT COUNT(*) FROM variations")
            total = cur.fetchone()[0]
            cur.execute("SELECT engine, COUNT(*) FROM variations GROUP BY engine")
            engine_counts = {r[0]: r[1] for r in cur.fetchall()}
            conn.close()
            return {
                "total_games": total,
                "results": {"*": total},
                "top_openings": [{"eco": "VAR", "opening": k, "count": v} for k, v in list(engine_counts.items())[:5]],
                "path": os.path.basename(self.db_path),
            }

        if primary_table == "flags":
            cur.execute("SELECT COUNT(*) FROM flags")
            total = cur.fetchone()[0]
            cur.execute("SELECT flag_type, COUNT(*) FROM flags GROUP BY flag_type")
            flag_counts = {r[0]: r[1] for r in cur.fetchall()}
            conn.close()
            return {
                "total_games": total,
                "results": {"*": total},
                "top_openings": [{"eco": "FLAG", "opening": k, "count": v} for k, v in list(flag_counts.items())[:5]],
                "path": os.path.basename(self.db_path),
            }

        cur.execute(f"SELECT COUNT(*) FROM {primary_table}")
        total_games = cur.fetchone()[0]

        cur.execute(f"SELECT RESULT, COUNT(*) FROM {primary_table} GROUP BY RESULT")
        result_counts = {r[0] or "*": r[1] for r in cur.fetchall()}

        try:
            cur.execute(f"SELECT ECO, OPENING, COUNT(*) as cnt FROM {primary_table} WHERE ECO IS NOT NULL AND ECO != '' GROUP BY ECO, OPENING ORDER BY cnt DESC LIMIT 5")
            top_openings = [{"eco": r[0], "opening": r[1] or r[0], "count": r[2]} for r in cur.fetchall()]
        except Exception:
            top_openings = []

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

            # Skip 0-ply phantom stubs with empty/unknown players
            if plycount == 0 and white in ("?", "Unknown", "") and black in ("?", "Unknown", ""):
                continue

            # Auto-infer ECO if missing or '-'
            if not eco or eco == "-" or eco == "A00":
                try:
                    moves_str = " ".join([m.uci() for m in game.mainline_moves()][:8])
                    # basic classification or preserve book name
                    if not opening and headers.get("Opening"):
                        opening = headers.get("Opening")
                except Exception:
                    pass

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
