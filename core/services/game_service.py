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
