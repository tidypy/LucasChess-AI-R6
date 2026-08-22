import os
import sys
import platform
import logging
from typing import Optional, Dict, Any, List
import chess
import chess.engine

logger = logging.getLogger("deepscout.engine")

ROOT_DIR = os.path.dirname(os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))))

class UCIEngineService:
    """
    Standard Modern UCI Engine Service.
    Uses official python-chess UCI protocol with Stockfish 18 and multi-engine auto-discovery.
    """

    def __init__(self, root_dir: str = ROOT_DIR):
        self.root_dir = root_dir
        self._engine_paths: Dict[str, str] = {}
        self._discover_engines()

    def _discover_engines(self):
        """Scans engine directories for native executables."""
        is_windows = platform.system() == "Windows"
        os_subpath = "win32" if is_windows else "linux"
        engines_base = os.path.join(self.root_dir, "bin", "OS", os_subpath, "Engines")

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
            # Fallback if no binary found: pick first legal move
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
            # Safe legal fallback
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
