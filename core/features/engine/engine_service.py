import os
import sys
import json
import platform
import logging
from typing import Optional, Dict, Any, List
import chess
import chess.engine

logger = logging.getLogger("deepscout.engine")

ROOT_DIR = os.path.dirname(os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))))

DEFAULT_BUILTIN_ENGINES = [
    {
        "id": "stockfish",
        "name": "Stockfish 18",
        "elo": "3500+",
        "style": "Ultimate Tactical Precision & Elo Scale",
        "icon": "🤖",
        "is_custom": False,
    },
    {
        "id": "patricia",
        "name": "Patricia 4",
        "elo": "2800",
        "style": "Sharp Alpha-Beta Tactical",
        "icon": "⚡",
        "is_custom": False,
    },
    {
        "id": "ct800",
        "name": "CT800",
        "elo": "1850",
        "style": "Positional Classicist",
        "icon": "🛡️",
        "is_custom": False,
    },
    {
        "id": "maia1500",
        "name": "Maia 1500",
        "elo": "1500",
        "style": "Human-like Neural Play",
        "icon": "🧠",
        "is_custom": False,
    },
    {
        "id": "maia1900",
        "name": "Maia 1900",
        "elo": "1900",
        "style": "Club Master Simulation",
        "icon": "🎯",
        "is_custom": False,
    },
]

class UCIEngineService:
    """
    Standard Modern UCI Engine Service.
    Supports Stockfish 18, built-in engines, and custom user-registered UCI engines.
    """

    def __init__(self, root_dir: str = ROOT_DIR):
        self.root_dir = root_dir
        self._engine_paths: Dict[str, str] = {}
        self._custom_engines_file = os.path.join(self.root_dir, "UserData", "custom_engines.json")
        self._discover_engines()
        self._load_custom_engines()

    def _discover_engines(self):
        """Scans engine directories for native executables."""
        is_windows = platform.system() == "Windows"
        os_subpath = "win32" if is_windows else "linux"
        candidates_bases = [
            os.path.join(self.root_dir, "engines", os_subpath, "Engines"),
            os.path.join(self.root_dir, "engines", "Engines"),
            os.path.join(self.root_dir, "engines"),
        ]
        engines_base = next((b for b in candidates_bases if os.path.exists(b)), candidates_bases[0])

        # 1. Stockfish 18
        sf_dir = os.path.join(engines_base, "stockfish")
        if os.path.exists(sf_dir):
            for candidate in [
                "Stockfish-18-x86-64-avx2.exe" if is_windows else "stockfish-18-x86-64-avx2",
                "Stockfish-18-64.exe" if is_windows else "stockfish-18-64",
                "Stockfish-18-x86-64.exe" if is_windows else "stockfish-18-x86-64",
            ]:
                p = os.path.join(sf_dir, candidate)
                if os.path.exists(p):
                    self._engine_paths["stockfish"] = p
                    break

        # 2. Patricia
        patricia_dir = os.path.join(engines_base, "patricia")
        if os.path.exists(patricia_dir):
            for candidate in ["patricia_4_v2.exe" if is_windows else "patricia_4_v2", "patricia.exe" if is_windows else "patricia"]:
                p = os.path.join(patricia_dir, candidate)
                if os.path.exists(p):
                    self._engine_paths["patricia"] = p
                    break

        # 3. CT800
        ct800_dir = os.path.join(engines_base, "ct800")
        if os.path.exists(ct800_dir):
            for candidate in ["CT800_V1.46_x64.exe" if is_windows else "CT800_V1.46_x64", "ct800.exe" if is_windows else "ct800"]:
                p = os.path.join(ct800_dir, candidate)
                if os.path.exists(p):
                    self._engine_paths["ct800"] = p
                    break

        # 4. Maia (via lc0)
        maia_dir = os.path.join(engines_base, "maia")
        if os.path.exists(maia_dir):
            lc0_p = os.path.join(maia_dir, "lc0.exe" if is_windows else "lc0")
            if os.path.exists(lc0_p):
                self._engine_paths["maia1500"] = lc0_p
                self._engine_paths["maia1900"] = lc0_p

    def _load_custom_engines(self) -> List[Dict[str, Any]]:
        if not os.path.exists(self._custom_engines_file):
            return []
        try:
            with open(self._custom_engines_file, "r", encoding="utf-8") as f:
                custom_list = json.load(f)
                for eng in custom_list:
                    if "id" in eng and "path" in eng and os.path.exists(eng["path"]):
                        self._engine_paths[eng["id"].lower()] = eng["path"]
                return custom_list
        except Exception as e:
            logger.warning("Could not read custom engines file: %s", e)
            return []

    def _save_custom_engines(self, engines: List[Dict[str, Any]]):
        os.makedirs(os.path.dirname(self._custom_engines_file), exist_ok=True)
        with open(self._custom_engines_file, "w", encoding="utf-8") as f:
            json.dump(engines, f, indent=2)

    def get_available_engines(self) -> List[Dict[str, Any]]:
        """Returns all built-in and user-added custom engines."""
        custom_engines = self._load_custom_engines()
        all_engines = list(DEFAULT_BUILTIN_ENGINES)
        for ce in custom_engines:
            ce_copy = dict(ce)
            ce_copy["is_custom"] = True
            all_engines.append(ce_copy)
        return all_engines

    def test_uci_engine(self, executable_path: str) -> Dict[str, Any]:
        """Validates standard UCI handshake for a binary."""
        clean_path = os.path.expanduser(executable_path.strip().strip('"').strip("'"))
        if not os.path.exists(clean_path):
            raise FileNotFoundError(f"Executable not found at path: {clean_path}")

        try:
            engine = chess.engine.SimpleEngine.popen_uci(clean_path, timeout=5)
            engine_name = engine.id.get("name", os.path.basename(clean_path))
            engine_author = engine.id.get("author", "Unknown Author")
            options = list(engine.options.keys())
            supports_elo = "UCI_LimitStrength" in options or "UCI_Elo" in options
            engine.quit()

            return {
                "success": True,
                "name": engine_name,
                "author": engine_author,
                "path": clean_path,
                "supports_elo": supports_elo,
                "options": options[:15],
            }
        except Exception as e:
            return {
                "success": False,
                "error": f"UCI Handshake failed: {str(e)}. Ensure this is a valid standard UCI executable.",
            }

    def register_custom_engine(
        self,
        name: str,
        path: str,
        elo: str = "2400",
        style: str = "Custom UCI Engine",
        icon: str = "⚔️",
    ) -> Dict[str, Any]:
        """Registers and persists a custom UCI engine."""
        test_res = self.test_uci_engine(path)
        if not test_res.get("success"):
            raise ValueError(test_res.get("error", "Engine test failed"))

        clean_path = test_res["path"]
        engine_id = f"custom_{name.lower().replace(' ', '_')}_{int(os.path.getsize(clean_path)) % 10000}"
        
        custom_list = self._load_custom_engines()
        # Remove existing with same id or path
        custom_list = [e for e in custom_list if e.get("id") != engine_id and e.get("path") != clean_path]

        new_entry = {
            "id": engine_id,
            "name": name.strip() or test_res.get("name", "Custom Engine"),
            "path": clean_path,
            "elo": elo.strip() or "2400",
            "style": style.strip() or "Custom UCI Tactical Engine",
            "icon": icon or "⚔️",
            "author": test_res.get("author", ""),
            "supports_elo": test_res.get("supports_elo", False),
            "is_custom": True,
        }
        custom_list.append(new_entry)
        self._save_custom_engines(custom_list)
        self._engine_paths[engine_id.lower()] = clean_path
        return new_entry

    def remove_custom_engine(self, engine_id: str) -> Dict[str, Any]:
        """Removes a registered custom engine."""
        custom_list = self._load_custom_engines()
        filtered = [e for e in custom_list if e.get("id") != engine_id]
        self._save_custom_engines(filtered)
        if engine_id.lower() in self._engine_paths:
            del self._engine_paths[engine_id.lower()]
        return {"success": True, "removed_id": engine_id}

    def get_engine_path(self, engine_id: str = "stockfish") -> Optional[str]:
        engine_id_clean = engine_id.lower()
        if engine_id_clean in self._engine_paths:
            return self._engine_paths[engine_id_clean]
        # Default fallback to Stockfish if available
        return self._engine_paths.get("stockfish")

    def play_move(
        self,
        fen: str,
        engine_id: str = "stockfish",
        elo: Optional[int] = None,
        time_limit_sec: float = 0.4,
        depth: Optional[int] = None,
    ) -> Dict[str, Any]:
        """
        Executes standard modern UCI 'play' / 'go' commands to return the best engine move.
        """
        board = chess.Board(fen)
        if board.is_game_over():
            return {
                "success": False,
                "error": "Game is already over in this position.",
                "is_game_over": True,
            }

        exe_path = self.get_engine_path(engine_id)
        if not exe_path or not os.path.exists(exe_path):
            import random
            legal_moves = list(board.legal_moves)
            chosen = random.choice(legal_moves)
            san_move = board.san(chosen)
            return {
                "success": True,
                "engine": engine_id,
                "best_move_uci": chosen.uci(),
                "best_move_san": san_move,
                "from_square": chess.square_name(chosen.from_square),
                "to_square": chess.square_name(chosen.to_square),
                "eval_score": "+0.00",
                "eval_cp": 0,
                "depth": 1,
                "pv_san": [san_move],
                "pv_uci": [chosen.uci()],
                "is_fallback": True,
            }

        try:
            engine = chess.engine.SimpleEngine.popen_uci(exe_path)
            
            # Configure Elo limit if specified and supported by engine
            if elo is not None and "UCI_LimitStrength" in engine.options:
                target_elo = max(800, min(2850, int(elo)))
                engine.configure({"UCI_LimitStrength": True, "UCI_Elo": target_elo})

            limit = chess.engine.Limit(time=time_limit_sec, depth=depth)
            
            # 1. Ask engine for best move
            play_result = engine.play(board, limit)
            best_move = play_result.move

            if best_move is None:
                engine.quit()
                raise ValueError("Engine returned no move")

            san_move = board.san(best_move)
            
            # 2. Get quick evaluation & PV
            eval_score = "+0.00"
            eval_cp = 0
            pv_san = [san_move]
            pv_uci = [best_move.uci()]
            info_depth = depth or 12

            try:
                info = engine.analyse(board, chess.engine.Limit(time=min(0.15, time_limit_sec)))
                info_depth = info.get("depth", info_depth)
                score_obj = info.get("score")
                if score_obj is not None:
                    pov_score = score_obj.white()
                    if pov_score.is_mate():
                        mate_moves = pov_score.mate()
                        eval_score = f"#{mate_moves}" if mate_moves else "#0"
                    else:
                        cp_val = pov_score.score()
                        eval_cp = cp_val if cp_val is not None else 0
                        eval_score = f"{eval_cp / 100.0:+.2f}"

                if "pv" in info and info["pv"]:
                    pv_uci = [m.uci() for m in info["pv"][:5]]
                    temp_board = board.copy()
                    pv_san_list = []
                    for m in info["pv"][:5]:
                        if m in temp_board.legal_moves:
                            pv_san_list.append(temp_board.san(m))
                            temp_board.push(m)
                    if pv_san_list:
                        pv_san = pv_san_list
            except Exception as e:
                logger.warning("Secondary analysis failed: %s", e)

            engine.quit()

            return {
                "success": True,
                "engine": engine_id,
                "best_move_uci": best_move.uci(),
                "best_move_san": san_move,
                "from_square": chess.square_name(best_move.from_square),
                "to_square": chess.square_name(best_move.to_square),
                "eval_score": eval_score,
                "eval_cp": eval_cp,
                "depth": info_depth,
                "pv_san": pv_san,
                "pv_uci": pv_uci,
            }
        except Exception as err:
            logger.error("UCI Engine error: %s", err)
            legal_moves = list(board.legal_moves)
            if not legal_moves:
                return {"success": False, "error": "No legal moves available."}
            chosen = legal_moves[0]
            return {
                "success": True,
                "engine": engine_id,
                "best_move_uci": chosen.uci(),
                "best_move_san": board.san(chosen),
                "from_square": chess.square_name(chosen.from_square),
                "to_square": chess.square_name(chosen.to_square),
                "eval_score": "+0.00",
                "eval_cp": 0,
                "depth": 1,
                "pv_san": [board.san(chosen)],
                "pv_uci": [chosen.uci()],
                "is_fallback": True,
            }

    def evaluate_position(
        self,
        fen: str,
        depth: int = 14,
        time_limit_sec: float = 0.3,
    ) -> Dict[str, Any]:
        """Performs non-blocking position evaluation and principal variation extraction."""
        board = chess.Board(fen)
        exe_path = self.get_engine_path("stockfish")
        if not exe_path or not os.path.exists(exe_path):
            return {
                "success": False,
                "eval_score": "+0.00",
                "eval_cp": 0,
                "best_move_san": "",
                "best_move_uci": "",
                "main_line": "",
                "depth": 0,
            }

        try:
            engine = chess.engine.SimpleEngine.popen_uci(exe_path)
            info = engine.analyse(board, chess.engine.Limit(time=time_limit_sec, depth=depth))
            engine.quit()

            score_obj = info.get("score")
            eval_score = "+0.00"
            eval_cp = 0
            if score_obj:
                pov_score = score_obj.white()
                if pov_score.is_mate():
                    mate_val = pov_score.mate()
                    eval_score = f"#{mate_val}" if mate_val else "#0"
                else:
                    cp_val = pov_score.score()
                    eval_cp = cp_val if cp_val is not None else 0
                    eval_score = f"{eval_cp / 100.0:+.2f}"

            pv_moves = info.get("pv", [])
            best_move_uci = pv_moves[0].uci() if pv_moves else ""
            best_move_san = board.san(pv_moves[0]) if pv_moves and pv_moves[0] in board.legal_moves else ""

            temp_board = board.copy()
            main_line_tokens = []
            for m in pv_moves[:6]:
                if m in temp_board.legal_moves:
                    main_line_tokens.append(temp_board.san(m))
                    temp_board.push(m)

            return {
                "success": True,
                "eval_score": eval_score,
                "eval_cp": eval_cp,
                "best_move_san": best_move_san,
                "best_move_uci": best_move_uci,
                "main_line": " ".join(main_line_tokens),
                "depth": info.get("depth", depth),
            }
        except Exception as err:
            logger.error("Evaluation failed: %s", err)
            return {
                "success": False,
                "eval_score": "+0.00",
                "eval_cp": 0,
                "best_move_san": "",
                "best_move_uci": "",
                "main_line": "",
                "depth": 0,
                "error": str(err),
            }
