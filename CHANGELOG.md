# LucasChess R6 — Change Log

## [R6.0.6 - August 3, 2026]

### 🖥️ UX Modernization, Tiled Welcome Screen & Filter-Driven Analytics
- **Tiled Welcome Screen (`WindowWelcome.py`):** Added a PySide6 tiled dashboard with 5 primary action cards: Databases, Spar against Engine, Trainings & Puzzles, Book Factory, Engine Tourneys.
- **Startup Redirection (`Procesador.py`):** Replaced default 101 Challenge tactics puzzle greeting on startup with `WindowWelcome` hub.
- **Data Fitness Workflow & Gating (`gui_integration.py` & `WDB_Games.py`):** Upgraded "Generate Statistics" to act as a Data Fitness gateway dialog where users explicitly choose to clean data (Mass Analysis) or generate analytics (Tactical Themes). (GitHub Issue #6)
- **Decoupled Grid Selection (`WDB_Games.py` & `WDB_Theme_Analysis.py`):** Decoupled bulk operations from single-row grid selection; tools now authoritatively run on all filtered games.
- **Opening Explorer Filter Persistence (`DBgames.py` & `WDB_Summary.py`):** Modified `rebuild_stat` to evaluate only the filtered database rowids and restricted rebuilding to the manual "Rebuild" button to preserve filter settings across tab switches. (GitHub Issue #7)
- **Performance Tab Decoupling & Caching (`WDB_Perfomance.py`):** Scoped DuckDB/SQLite performance calculations strictly to active grid filters and cached player dictionary arrays to prevent aggressive tab-changed recalculation freezes. (GitHub Issue #8)
- **Players Tab Redesign & SQL Caching (`WDB_Players.py` & `DBgames.py`):** Replaced startup select-player popups with a searchable 'Player List' grid tab, relaxed rigid case-sensitive database schema checks, and added SQLite config caching persistence so player statistics survive restarts. (GitHub Issue #9)
- **Data Fitness Adjudication Wizard (`gui_integration.py`, `result_repair.py`, & `WDB_Games.py`):** Created a missing results (`*`) wizard dialog offering 4 distinct metadata/logic-based adjudication policies (Termination, Last Move, Accuracy/ACPL matchup) with custom engine eval fallbacks. Integrated into the Generate Statistics workflow and added a dedicated toolbar button. (GitHub Issue #10)

### 🐛 Bug Fixes & Executable Packaging
- **DuckDB High-Speed Analytics Engine Toggle & Player List Auto-Filter (`WDB_Perfomance.py` & `WDB_Players.py`):** Added explicit `[x] Use DuckDB High-Speed Analytics Engine` checkbox, updated dynamic engine status indicators (`[🚀 DuckDB Engine Active]` vs `[⚡ SQLite Engine Active]`), configured player list double-click to auto-filter the main Games view grid to the selected player, and added AI Repertoire summary export. (GitHub Issue #17)
- **Performance & Players Tab NameError Fixes (`WDB_Perfomance.py` & `WDB_Players.py`):** Fixed `UnboundLocalError / NameError: name 'query' is not defined` SQL string construction bug in `WDB_Perfomance.py` and removed duplicate lines referencing undefined `data` in `WDB_Players.py`. (GitHub Issue #18)
- **Comprehensive Data Fitness Wizard & Stockfish Live Evaluation (`gui_integration.py` & `result_repair.py`):** Expanded Data Fitness Wizard to include live Stockfish batch evaluation on final FEN positions at low CPU priority (`BELOW_NORMAL_PRIORITY_CLASS`), zero-move outlier purging, user-configurable Win/Draw evaluation thresholds, search depth limits, CPU core safety allocation, and overwrite mode with warning prompts. (GitHub Issue #15)
- **Global UI Action Click Logger & Exception Tracing (`Debug.py` & `LucasChessGui.py`):** Installed a global Qt event filter (`GlobalClickLogger`) on `QApplication` to record every button click, menu selection, and wizard choice into `lucas_debug_trace.log`, redirected `sys.stderr` and `sys.excepthook` for persistent traceback logging, and fixed an `AttributeError: 'NoneType' object has no attribute 'san'` in `Game.lipv_lipgn()` when building player variation trees. (GitHub Issue #16)
- **Database UI Regressions & Filter Fixes (`WDB_Games.py` / `WDB_Filters.py`):** Resolved remaining `TypeError: Grid.recno() takes 1 positional argument` crashes in `tw_data_fitness` and `tw_massive_analysis`. Fixed a chaining layout bug (`setFixedWidth` returning `None` instead of the widget) in `WDB_Filters.py` that crashed filter dialog construction. (GitHub Issue #13)
- **Automatic Position Index Updates (`WDB_Games.py`):** Configured automated triggering of `update_positions_file()` or `generate_positions_file()` at the end of Mass Analysis (`tw_massive_analysis`) and Themes Analysis (`tw_themes`) so position indices remain perfectly synchronized without requiring manual intervention.
- **Database Load `AttributeError` Crash (`WDB_Players.py`):** Fixed `AttributeError: 'WPlayer' object has no attribute 'gridPlayerList'` crash that occurred when opening the Databases view by properly initializing grid attributes before Qt triggers rowCount checks. (GitHub Issue #11)
- **Spar Against Engine `KeyError: 'ISWHITE'` (`WindowWelcome.py`):** Fixed `KeyError` by resolving side color (`dic['ISWHITE'] = side == "B"`) before starting `ManagerPlayAgainstEngine`. (GitHub Issue #3)
- **PyInstaller `numpy` & `duckdb` Bundling (`elo_calculator.py` & `build_exe.py`):** Installed `duckdb` and `numpy` into `.venv`, added pure-Python `_NumPyFallback` in `elo_calculator.py`, and updated `build_exe.py` to `--collect-all` for all dependencies in `requirements.txt`. (GitHub Issue #4)
- **All Venv Dependencies Self-Contained (`build_exe.py`):** Configured `--collect-all` for all `requirements.txt` modules (`PySide6`, `numpy`, `duckdb`, `chess`, `requests`, `urllib3`, `certifi`, `idna`, `bs4`, `cpuinfo`, `psutil`, `PIL`, `polib`, `deep_translator`, `sortedcontainers`, `charset-normalizer`) into `_internal/` bundle.

---

### 🎯 Truthful Performance Metrics & Metric-Gating (Phase 1)

#### 1. Removed Fake Fallback Values (`analytics_engine.py` & `WDB_Perfomance.py`)
- **No More 1500 / 350 Fallbacks:** Removed hardcoded `1500` Elo and `"1500 ± 350"` Glicko-2 fallbacks for games missing player or opponent rating tags. Missing metrics return `None` (rendered as `"—"` in the UI).
- **Separated Accuracy from Score %:** Fixed bug where game score percentage was incorrectly passed as move-accuracy to `SigmoidELOCalculator`. Sigmoid Elo calculation is now strictly gated on actual move-accuracy tags.
- **Metric Population Tracking:** Added `metric_counts` tracking (`basic_games_used`, `elo_games_used`, `elo_games_excluded`, `accuracy_games_used`, `accuracy_games_excluded`).

#### 2. Enhanced UI Transparency & Coverage Reporting (`WDB_Perfomance.py`)
- **Grid Coverage Column:** Added a dynamic `Coverage` column (`Total/Elo/Accuracy` games used) in the performance table.
- **User Exclusion Alerts:** Added explicit notification popups informing users when games are excluded from Elo or Accuracy metrics due to incomplete data.

#### 3. AI Coach Guardrails (`StatsSummary.py`)
- **Exclusion Metadata in Payload:** Passes `elo_metric_games_used` and `elo_metric_games_excluded` into the AI summary prompt payload.
- **Strict Prompt Instructions:** Added system prompt directives prohibiting the LLM from inferring, estimating, or substituting missing metrics.

#### 4. Automated Testing (`test_truthful_performance_metrics.py`)
- Added 6 unit tests verifying truthful metric gating, null returns on missing data, and absence of fake `1500` fallbacks.

### 🛡️ Schema Migration & 4-Tier Quality Validation Engine (Phase 2)

#### 1. Database Safety & Schema Migration (`db_migration.py`)
- **Timestamped Integrity Backup:** `backup_database()` performs WAL checkpointing (`PRAGMA wal_checkpoint(FULL)`) and `PRAGMA integrity_check` before generating safety backup `.lcdb.bak_YYYYMMDD_HHMMSS`.
- **Relational Quality Schema:** Created `GameQuality`, `GameQualityIssue`, and `AnalysisProvenance` tables with foreign key cascades and indexes (`idx_gq_tier`, `idx_gq_status`).
- **Persistent UUID4 Mapping:** Automatically generates UUID4 `GAME_ID` values for existing database records to maintain identity independent of SQLite `rowid` changes.

#### 2. Game Quality & Tier Validation Engine (`game_validator.py`)
- **4-Tier Classification Logic:**
  - **Tier 0:** Dirty/Invalid data (unparseable PGN, missing moves, or unparseable players/result).
  - **Tier 1:** Basic PGN (valid move structure, player names, and normalized result `1-0`, `0-1`, `1/2-1/2`).
  - **Tier 2:** Elo-Ready (Tier 1 + authoritative numeric Elo tags > 0 for both players).
  - **Tier 3:** Gold Standard (Tier 2 + complete Stockfish move analysis & valid provenance).
- **Issue Code Logging:** Logs granular issue codes (`MISSING_WHITE`, `MISSING_BLACK`, `MISSING_RESULT`, `MISSING_ELO`, `INVALID_MOVES`, `PARTIAL_ANALYSIS`) with severity tags.
- **Content Hashing:** Computes SHA256 `source_hash` and `clean_hash` to detect data mutations or stale analysis.

#### 3. Automated Validation Unit Tests (`test_phase2_validation.py`)
- Added 8 comprehensive unit tests covering backups, DDL creation, database migration, tier classification (T0–T3), and result persistence.

### ⚡ Pre-Report Readiness Scan & Tier-Gated Analytics Engine (Phase 3)

#### 1. Database Readiness Summary (`analytics_engine.py`)
- **`get_database_readiness_summary()`**: Executes single-pass `GROUP BY` query on `GameQuality` returning total games, repairable count, and counts per `DERIVED_TIER` (0, 1, 2, 3).
- **`process_gated_analytics()`**: Filters DuckDB and SQLite analytics queries strictly on `DERIVED_TIER >= 3` for chart generation, attaching eligibility metadata and ratio counters.

#### 2. Auto-Validation Hooks (`DBgames.py`)
- **Schema Auto-Creation:** `DBgames.__init__` executes `apply_phase2_schema()` on open.
- **Auto-Validation Triggers:** `DBgames.insert()` and `DBgames.modify()` automatically validate game text and save quality results to `GameQuality` / `GameQualityIssue`.

#### 3. Automated Readiness Unit Tests (`test_phase3_readiness.py`)
- Added unit test suite verifying database readiness summary counts and tier-gated metric calculations.

### 🔬 Stockfish Mass Analysis & Provenance Engine (Phase 4)

#### 1. Analysis Provenance Engine (`analysis_provenance.py`)
- **`AnalysisProvenance` Dataclass & Persistence:** Records `game_id`, `engine_name`, `engine_version`, `depth`, `worker_count`, `analyzed_hash`, and ISO-8601 timestamps into `AnalysisProvenance` table via `record_analysis_provenance()`.
- **Stale Analysis Detection (`is_analysis_stale`):** Automatically flags analysis as stale if game content hash (`CLEAN_HASH`) mutates after analysis run.
- **Mass Analysis Selection (`filter_recnos_for_analysis`):** Supports `"MISSING_ONLY"` mode (skips existing Tier 3 games with fresh analysis, targeting only unanalyzed/stale games) and `"OVERWRITE"` mode.

#### 2. Automated Provenance Unit Tests (`test_phase4_provenance.py`)
- Added 4 unit tests covering provenance upserts, staleness detection, and candidate list filtering.

### 🎨 Visual QtCharts Badges & AI Coach Payload Bridge (Phase 5)

#### 1. UI Bridge & AI Coach Payload Generator (`phase5_ui_bridge.py`)
- **Visual Tier Badges (`get_tier_badge_info`):** Provides standardized metadata (title, color hex, icon, description) for Tier 0 (Invalid), Tier 1 (Basic PGN), Tier 2 (Elo-Ready), and Tier 3 (Gold Standard).
- **Qt-Rich-Text HTML Renderer (`format_readiness_html`):** Formats database readiness summaries into HTML table fragments suitable for `QLabel` and `QMessageBox`.
- **Truthful AI Coach Payload (`build_ai_coach_payload`):** Bundles player stats, explicit exclusion counters (`elo_games_excluded`, `accuracy_games_excluded`), tier distributions, system guardrail directives, and SHA-256 integrity hash for `Code/AI/StatsSummary.py` (LM Studio & OpenAI BYOK).

#### 2. PySide6 GUI Integration Layer (`gui_integration.py`)
- **Readiness Summary Modal (`show_readiness_dialog`):** Renders modal `QMessageBox` with rich-text HTML summary and proceed/cancel buttons.
- **Mass Analysis Policy Control (`create_mass_analysis_policy_widget`):** Provides a PySide6 `QGroupBox` and `QCheckBox` for choosing between `"MISSING_ONLY"` (Skip Tier 3 games) and `"OVERWRITE"` modes.

#### 3. Game Result Repair Engine (`result_repair.py`)
- **Policy 1 Engine Eval Adjudication (`adjudicate_results_by_eval`):** Adjudicates games with `Result "*"` based on centipawn evaluations (eval $\ge 2.0 \rightarrow$ `"1-0"`, $\le -2.0 \rightarrow$ `"0-1"`, $\le \pm 0.55 \rightarrow$ `"1/2-1/2"`), updating PGN headers and upgrading game quality records to Tier 1/2/3.
- **Policy 4 Bulk Result Assignment (`bulk_set_game_results`):** Batch-updates selected game results to `"1-0"`, `"0-1"`, or `"1/2-1/2"` and re-validates quality tiers.

#### 4. Automated Unit Tests (`test_phase5_ui_bridge.py`, `test_gui_integration.py`, `test_result_repair.py`)
- Added 7 unit tests verifying badge metadata lookups, rich-text HTML rendering, SHA-256 payload generation, PySide6 policy widget controls, and result repair engines.

---

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
