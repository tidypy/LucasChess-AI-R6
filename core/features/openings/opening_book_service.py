import os
import json
import logging
from typing import Dict, Any, List, Optional
import chess
import chess.polyglot

logger = logging.getLogger("OpeningBookService")

class OpeningBookService:
    """
    Manages discovery, import, probe, and selection of Polyglot (.bin) opening books.
    """
    def __init__(self, root_dir: str):
        self.root_dir = root_dir
        self.user_books_dir = os.path.join(root_dir, "UserData", "OpeningBooks")
        self.config_file = os.path.join(root_dir, "UserData", "active_book.json")
        os.makedirs(self.user_books_dir, exist_ok=True)

    def _get_system_book_dirs(self) -> List[str]:
        return [
            os.path.join(self.root_dir, "Resources", "Openings"),
            os.path.join(self.root_dir, "Resources", "Openings", "Players"),
            os.path.join(self.root_dir, "Resources", "Openings", "Extras"),
        ]

    def get_active_book(self) -> Dict[str, Any]:
        """Returns metadata for the currently active opening book."""
        active_name = "GMopenings.bin"
        if os.path.exists(self.config_file):
            try:
                with open(self.config_file, "r", encoding="utf-8") as f:
                    data = json.load(f)
                    active_name = data.get("active_book", active_name)
            except Exception:
                pass

        path = self.resolve_book_path(active_name)
        return {
            "name": active_name,
            "path": path,
            "exists": path is not None and os.path.exists(path),
        }

    def set_active_book(self, book_name: str) -> Dict[str, Any]:
        """Sets the default opening book to be used across Sparring and Analysis."""
        path = self.resolve_book_path(book_name)
        if not path or not os.path.exists(path):
            raise FileNotFoundError(f"Opening book '{book_name}' was not found.")

        with open(self.config_file, "w", encoding="utf-8") as f:
            json.dump({"active_book": book_name}, f, indent=2)

        return {"status": "ok", "active_book": book_name, "path": path}

    def resolve_book_path(self, book_name: str) -> Optional[str]:
        """Finds absolute path of a book by filename or name across user and system directories."""
        if not book_name:
            return None
        
        clean_name = os.path.basename(book_name)
        if not clean_name.endswith(".bin") and not clean_name.endswith(".pgn"):
            clean_name += ".bin"

        # Check user directory first
        user_path = os.path.join(self.user_books_dir, clean_name)
        if os.path.exists(user_path):
            return user_path

        # Check direct path
        if os.path.exists(book_name):
            return book_name

        # Check system directories
        for d in self._get_system_book_dirs():
            candidate = os.path.join(d, clean_name)
            if os.path.exists(candidate):
                return candidate

        return None

    def list_books(self) -> List[Dict[str, Any]]:
        """Lists all user-imported and built-in opening books."""
        active = self.get_active_book().get("name", "GMopenings.bin")
        results: List[Dict[str, Any]] = []
        seen_names = set()

        # 1. User Imported Books
        if os.path.exists(self.user_books_dir):
            for f in os.listdir(self.user_books_dir):
                if f.endswith((".bin", ".pgn")):
                    fp = os.path.join(self.user_books_dir, f)
                    sz = round(os.path.getsize(fp) / 1024.0, 1)
                    results.append({
                        "name": f,
                        "filename": f,
                        "path": fp,
                        "size_kb": sz,
                        "category": "User Imported",
                        "is_user_imported": True,
                        "is_active": f.lower() == active.lower(),
                    })
                    seen_names.add(f.lower())

        # 2. Built-in Grandmaster & System Books
        for d in self._get_system_book_dirs():
            if os.path.exists(d):
                cat = "Player Repertoires" if "Players" in d else "Tournament Books" if "Openings" in d and "Extras" not in d else "Extra Books"
                for f in os.listdir(d):
                    if f.endswith(".bin") and f.lower() not in seen_names:
                        fp = os.path.join(d, f)
                        sz = round(os.path.getsize(fp) / 1024.0, 1)
                        results.append({
                            "name": f,
                            "filename": f,
                            "path": fp,
                            "size_kb": sz,
                            "category": cat,
                            "is_user_imported": False,
                            "is_active": f.lower() == active.lower(),
                        })
                        seen_names.add(f.lower())

        return results

    list_available_books = list_books

    def import_book(self, filename: str, content: bytes) -> Dict[str, Any]:
        """Imports and persists a Polyglot .bin opening book into UserData/OpeningBooks."""
        clean_name = os.path.basename(filename)
        if not clean_name.endswith(".bin") and not clean_name.endswith(".pgn"):
            clean_name += ".bin"

        dest_path = os.path.join(self.user_books_dir, clean_name)
        with open(dest_path, "wb") as f:
            f.write(content)

        # Validate polyglot structure if .bin
        entry_count = 0
        if clean_name.endswith(".bin"):
            try:
                board = chess.Board()
                with chess.polyglot.open_reader(dest_path) as reader:
                    entry_count = len(list(reader.find_all(board)))
            except Exception as e:
                logger.warning("Imported book '%s' validated with warning: %s", clean_name, e)

        file_size_kb = round(len(content) / 1024.0, 1)
        # Automatically make active upon user import
        self.set_active_book(clean_name)

        return {
            "status": "ok",
            "name": clean_name,
            "path": dest_path,
            "size_kb": file_size_kb,
            "is_active": True,
            "starting_entries_count": entry_count,
        }

    def probe_book(
        self,
        board: Any,
        book_name: Optional[str] = None,
    ) -> Optional[Dict[str, Any]]:
        """
        Probes the active or specified opening book for candidate moves.
        Returns the weighted chosen move and all candidate branch entries.
        """
        if isinstance(board, str):
            try:
                board = chess.Board(board)
            except Exception:
                return None

        target_path = self.resolve_book_path(book_name) if book_name else self.get_active_book().get("path")
        if not target_path or not os.path.exists(target_path) or not target_path.endswith(".bin"):
            return None

        try:
            with chess.polyglot.open_reader(target_path) as reader:
                entries = list(reader.find_all(board))
                if not entries:
                    return None

                # Select move using weighted random choice from polyglot book
                try:
                    chosen_entry = reader.weighted_choice(board)
                except IndexError:
                    chosen_entry = entries[0]

                best_move = chosen_entry.move
                candidates = []
                total_weight = sum(e.weight for e in entries) or 1

                for e in entries:
                    san = board.san(e.move) if e.move in board.legal_moves else e.move.uci()
                    candidates.append({
                        "san": san,
                        "uci": e.move.uci(),
                        "weight": e.weight,
                        "weight_pct": round((e.weight / total_weight) * 100.0, 1),
                        "learn": getattr(e, "learn", 0),
                    })

                return {
                    "book_name": os.path.basename(target_path),
                    "best_move": best_move,
                    "best_move_san": board.san(best_move) if best_move in board.legal_moves else best_move.uci(),
                    "best_move_uci": best_move.uci(),
                    "from_square": chess.square_name(best_move.from_square),
                    "to_square": chess.square_name(best_move.to_square),
                    "weight": chosen_entry.weight,
                    "candidates": candidates,
                }
        except Exception as e:
            logger.warning("Failed probing opening book '%s': %s", target_path, e)
            return None
