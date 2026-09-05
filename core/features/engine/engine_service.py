import os
import sys
import json
import platform
import logging
from typing import Optional, Dict, Any, List
import chess
import chess.engine
import chess.polyglot
from core.features.openings.opening_book_service import OpeningBookService

logger = logging.getLogger("deepscout.engine")

ROOT_DIR = os.path.dirname(os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))))

DEFAULT_BUILTIN_ENGINES = [
    {
        "id": "stockfish",
        "name": "Stockfish 18",
        "elo": "3500+",
        "style": "Grandmaster Dynamic & Elo Scale",
        "icon": "🤖",
        "is_custom": False,
        "supports_elo": True,
        "min_elo": 1320,
        "max_elo": 3190,
    },
    {
        "id": "dragon",
        "name": "Dragon by Komodo",
        "elo": "3500+",
        "style": "Ultra-Sharp Tactical & Active Piece Play",
        "icon": "🐉",
        "is_custom": False,
        "supports_elo": True,
        "min_elo": 1000,
        "max_elo": 3500,
    },
    {
        "id": "houdini",
        "name": "Houdini 1.5a",
        "elo": "3300",
        "style": "Legendary Tactical Attacker & King Hunter",
        "icon": "🎩",
        "is_custom": False,
        "supports_elo": False,
    },
    {
        "id": "rybka",
        "name": "Rybka 2.3",
        "elo": "3200",
        "style": "Dynamic Sacrificial & Aggressive Play",
        "icon": "🐟",
        "is_custom": False,
        "supports_elo": True,
        "min_elo": 1200,
        "max_elo": 2400,
    },
    {
        "id": "critter",
        "name": "Critter 1.6a",
        "elo": "3100",
        "style": "Sharp Tactical & Counter-Attacking",
        "icon": "🦗",
        "is_custom": False,
        "supports_elo": False,
    },
    {
        "id": "andscacs",
        "name": "Andscacs 0.94",
        "elo": "3100",
        "style": "Modern Precise Tactical Defense",
        "icon": "⚔️",
        "is_custom": False,
        "supports_elo": False,
    },
    {
        "id": "patricia",
        "name": "Patricia 4.0",
        "elo": "2800",
        "style": "Fast Alpha-Beta NNUE Tactician",
        "icon": "⚡",
        "is_custom": False,
        "supports_elo": True,
        "min_elo": 1000,
        "max_elo": 2800,
    },
    {
        "id": "fruit",
        "name": "Fruit 2.3.1",
        "elo": "2850",
        "style": "Classical Pure Positional Calculator",
        "icon": "🍎",
        "is_custom": False,
        "supports_elo": False,
    },
    {
        "id": "toga",
        "name": "Deep Toga",
        "elo": "2800",
        "style": "Relentless King-Side Attacker",
        "icon": "🏛️",
        "is_custom": False,
        "supports_elo": False,
    },
    {
        "id": "rodent",
        "name": "Rodent II",
        "elo": "2700",
        "style": "Flexible Classical Club Master",
        "icon": "🐭",
        "is_custom": False,
        "supports_elo": False,
    },
    {
        "id": "cheng",
        "name": "Cheng 4.41",
        "elo": "2600",
        "style": "Solid Balanced Endgame Specialist",
        "icon": "🛡️",
        "is_custom": False,
        "supports_elo": True,
        "min_elo": 800,
        "max_elo": 2600,
    },
    {
        "id": "cdrill2000",
        "name": "CDrill 2000",
        "elo": "2000",
        "style": "Master Practice Sparring Partner",
        "icon": "🎖️",
        "is_custom": False,
        "supports_elo": False,
    },
    {
        "id": "maia1900",
        "name": "Maia 1900",
        "elo": "1900",
        "style": "Human Club Master Neural Network",
        "icon": "🎯",
        "is_custom": False,
        "supports_elo": False,
    },
    {
        "id": "ct800",
        "name": "CT800 V1.46",
        "elo": "1850",
        "style": "Clean Positional Classicist",
        "icon": "🏰",
        "is_custom": False,
        "supports_elo": True,
        "min_elo": 1000,
        "max_elo": 2400,
    },
    {
        "id": "cdrill",
        "name": "CDrill 1800",
        "elo": "1800",
        "style": "Intermediate Training Partner",
        "icon": "🏅",
        "is_custom": False,
        "supports_elo": False,
    },
    {
        "id": "maia1500",
        "name": "Maia 1500",
        "elo": "1500",
        "style": "Human-like Neural Play (Lichess 1500)",
        "icon": "🧠",
        "is_custom": False,
        "supports_elo": False,
    },
    {
        "id": "maia1100",
        "name": "Maia 1100",
        "elo": "1100",
        "style": "Casual Enthusiast Neural Simulation",
        "icon": "🌱",
        "is_custom": False,
        "supports_elo": False,
    },
]

class UCIEngineService:
    """
    Standard Modern UCI Engine Service.
    Supports Stockfish 18, built-in engines, custom user-registered UCI engines,
    and Polyglot (.bin) Opening Book obedience.
    """

    def __init__(self, root_dir: str = ROOT_DIR):
        self.root_dir = root_dir
        self._engine_paths: Dict[str, str] = {}
        self._custom_engines_file = os.path.join(self.root_dir, "UserData", "custom_engines.json")
        self.book_service = OpeningBookService(self.root_dir)
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

        def find_exe(subfolder: str, names: List[str]) -> Optional[str]:
            folder = os.path.join(engines_base, subfolder)
            if not os.path.exists(folder):
                return None
            for name in names:
                fn = f"{name}.exe" if is_windows else name
                full_p = os.path.join(folder, fn)
                if os.path.exists(full_p):
                    return full_p
            return None

        # 1. Stockfish
        sf_p = find_exe("stockfish", ["Stockfish-18-x86-64-avx2", "Stockfish-18-64", "Stockfish-18-x86-64", "stockfish-18-64"])
        if sf_p:
            self._engine_paths["stockfish"] = sf_p

        # 2. Dragon / Komodo
        dragon_p = find_exe("komodo", ["dragon-64bit-avx2", "komodo-13.02-64bit"])
        if dragon_p:
            self._engine_paths["dragon"] = dragon_p
            self._engine_paths["komodo"] = dragon_p

        # 3. Houdini
        houdini_p = find_exe("houdini", ["Houdini_15a_w32"])
        if houdini_p:
            self._engine_paths["houdini"] = houdini_p

        # 4. Rybka
        rybka_p = find_exe("rybka", ["Rybka v2.3.2a.w32", "Rybka"])
        if rybka_p:
            self._engine_paths["rybka"] = rybka_p

        # 5. Critter
        critter_p = find_exe("critter", ["Critter_1.6a_32bit", "Critter"])
        if critter_p:
            self._engine_paths["critter"] = critter_p

        # 6. Andscacs
        andscacs_p = find_exe("andscacs", ["andscacs_32_no_popcnt", "andscacs"])
        if andscacs_p:
            self._engine_paths["andscacs"] = andscacs_p

        # 7. Patricia
        patricia_p = find_exe("patricia", ["patricia_4_v2", "patricia"])
        if patricia_p:
            self._engine_paths["patricia"] = patricia_p

        # 8. Fruit
        fruit_p = find_exe("fruit", ["Fruit-2-3-1", "Fruit"])
        if fruit_p:
            self._engine_paths["fruit"] = fruit_p

        # 9. Deep Toga
        toga_p = find_exe("toga", ["DeepToga1.9.6nps", "DeepToga"])
        if toga_p:
            self._engine_paths["toga"] = toga_p

        # 10. Rodent II
        rodent_p = find_exe("rodentII", ["rodentII_x32", "rodentII"])
        if rodent_p:
            self._engine_paths["rodent"] = rodent_p

        # 11. Cheng
        cheng_p = find_exe("cheng", ["cheng4_x64", "cheng4"])
        if cheng_p:
            self._engine_paths["cheng"] = cheng_p

        # 12. CDrill 2000
        cdrill2000_p = find_exe("cdrill2000", ["cdrill_2000"])
        if cdrill2000_p:
            self._engine_paths["cdrill2000"] = cdrill2000_p

        # 13. CT800
        ct800_p = find_exe("ct800", ["CT800_V1.46_x64", "CT800_V1.46", "ct800"])
        if ct800_p:
            self._engine_paths["ct800"] = ct800_p

        # 14. CDrill 1800
        cdrill_p = find_exe("cdrill", ["CDrill_1800_Build_4", "CDrill_1800"])
        if cdrill_p:
            self._engine_paths["cdrill"] = cdrill_p

        # 15. Maia (via lc0)
        maia_dir = os.path.join(engines_base, "maia")
        if os.path.exists(maia_dir):
            lc0_p = os.path.join(maia_dir, "lc0.exe" if is_windows else "lc0")
            if os.path.exists(lc0_p):
                self._engine_paths["maia1100"] = lc0_p
                self._engine_paths["maia1500"] = lc0_p
                self._engine_paths["maia1900"] = lc0_p
                self._engine_paths["maia2200"] = lc0_p

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
        """Returns all built-in and user-added custom engines, merging user custom options."""
        custom_engines = self._load_custom_engines()
        custom_by_id = {ce["id"].lower(): ce for ce in custom_engines if "id" in ce}
        
        result_engines = []
        for be in DEFAULT_BUILTIN_ENGINES:
            be_id = be["id"].lower()
            if be_id in custom_by_id:
                # Merge custom user overrides
                merged = dict(be)
                custom_item = custom_by_id[be_id]
                merged["options"] = custom_item.get("options", {})
                if custom_item.get("name"): merged["name"] = custom_item["name"]
                if custom_item.get("elo"): merged["elo"] = custom_item["elo"]
                if custom_item.get("style"): merged["style"] = custom_item["style"]
                if custom_item.get("icon"): merged["icon"] = custom_item["icon"]
                merged["is_custom"] = True
                result_engines.append(merged)
            else:
                result_engines.append(dict(be))

        for ce in custom_engines:
            if ce.get("id", "").lower() not in [b["id"].lower() for b in DEFAULT_BUILTIN_ENGINES]:
                ce_copy = dict(ce)
                ce_copy["is_custom"] = True
                result_engines.append(ce_copy)
        return result_engines

    def browse_engine_executable(self) -> Optional[str]:
        """Opens native OS open-file dialog to select a UCI engine binary."""
        if sys.platform == "win32":
            try:
                import ctypes
                from ctypes import wintypes

                class OPENFILENAMEW(ctypes.Structure):
                    _fields_ = [
                        ('lStructSize', wintypes.DWORD),
                        ('hwndOwner', wintypes.HWND),
                        ('hInstance', wintypes.HINSTANCE),
                        ('lpstrFilter', wintypes.LPCWSTR),
                        ('lpstrCustomFilter', wintypes.LPWSTR),
                        ('nMaxCustFilter', wintypes.DWORD),
                        ('nFilterIndex', wintypes.DWORD),
                        ('lpstrFile', wintypes.LPWSTR),
                        ('nMaxFile', wintypes.DWORD),
                        ('lpstrFileTitle', wintypes.LPWSTR),
                        ('nMaxFileTitle', wintypes.DWORD),
                        ('lpstrInitialDir', wintypes.LPCWSTR),
                        ('lpstrTitle', wintypes.LPCWSTR),
                        ('Flags', wintypes.DWORD),
                        ('nFileOffset', wintypes.WORD),
                        ('nFileExtension', wintypes.WORD),
                        ('lpstrDefExt', wintypes.LPCWSTR),
                        ('lCustData', wintypes.LPARAM),
                        ('lpfnHook', wintypes.LPVOID),
                        ('lpTemplateName', wintypes.LPCWSTR),
                        ('pvReserved', wintypes.LPVOID),
                        ('dwReserved', wintypes.DWORD),
                        ('FlagsEx', wintypes.DWORD)
                    ]

                ofn = OPENFILENAMEW()
                ofn.lStructSize = ctypes.sizeof(OPENFILENAMEW)
                buffer = ctypes.create_unicode_buffer(2048)
                ofn.lpstrFile = ctypes.cast(buffer, wintypes.LPWSTR)
                ofn.nMaxFile = 2048
                ofn.lpstrFilter = "Executable Files (*.exe)\0*.exe\0All Files (*.*)\0*.*\0\0"
                ofn.nFilterIndex = 1
                ofn.lpstrTitle = "Select UCI Engine Executable (.exe)"
                
                OFN_FILEMUSTEXIST = 0x00001000
                OFN_PATHMUSTEXIST = 0x00000800
                OFN_EXPLORER = 0x00080000
                OFN_DONTADDTORECENT = 0x02000000
                ofn.Flags = OFN_FILEMUSTEXIST | OFN_PATHMUSTEXIST | OFN_EXPLORER | OFN_DONTADDTORECENT

                comdlg32 = ctypes.windll.comdlg32
                if comdlg32.GetOpenFileNameW(ctypes.byref(ofn)):
                    res_path = buffer.value
                    if res_path and os.path.isfile(res_path):
                        return res_path
            except Exception as e:
                logger.error("Native Windows browse dialog failed: %s", e)
        return None

    def test_uci_engine(self, executable_path: str) -> Dict[str, Any]:
        """Validates standard UCI handshake and parses all supported UCI options and defaults."""
        clean_path = os.path.expanduser(executable_path.strip().strip('"').strip("'"))
        if not os.path.exists(clean_path):
            return {
                "success": False,
                "error": f"Executable not found at path: {clean_path}",
            }
        if os.path.isdir(clean_path):
            return {
                "success": False,
                "error": f"The selected path is a folder/directory, not an executable file: {clean_path}. Please select a .exe binary.",
            }

        try:
            engine = chess.engine.SimpleEngine.popen_uci(clean_path, timeout=8)
            engine_name = engine.id.get("name", os.path.basename(clean_path))
            engine_author = engine.id.get("author", "Unknown Author")
            
            options_dict: Dict[str, Any] = {}
            for opt_key, opt in engine.options.items():
                options_dict[opt_key] = {
                    "name": opt.name,
                    "type": opt.type,  # 'check', 'spin', 'combo', 'button', 'string'
                    "default": opt.default,
                    "min": getattr(opt, "min", None),
                    "max": getattr(opt, "max", None),
                    "var": list(getattr(opt, "var", [])) if getattr(opt, "var", None) else [],
                    "current": opt.default,
                }

            supports_elo = (
                "UCI_LimitStrength" in engine.options
                or "UCI_Elo" in engine.options
                or "Skill" in engine.options
                or "Skill Level" in engine.options
                or "Skill_Level" in engine.options
            )
            supports_threads = "Threads" in engine.options
            supports_hash = "Hash" in engine.options
            supports_syzygy = "SyzygyPath" in engine.options
            supports_multipv = "MultiPV" in engine.options
            supports_nnue = "EvalFile" in engine.options or "Use NNUE" in engine.options

            engine.quit()

            return {
                "success": True,
                "name": engine_name,
                "author": engine_author,
                "path": clean_path,
                "supports_elo": supports_elo,
                "supports_threads": supports_threads,
                "supports_hash": supports_hash,
                "supports_syzygy": supports_syzygy,
                "supports_multipv": supports_multipv,
                "supports_nnue": supports_nnue,
                "options": options_dict,
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
        options: Optional[Dict[str, Any]] = None,
    ) -> Dict[str, Any]:
        """Registers and persists a custom UCI engine with its customized UCI options."""
        test_res = self.test_uci_engine(path)
        if not test_res.get("success"):
            raise ValueError(test_res.get("error", "Engine test failed"))

        clean_path = test_res["path"]
        engine_id = f"custom_{name.lower().replace(' ', '_')}_{int(os.path.getsize(clean_path)) % 10000}"
        
        custom_list = self._load_custom_engines()
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
            "supports_threads": test_res.get("supports_threads", False),
            "supports_hash": test_res.get("supports_hash", False),
            "supports_syzygy": test_res.get("supports_syzygy", False),
            "options": options or {},
            "all_options": test_res.get("options", {}),
            "is_custom": True,
        }
        custom_list.append(new_entry)
        self._save_custom_engines(custom_list)
        self._engine_paths[engine_id.lower()] = clean_path
        return new_entry

    def update_custom_engine(self, engine_id: str, update_data: Dict[str, Any]) -> Dict[str, Any]:
        """Updates metadata and customized UCI options for an existing custom engine profile."""
        custom_list = self._load_custom_engines()
        found_idx = -1
        for idx, eng in enumerate(custom_list):
            if eng.get("id", "").lower() == engine_id.lower():
                found_idx = idx
                break

        if found_idx == -1:
            # Check if this is a built-in engine being customized
            builtin_eng = next((e for e in DEFAULT_BUILTIN_ENGINES if e["id"].lower() == engine_id.lower()), None)
            if builtin_eng:
                exe_path = self.get_engine_path(engine_id)
                new_entry = {
                    "id": builtin_eng["id"],
                    "name": update_data.get("name", builtin_eng["name"]),
                    "path": exe_path or "",
                    "elo": update_data.get("elo", builtin_eng["elo"]),
                    "style": update_data.get("style", builtin_eng["style"]),
                    "icon": update_data.get("icon", builtin_eng.get("icon", "⚔️")),
                    "supports_elo": builtin_eng.get("supports_elo", False),
                    "options": update_data.get("options", {}),
                    "is_custom": True,
                }
                custom_list.append(new_entry)
                self._save_custom_engines(custom_list)
                return new_entry
            raise ValueError(f"Engine with id '{engine_id}' not found.")

        current = dict(custom_list[found_idx])
        if "name" in update_data and update_data["name"]:
            current["name"] = str(update_data["name"]).strip()
        if "elo" in update_data and update_data["elo"]:
            current["elo"] = str(update_data["elo"]).strip()
        if "style" in update_data and update_data["style"]:
            current["style"] = str(update_data["style"]).strip()
        if "icon" in update_data and update_data["icon"]:
            current["icon"] = str(update_data["icon"]).strip()
        if "options" in update_data and isinstance(update_data["options"], dict):
            current["options"] = update_data["options"]

        custom_list[found_idx] = current
        self._save_custom_engines(custom_list)
        return current

    def clone_engine(self, source_id: str, new_name: str, options_override: Optional[Dict[str, Any]] = None) -> Dict[str, Any]:
        """Duplicates an existing built-in or custom engine into a new customizable profile."""
        src_path = self.get_engine_path(source_id)
        if not src_path or not os.path.exists(src_path):
            raise ValueError(f"Source engine '{source_id}' binary not found on disk.")

        # Find base config
        base_eng = next((e for e in self.get_available_engines() if e["id"].lower() == source_id.lower()), None)
        base_icon = base_eng.get("icon", "⚔️") if base_eng else "⚔️"
        base_elo = base_eng.get("elo", "2400") if base_eng else "2400"
        base_style = base_eng.get("style", "Custom Cloned Engine") if base_eng else "Custom Cloned Engine"
        base_options = dict(base_eng.get("options", {})) if base_eng else {}
        if options_override:
            base_options.update(options_override)

        clean_name = new_name.strip() or f"{source_id.capitalize()} (Custom Profile)"
        return self.register_custom_engine(
            name=clean_name,
            path=src_path,
            elo=str(base_elo),
            style=f"Custom Profile: {clean_name}",
            icon=base_icon,
            options=base_options,
        )

    def remove_custom_engine(self, engine_id: str) -> Dict[str, Any]:
        """Removes a registered custom engine."""
        custom_list = self._load_custom_engines()
        filtered = [e for e in custom_list if e.get("id") != engine_id]
        self._save_custom_engines(filtered)
        if engine_id.lower() in self._engine_paths:
            del self._engine_paths[engine_id.lower()]
        return {"success": True, "removed_id": engine_id}

    def get_custom_engine_config(self, engine_id: str) -> Optional[Dict[str, Any]]:
        custom_list = self._load_custom_engines()
        for eng in custom_list:
            if eng.get("id", "").lower() == engine_id.lower():
                return eng
        return None

    def get_engine_path(self, engine_id: str = "stockfish") -> Optional[str]:
        engine_id_clean = engine_id.lower()
        if engine_id_clean in self._engine_paths:
            return self._engine_paths[engine_id_clean]
        return self._engine_paths.get("stockfish")

    def get_engine_options(self, engine_id: str) -> Dict[str, Any]:
        """Retrieves all native UCI options for an engine via handshake."""
        exe_path = self.get_engine_path(engine_id)
        if not exe_path or not os.path.exists(exe_path):
            return {}
        res = self.test_uci_engine(exe_path)
        return res.get("options", {})

    def play_move(
        self,
        fen: str,
        engine_id: str = "stockfish",
        elo: Optional[int] = None,
        time_limit_sec: float = 0.4,
        depth: Optional[int] = None,
        book_name: Optional[str] = None,
        use_book: bool = True,
    ) -> Dict[str, Any]:
        """
        Executes standard modern UCI 'play' / 'go' commands to return the best engine move.
        First probes the active Polyglot opening book; if in book, plays book move instantly.
        """
        board = chess.Board(fen)
        if board.is_game_over():
            return {
                "success": False,
                "error": "Game is already over in this position.",
                "is_game_over": True,
            }

        # 1. Probe Polyglot Opening Book
        if use_book and self.book_service:
            book_probe = self.book_service.probe_book(board, book_name=book_name)
            if book_probe is not None:
                candidates = book_probe.get("candidates", [])
                uci_log = [
                    f"[POLYGLOT] Probing active opening book: '{book_probe['book_name']}'",
                    f"[POLYGLOT] [OK] Position found in theory with {len(candidates)} candidate variation(s).",
                    f"[POLYGLOT] Selected weighted move: {book_probe['best_move_san']} ({book_probe['best_move_uci']}) [Weight: {book_probe['weight']}]",
                ]
                telemetry = {
                    "source": "opening_book",
                    "engine_name": engine_id,
                    "book_name": book_probe["book_name"],
                    "is_book_move": True,
                    "weight": book_probe["weight"],
                    "candidates": candidates,
                    "active_options": {"Polyglot Book": book_probe["book_name"], "Status": "In Opening Book"},
                    "nps": "Instant (Book Lookup)",
                    "nodes": len(candidates),
                    "depth": 1,
                    "seldepth": 1,
                    "time_ms": 2,
                    "hashfull": 0,
                    "tbhits": 0,
                    "score": "+0.00",
                    "uci_log": uci_log,
                }
                return {
                    "success": True,
                    "engine": engine_id,
                    "best_move_uci": book_probe["best_move_uci"],
                    "best_move_san": book_probe["best_move_san"],
                    "from_square": book_probe["from_square"],
                    "to_square": book_probe["to_square"],
                    "eval_score": "+0.00",
                    "eval_cp": 0,
                    "depth": 1,
                    "pv_san": [book_probe["best_move_san"]],
                    "pv_uci": [book_probe["best_move_uci"]],
                    "is_book_move": True,
                    "book_name": book_probe["book_name"],
                    "book_weight": book_probe["weight"],
                    "book_candidates": candidates,
                    "telemetry": telemetry,
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
                "telemetry": {
                    "source": "random_fallback",
                    "engine_name": "Fallback Engine",
                    "is_book_move": False,
                    "uci_log": ["[WARN] Engine executable not found. Played fallback random legal move."],
                },
            }

        try:
            engine = chess.engine.SimpleEngine.popen_uci(exe_path, timeout=10)
            engine_name = engine.id.get("name", engine_id)
            engine_author = engine.id.get("author", "Unknown Author")
            applied_options: Dict[str, Any] = {}
            uci_log: List[str] = [
                f">> uci",
                f"<< id name {engine_name}",
                f"<< id author {engine_author}",
            ]
            
            # Special configuration for Maia Neural Network models
            if "maia" in engine_id.lower():
                maia_dir = os.path.dirname(exe_path)
                rating = "1500"
                if "1100" in engine_id: rating = "1100"
                elif "1900" in engine_id: rating = "1900"
                elif "2200" in engine_id: rating = "2200"
                weights_path = os.path.join(maia_dir, f"maia-{rating}.pb.gz")
                if os.path.exists(weights_path) and "WeightsFile" in engine.options:
                    try:
                        engine.configure({"WeightsFile": weights_path})
                        applied_options["WeightsFile"] = weights_path
                        uci_log.append(f">> setoption name WeightsFile value {weights_path}")
                    except Exception as me:
                        logger.warning("Could not set Maia WeightsFile: %s", me)

            # Apply configured custom UCI options if available
            custom_cfg = self.get_custom_engine_config(engine_id)
            if custom_cfg and "options" in custom_cfg and isinstance(custom_cfg["options"], dict):
                config_to_apply = {}
                for k, v in custom_cfg["options"].items():
                    if k in engine.options and v is not None and v != "<empty>":
                        opt_meta = engine.options.get(k)
                        if opt_meta and getattr(opt_meta, "type", "") == "button":
                            continue
                        config_to_apply[k] = v
                if config_to_apply:
                    try:
                        engine.configure(config_to_apply)
                        for k, v in config_to_apply.items():
                            applied_options[k] = v
                            uci_log.append(f">> setoption name {k} value {v}")
                    except Exception as cfg_err:
                        logger.warning("Failed to configure custom UCI options for engine %s: %s", engine_id, cfg_err)

            # Universal Elo / Skill strength limit configuration
            if elo is not None:
                target_elo = int(elo)
                # 1. Standard UCI_LimitStrength + UCI_Elo
                if "UCI_LimitStrength" in engine.options:
                    try:
                        cfg_elo = {"UCI_LimitStrength": True}
                        if "UCI_Elo" in engine.options:
                            min_e = getattr(engine.options["UCI_Elo"], "min", 800) or 800
                            max_e = getattr(engine.options["UCI_Elo"], "max", 3190) or 3190
                            cfg_elo["UCI_Elo"] = max(min_e, min(max_e, target_elo))
                            applied_options["UCI_Elo"] = cfg_elo["UCI_Elo"]
                            uci_log.append(f">> setoption name UCI_Elo value {cfg_elo['UCI_Elo']}")
                        engine.configure(cfg_elo)
                        applied_options["UCI_LimitStrength"] = True
                        uci_log.append(f">> setoption name UCI_LimitStrength value true")
                    except Exception as elo_err:
                        logger.warning("Failed to configure UCI_LimitStrength: %s", elo_err)
                elif "UCI_Elo" in engine.options:
                    try:
                        min_e = getattr(engine.options["UCI_Elo"], "min", 800) or 800
                        max_e = getattr(engine.options["UCI_Elo"], "max", 3190) or 3190
                        scaled_elo = max(min_e, min(max_e, target_elo))
                        engine.configure({"UCI_Elo": scaled_elo})
                        applied_options["UCI_Elo"] = scaled_elo
                        uci_log.append(f">> setoption name UCI_Elo value {scaled_elo}")
                    except Exception as elo_err:
                        logger.warning("Failed to configure UCI_Elo: %s", elo_err)

                # 2. Komodo / Dragon "Skill" option (0..25)
                if "Skill" in engine.options:
                    try:
                        max_s = getattr(engine.options["Skill"], "max", 25) or 25
                        min_s = getattr(engine.options["Skill"], "min", 0) or 0
                        skill_val = max(min_s, min(max_s, int(round((target_elo - 1000) / 2500.0 * (max_s - min_s) + min_s))))
                        engine.configure({"Skill": skill_val})
                        applied_options["Skill"] = skill_val
                        uci_log.append(f">> setoption name Skill value {skill_val} (mapped from {target_elo} Elo)")
                    except Exception as skill_err:
                        logger.warning("Failed to configure Skill option: %s", skill_err)

                # 3. Stockfish / Patricia "Skill Level" / "Skill_Level" (0..20)
                for skill_key in ["Skill Level", "Skill_Level"]:
                    if skill_key in engine.options and "UCI_LimitStrength" not in engine.options:
                        try:
                            max_sl = getattr(engine.options[skill_key], "max", 20) or 20
                            min_sl = getattr(engine.options[skill_key], "min", 0) or 0
                            skill_lvl = max(min_sl, min(max_sl, int(round((target_elo - 1000) / 2200.0 * (max_sl - min_sl) + min_sl))))
                            engine.configure({skill_key: skill_lvl})
                            applied_options[skill_key] = skill_lvl
                            uci_log.append(f">> setoption name {skill_key} value {skill_lvl} (mapped from {target_elo} Elo)")
                        except Exception as sl_err:
                            logger.warning("Failed to configure %s: %s", skill_key, sl_err)

            uci_log.append(">> isready")
            uci_log.append("<< readyok")
            uci_log.append(f">> position fen {fen}")
            uci_log.append(f">> go movetime {int(time_limit_sec * 1000)}")

            effective_time = max(0.15, time_limit_sec)
            limit = chess.engine.Limit(time=effective_time, depth=depth)
            
            play_result = engine.play(board, limit)
            best_move = play_result.move

            if best_move is None:
                engine.quit()
                raise ValueError("Engine returned no move")

            san_move = board.san(best_move)
            
            # Quick evaluation & PV
            eval_score = "+0.00"
            eval_cp = 0
            pv_san = [san_move]
            pv_uci = [best_move.uci()]
            info_depth = depth or 12
            info_data: Dict[str, Any] = {}

            try:
                info = engine.analyse(board, chess.engine.Limit(time=min(0.15, effective_time)), info=chess.engine.INFO_ALL)
                info_data = info
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

            nps_val = info_data.get("nps", 0)
            nodes_val = info_data.get("nodes", 0)
            seldepth_val = info_data.get("seldepth", info_depth)
            time_ms_val = round((info_data.get("time") or effective_time) * 1000, 1)
            hashfull_val = info_data.get("hashfull", 0)
            tbhits_val = info_data.get("tbhits", 0)

            uci_log.append(f"<< info depth {info_depth} seldepth {seldepth_val} score cp {eval_cp} nodes {nodes_val} nps {nps_val} time {int(time_ms_val)} hashfull {hashfull_val} pv {' '.join(pv_uci)}")
            uci_log.append(f"<< bestmove {best_move.uci()}")

            telemetry = {
                "source": "uci_engine",
                "engine_name": engine_name,
                "engine_author": engine_author,
                "engine_id": engine_id,
                "is_book_move": False,
                "active_options": applied_options,
                "nps": nps_val,
                "nodes": nodes_val,
                "depth": info_depth,
                "seldepth": seldepth_val,
                "time_ms": time_ms_val,
                "hashfull": hashfull_val,
                "tbhits": tbhits_val,
                "score": eval_score,
                "pv_san": pv_san,
                "pv_uci": pv_uci,
                "uci_log": uci_log,
            }

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
                "telemetry": telemetry,
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
        engine_id: str = "stockfish",
    ) -> Dict[str, Any]:
        """Performs non-blocking position evaluation and principal variation extraction."""
        board = chess.Board(fen)
        exe_path = self.get_engine_path(engine_id)
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
            engine = chess.engine.SimpleEngine.popen_uci(exe_path, timeout=6)
            
            # Apply configured custom UCI options if available
            custom_cfg = self.get_custom_engine_config(engine_id)
            if custom_cfg and "options" in custom_cfg and isinstance(custom_cfg["options"], dict):
                config_to_apply = {}
                for k, v in custom_cfg["options"].items():
                    if k in engine.options and v is not None and v != "<empty>":
                        opt_meta = engine.options.get(k)
                        if opt_meta and getattr(opt_meta, "type", "") == "button":
                            continue
                        config_to_apply[k] = v
                if config_to_apply:
                    try:
                        engine.configure(config_to_apply)
                    except Exception as cfg_err:
                        logger.warning("Failed to configure UCI options during eval: %s", cfg_err)

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

    def request_variations(
        self,
        fen: str,
        engine_id: str = "patricia",
        depth: int = 14,
        multipv: int = 3,
        time_limit_sec: Optional[float] = None,
        threads: int = 1,
        hash_mb: int = 64,
    ) -> List[Dict[str, Any]]:
        """
        Extracts multi-PV candidate lines and applies Section 6 Tag Classifier.
        """
        from core.features.engine.tag_classifier import classify_multipv
        board = chess.Board(fen)
        if board.is_game_over():
            return []

        exe_path = self.get_engine_path(engine_id)
        if not exe_path or not os.path.exists(exe_path):
            return []

        uci_log: List[str] = []
        uci_options: Dict[str, Any] = {}

        try:
            engine = chess.engine.SimpleEngine.popen_uci(exe_path, timeout=8)
            engine_name = engine.id.get("name", engine_id)
            engine_author = engine.id.get("author", "Unknown Author")
            
            uci_log.append(">> uci")
            uci_log.append(f"<< id name {engine_name}")
            uci_log.append(f"<< id author {engine_author}")

            # Apply custom options from profile first
            custom_cfg = self.get_custom_engine_config(engine_id)
            if custom_cfg and "options" in custom_cfg and isinstance(custom_cfg["options"], dict):
                config_to_apply = {}
                for k, v in custom_cfg["options"].items():
                    if k in engine.options and v is not None and v != "<empty>":
                        opt_meta = engine.options.get(k)
                        if opt_meta and getattr(opt_meta, "type", "") == "button":
                            continue
                        config_to_apply[k] = v
                if config_to_apply:
                    try:
                        engine.configure(config_to_apply)
                        uci_options.update(config_to_apply)
                    except Exception as cfg_err:
                        logger.warning("Could not apply custom options to variation search: %s", cfg_err)

            uci_opts = {}
            if "Threads" in engine.options:
                th_val = max(1, min(32, threads))
                uci_opts["Threads"] = th_val
                uci_log.append(f">> setoption name Threads value {th_val}")
            if "Hash" in engine.options:
                h_val = max(16, min(4096, hash_mb))
                uci_opts["Hash"] = h_val
                uci_log.append(f">> setoption name Hash value {h_val}")
            
            if uci_opts:
                try:
                    engine.configure(uci_opts)
                    uci_options.update(uci_opts)
                except Exception as e:
                    logger.warning("Could not set threads/hash: %s", e)

            multipv_supported = "MultiPV" in engine.options
            actual_multipv = max(1, min(multipv, 10)) if multipv_supported else 1

            if multipv_supported and actual_multipv > 1:
                try:
                    engine.configure({"MultiPV": actual_multipv})
                    uci_options["MultiPV"] = actual_multipv
                    uci_log.append(f">> setoption name MultiPV value {actual_multipv}")
                except Exception as e:
                    logger.warning("Could not set MultiPV: %s", e)

            uci_log.append(">> isready")
            uci_log.append("<< readyok")
            uci_log.append(f">> position fen {fen}")
            uci_log.append(f">> go depth {depth}")

            limit = chess.engine.Limit(time=time_limit_sec, depth=depth)
            analysis_results = engine.analyse(board, limit, multipv=actual_multipv)
            engine.quit()

            if isinstance(analysis_results, dict):
                analysis_results = [analysis_results]

            raw_lines: List[Dict[str, Any]] = []
            for item in analysis_results:
                score_obj = item.get("score")
                score_cp = None
                is_mate = False
                mate_in = None
                if score_obj:
                    pov_score = score_obj.white() if board.turn == chess.WHITE else score_obj.black()
                    if pov_score.is_mate():
                        is_mate = True
                        mate_in = pov_score.mate()
                    else:
                        score_cp = pov_score.score()

                pv_moves = item.get("pv", [])
                pv_uci_list = [m.uci() for m in pv_moves[:8]]
                
                temp_board = board.copy()
                pv_san_list = []
                for m in pv_moves[:8]:
                    if m in temp_board.legal_moves:
                        pv_san_list.append(temp_board.san(m))
                        temp_board.push(m)

                line_depth = item.get("depth", depth)
                nps_val = item.get("nps")

                uci_log.append(f"<< info depth {line_depth} score cp {score_cp} pv {' '.join(pv_uci_list)}")

                raw_lines.append({
                    "pv_san": " ".join(pv_san_list),
                    "pv_uci": " ".join(pv_uci_list),
                    "score_cp": score_cp,
                    "is_mate": is_mate,
                    "mate_in": mate_in,
                    "depth": line_depth,
                    "nps": nps_val,
                })

            classified = classify_multipv(raw_lines)
            return {
                "variations": classified,
                "uci_log": uci_log,
                "uci_options": uci_options,
            }
        except Exception as err:
            logger.error("request_variations failed: %s", err)
            return {
                "variations": [],
                "uci_log": [f"[ERROR] Engine request_variations failed: {str(err)}"],
                "uci_options": {},
            }
