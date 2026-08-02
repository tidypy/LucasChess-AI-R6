# LucasChess R6 — Change Log

## [R6.0.4 - July 31 / August 1, 2026]

### 🚀 New Features & Architecture Upgrades

#### 1. Rating Matrix Engine (`Code/AI/elo_calculator.py`)
- **Depth-Aware Sigmoid ELO**: Implemented logistic accuracy-to-ELO conversion ($\text{ELO} = 800 + \frac{2000}{1 + e^{-0.08 \times (\text{Accuracy} - 72)}}$).
- **Non-Book Accuracy Filtering**: Excludes opening book moves (`is_book == True`) from accuracy and centipawn loss calculations to prevent preparation inflation.
- **Phase Weighting**: Weighted accuracy across game phases: Opening ($20\%$), Middlegame ($50\%$), Endgame ($30\%$).
- **Outlier Trimming**: Implemented $10\%$ trimmed mean / rolling median filtering to eliminate single-game blowouts or short drawish miniatures from distorting long-term player rating trends.
- **Glicko-2 System**: Implemented multi-game Glicko-2 rating ($R$), deviation ($RD$), and volatility ($\sigma$).
- **WDL Converter**: Parses Stockfish `UCI_ShowWDL` output ($W/D/L$ per $1000$) with a logistic fallback $P(W) = \frac{1}{1 + 10^{-\text{CP}/400}}$.

#### 2. Dual-Engine Analytics Layer & DuckDB Active Indicator (`Code/Databases/analytics_engine.py` & `WDB_Perfomance.py`)
- **DuckDB Read-Only Attachment**: ATTACHes SQLite database in read-only mode (`ATTACH 'db.sqlite' AS db (TYPE SQLITE, READ_ONLY)`) for instant C++ vectorized queries when DuckDB is installed.
- **SQLite CTE / NumPy Fallback**: Uses optimized SQLite CTEs + `numpy` arrays if DuckDB is not present.
- **DuckDB Status Badge**: Added a visual status badge (`⚡ DuckDB Engine Active` vs `SQLite Engine Active`) near the Performance Review header so users know when hardware acceleration is active.
- **Live Progress Bar**: Replaced static waiting modals with a live `QProgressBar` and time remaining estimator (`ProgressBarWithTime`) during performance generation across large datasets.

#### 3. Performance Review Tab Refactor (`Code/Databases/WDB_Perfomance.py`)
- **Search Player Autocomplete**: Added `QLineEdit` search box with `QCompleter` (placeholder: *"Begin Typing Name..."*) across Performance and Player Statistics tabs.
- **Matrix Columns**: Added `Sigmoid ELO` (`(Non-Book)`) and `Glicko-2` (`(Rating ± RD)`) columns to the performance grid.
- **Removed Legacy Config**: Stripped legacy `Config` button and `FIDE/MATH/LINEAR` mode switcher that conflicted with the new unified rating matrix.
- **Scouting Dossier Bridge**: Added **"Pass Data to LM"** toolbar button (`Iconos.AIChip()`) to send structured JSON payloads (metrics, phase ACPL, error spectrum, tactical motifs) to local LM Studio endpoints.

#### 4. PGN ETL / Cleaning Tool & Tactical Theme Guidance Note (`Code/Databases/DBgames.py` & `Code/Themes/WDB_Theme_Analysis.py`)
- **PGN ETL & Sanitization**: Added `clean_and_repair_pgn_database()` direct SQL routine to normalize whitespace, standardize result strings (`1-0`, `0-1`, `1/2-1/2`), and clean numeric ELO tags across all games.
- **Tactical Theme Guidance**: Added explanatory tip note in Theme Analysis dialog: *"Tip: To enrich external PGN imports with tactical tags, please run Mass Analysis with 'Tactical themes' enabled."*
- **Mass Analysis Parameters**: Clarified *"Show live evaluation graphs during analysis"* and *"Redo any existing prior analysis (overwrite evaluation tags)"* options in `WindowAnalysisParam.py`.

---

### 🐛 Bug Fixes & Stability Hardening

- **Centralized Translation Guard (`Code/__init__.py`)**: Installed identity fallback lambdas for `_`, `_X`, `_F`, `_FO`, and `_SP` at package startup to prevent `UnboundLocalError: _` crashes in database tabs.
- **AI Memory & Logger Paths (`AIMemory.py`, `AILogger.py`)**: Fixed `folder_intfiles()` invalid attribute errors by routing to `folder_from_userdata()`.
- **WindowTutor Import (`WindowTutor.py`)**: Added missing `from Code.Base import Game` import so PV lines render in human-readable SAN notation instead of raw UCI strings.
- **Arrow Key Grid Navigation (`WDB_Players.py`, `WDB_Games.py`)**: Fixed enum evaluation bug (`if k == QtCore.Qt.Key...`) so Left arrow key navigates correctly.
- **Worker Parameters (`WindowAnalysisParam.py`)**: Passed `multiple_selected` to `_apply_general_params()` so user-configured parallel worker counts apply.
- **ZeroDivisionError & Move Guards (`WDB_Theme_Analysis.py`, `WDB_Perfomance.py`, `WDB_Players.py`)**: Added guards against division-by-zero on empty game selections and friendly warnings when a player has no games with move data.
- **Toolbar Icon Cleanup (`WDB_Players.py`)**: Replaced duplicate `Iconos.Reindexar()` icon with `Iconos.Estadisticas()` for the statistics update action.
- **Grid Selection & Theme Analyzer Fix (`WDB_Theme_Analysis.py`)**: Fixed `wb_games` naming mismatch and added guards to prevent broken PGNs from crashing the entire theme analysis scan.
- **Rating Matrix Precision (`WDB_Perfomance.py`, `analytics_engine.py`)**: Removed `*` (unknown) results from being artificially counted as draws, preventing ratings distortion. Fixed DuckDB badge to accurately reflect SQLite engine usage.
- **Database Engine Stability (`DBgames.py`, `WDB_Perfomance.py`)**: Added missing `None` guards to `read_game_recno` to prevent crashes on stale ROWIDs or deleted games. Force-refreshed `li_row_ids` before matrix calculation.
- **SQL Construction Safety (`DBgames.py`)**: Wrapped `filtro` and `self.filter` strings in parentheses during SQL construction to prevent logical precedence errors when filtering players with aliases.
- **Grid Rendering Safety (`WDB_Players.py`)**: Added index bounds checking in `grid_dato` to prevent `IndexError` crashes when grid data is asynchronously rebuilt.
- **Missing Data User Warnings (`WDB_Perfomance.py`)**: Ensured `missing_data` flag is correctly toggled when ELO data is absent so the UI displays the correct warning instead of misleading "no games" alerts.
