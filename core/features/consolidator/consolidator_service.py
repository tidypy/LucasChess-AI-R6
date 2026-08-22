import os
import sqlite3
import hashlib
from typing import Dict, Any, List

class ConsolidatorService:
    def __init__(self, root_dir: str):
        self.root_dir = root_dir

    def _get_db_path(self, db_name: str) -> str:
        candidates = [
            os.path.join(self.root_dir, db_name),
            os.path.join(self.root_dir, "Resources", "IntFiles", db_name),
        ]
        for c in candidates:
            if os.path.exists(c):
                return c
        return os.path.join(self.root_dir, db_name)

    def merge_databases(
        self,
        source_db_names: List[str],
        target_db_name: str,
        deduplicate: bool = True,
    ) -> Dict[str, Any]:
        """
        Merges games from multiple SQLite databases into a unified target database
        with chunked batch streaming and robust SHA-256 move-sequence deduplication.
        """
        if not target_db_name.endswith(".sqlite") and not target_db_name.endswith(".db") and not target_db_name.endswith(".lcdb"):
            target_db_name += ".Tournament.sqlite"

        target_path = os.path.join(self.root_dir, target_db_name)
        target_abs_path = os.path.abspath(target_path)

        target_conn = sqlite3.connect(target_path)
        skipped_dbs = []

        try:
            target_conn.execute("PRAGMA journal_mode = WAL;")
            target_conn.execute("PRAGMA synchronous = NORMAL;")

            # Create target Games table if not exists
            target_conn.execute(
                """
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
                    WHITEELO TEXT,
                    BLACKELO TEXT,
                    PLYCOUNT INTEGER,
                    _DATA_ TEXT
                )
                """
            )

            seen_hashes = set()
            if deduplicate:
                cur = target_conn.cursor()
                cur.execute("SELECT WHITE, BLACK, DATE, RESULT, PLYCOUNT, SUBSTR(_DATA_, 1, 2000) FROM Games")
                while True:
                    rows = cur.fetchmany(5000)
                    if not rows:
                        break
                    for r in rows:
                        h = hashlib.sha256(f"{r[0]}|{r[1]}|{r[2]}|{r[3]}|{r[4]}|{r[5]}".encode("utf-8")).hexdigest()
                        seen_hashes.add(h)

            total_imported = 0
            total_duplicates = 0
            batch_insert = []

            for src_name in source_db_names:
                src_path = self._get_db_path(src_name)
                src_abs_path = os.path.abspath(src_path)

                # Skip if source database does not exist
                if not os.path.exists(src_path):
                    skipped_dbs.append({"name": src_name, "reason": "File not found"})
                    continue

                # Skip if source database is identical to target database to prevent infinite duplication
                if src_abs_path == target_abs_path:
                    skipped_dbs.append({"name": src_name, "reason": "Source is identical to target"})
                    continue

                src_conn = sqlite3.connect(src_path)
                try:
                    src_conn.row_factory = sqlite3.Row
                    src_cur = src_conn.cursor()
                    src_cur.execute(
                        """
                        SELECT WHITE, BLACK, RESULT, EVENT, SITE, DATE, ROUND, ECO, OPENING, WHITEELO, BLACKELO, PLYCOUNT, _DATA_
                        FROM Games
                        """
                    )

                    while True:
                        rows = src_cur.fetchmany(5000)
                        if not rows:
                            break

                        for r in rows:
                            row_dict = dict(r)
                            white = row_dict.get("WHITE") or ""
                            black = row_dict.get("BLACK") or ""
                            date_val = row_dict.get("DATE") or ""
                            res = row_dict.get("RESULT") or ""
                            ply = row_dict.get("PLYCOUNT") or 0
                            data_val = row_dict.get("_DATA_") or ""

                            if deduplicate:
                                move_snippet = data_val[:2000] if data_val else ""
                                h = hashlib.sha256(f"{white}|{black}|{date_val}|{res}|{ply}|{move_snippet}".encode("utf-8")).hexdigest()
                                if h in seen_hashes:
                                    total_duplicates += 1
                                    continue
                                seen_hashes.add(h)

                            batch_insert.append((
                                white,
                                black,
                                res,
                                row_dict.get("EVENT") or "",
                                row_dict.get("SITE") or "",
                                date_val,
                                row_dict.get("ROUND") or "",
                                row_dict.get("ECO") or "",
                                row_dict.get("OPENING") or "",
                                row_dict.get("WHITEELO") or "",
                                row_dict.get("BLACKELO") or "",
                                ply,
                                data_val,
                            ))

                            if len(batch_insert) >= 2000:
                                target_conn.executemany(
                                    """
                                    INSERT INTO Games (WHITE, BLACK, RESULT, EVENT, SITE, DATE, ROUND, ECO, OPENING, WHITEELO, BLACKELO, PLYCOUNT, _DATA_)
                                    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                                    """,
                                    batch_insert,
                                )
                                target_conn.commit()
                                total_imported += len(batch_insert)
                                batch_insert = []

                finally:
                    src_conn.close()

            if batch_insert:
                target_conn.executemany(
                    """
                    INSERT INTO Games (WHITE, BLACK, RESULT, EVENT, SITE, DATE, ROUND, ECO, OPENING, WHITEELO, BLACKELO, PLYCOUNT, _DATA_)
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                    """,
                    batch_insert,
                )
                target_conn.commit()
                total_imported += len(batch_insert)

            # Query the actual total row count in the target database
            cur = target_conn.cursor()
            cur.execute("SELECT COUNT(*) FROM Games")
            total_db_games = cur.fetchone()[0]

        finally:
            target_conn.close()

        file_size_mb = round(os.path.getsize(target_path) / (1024 * 1024), 2)

        return {
            "status": "ok",
            "target_database": target_db_name,
            "target_path": target_path,
            "total_imported": total_imported,
            "total_duplicates_skipped": total_duplicates,
            "total_games_in_database": total_db_games,
            "skipped_sources": skipped_dbs,
            "file_size_mb": file_size_mb,
        }
