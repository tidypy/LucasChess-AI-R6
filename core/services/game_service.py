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

    def _get_or_create_repo(self, db_name: str, create_if_missing: bool = False) -> GameRepository:
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

        if create_if_missing:
            clean_name = db_name if db_name.endswith((".sqlite", ".db")) else f"{db_name}.sqlite"
            new_path = os.path.join(self.root_dir, clean_name)
            repo = GameRepository.create_empty_db(new_path)
            self._repositories[db_name] = repo
            self._repositories[clean_name] = repo
            return repo

        raise FileNotFoundError(f"Database '{db_name}' not found.")

    def set_active_database(self, db_name: str) -> Dict[str, Any]:
        repo = self._get_or_create_repo(db_name)
        self.repo = repo
        self.active_db_path = repo.db_path
        return self.repo.get_database_stats()

    def list_games(
        self,
        page: int = 1,
        page_size: int = 25,
        search: Optional[str] = None,
        white: Optional[str] = None,
        black: Optional[str] = None,
        eco: Optional[str] = None,
        result: Optional[str] = None,
        db_name: Optional[str] = None,
        sort_by: Optional[str] = None,
        sort_order: str = "asc",
    ) -> Dict[str, Any]:
        repo = self._get_or_create_repo(db_name) if db_name else self.repo
        return repo.list_games(
            page=page,
            page_size=page_size,
            search=search,
            white=white,
            black=black,
            eco=eco,
            result=result,
            sort_by=sort_by,
            sort_order=sort_order,
        )

    def get_game(self, game_id: int, db_name: Optional[str] = None) -> Optional[Dict[str, Any]]:
        repo = self._get_or_create_repo(db_name) if db_name else self.repo
        return repo.get_game(game_id)

    def list_players(self, search: Optional[str] = None, limit: int = 50, db_name: Optional[str] = None) -> List[Dict[str, Any]]:
        repo = self._get_or_create_repo(db_name) if db_name else self.repo
        return repo.list_players(search=search, limit=limit)

    def get_stats(self, db_name: Optional[str] = None) -> Dict[str, Any]:
        repo = self._get_or_create_repo(db_name) if db_name else self.repo
        return repo.get_database_stats()

    def list_available_databases(self) -> List[Dict[str, Any]]:
        results = []
        seen_names = set()
        db_exts = (".sqlite", ".db")

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
        repo = self._get_or_create_repo(db_name, create_if_missing=True) if db_name else self.repo
        return repo.import_pgn(pgn_content)

    def ingest_database(self, file_name: str, target_name: str, file_bytes: bytes, strategy: str = "fast") -> Dict[str, Any]:
        clean_target = target_name.strip()
        if not (clean_target.endswith(".sqlite") or clean_target.endswith(".db")):
            clean_target += ".sqlite"

        target_path = os.path.join(self.root_dir, clean_target)
        if os.path.exists(target_path):
            raise FileExistsError(f"Database '{clean_target}' already exists.")

        lower_orig = file_name.lower()
        imported_count = 0

        if lower_orig.endswith(".pgn"):
            try:
                pgn_text = file_bytes.decode("utf-8")
            except UnicodeDecodeError:
                pgn_text = file_bytes.decode("latin-1", errors="replace")

            repo = GameRepository.create_empty_db(target_path)
            imported_count = repo.import_pgn(pgn_text)
            self._repositories[clean_target] = repo
        elif lower_orig.endswith((".sqlite", ".db")):
            with open(target_path, "wb") as f:
                f.write(file_bytes)
            repo = GameRepository(target_path)
            self._repositories[clean_target] = repo
            stats = repo.get_database_stats()
            imported_count = stats.get("total_games", 0)
        else:
            try:
                pgn_text = file_bytes.decode("utf-8")
            except UnicodeDecodeError:
                pgn_text = file_bytes.decode("latin-1", errors="replace")
            repo = GameRepository.create_empty_db(target_path)
            imported_count = repo.import_pgn(pgn_text)
            self._repositories[clean_target] = repo

        self.set_active_database(clean_target)

        return {
            "success": True,
            "db_name": clean_target,
            "imported_games": imported_count,
            "size_mb": round(os.path.getsize(target_path) / (1024 * 1024), 2),
            "strategy": strategy,
        }

    @property
    def trash_dir(self) -> str:
        t_dir = os.path.join(self.root_dir, "UserData", "Trash")
        os.makedirs(t_dir, exist_ok=True)
        return t_dir

    def list_trash(self) -> List[Dict[str, Any]]:
        results = []
        db_exts = (".sqlite", ".db")
        if os.path.exists(self.trash_dir):
            for f in os.listdir(self.trash_dir):
                if f.endswith(db_exts) and not f.startswith("."):
                    path = os.path.join(self.trash_dir, f)
                    if os.path.isfile(path):
                        results.append({
                            "name": f,
                            "path": path,
                            "size_mb": round(os.path.getsize(path) / (1024 * 1024), 2),
                        })
        return results

    def get_storage_telemetry(self) -> Dict[str, Any]:
        active_dbs = self.list_available_databases()
        trash_dbs = self.list_trash()

        active_mb = sum(d["size_mb"] for d in active_dbs)
        trash_mb = sum(d["size_mb"] for d in trash_dbs)
        total_mb = active_mb + trash_mb

        return {
            "total_size_mb": round(total_mb, 2),
            "total_size_gb": round(total_mb / 1024, 2),
            "active_size_mb": round(active_mb, 2),
            "active_size_gb": round(active_mb / 1024, 2),
            "trash_size_mb": round(trash_mb, 2),
            "active_count": len(active_dbs),
            "trash_count": len(trash_dbs),
        }

    def trash_database(self, db_name: str) -> Dict[str, Any]:
        """Soft-deletes a database by moving it into UserData/Trash/ without popup disruption."""
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

        # Reset active database if trashing currently active
        if self.active_db_path == target_path:
            avail = [c for c in self.list_available_databases() if c["name"] != db_name]
            if avail:
                self.set_active_database(avail[0]["name"])
            else:
                self.active_db_path = ""

        # Move to trash directory
        dest_path = os.path.join(self.trash_dir, db_name)
        if os.path.exists(dest_path):
            os.remove(dest_path)

        import shutil
        shutil.move(target_path, dest_path)

        # Move any auxiliary WAL/SHM
        for aux_ext in ["-wal", "-shm"]:
            aux_src = target_path + aux_ext
            aux_dst = dest_path + aux_ext
            if os.path.exists(aux_src):
                try:
                    if os.path.exists(aux_dst):
                        os.remove(aux_dst)
                    shutil.move(aux_src, aux_dst)
                except Exception:
                    pass

        size_mb = round(os.path.getsize(dest_path) / (1024 * 1024), 2)
        return {"success": True, "trashed": db_name, "size_mb": size_mb}

    def restore_database(self, db_name: str) -> Dict[str, Any]:
        """Restores a database from UserData/Trash/ back into the active database shelf."""
        trash_path = os.path.join(self.trash_dir, db_name)
        if not os.path.exists(trash_path):
            raise FileNotFoundError(f"Database '{db_name}' not found in trash.")

        dest_path = os.path.join(self.root_dir, db_name)
        if os.path.exists(dest_path):
            raise FileExistsError(f"Cannot restore '{db_name}' because a database with that name already exists in shelf.")

        import shutil
        shutil.move(trash_path, dest_path)

        for aux_ext in ["-wal", "-shm"]:
            aux_src = trash_path + aux_ext
            aux_dst = dest_path + aux_ext
            if os.path.exists(aux_src):
                try:
                    shutil.move(aux_src, aux_dst)
                except Exception:
                    pass

        return {"success": True, "restored": db_name}

    def purge_trash(self, db_names: Optional[List[str]] = None) -> Dict[str, Any]:
        """Permanently hard-deletes databases marked for deletion in UserData/Trash/."""
        trashed = self.list_trash()
        to_purge = [d for d in trashed if (not db_names or d["name"] in db_names)]

        freed_mb = 0.0
        purged_names = []

        for item in to_purge:
            p = item["path"]
            f_size = item["size_mb"]
            try:
                if os.path.exists(p):
                    os.remove(p)
                for aux in [p + "-wal", p + "-shm"]:
                    if os.path.exists(aux):
                        try:
                            os.remove(aux)
                        except Exception:
                            pass
                freed_mb += f_size
                purged_names.append(item["name"])
            except Exception as e:
                print(f"Error purging {item['name']}: {e}")

        return {
            "success": True,
            "purged_count": len(purged_names),
            "purged_databases": purged_names,
            "freed_mb": round(freed_mb, 2),
        }

    def delete_database(self, db_name: str) -> Dict[str, Any]:
        """Legacy direct deletion; delegates to trash_database for safety."""
        return self.trash_database(db_name)

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
        if not (clean_target.endswith(".sqlite") or clean_target.endswith(".db")):
            clean_target += ".sqlite"

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
