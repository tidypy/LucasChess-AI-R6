# DeepScout Chess — Issues Fixed & Mathematical KPI Engine Specification

This document details the code review findings, architectural enhancements, bug fixes, and formal mathematical implementations applied to **DeepScout Chess**.

---

## 1. Executive Summary & App Rebranding

- **Product Name**: DeepScout Chess (DSC)
- **Standardized DB Extension**: Standard SQLite format (`*.Tournament.sqlite`, `*.TacticsDB.sqlite`, `*.Repertoire.sqlite`, with legacy support for `.lcdb` and `.db`).
- **Architecture**: Vertical-slice microservice architecture. Each analytics, scouting, and database tool operates as an isolated feature with dedicated frontend views and backend micro-routers.

---

## 2. Issues Identified and Resolved

| # | Component | Severity | Issue Identified | Resolution Applied |
|---|---|---|---|---|
| 1 | `chess_math.py` | 🔴 High | Glicko-2 bracket search `while` loop had no safety ceiling (risk of infinite loop). | Added bounded ceiling check `while ... and k <= 100:` to prevent runaway iteration. |
| 2 | `chess_math.py` | 🟠 Med | Volatility solver returned stale endpoint `A` rather than active updated estimate `B`. | Updated solver to compute `new_sigma = math.exp(B / 2.0)`. |
| 3 | `dossier_service.py` | 🟠 Med | Repertoire performance rating passed wins only, ignoring draws. | Added full tracking for wins, draws, and losses per opening with score `wins + 0.5 * draws`. |
| 4 | `dossier_service.py` | 🟠 Med | Unescaped SQL `LIKE` wildcards (`%`, `_`) caused accidental broad pattern matches. | Added `_escape_like()` helper and appended `ESCAPE '\\'` to all SQL LIKE queries. |
| 5 | `dossier_service.py` | 🟠 Med | Opponent rating fallback was fixed to 2550 with RD=60, artificially inflating club-level player KPIs. | Replaced with dynamic player baseline rating and realistic uncertainty (`RD=200` when unrated, `RD=60` when established). |
| 6 | `consolidator_service.py` | 🟠 Med | Merging a database into itself caused exponential duplicate row insertion. | Added guard `if src_abs_path == target_abs_path: skip`. |
| 7 | `consolidator_service.py` | 🟠 Med | Dedup hash evaluated only 100 chars of `_DATA_`, risking collision on identical opening lines. | Extended SHA-256 evaluation window to 2000 chars of move data. |
| 8 | `consolidator_service.py` | 🟡 Low | Reported imported count didn't reflect true database total after crash-retries. | Added `SELECT COUNT(*) FROM Games` query to report `total_games_in_database` and skipped database list. |
| 9 | `dossier_service.py` | 🔴 High | Database connection unclosed upon query exceptions (resource leak). | Wrapped all database query scopes in `try / finally: conn.close()`. |
| 10 | `dossier_service.py` | 🟡 Low | Unused `import os` and possible negative loss percentage on rounding edge cases. | Cleaned unused imports and guarded percentages with `max(0, 100 - win_pct - draw_pct)`. |
| 11 | `fashion_service.py` | 🟠 Med | `timeRange` filter ("Full History" vs "Last 20 Years") was not connected to backend query. | Added `time_range` query parameter in `router.py` and dynamic temporal aggregation in `fashion_service.py`. |
| 12 | `consolidator_service.py` | 🟠 Med | Unbounded `fetchall()` in memory during database merges risked OOM. | Implemented chunked streaming with `fetchmany(5000)` and batch `executemany(2000)`. |
| 13 | `DossierView.tsx` | 🔴 High | `React.FormEvent` type used without explicit namespace import. | Changed to `import { useState, type FormEvent } from "react"`. |
| 14 | `CompareView.tsx` | 🟠 Med | Player names were frozen with no inputs to search or switch players. | Added search input bars for Player A & B and a **Swap Players** button. |
| 15 | `DatabaseBrowserView.tsx` | 🔴 High | Blank white screen on unhandled theme access or missing `games` array. | Added safe null-coalescing defaults, list view table mode, and wrapped views in `ErrorBoundary`. |
| 16 | `DatabaseBrowserView.tsx` | 🔴 High | React 19 crash on `Piece2` render caused by passing legacy keyword `position: "start"` into `react-chessboard` v5.12 (parsed as non-existent piece `'bS'`). | Replaced with dynamic `previewFen` using standard valid FEN strings and `chess.js` PGN preview loader. |
| 17 | `DataFitnessView.tsx` / `fitness_service.py` / `mass_analysis_service.py` | 🔴 High | Missing 4-tier data fitness lifecycle, result adjudication cascade, and resilient mass Stockfish analysis. | Implemented full Data Fitness Studio, result adjudication cascade, Polyglot Silver stats generation, and atomic WAL Stockfish mass analysis. |
| 18 | `DatabaseBrowserView.tsx` | 🟠 Med | Dead header tabs (`Maintenance`, `Cloud Vault`, `Reports`) and unlinked sidebar folders. | Identified dead buttons, replaced static placeholders with functional navigation and routing hooks. |
| 19 | `clickLogger.tsx` | 🟡 Low | Duplicate click events logged simultaneously (global mouse interceptor + manual component handlers). | Streamlined logging architecture to prevent redundant spam and self-referential logging loops. |
| 20 | `AIGrandmasterView.tsx` / `ai_service.py` / `router.py` | 🟢 Feature | AI Grandmaster workspace was static placeholder without BYOK or Local LLM connectivity. | Implemented full 2-Tile BYOK architecture (LM Studio / Ollama + Cloud OpenAI/OpenRouter/DeepSeek), 5 distinct Grandmaster personas (Tal, Karpov, Kasparov, Carlsen, Tutor), Stockfish-to-Natural-Language coaching pipeline, and Markdown player memory profile manager. |
| 21 | `core/api/main.py` / `core/sidecar.py` | 🔴 High | Legacy `FasterCode` import caused unhandled exception during sidecar initialization. | Removed obsolete import and verified clean standalone FastAPI startup via `.venv` python environment. |
| 22 | `AskGrandmasterAction.tsx` / `ai_service.py` / `.gitignore` | 🛡️ Security | Risk of API key leakage on shared/work machines or accidental Git commits, plus lack of universal coaching action. | Added local XOR salt cipher obfuscation, `.gitignore` secret exclusion for `ai_config.json`, client-side key masking (`sk-••••••••1234`), and created the universal `<AskGrandmasterAction />` component for Analysis, Kibitzer, and game exploration. |
| 23 | `SparView.tsx` / `BookBuilderView.tsx` / `DesktopMenu.tsx` / `Wing.tsx` | 🟢 Feature | Sparring and Opening Book Builder were hidden inside submenus without dedicated first-class workspaces. | Promoted **Sparring** and **Book Builder** to standalone primary features with dedicated views, interactive Elo/Engine and Polyglot tree configurations, top navigation tabs, and left wing navigation rail icons. |
| 24 | `DatabaseBrowserView.tsx` / `DesktopMenu.tsx` / `Wing.tsx` | 🎨 UX / Architecture | `Compare` and `Fashion Index` were cluttering top-level navigation instead of behaving as database sub-features and reports. | Reorganized `DatabaseBrowserView` into a unified **Database Hub** with sub-tabs (**Shelf & Games**, **Fashion Index**, **Player Dossier & Compare**, **Data Fitness**, **Consolidator**), and streamlined top-level navigation to 5 core features. |
| 25 | `DatabaseBrowserView.tsx` / `DataFitnessView.tsx` | 🟢 Feature / UX | Clicking 'Add Database' lacked native file browser dialog and seamless handoff into the Data Fitness Ingestion pipeline. | Wired **Add Database** button to trigger the native file browser dialog (`.pgn`, `.sqlite`, `.lcdb`, `.cbh`), automatically hand off the selected file to **Data Fitness Pipeline**, and allow the user to select ingestion strategy (Fast Ingest, Sanitize & Repair, Gold Mass Stockfish Analysis, or Polyglot Repertoire extraction). |
| 26 | `DatabaseBrowserView.tsx` / `game_service.py` / `main.py` / `api.ts` | 🟢 Feature | Users were unable to delete databases or export filtered subsets of games into new smaller databases. | Implemented backend endpoints (`DELETE /api/v1/databases/{db_name}` and `POST /api/v1/databases/export-filtered`), safe connection closing & WAL cleanup, UI trash/delete action with confirmation modal, and interactive **Export Filtered Sub-Database** modal. |
| 27 | `DatabaseBrowserView.tsx` / `game_service.py` / `main.py` / `api.ts` | 🟢 Architecture / UX | Modal interruptions on every delete click disrupted workflow; lack of vault storage metrics and bulk disk reclamation. | Implemented zero-friction **Soft-Delete $\to$ Trash Vault** staging (`UserData/Trash/`), **Vault Storage Footprint Telemetry** (total DB space used, active vs trash breakdown), dedicated **Trash View** with individual Restore capabilities, and a **Batch Purge Reclaim Modal** showing exact MB to be freed on disk. |
| 28 | `DataFitnessView.tsx` / `DatabaseBrowserView.tsx` / `SparView.tsx` / `AskGrandmasterAction.tsx` / `main.py` / `game_service.py` | 🟢 Full-Stack Feature & UX | Ingestion pipeline was not creating `.lcdb` on disk; delete button was missing in preview toolbar; Clean Light Titanium theme did not cascade to database views; Sparring lacked checkmate banners and saving; Ask GM modal obscured chessboard. | 1. Implemented real multipart/form `upload_and_ingest_database` endpoint converting PGN/SQLite into active `.lcdb` files.<br/>2. Added **Move to Trash** action in active database preview toolbar.<br/>3. Re-architected Database Hub with `isLight` dynamic styling for full **Clean Light Titanium** theme responsiveness.<br/>4. Added **Checkmate / Draw / Stalemate Detection**, victory banner, **Save Game to Active Database**, and **Export PGN** in Sparring Arena.<br/>5. Converted Ask GM coach popup into a **non-blocking floating drawer**, allowing unobstructed live chessboard viewing while receiving GM insights. |
| 29 | `fitness_service.py` / `DataFitnessView.tsx` / `DesktopMenu.tsx` / `App.tsx` / `sse.py` | 🐛 Stability & Accuracy | Health score was displaying inaccurate fixed/fallback 95.6% score; SSE telemetry was closing/reconnecting on every UI click due to unstable effect dependency; Desktop menu theme labels had text overhang. | 1. Replaced naive health penalty with multi-tier weighted mathematical formula (`T0: 0%`, `T1: 45%`, `T2: 80%`, `T3: 100%`) minus defect ratio, producing accurate ~77.7% Grade B rating for Silver tournament databases.<br/>2. Removed hardcoded `95.6` and `"A"` UI fallbacks in `DataFitnessView.tsx`.<br/>3. Stabilized SSE telemetry stream in `App.tsx` and `sse.py` with keepalive headers, eliminating connection thrashing.<br/>4. Added truncation and flex-shrink protection on top menu theme badges to eliminate text overhang. |
| 30 | `api.ts` / `fitness_service.py` / `DataFitnessView.tsx` / `App.tsx` / `CompareView.tsx` / `DossierView.tsx` / `FashionIndexView.tsx` / `ConsolidatorView.tsx` | 🛡️ Code Quality & Robustness | Inline hardcoded fetch URLs bypassed `API_BASE`; empty database returned mismatched tier keys (`tier_0` vs `tier_0_quarantine`); checkmate parser failed on PGNs with comments; SSE handlers had stale closure risk; tier percentage calculation had rounding skew and empty DB purple flash. | 1. Extracted all inline `fetch()` calls into typed wrapper functions in `src/lib/api.ts` (`fetchFitnessAudit`, `sanitizeDatabase`, `generateSilverStats`, `startMassAnalysis`, `fetchDossierPlayer`, `fetchDossierCompare`, `fetchOpeningFashion`, `mergeDatabases`).<br/>2. Aligned empty database tier key names in `fitness_service.py` (`tier_0_quarantine`, etc.) preventing `NaN` UI crashes.<br/>3. Pre-stripped PGN comments `{...}` and `[%...]` before tokenizing for checkmate resolution in `AdjudicationCascade`.<br/>4. Added `useRef` for `logAction` in `App.tsx` and sliced event telemetry to prevent unbounded array growth.<br/>5. Fixed tier percentages in `DataFitnessView.tsx` with zero-guarding and replaced native `alert()` with non-blocking error banners. |
| 31 | `requirements.txt` / `RunAnalysisControl.py` / `core/api/main.py` | 🔴 Critical Runtime Fix | FastAPI sidecar crashed on startup with `RuntimeError: Form data requires 'python-multipart' to be installed` when parsing `/api/v1/databases/upload-ingest`; mass analysis in PyQt crashed with `NameError: name 'time' is not defined`. | 1. Installed `python-multipart` in Python virtual environment and added `fastapi`, `uvicorn`, `python-multipart`, and `pydantic` to `requirements.txt`.<br/>2. Added missing `import time` to `RunAnalysisControl.py`.<br/>3. Verified full sidecar startup and end-to-end routing health across all 6 service subsystems. |
| 32 | `App.tsx` / `DatabaseBrowserView.tsx` / `DesktopMenu.tsx` / `Wing.tsx` / `SparView.tsx` | 🧭 Navigation & Theme Polish | Navigation broke when switching between database sub-features (Fitness, Dossier, Compare, Fashion Index, Consolidator) because they were split across isolated workspace renderers, unlinking top menu and left wing indicators; Sparring view was missing light theme styling. | 1. Unified all Database sub-features under `DatabaseBrowserView` with `initialSubTab` synchronization (`shelf`, `fashion`, `dossier`, `compare`, `fitness`, `consolidator`).<br/>2. Updated `DesktopMenu` and `Wing` active state logic so `Database` stays highlighted across all sub-views.<br/>3. Added full `isLight` theme responsiveness to `SparView.tsx` (board container, engine picker, Elo slider, and move history). |
| 33 | `ai_service.py` / `engine_service.py` / `router.py` / `SparView.tsx` / `api.ts` | 🤖 AI & UCI Engine Integration | 1. AI Grandmaster (Garry Kasparov persona) triggered false-positive safety refusals ("chess violence") when receiving chess tactical terms like attack or crush.<br/>2. Sparring arena simulated moves with random legal choices instead of communicating via standard modern UCI protocol.<br/>3. Spar game saves did not dynamically target the user's active database. | 1. Injected explicit anti-refusal system context in `ai_service.py` defining chess terminology as strictly board game actions.<br/>2. Built standard modern UCI engine subsystem (`UCIEngineService` & `/api/v1/engine/play`) with Stockfish 18, Patricia 4, CT800, Elo scaling (`UCI_LimitStrength`), search depth control, and centipawn evaluations.<br/>3. Integrated real UCI moves into `SparView.tsx` with live thinking spinner and targeted active database saving. |
| 34 | `SparView.tsx` / `AskGrandmasterAction.tsx` / `engine_service.py` / `router.py` / `game_service.py` / `api.ts` | 🟢 Feature & Architecture | Missing custom UCI engine registration in Sparring; lack of strict separation between sparring matches and kibitzer analysis databases; missing autosave vs manual save choices for kibitzer analysis. | 1. Added **Add UCI Engine** workflow in Sparring with live UCI handshake testing (`test_uci_engine`), auto-discovery of engine name/author/options, and persistence to `UserData/custom_engines.json`.<br/>2. Routed all sparring matches to strictly **autosave into `Sparring_Games.sqlite`** on match conclusion or resignation.<br/>3. Routed all kibitzer/AI coaching analysis into dedicated **`Kibitzer_Analysis.sqlite`** with user-configurable **Autosave toggle** and **Manual Save** actions. |
| 35 | `core/` / `src/` / `Resources/` | 🧹 Decoupled Standardization | Legacy `.lcdb` naming artifacts from upstream LucasChess persisted across backend routers, services, file pickers, and shelf databases instead of universal industry-standard SQLite format. | 1. Completely purged all `.lcdb` artifacts across the entire codebase (`core/`, `src/`, `Resources/`).<br/>2. Converted all existing SQLite databases to standard `.sqlite` (`patriciaTourny.sqlite`, `last_games.sqlite`, `Miniatures.sqlite`).<br/>3. Standardized all automated saves (`Sparring_Games.sqlite`, `Kibitzer_Analysis.sqlite`), exports, and file inputs to strictly standard `.sqlite` / `.db` / `.pgn`. |
| 36 | `core/sidecar.py` / `Launch_App.bat` | 🔴 High | Port 8000 socket collision occurred when running manual sidecars concurrently with Tauri's automated sidecar. | Added dynamic port conflict detection and automated reuse in `sidecar.py`. |
| 37 | `database.py` / `engine_service.py` / `game_service.py` | 🐛 Stability | SQLite `LOWER()` failed on Cyrillic/Unicode names in search queries; `test_uci_engine` raised unhandled `FileNotFoundError`. | Registered native Python Unicode collations and made engine tests fail gracefully with structured error schemas. |
| 38 | `opening_book_service.py` / `engine_service.py` / `router.py` | 📖 Feature | Engines recalculated moves from scratch from ply 1, ignoring opening book theory. | Built Polyglot `.bin` discovery service and integrated weighted opening probes directly into the engine move generator. |
| 39 | `customPieces.tsx` / `SparView.tsx` / `ResponsiveChessboard.tsx` | 🎨 UX / Vector Glitch | Disconnected White Bishop pedestal path gap in `react-chessboard` vector set caused a "solid white floating line" artifact on dark squares. | Created high-definition contiguous vector piece set in `customPieces.tsx` with seamless body-to-base geometry, eliminating all pedestal gap artifacts. |
| 40 | `SparView.tsx` | 🧭 Architecture / UX | Opening Book and UCI Telemetry opened as full-screen modal overlays that dimmed and blocked interactive sparring gameplay. | Re-engineered into **Hybrid Persistent Non-Modal HUDs** with 1-Click Sidebar Docking (`[⤢ / ⤡]`), Minimize to Status Pill (`[− / +]`), and live synchronized move telemetry without screen dimming. |
| 41 | `SparView.tsx` / `database.py` | 🐛 Accuracy & PGN | Double header collision in `generatePgn` resulted in games saved with `White="?"`, `Black="?"`, `Result="*"`, and missing per-move engine evaluations. | Rewrote PGN generation with single standard 7-tag roster, proper Player/Engine names, and embedded per-move engine telemetry annotations (`[%eval]`, `[%depth]`, `[%nps]`). |
| 42 | `fitness_service.py` / `DataFitnessView.tsx` | 🛡️ Data Fitness & UX | Data Fitness did not patch raw PGN `_DATA_` tags when resolving `*` game results; UI lacked user-preferred Tier 2 default and customized Tier 1/3 color hierarchy. | Added board-level result adjudication in `fitness_service.py` updating both SQL columns and `_DATA_` PGN text; defaulted to Tier 2 (Silver Stats); styled Tier 1 as Red-Orange and Tier 3 as Red with a Gold Fireball icon (`🔥`). |
| 43 | `ResponsiveChessboard.tsx` / `App.tsx` / `DatabaseBrowserView.tsx` | 🐛 Game Loading & Analysis | "Open Game in Analysis" navigated to the Analysis workspace but failed to load the game because `chess.js` crashed on trailing `[%provenance]` annotations, and `App.tsx` omitted the active database name. | Added robust `cleanPgnForChessJs` and token fallback parser in `ResponsiveChessboard.tsx`, passed `activeDbName` from Database Hub to Analysis, and wired dynamic game metadata & FEN tracking to the analysis board. |

---

## 3. Mathematical Foundations for Chess KPIs ([`chess_math.py`](file:///c:/Users/Dev/Documents/APPS/lucaschessR6-main%20-%20TAURI/core/features/dossier/chess_math.py))

### A. Glicko-2 Rating System ($\mu, \text{RD}, \sigma$)
- **Scale Conversion**:
  $$\mu = \frac{R - 1500}{173.7178}, \quad \phi = \frac{\text{RD}}{173.7178}$$
- **Variance Estimation ($v$) and Scoring Delta ($\Delta$)**:
  $$g(\phi) = \frac{1}{\sqrt{1 + \frac{3\phi^2}{\pi^2}}}$$
  $$E(\mu, \mu_j, \phi_j) = \frac{1}{1 + \exp\left(-g(\phi_j)(\mu - \mu_j)\right)}$$
  $$v = \left( \sum_j g(\phi_j)^2 E_j (1 - E_j) \right)^{-1}, \quad \Delta = v \sum_j g(\phi_j) (s_j - E_j)$$
- **Volatility Iteration ($\sigma'$)**: Solved via the Illinois numerical algorithm constrained by system constant $\tau = 0.5$ and bracket bound $k \le 100$.

---

### B. Exact Logistic Performance Rating ($R_p$)
Calculates the exact performance rating against a distribution of opponent ratings $R_j$ by finding the root $R_p$ where expected score equals actual score $S$:
$$S = \sum_{j=1}^N s_j = \sum_{j=1}^N \frac{1}{1 + 10^{(R_j - R_p)/400}}$$
Solved using bounded binary search to $<0.1$ Elo precision.

---

### C. CAPS (Computer Aggregated Precision Score)
Translates centipawn loss ($\Delta cp$) into move accuracy probability:
$$\text{Accuracy}(\Delta cp) = \max\left(0, \min\left(100, 103.1668 \times e^{-0.04354 \times \Delta cp} - 3.1669\right)\right)$$

---

### D. Phase Average Centipawn Loss (ACPL)
Partitioned across game stages:
- **Opening Phase** ($1 \le \text{ply} \le 20$): Book theory & opening deviation.
- **Middlegame Phase** ($21 \le \text{ply} \le 60$): Tactical & strategic complexity.
- **Endgame Phase** ($ply > 60$): Conversion and technical simplification.

---

### E. Shannon Entropy & Tactical Aggression Index
- **Opening Repertoire Entropy**:
  $$H(\text{Repertoire}) = -\sum_k p_k \ln(p_k)$$
- **Aggression Index**:
  $$\text{Aggression} = \min\left(96, \max\left(38, w_w \cdot \text{WinRate} + w_d \cdot \text{Decisiveness} + w_l \cdot \text{LengthFactor} + w_e \cdot H\right)\right)$$

---

## 4. Live Verification Output

Tested against the live SQLite tournament database (`patriciaTourny.lcdb`):

```json
{
  "player": "Patricia",
  "classical_rating": 1630,
  "kpis": {
    "glicko": 1615,
    "glicko_rd": 74,
    "glicko_volatility": 0.06,
    "perf_elo": 1749,
    "caps_accuracy": 88.5,
    "global_acpl": 71.0,
    "conversion_rate": 45,
    "aggression_index": 72
  },
  "performance_panel": {
    "glicko_trajectory": "-15",
    "opening_acpl": 44.0,
    "middlegame_acpl": 83.8,
    "endgame_acpl": 74.5,
    "severe_blunder_rate": "1.8%"
  }
}
```

- **TypeScript / Vite Build**: `tsc && vite build` passed with **0 errors**.
- **Rust / Tauri Build**: `cargo check` passed with **0 errors**.

---

## 5. Karpathy Verification Loop (Issues #36 & #37)

### Issue #36: Port 8000 Conflict & Backend Sidecar Disconnection
- **Problem**: Running `Launch_App.bat` spawned a manual sidecar while Tauri's `src-tauri/src/lib.rs` also spawned an automated sidecar, triggering `[Errno 10048] address already in use` and disconnecting the frontend.
- **Fix**: Added socket port-detection in `core/sidecar.py` to gracefully reuse existing active ports and streamlined `Launch_App.bat` to launch `npm run tauri dev` directly.

### Issue #37: Unicode Case-Insensitivity & Engine Validation Graceful Recovery
- **Problem**: SQLite standard `LOWER()` function failed on Cyrillic/Unicode names in player/game searches; `test_uci_engine` raised unhandled `FileNotFoundError` when invalid paths were supplied.
- **Fix**:
  1. Registered native Python Unicode `LOWER` and `UPPER` handlers on `sqlite3.Connection` in `core/persistence/database.py`.
  2. Made `test_uci_engine` return `{"success": False, "error": ...}` instead of throwing an unhandled 500 error.
  3. Added `get_game` alias on `GameRepository` to eliminate `AttributeError`.

### Issue #38: Polyglot Opening Book Service & UCI Engine Book Obedience
- **Problem**: UCI engines previously recalculated positions from scratch even during standard opening phases and had no mechanism to import or probe Polyglot `.bin` opening books.
- **Fix**:
  1. Implemented [`OpeningBookService`](file:///c:/Users/Dev/Documents/APPS/lucaschessR6-main%20-%20TAURI/core/features/openings/opening_book_service.py) with discovery, user import, weighted branch choice, and persistence.
  2. Updated [`UCIEngineService.play_move`](file:///c:/Users/Dev/Documents/APPS/lucaschessR6-main%20-%20TAURI/core/features/engine/engine_service.py) to probe the active Polyglot opening book first, playing opening book moves with metadata (`is_book_move: true`, `book_name`, `book_weight`, `candidates`) and falling back to Stockfish 18 / UCI engine only when out-of-book.
  3. Added REST endpoints: `GET /api/v1/openings/books/list`, `GET /api/v1/openings/books/active`, `POST /api/v1/openings/books/active`, `POST /api/v1/openings/books/import`, and `GET /api/v1/openings/books/probe`.

### Issue #39: Chessboard Vector Piece Glitch / "Floating White Line" on Bishop
- **Industry UX / Rendering Term**: *SVG Vector Sub-path Gap / Disconnected Silhouette Pedestal Artifact*.
- **Root Cause Analysis**: In the default cburnett vector set bundled with `react-chessboard`, the White Bishop (`wB`) SVG path was constructed from two disconnected sub-paths: the upper mitre body (`d="M 15,32..."`) and the bottom pedestal base (`d="M 9,36 C 12.39,35.03..."`). Because a 2-unit vertical void existed between $y=32$ and $y=34$, the dark board square color showed through the neck of the pedestal. On dark blue/green squares, this rendered as a detached, floating white curved line/saucer beneath the bishop.
- **Fix**:
  1. Created [`customPieces.tsx`](file:///c:/Users/Dev/Documents/APPS/lucaschessR6-main%20-%20TAURI/src/components/chessboard/customPieces.tsx) providing high-definition, unbroken vector piece definitions where the bishop's body and pedestal base are seamlessly unified with contiguous geometry.
  2. Applied `pieces: customChessPieces` across all board views ([`SparView.tsx`](file:///c:/Users/Dev/Documents/APPS/lucaschessR6-main%20-%20TAURI/src/features/sparring/SparView.tsx) and [`ResponsiveChessboard.tsx`](file:///c:/Users/Dev/Documents/APPS/lucaschessR6-main%20-%20TAURI/src/components/chessboard/ResponsiveChessboard.tsx)), eliminating all floating line artifacts across both dark and light squares.

### Issue #40: Hybrid Persistent Non-Modal HUDs (Live UCI Telemetry & Opening Book Theory)
- **Problem**: Opening the Opening Book Explorer or Live UCI Telemetry opened full-screen modal overlays (`bg-black/75 backdrop-blur-sm`) which dimmed the screen and blocked user interaction with the live chessboard.
- **Fix**:
  1. Converted both tools from modal dialogs into **non-modal persistent floating HUDs** (`fixed bottom-6 right-6` and `fixed bottom-6 left-6`) with **zero backdrop dimming**, allowing 100% uninterrupted piece dragging and live play.
  2. **1-Click Docking Toggle (`[⤢ / ⤡]`)**: Allows snapping the HUD directly into the right-hand arena column (below Move History) or popping it out as a floating tool window.
  3. **Minimize to Status Pill (`[− / +]`)**: Collapses the window into a sleek floating corner badge showing live telemetry metrics (e.g. `1,048k nps | Depth 12` or `Theory: 5 Lines`) with instant 1-click restoration.
  4. **Synchronous Live Updates**: Dynamically updates theory candidate frequencies and streams raw bidirectional UCI commands (`>> position`, `>> go`, `<< info`, `<< bestmove`) in real-time as moves occur on the board.

### Issue #41: Sparring Game Recording with Single-Header PGNs, Player/Engine Names & Live Engine Output
- **Problem**: In `SparView.tsx`, `generatePgn` concatenated custom headers before calling `game.pgn()`. Because `chess.js` generated its own default fallback header block (`[Event "?"]`, `[White "?"]`, `[Black "?"]`, `[Result "*"]`), the resulting PGN contained conflicting double headers. When imported into `Sparring_Games.sqlite`, the second block overwrote the first, rendering games with `White="?"`, `Black="?"`, `Result="*"`, and `Date="????.??.??"`. In addition, per-move engine telemetry was not recorded in move comments.
- **Fix**:
  1. Rewrote `generatePgn` to produce a single standard Seven-Tag Roster with accurate player names (`Player (Human)` vs `Stockfish 18 / Maia 1500`), White/Black Elos, and resolved game outcomes (`1-0`, `0-1`, `1/2-1/2`).
  2. Implemented `moveRecords` state tracking ply-by-ply engine metrics (`eval`, `depth`, `nps`, `time_ms`, `book_name`, `weight`) and embedded them directly into PGN move annotations (e.g. `1... c5 { [%eval +0.16] [%depth 12] [%nps 1048466] }`).
  3. Appended `[%provenance]` and `[%sparring]` footer blocks.

### Issue #42: Data Fitness Studio Results Adjudication & Tier 2 Default & Tier 1/3 Color Themes
- **Problem**:
  1. Data Fitness sanitization updated SQL database columns but did not update the underlying raw PGN text (`_DATA_`), so the Database Browser preview still displayed `*` and un-adjudicated headers.
  2. The user requested **Tier 2 (Silver Statistics)** generation to be preferred and selected by default.
  3. Tier 1 and Tier 3 styling lacked clear visual hierarchy (Tier 1 was generic amber; Tier 3 was grey/purple).
- **Fix**:
  1. Enhanced `AdjudicationCascade` with `python-chess` board simulation (`resolve_from_board`) to adjudicate terminal positions (`#`, stalemate, 3-fold repetition, 50-move rule) and update both SQLite table columns AND raw PGN text tags (`[Result]`, `[White]`, `[Black]`, `[Date]`, `[ECO]`, `[Opening]`) inside `_DATA_`.
  2. Repaired all existing games in `Sparring_Games.sqlite`.
  3. Defaulted Data Fitness Studio to the **Tier 2 Silver Statistics** tab and ingestion strategy.
  4. Styled **Tier 1 (Sanitized)** in vibrant **Red-Orange** (`text-orange-500` / `bg-orange-500/10` / `border-orange-500/30`).
  5. Styled **Tier 3 (Gold Evaluated)** in **Red with a Gold Fireball icon (`🔥`)** across tab buttons, status cards, and section headers.

### Issue #43: Game Loading Failure in Analysis Workspace
- **Problem**: When clicking "Open Game in Analysis" or double-clicking a game in Database Hub, the app switched to the Analysis workspace, but the chessboard stayed blank or failed to render the game moves.
- **Root Causes**:
  1. `chess.js` parser in [`ResponsiveChessboard.tsx`](file:///c:/Users/Dev/Documents/APPS/lucaschessR6-main%20-%20TAURI/src/components/chessboard/ResponsiveChessboard.tsx) threw an unhandled syntax error (`Expected end of input or whitespace but "[" found`) when encountering trailing annotations (such as `[%provenance ...]`, `[%acpl ...]`, `[%caps ...]`), preventing move list hydration.
  2. [`App.tsx`](file:///c:/Users/Dev/Documents/APPS/lucaschessR6-main%20-%20TAURI/src/App.tsx) invoked `fetchGame(gameId)` without providing the active database name, causing cross-database lookup errors when inspecting games in databases other than the default.
  3. The Analysis view right-side panel rendered static placeholder text rather than dynamic player names, match metadata, and live board FENs.
- **Fix**:
  1. Created `cleanPgnForChessJs` in [`ResponsiveChessboard.tsx`](file:///c:/Users/Dev/Documents/APPS/lucaschessR6-main%20-%20TAURI/src/components/chessboard/ResponsiveChessboard.tsx) that strips non-standard trailing tags and comments while maintaining strict standard Seven-Tag Roster headers and mainline moves, with a secondary token-by-token fallback parser.
  2. Updated `onLoadGame` across [`DatabaseBrowserView.tsx`](file:///c:/Users/Dev/Documents/APPS/lucaschessR6-main%20-%20TAURI/src/features/database/browser/DatabaseBrowserView.tsx) and [`App.tsx`](file:///c:/Users/Dev/Documents/APPS/lucaschessR6-main%20-%20TAURI/src/App.tsx) to pass `activeDbName`, querying `GET /api/v1/games/{id}?db_name=...`.
  3. Wired dynamic game details (`white`, `black`, `elos`, `event`, `eco`, `opening`, `result`, `date`) and live FEN updates to both the board controls and AI Grandmaster coach.

### Issue #44: Python Backend Sidecar Disconnection & SQLite Migration Failure
- **Problem**: When starting the app or switching to the analysis/sparring tab, users received a warning `Backend Sidecar Disconnected: Could not reach http://127.0.0.1:8000. Ensure the Python sidecar is running.`
- **Root Cause Analysis**: An existing `Sparring_Games.sqlite` database in the repository root possessed a legacy `Games` table schema (`WHITE, BLACK, RESULT, EVENT...`) without companion columns like `started_at` or `game_id`. When FastAPI initialized `CompanionDataManager` -> `SparringGamesRepository._init_schema()`, it executed `CREATE INDEX idx_games_started_at ON games(started_at);`, throwing `sqlite3.OperationalError: no such column: started_at` and crashing the FastAPI server process on startup.
- **Fix**:
  1. Updated [`SparringGamesRepository._init_schema`](file:///c:/Users/Dev/Documents/APPS/lucaschessR6-main%20-%20TAURI/core/persistence/companion_repositories.py) to introspect existing tables with `PRAGMA table_info(games)` and dynamically apply `ALTER TABLE games ADD COLUMN ...` for all companion schema fields (`game_id`, `started_at`, `opponent_engine`, `user_time_control`, `tutor_interrupt_mode`, `pgn`, `result`) prior to index creation.
  2. Added fallback discovery in [`src-tauri/src/lib.rs`](file:///c:/Users/Dev/Documents/APPS/lucaschessR6-main%20-%20TAURI/src-tauri/src/lib.rs) to try `.venv/Scripts/python.exe` and fallback to system `python` gracefully.

### Issue #45: Chessboard Resizing & Flickering during Sparring Match
- **Problem**: In the Sparring workspace, the chessboard constantly shifted dimensions, flickered, and re-rendered whenever moves were made or when alerts appeared.
- **Root Cause Analysis**: `react-chessboard` re-measures its parent container dimensions on height shifts. In `SparView.tsx`, conditional banners (`gameOverInfo`, `autosaveAlert`, `saveSuccessMsg`, and thinking indicators) dynamically expanded and collapsed directly above the board inside a vertical flex column, triggering repeated layout reflows and resizing the SVG canvas on every move.
- **Fix**:
  1. Wrapped `<Chessboard />` inside a rigid, fixed-dimension container (`w-[480px] h-[480px] aspect-square flex-shrink-0 relative`).
  2. Isolated status banners and thinking indicators into a fixed-height (`min-h-[44px]`) status slot above the board so layout geometry never changes.

### Issue #46: Kibitzer Companion Subsystem ("Roads Not Taken" MultiPV Engine, Tag Classification & SQLite Persistence)
- **Problem**: Companion features outlined in `kibitzer-tutor-sparring-implementation-guide.md` were missing from the UI. Users had no access to the Kibitzer engine (e.g. Patricia 4 / Stockfish), MultiPV candidate lines, or tag-classified variations.
- **Fix**:
  1. Implemented Section 6 Move Tag Classifier in [`tag_classifier.py`](file:///c:/Users/Dev/Documents/APPS/lucaschessR6-main%20-%20TAURI/core/features/engine/tag_classifier.py) providing win-probability calculation ($P = 1 / (1 + 10^{-cp/400})$), centipawn delta thresholds (`best`, `tactical`, `brilliant`, `aggressive`, `solid`, `blunder`), pin detection, and sacrifice heuristics.
  2. Added `request_variations` to [`UCIEngineService`](file:///c:/Users/Dev/Documents/APPS/lucaschessR6-main%20-%20TAURI/core/features/engine/engine_service.py) and `/api/v1/engine/variations` endpoint in [`core/features/engine/router.py`](file:///c:/Users/Dev/Documents/APPS/lucaschessR6-main%20-%20TAURI/core/features/engine/router.py).
  3. Integrated **Kibitzer Companion Panel** in [`SparView.tsx`](file:///c:/Users/Dev/Documents/APPS/lucaschessR6-main%20-%20TAURI/src/features/sparring/SparView.tsx) with selectable engine, run modes (`on_demand`, `user_clock_bound` [thinks only during user's turn], `opponent_clock_bound` [thinks only during opponent's turn], `continuous` [all moves]), MultiPV slider, "Get Advise" trigger, and direct "Save Variation" persistence into `Kibitzer_Analysis.sqlite`.

### Issue #47: Tutor Reinforcement Subsystem (Real-Time Blunder & Tactical Alerts, Multi-Choice Resolution & `Tutor_Games.sqlite` Persistence)
- **Problem**: In-game blunder detection, tactical coaching, and reinforcement flags were not surfaced to the player during live sparring games.
- **Fix**:
  1. Created [`TutorGamesRepository`](file:///c:/Users/Dev/Documents/APPS/lucaschessR6-main%20-%20TAURI/core/persistence/companion_repositories.py) and `/api/v1/companion/tutor/flag` endpoint supporting `(game_id, ply, fen)` join contract and outcomes (`accepted_suggestion`, `played_own_move`, `ignored_flag`).
  2. Built **Tutor Control Panel & In-Game Overlay** in [`SparView.tsx`](file:///c:/Users/Dev/Documents/APPS/lucaschessR6-main%20-%20TAURI/src/features/sparring/SparView.tsx) supporting `passive_log` (silent background recording) and `freeze_on_flag` (pausing the match with interactive `[✓ Accept Move]`, `[Keep Mine]`, `[Dismiss]` choices).
  3. Minted persistent `game_id` on match initiation via `/api/v1/companion/sparring/create` to link match records across all 3 SQLite databases (`Sparring_Games.sqlite`, `Kibitzer_Analysis.sqlite`, `Tutor_Games.sqlite`).

### Issue #48: Advanced Kibitzer & Tutor Options Popups, Hardware Allocation & Coaching Depth
- **Problem**: Users needed deeper customizability over Kibitzer engine limits (Threads, Hash size, calculation time, search depth), evaluation display styles (Centipawns vs Win Probability % vs Hybrid), auto-save triggers, and Tutor coaching guidance depths (full solution vs piece-only hints vs strategic themes).
- **Fix**:
  1. **Kibitzer Advanced Options Modal (`[⚙️]` Popup)**: Added CPU Threads (1-8), Hash Table (16-512MB), Search Depth (8-22 plies), Time Limit (100-2500ms), Display Format toggles, Auto-Save to `Kibitzer_Analysis.sqlite`, and live board square highlighting.
  2. **Tutor Coaching & Sensitivity Modal (`[⚙️]` Popup)**: Added configurable Blunder Threshold (-100 to -350 cp), Mistake Threshold (-50 to -150 cp), Tactical Shot Alerts, and Coaching Hint Depths (`Full Move`, `Piece Only`, `Strategic Theme`).
  3. Updated [`request_variations`](file:///c:/Users/Dev/Documents/APPS/lucaschessR6-main%20-%20TAURI/core/features/engine/engine_service.py) and `/api/v1/engine/variations` endpoint to pass UCI options (`Threads`, `Hash`) dynamically to engines.

### Issue #49: Companion Databases Visibility & Management in Database Hub
- **Problem**: The three companion databases (`Sparring_Games.sqlite`, `Kibitzer_Analysis.sqlite`, `Tutor_Games.sqlite`) were not listed in the Database Hub shelf because `_is_game_db()` strictly checked for an exact table name `Games`.
- **Fix**:
  1. Updated [`_is_game_db`](file:///c:/Users/Dev/Documents/APPS/lucaschessR6-main%20-%20TAURI/core/services/game_service.py) to recognize databases with tables `games`, `variations`, `flags`, `sparring_games`, `kibitzer_analysis`, and `tutor_games`.
  2. Enabled full browsing, pagination, statistics, and trash/purge support in [`GameRepository`](file:///c:/Users/Dev/Documents/APPS/lucaschessR6-main%20-%20TAURI/core/persistence/database.py) for all three databases, mapping candidate variations and coaching flags into navigable game records.

### Issue #50: LucasChess XPV Compact Move Decoding & Move Notation Loading in Analysis Workspace
- **Problem**: Clicking "Open Game in Analysis" loaded empty move notation (0 moves) or failed to step through moves on games imported from LucasChess databases (such as `patriciaTourny.sqlite`).
- **Root Cause Analysis**: LucasChess stores compressed move sequences inside the `XPV` column using a 2-character ASCII byte-pair format ($(\text{ord}(c_1)-58, \text{ord}(c_2)-58)$) rather than plain text inside `_DATA_` (which only contained evaluation tags like `[%provenance ...]`). Because naive substring checks matched `" 1"` inside metadata comments, the repository never decompressed `XPV`, returning empty movelists.
- **Fix**:
  1. Implemented `decode_xpv(xpv_str)` in [`database.py`](file:///c:/Users/Dev/Documents/APPS/lucaschessR6-main%20-%20TAURI/core/persistence/database.py) to accurately decode LucasChess compact move sequences and pawn promotions into standard SAN mainline notation.
  2. Updated `get_game_by_rowid` to strip metadata comments when checking for moves and merge decoded `XPV` moves with Seven-Tag Rosters.
  3. Added `onPositionChange` hooks to `updateToMove` and auto-play in [`ResponsiveChessboard.tsx`](file:///c:/Users/Dev/Documents/APPS/lucaschessR6-main%20-%20TAURI/src/components/chessboard/ResponsiveChessboard.tsx), enabling full bidirectional synchronization with Ask Grandmaster and telemetry.

### Issue #51: Database Tier Badges & Direct Data Fitness Launch Buttons on Shelf
- **Problem**: Databases on the shelf displayed a static "Ready" label with no visual indicator of their data fitness tier (Gold, Silver, Companion, Raw), and users had no direct way to initiate a fitness audit/sanitization directly from a database's shelf entry.
- **Fix**:
  1. Added `_classify_db_tier()` in [`game_service.py`](file:///c:/Users/Dev/Documents/APPS/lucaschessR6-main%20-%20TAURI/core/services/game_service.py) to dynamically classify and return `tier`, `tier_level`, `grade`, and `badge_color` (`gold`, `silver`, `cyan`, `amber`) in `/api/v1/databases`.
  2. Updated [`DatabaseBrowserView.tsx`](file:///c:/Users/Dev/Documents/APPS/lucaschessR6-main%20-%20TAURI/src/features/database/browser/DatabaseBrowserView.tsx) to render stylized, interactive Tier Badges across both Card grid and List table views:
     - **Gold Tier (`✨ Gold Tier`)**: Amber gradient badge with tooltip for evaluated databases with Stockfish / ACPL provenance.
     - **Silver Tier (`🛡️ Silver Tier`)**: Silver badge with tooltip for standardized tournament databases with ECO & player Elo tags.
     - **Companion Stream (`⚡ Companion`)**: Cyan badge for live Sparring, Kibitzer, and Tutor session data.
     - **Raw Tier (`⚠️ Raw • Fitness`)**: Amber/Rose alert badge for un-audited or incomplete databases.
  3. Made the Tier Status badge an interactive one-click button that immediately launches the **Data Fitness Studio** focused on that specific database.

### Issue #52: Analysis Interactive Board Move Making & Click Logger "LAST 5" Filter
- **Problem**: In Analysis mode, users were unable to make moves directly on the chessboard (dragging pieces sprang back because `onPieceDrop` was not wired to the board), there was no direct button to reset to the initial Start Position in the notation list, and users needed a dedicated "LAST 5" filter chip in the Debug Console.
- **Fix**:
  1. Implemented `handlePieceDrop` in [`ResponsiveChessboard.tsx`](file:///c:/Users/Dev/Documents/APPS/lucaschessR6-main%20-%20TAURI/src/components/chessboard/ResponsiveChessboard.tsx) to validate legal moves, advance the position, append branch moves to history, synchronize telemetry, and log `BOARD` events.
  2. Added a clickable `🏁 Start Position` row at the top of the Move Notation panel to jump directly to move 0.
  3. Added a dedicated `LAST 5` filter chip and real-time event counter to [`ClickLogConsole.tsx`](file:///c:/Users/Dev/Documents/APPS/lucaschessR6-main%20-%20TAURI/src/components/debug/ClickLogConsole.tsx) to inspect recent click actions immediately.

### Issue #53: Resolution of Move Browsing Position Snap-Back in Analysis Mode
- **Problem**: When a user opened a game in Analysis mode and attempted to browse moves forward and backward or click on move plies in the notation table, the chessboard was immediately snapping back to the final position on every click.
- **Root Cause Analysis**: `ResponsiveChessboard.tsx` had `onPositionChange` in its PGN-loading `useEffect` dependency array. Whenever the user clicked a move, `onPositionChange(newFen)` updated `currentBoardFen` in `App.tsx`, triggering an App re-render. This re-rendered `ResponsiveChessboard` with a new `onPositionChange` reference, re-triggering the PGN load effect and immediately resetting the board position back to `moves.length - 1` (the last move).
- **Fix**:
  1. Decoupled `onPositionChange` and `logAction` using React `useRef` hooks (`onPositionChangeRef`, `logActionRef`, `lastLoadedPgnRef`), ensuring PGN parsing and board initialization only executes when the raw `pgn` prop actually changes.
  2. Precomputed all position FENs (`positions` array) on initial PGN load for instantaneous $\mathcal{O}(1)$ position lookup and navigation without reconstructing moves.
  3. Initialized new game loads to `🏁 Start Position` (`historyIndex = -1`) so players can step forward cleanly from move 1.

### Issue #54: Optimized Default Window Dimensions for 1080p Screens
- **Problem**: The Tauri desktop app launched with a small default window size ($1280 \times 800$), requiring users on standard 1080p ($1920 \times 1080$) displays to frequently resize and reposition the window upon opening the app.
- **Fix**:
  1. Updated [`tauri.conf.json`](file:///c:/Users/Dev/Documents/APPS/lucaschessR6-main%20-%20TAURI/src-tauri/tauri.conf.json) to set default launch window dimensions to **$1680 \times 980$**, with `minWidth: 1280`, `minHeight: 720`, and `center: true`.
  2. Optimized chessboard scaling in [`ResponsiveChessboard.tsx`](file:///c:/Users/Dev/Documents/APPS/lucaschessR6-main%20-%20TAURI/src/components/chessboard/ResponsiveChessboard.tsx) (`max-w-[580px] xl:max-w-[620px]`) and [`SparView.tsx`](file:///c:/Users/Dev/Documents/APPS/lucaschessR6-main%20-%20TAURI/src/features/sparring/SparView.tsx) (`520px`) so game boards, telemetry panels, tutor feedback overlays, and move notation fit cleanly on 1080p screens without manual resizing.

### Issue #55: Analysis Workspace Kibitzer Multi-PV Analysis & Responsive Viewport Auto-Fit
- **Problem**: The Analysis workspace lacked a direct Kibitzer button to calculate multi-PV engine variations and candidate moves, and the Debug Console opened expanded by default (taking ~250px vertical height), which squeezed the game board and forced vertical scrolling.
- **Fix**:
  1. Set `isLogConsoleOpen` default to `false` in [`clickLogger.tsx`](file:///c:/Users/Dev/Documents/APPS/lucaschessR6-main%20-%20TAURI/src/lib/clickLogger.tsx) so the bottom console is collapsed into a compact header on startup, freeing up 200px+ of vertical space for the analysis board.
  2. Constrained chessboard dimensions in [`ResponsiveChessboard.tsx`](file:///c:/Users/Dev/Documents/APPS/lucaschessR6-main%20-%20TAURI/src/components/chessboard/ResponsiveChessboard.tsx) to `w-[min(100%,calc(100vh-270px))] max-w-[480px] xl:max-w-[530px]` so the board, top headers, and control bar always fit without vertical overflow on app launch.
  3. Built the complete **Analysis Kibitzer Suite**:
     - Added an interactive **`🤖 Kibitzer`** button with calculation spinner in the control bar.
     - Added a dedicated **Kibitzer Analysis Tab** with rank badges (`#1`, `#2`, `#3`), centipawn scores, win percentages, depth, tactical tags (`Tactics`, `Brilliant`, `Solid`), and one-click variation saving to `Kibitzer_Analysis.sqlite`.
     - Added board square styling (`customSquareStyles`) to visually highlight candidate move source & destination squares directly on the chessboard.
     - Added a **Kibitzer Settings Modal `[⚙️]`** for configuring Engine, CPU Threads (1-8), Hash Size (16-512MB), Depth (8-22), Time Limit (100-2500ms), Multi-PV lines (1-5), and Display Format (Centipawns, Win %, Hybrid).

### Issue #56: Deep Depth Up to 50 Plies, Search Mode Control & Prominent Variation Save
- **Problem**:
  1. When changing Kibitzer settings in Analysis, changes were not obeyed because a hardcoded `500ms` time limit cut off deep calculation early (stopping at depth 12 even when depth 22+ was requested).
  2. Search depth was capped at 22 plies, preventing users from calculating deep plies (e.g. ply 33 or ply 50).
  3. The Save button on variation cards was an unobtrusive, faint bookmark icon in the corner, making it hard to see and interact with.
  4. Win probability was rendering with raw decimals like `0.5516%` instead of `55.2% Win`.
- **Root Cause Analysis**:
  - `python-chess`'s `chess.engine.Limit(time=time_limit_sec, depth=depth)` terminates as soon as *either* time or depth is reached. When `time_limit_sec` was set to `0.5` by default in the backend router, the engine aborted after 500ms at ~12 plies regardless of the depth target requested by the user.
  - The UI depth range was constrained to `[8, 22]` in both Analysis and Sparring settings modals.
- **Fix**:
  1. **Extended Depth Range & Search Modes**:
     - Extended search depth up to **50 plies** in both Analysis ([`ResponsiveChessboard.tsx`](file:///c:/Users/Dev/Documents/APPS/lucaschessR6-main%20-%20TAURI/src/components/chessboard/ResponsiveChessboard.tsx)) and Sparring ([`SparView.tsx`](file:///c:/Users/Dev/Documents/APPS/lucaschessR6-main%20-%20TAURI/src/features/sparring/SparView.tsx)) with dual sliders and direct numeric text inputs.
     - Updated [`engine_service.py`](file:///c:/Users/Dev/Documents/APPS/lucaschessR6-main%20-%20TAURI/core/features/engine/engine_service.py) and [`router.py`](file:///c:/Users/Dev/Documents/APPS/lucaschessR6-main%20-%20TAURI/core/features/engine/router.py) to support optional `time_limit_sec: None` and depths up to 60 plies.
     - Added a 3-way **Search Mode selector** in Settings: `Exact Depth Target` (pure depth calculation reaching full depth 33/50 without early time abortion), `Time Bound` (searches within 200ms–10,000ms), and `Hybrid` (depth with timeout).
  2. **Prominent Variation Save Button**:
     - Replaced the faint corner icon with a high-contrast, prominent gradient button (`Save Line`) with a filled bookmark icon and an instant `Saved! ✓` visual confirmation state.
  3. **Immediate Settings Application**:
     - When clicking "Apply & Re-Analyze", newly configured settings are passed directly into the evaluation dispatcher, guaranteeing 100% obedience without React state batching delays.
  4. **Win Probability Formatting**:
     - Cleaned up percentage calculations to display standard percentages (e.g. `+0.36 · 55.2% Win`).

| File Modified | Summary of Changes |
| :--- | :--- |
| [`core/features/engine/engine_service.py`](file:///c:/Users/Dev/Documents/APPS/lucaschessR6-main%20-%20TAURI/core/features/engine/engine_service.py) | Supported `time_limit_sec: Optional[float] = None`, deep depth up to 60 plies in `request_variations` |
| [`core/features/engine/router.py`](file:///c:/Users/Dev/Documents/APPS/lucaschessR6-main%20-%20TAURI/core/features/engine/router.py) | Updated `/variations` endpoint to accept nullable `time_limit_ms` and increased max timeout to 60s |
| [`src/lib/api.ts`](file:///c:/Users/Dev/Documents/APPS/lucaschessR6-main%20-%20TAURI/src/lib/api.ts) | Updated `fetchEngineVariations` payload interface to accept `time_limit_ms?: number \| null` |
| [`src/components/chessboard/ResponsiveChessboard.tsx`](file:///c:/Users/Dev/Documents/APPS/lucaschessR6-main%20-%20TAURI/src/components/chessboard/ResponsiveChessboard.tsx) | Added Search Mode selector, depth up to 50, numeric input, prominent `Save Line` button with `Saved! ✓` confirmation, and immediate settings application |
| [`src/features/sparring/SparView.tsx`](file:///c:/Users/Dev/Documents/APPS/lucaschessR6-main%20-%20TAURI/src/features/sparring/SparView.tsx) | Extended Kibitzer search depth slider and numeric input up to 50 plies |

- **Verification**:
  - Python test suite: `.\.venv\Scripts\python.exe -m unittest discover tests` $\to$ **6/6 tests passing**.
  - TypeScript typecheck: `npx tsc --noEmit` $\to$ **0 errors**.
  - Production build: `npm run build` $\to$ **built in 3.13s**.

### Issue #57: Removal of SSE Telemetry, Dedicated "Get Advise" Action, Font Contrast & Sparring Engine Mechanics
- **Problem**:
  1. Noisy, raw SSE telemetry logs cluttered the sparring viewport and introduced unnecessary UI churn.
  2. The user lacked a prominent, dedicated **"Get Advise"** action button in the Sparring action bar to fetch candidate engine analysis on demand.
  3. UI typography and font contrast were too light and dim across dark and light themes (e.g. `text-slate-400`/`text-slate-500` notation and badges were difficult to read).
  4. Engine sparring behavior was brittle due to mutable `Chess` state references causing engine replies to hang or fail on certain move sequences, and missing opening book parameters.
- **Fix**:
  1. **Removed SSE Telemetry Clutter**:
     - Stripped out raw telemetry nodes (`nps`, `hashfull`, `tbhits`, `uci_log`) from the match status header in [`SparView.tsx`](file:///c:/Users/Dev/Documents/APPS/lucaschessR6-main%20-%20TAURI/src/features/sparring/SparView.tsx).
     - Replaced with a clean, high-contrast match status container displaying active Evaluation, Ply count, Opening Book badge, and Turn indicator.
  2. **Added Prominent "Get Advise" Action**:
     - Added a dedicated, glowing **`💡 Get Advise`** button in the main Sparring action toolbar and header quick action bar.
     - Clicking "Get Advise" immediately queries the active Kibitzer engine for multi-PV candidate advice, highlights candidate moves on the board, and switches directly to the Kibitzer variation list with full score, win %, and one-click saving.
  3. **High-Contrast Font & Typography Overhaul**:
     - Upgraded text styles across [`SparView.tsx`](file:///c:/Users/Dev/Documents/APPS/lucaschessR6-main%20-%20TAURI/src/features/sparring/SparView.tsx) and [`ResponsiveChessboard.tsx`](file:///c:/Users/Dev/Documents/APPS/lucaschessR6-main%20-%20TAURI/src/components/chessboard/ResponsiveChessboard.tsx) to bold, high-contrast whites (`text-white`, `text-slate-100`) and dark slates (`text-slate-900`, `text-slate-800`), ensuring all move numbers, notation pairs, eval scores, candidate lines, and settings labels are crystal-clear and effortlessly readable.
  4. **Robust Sparring Engine Mechanics**:
     - Ensured move execution is completely immutable using `const nextGame = new Chess(currentFen)`, preventing state freeze or desync during engine thinking.
     - Added dual SAN + UCI fallback move parsing when receiving engine replies.
     - Passed `book_name` and `use_book` parameters in `fetchEnginePlay` payload in [`api.ts`](file:///c:/Users/Dev/Documents/APPS/lucaschessR6-main%20-%20TAURI/src/lib/api.ts).
     - Auto-activates sparring match on first user move or plays move 1 immediately when playing as Black.
- **Verification**:
  - TypeScript typecheck: `npx tsc --noEmit` $\to$ **0 errors**.
  - Production build: `npm run build` $\to$ **built in 3.02s**.
  - Python test suite: `.\.venv\Scripts\python.exe -m unittest discover tests` $\to$ **6/6 tests passing**.

### Issue #58: Replacement of Analysis SSE Telemetry Stream with Engine UCI Output & Options Debugger
- **Problem**: In the Analysis workspace right panel under "Ask Garry Kasparov", the "SSE Telemetry Stream" box displayed empty/dummy event listening text rather than real engine debugging output, preventing users from inspecting live UCI engine communications (`>> uci`, `>> setoption`, `>> go`, `<< info`, `<< bestmove`) or viewing configured UCI options.
- **Fix**:
  1. **Built Engine UCI Output & Protocol Console (`App.tsx`)**:
     - Completely replaced the SSE Telemetry Stream box with a dedicated **Engine UCI Output & Protocol Debugger**.
     - Added dual mode switcher:
       - **`Stream` Tab**: High-contrast, colorized live terminal stream showing real UCI protocol lines:
         - `>> setoption` commands in purple (`text-purple-300`)
         - `>> position` and `>> go` commands in cyan (`text-cyan-300 font-bold`)
         - `<< id name / author` handshakes in blue (`text-blue-300 font-bold`)
         - `<< info` multi-PV lines, depths, scores, and nps in emerald (`text-emerald-300`)
         - `<< bestmove` decisions in amber (`text-amber-300 font-extrabold`)
         - `[STATUS]` / `[ERROR]` messages in cyan and rose.
       - **`Options` Tab**: Structured grid displaying active engine parameters (Engine name, Author, Executable name, Threads, Hash memory, Multi-PV lines, Target depth, and Time limit).
     - Added one-click **Copy Logs** button and **Clear** console button.
  2. **Connected Real-Time Engine Protocol Stream**:
     - Updated [`engine_service.py`](file:///c:/Users/Dev/Documents/APPS/lucaschessR6-main%20-%20TAURI/core/features/engine/engine_service.py) and [`router.py`](file:///c:/Users/Dev/Documents/APPS/lucaschessR6-main%20-%20TAURI/core/features/engine/router.py) to capture and return `uci_log` and `uci_options` upon every calculation request.
     - Updated [`ResponsiveChessboard.tsx`](file:///c:/Users/Dev/Documents/APPS/lucaschessR6-main%20-%20TAURI/src/components/chessboard/ResponsiveChessboard.tsx) with `onUciLog` callback, streaming live UCI logs to the Analysis debugger whenever Kibitzer evaluates, steps moves, or re-analyzes.
  3. **High-Contrast Game Details Card**:
     - Enhanced typography and color contrast in the Game Info panel (`text-slate-900 font-extrabold` in light mode, `text-white font-extrabold` in dark mode).
- **Verification**:
  - TypeScript typecheck: `npx tsc --noEmit` $\to$ **0 errors**.
  - Production build: `npm run build` $\to$ **built in 2.98s**.
  - Python test suite: `.\.venv\Scripts\python.exe -m unittest discover tests` $\to$ **6/6 tests passing**.

### Issue #59: Comprehensive Dark & Bold Typography Contrast Across Sparring and Analysis UI
- **Problem**: In light themes, text across the Companion Control Hub (Opponent Setup, Kibitzer, Tutor Reinforcement Engine, Match Move Record, and tab buttons) was too light and washed out (e.g. pale green `text-emerald-300`/`text-emerald-400` on light background, dim gray `text-slate-400`/`text-slate-500` labels, and pale move notation `Qb6`), making coaching options and move records nearly illegible.
- **Fix**:
  1. **Tutor Reinforcement Engine Typography**:
     - Upgraded headings and descriptions to bold dark slate (`text-slate-900 font-extrabold`, `text-slate-700 font-semibold`, `text-emerald-800 font-extrabold`).
     - Replaced pale green button text with high-contrast, deep emerald text (`text-emerald-950 font-extrabold` and `text-emerald-900 font-bold`) on selected states (`Passive Log`, `Freeze on Flag`, `Full Move`, `Piece Only`, `Theme Hint`).
     - Upgraded unselected states with crisp dark text (`text-slate-900 font-bold` on `bg-slate-100 border-slate-300`).
     - Enhanced sensitivity threshold bar with high-contrast text (`text-slate-900 font-bold`, `text-emerald-800 font-black`).
  2. **Match Move Record**:
     - Upgraded move SAN notation to ultra-bold, dark text (`text-slate-950 font-black text-xs font-mono` in light mode, `text-white font-black` in dark mode).
     - Upgraded move numbers to dark slate (`text-slate-700 font-black text-xs font-mono`).
  3. **Sub-Tab Navigation & Opponent / Kibitzer Setup**:
     - Enhanced top sub-tab container and unselected tab buttons (`text-slate-800 hover:text-black font-black` in light mode).
     - Updated all form labels, dropdown selects, candidate variation cards, and filter pills to high-contrast dark tones (`text-slate-950`, `text-slate-900`, `text-slate-800`).
  4. **Analysis View Notation & Kibitzer Tabs**:
     - Upgraded tab buttons and action links in [`ResponsiveChessboard.tsx`](file:///c:/Users/Dev/Documents/APPS/lucaschessR6-main%20-%20TAURI/src/components/chessboard/ResponsiveChessboard.tsx) for crisp, bold legibility in both light and dark themes.
- **Verification**:
  - TypeScript typecheck: `npx tsc --noEmit` $\to$ **0 errors**.
  - Production build: `npm run build` $\to$ **built in 3.10s**.
  - Python test suite: `.\.venv\Scripts\python.exe -m unittest discover tests` $\to$ **6/6 tests passing**.

### Issue #60: Sparring Kibitzer Search Limit Modes & Exact Depth Target (Reaching Depth 24–50 Without Time Abortion)
- **Problem**: When changing Kibitzer depth to 24 plies (or up to 50 plies) on the Sparring screen, the engine stopped evaluating at 12 plies. This occurred because a hardcoded `time_limit_ms: 500` (or 1000ms) was unconditionally passed to python-chess `Limit(time=time_limit, depth=depth)`, causing the engine search to abort prematurely after 500ms before reaching the requested 24 plies. Additionally, search mode selection was missing in Sparring, and applying settings didn't immediately re-analyze.
- **Fix**:
  1. **Added `kibitzerSearchMode` ("depth" | "time" | "both") in [`SparView.tsx`](file:///c:/Users/Dev/Documents/APPS/lucaschessR6-main%20-%20TAURI/src/features/sparring/SparView.tsx)**:
     - Set default mode to `Exact Depth Target` (`depth`), passing `effectiveTimeLimitMs = null` so the UCI engine continues computing until the exact requested depth (e.g. 24, 33, 50 plies) is fully reached.
  2. **3-Way Search Limit Mode Selector in Settings Modal**:
     - Added the 3 Search Limit Modes to the Kibitzer settings modal:
       - **`Exact Depth Target`**: Pure depth calculation (1–50 plies) without early clock timeout.
       - **`Time Bound`**: Clock-bound calculation (100ms–5000ms).
       - **`Hybrid`**: Target depth with clock timeout.
  3. **Immediate Settings Application & Re-Analysis**:
     - Updated the modal submit button to **`Apply & Re-Analyze`**, passing newly configured parameters directly into `handleGetAdvise` so the position is recalculated immediately with the new depth target.
  4. **Updated All Sparring Variation Triggers**:
     - `handleGetAdvise`, `triggerEngineMove`, `handleStartGame`, and `setKibitzerMode` now all compute and send `effectiveTimeLimitMs` and `effectiveDepth`.
- **Verification**:
  - TypeScript typecheck: `npx tsc --noEmit` $\to$ **0 errors**.
  - Production build: `npm run build` $\to$ **built in 3.05s**.
  - Python test suite: `.\.venv\Scripts\python.exe -m unittest discover tests` $\to$ **6/6 tests passing**.



