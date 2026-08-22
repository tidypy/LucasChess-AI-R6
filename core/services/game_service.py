import os
from typing import Optional, Dict, Any, List
from core.persistence.database import GameRepository

class GameService:
    """
    Business logic and orchestration layer for databases and games.
    """
    def __init__(self, default_repo: GameRepository, root_dir: str):
        self.repo = default_repo
        self.root_dir = root_dir
        self.active_db_path = default_repo.db_path
        self._repositories: Dict[str, GameRepository] = {
            os.path.basename(default_repo.db_path): default_repo
        }

    def _get_or_create_repo(self, db_name: str) -> GameRepository:
        if db_name in self._repositories:
            return self._repositories[db_name]

        # Check in root_dir or Resources/IntFiles/
        candidates = [
            os.path.join(self.root_dir, db_name),
            os.path.join(self.root_dir, "Resources", "IntFiles", db_name),
        ]
        for path in candidates:
            if os.path.exists(path):
                repo = GameRepository(path)
                self._repositories[db_name] = repo
                return repo

        raise FileNotFoundError(f"Database '{db_name}' not found.")

    def set_active_database(self, db_name: str) -> Dict[str, Any]:
        repo = self._get_or_create_repo(db_name)
        self.repo = repo
        self.active_db_path = repo.db_path
        return self.repo.get_database_stats()

    def get_game(self, game_id: int, db_name: Optional[str] = None) -> Optional[Dict[str, Any]]:
        repo = self._get_or_create_repo(db_name) if db_name else self.repo
        return repo.get_game_by_rowid(game_id)

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
        db_name: Optional[str] = None,
    ) -> Dict[str, Any]:
        repo = self._get_or_create_repo(db_name) if db_name else self.repo
        return repo.list_games(
            page=page,
            page_size=page_size,
            search=search,
            white=white,
            black=black,
            result=result,
            eco=eco,
            sort_by=sort_by,
            sort_order=sort_order,
        )

    def list_players(self, search: Optional[str] = None, limit: int = 100, db_name: Optional[str] = None) -> List[Dict[str, Any]]:
        repo = self._get_or_create_repo(db_name) if db_name else self.repo
        return repo.list_players(search=search, limit=limit)

    def get_stats(self, db_name: Optional[str] = None) -> Dict[str, Any]:
        repo = self._get_or_create_repo(db_name) if db_name else self.repo
        return repo.get_database_stats()

    def list_available_databases(self) -> List[Dict[str, Any]]:
        results = []
        seen_names = set()
        db_exts = (".lcdb", ".sqlite", ".db")

        # Check root
        for f in os.listdir(self.root_dir):
            if f.endswith(db_exts) and not f.startswith("."):
                path = os.path.join(self.root_dir, f)
                if os.path.isfile(path):
                    results.append({
                        "name": f,
                        "path": path,
                        "size_mb": round(os.path.getsize(path) / (1024 * 1024), 2),
                        "is_active": path == self.active_db_path,
                    })
                    seen_names.add(f)

        # Check Resources/IntFiles
        int_dir = os.path.join(self.root_dir, "Resources", "IntFiles")
        if os.path.exists(int_dir):
            for f in os.listdir(int_dir):
                if f.endswith(db_exts) and f not in seen_names and not f.startswith("."):
                    path = os.path.join(int_dir, f)
                    if os.path.isfile(path):
                        results.append({
                            "name": f,
                            "path": path,
                            "size_mb": round(os.path.getsize(path) / (1024 * 1024), 2),
                            "is_active": path == self.active_db_path,
                        })
                        seen_names.add(f)
        return results

    def import_pgn(self, pgn_content: str, db_name: Optional[str] = None) -> int:
        repo = self._get_or_create_repo(db_name) if db_name else self.repo
        return repo.import_pgn(pgn_content)

    def delete_database(self, db_name: str) -> Dict[str, Any]:
        target_path = None
        candidates = [
            os.path.join(self.root_dir, db_name),
            os.path.join(self.root_dir, "Resources", "IntFiles", db_name),
        ]
        for path in candidates:
            if os.path.exists(path):
                target_path = path
                break

        if not target_path:
            raise FileNotFoundError(f"Database '{db_name}' not found.")

        # Evict from active repository cache
        if db_name in self._repositories:
            del self._repositories[db_name]

        # Reset active database if deleting currently active
        if self.active_db_path == target_path:
            avail = [c for c in self.list_available_databases() if c["name"] != db_name]
            if avail:
                self.set_active_database(avail[0]["name"])
            else:
                self.active_db_path = ""

        # Remove file and auxiliary WAL/SHM
        try:
            os.remove(target_path)
            for aux in [target_path + "-wal", target_path + "-shm"]:
                if os.path.exists(aux):
                    try:
                        os.remove(aux)
                    except Exception:
                        pass
            return {"success": True, "deleted": db_name}
        except Exception as e:
            raise RuntimeError(f"Could not delete database file: {e}")

    def export_filtered_database(
        self,
        source_db: str,
        target_name: str,
        search: Optional[str] = None,
        white: Optional[str] = None,
        black: Optional[str] = None,
        eco: Optional[str] = None,
        result: Optional[str] = None,
        game_ids: Optional[List[int]] = None,
    ) -> Dict[str, Any]:
        source_repo = self._get_or_create_repo(source_db)
        clean_target = target_name.strip()
        if not (clean_target.endswith(".lcdb") or clean_target.endswith(".sqlite")):
            clean_target += ".lcdb"

        target_path = os.path.join(self.root_dir, clean_target)
        if os.path.exists(target_path):
            raise FileExistsError(f"Database '{clean_target}' already exists.")

        import sqlite3
        src_conn = source_repo._get_connection()
        src_cur = src_conn.cursor()

        # Build query
        query = "SELECT * FROM Games WHERE 1=1"
        params: List[Any] = []
        if game_ids:
            placeholders = ",".join("?" for _ in game_ids)
            query += f" AND ROWID IN ({placeholders})"
            params.extend(game_ids)
        else:
            if search:
                query += " AND (WHITE LIKE ? OR BLACK LIKE ? OR EVENT LIKE ? OR ECO LIKE ?)"
                t = f"%{search}%"
                params.extend([t, t, t, t])
            if white:
                query += " AND WHITE LIKE ?"
                params.append(f"%{white}%")
            if black:
                query += " AND BLACK LIKE ?"
                params.append(f"%{black}%")
            if eco:
                query += " AND ECO LIKE ?"
                params.append(f"%{eco}%")
            if result:
                query += " AND RESULT = ?"
                params.append(result)

        src_cur.execute(query, params)
        col_names = [col[0] for col in src_cur.description]
        rows = src_cur.fetchall()

        if not rows:
            src_conn.close()
            return {"success": True, "target_db": clean_target, "exported_games": 0}

        # Initialize Target SQLite DB
        tgt_conn = sqlite3.connect(target_path)
        tgt_cur = tgt_conn.cursor()

        # Get CREATE TABLE schema from source
        src_cur.execute("SELECT sql FROM sqlite_master WHERE type='table' AND name='Games'")
        create_sql = src_cur.fetchone()
        if create_sql and create_sql["sql"]:
            tgt_cur.execute(create_sql["sql"])
        else:
            tgt_cur.execute("""
                CREATE TABLE Games (
                    WHITE TEXT, BLACK TEXT, RESULT TEXT, DATE TEXT,
                    EVENT TEXT, SITE TEXT, ECO TEXT, PLIES INTEGER,
                    WHITE_ELO INTEGER, BLACK_ELO INTEGER, FEN TEXT,
                    _DATA_ BLOB
                );
            """)

        col_placeholders = ",".join("?" for _ in col_names)
        insert_sql = f"INSERT INTO Games ({','.join(col_names)}) VALUES ({col_placeholders})"

        for r in rows:
            tgt_cur.execute(insert_sql, tuple(r))

        tgt_conn.commit()
        tgt_conn.close()
        src_conn.close()

        # Create repo entry in cache
        self._get_or_create_repo(clean_target)

        return {
            "success": True,
            "target_db": clean_target,
            "exported_games": len(rows),
            "size_mb": round(os.path.getsize(target_path) / (1024 * 1024), 2),
        }
