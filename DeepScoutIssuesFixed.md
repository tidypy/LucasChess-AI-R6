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
