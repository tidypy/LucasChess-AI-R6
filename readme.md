# LucasChess AI R6

> Refactored, AI-Enhanced Edition of Lucas Chess featuring Dual-Engine DuckDB Vectorized Analytics, a Sigmoid & Glicko-2 Rating Matrix Engine, an AI Grandmaster Coach (LM Studio / BYOK), and a 4-Tier Data Quality & Provenance Pipeline.

---

## 🚀 Key Features & Architectural Upgrades

### 1. ⚡ Dual-Engine Vectorized Analytics (`DuckDB` + `SQLite`)
* **DuckDB C++ Engine:** ATTACHes SQLite database files in read-only mode (`ATTACH 'db.sqlite' AS db (TYPE SQLITE, READ_ONLY)`) for instant vectorized aggregation across massive game databases.
* **SQLite CTE / NumPy Fallback:** High-performance fallback query layer using SQLite Common Table Expressions and `numpy` array vectorization.
* **Live Progress Tracking:** Replaced static blocking wait dialogs with a live `QProgressBar` and time-remaining estimator (`ProgressBarWithTime`).

### 2. 📊 Rating Matrix Engine (`Sigmoid ELO` & `Glicko-2`)
* **Depth-Aware Sigmoid ELO:** Logistic accuracy-to-ELO conversion ($\text{ELO} = 800 + \frac{2000}{1 + e^{-0.08 \times (\text{Accuracy} - 72)}}$).
* **Non-Book Accuracy Filtering:** Automatically excludes opening book moves (`is_book == True`) from accuracy calculations to prevent opening preparation inflation.
* **Phase-Weighted Accuracy:** Weighted evaluation across game phases: Opening ($20\%$), Middlegame ($50\%$), Endgame ($30\%$).
* **Outlier Trimming:** 10% trimmed mean / rolling median filtering to eliminate short draw miniatures or single-game blowouts from distorting rating trends.
* **Multi-Game Glicko-2:** Calculates rating ($R$), deviation ($RD$), and volatility ($\sigma$).

### 3. 🤖 AI Grandmaster Coach (`LM Studio` & `BYOK`)
* **AI Performance Reviews:** Asynchronous chat worker generating natural language performance analyses, color dynamics, and concrete training items.
* **Local & Cloud Endpoints:** Seamless support for local LLM servers via **LM Studio** (`http://localhost:1234/v1`) or **BYOK** (Bring Your Own Key) OpenAI-compatible APIs.
* **Scouting Dossier Bridge:** Exports rich JSON payloads (phase ACPL, error spectrum, tactical motifs) to LLM endpoints.
* **Truthful Prompt Guardrails:** System prompts strictly forbid hallucinating or substituting missing metrics.

### 4. 🛡️ Truthful 4-Tier Data Quality Pipeline
* **Strict Quality Gating:**
  * **Tier 0:** Dirty/Invalid data (excluded from statistics).
  * **Tier 1:** Basic PGN (valid games & results only).
  * **Tier 2:** Elo-Ready (authoritative player ratings).
  * **Tier 3:** Gold Standard (complete Stockfish move analysis for charts & reports).
* **Transparent Exclusion Messaging:** UI grids and dialogs explicitly report how many games were used versus excluded per metric, displaying `"—"` when metrics lack eligible data.

---

## 🛠️ Installation & Dependencies

### Prerequisites
* **Python 3.12+**
* **Operating System:** Windows 10/11 (64-bit), Linux, macOS.

### Required Python Libraries
```bash
pip install -r requirements.txt
```

Key packages: `PySide6`, `duckdb>=1.0.0`, `numpy>=1.26.0`, `python-chess`, `requests`, `pillow`, `psutil`.

---

## 📜 Legal & Attribution

This project is a refactored, modernized fork based on the original **Lucas Chess** created by **Lucas Monge**.

* **Original Author:** Lucas Monge ([Website](https://lucaschess.pythonanywhere.com/) | [Blog](https://lucaschess.blogspot.com.es/))
* **License:** GNU General Public License v2.0 or later (GPL-2.0-or-later). See [LICENSE](LICENSE) for details.
