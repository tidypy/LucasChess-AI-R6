# Phase 2 Implementation Master Plan

## Global Architectural Rules
- Zero-Fallback Rule: Missing values (Elo, RD, ACPL) must strictly remain `None`/`NULL`. NEVER default to 1500, 350, or score percentages.
- Raw Data Preservation: Do not alter or truncate raw PGN blobs in `_DATA_`.
- Delegation Rule: For all complex C/Cython logic, SQL migrations, and tier gating algorithms, delegate code generation to `query_kimi`.

---

## Task Checklist

- [ ] **Task 2.1: Database Schema Migration**
  - Target File: `phase2_schema_migration.py`
  - Action: Generate SQLite migration script to add `GAME_ID` (UUID) to main games, create `GameQuality`, `GameQualityIssue`, and `AnalysisProvenance` tables. Initialize migrated games as `VALIDATION_STATUS = 'UNVALIDATED'`.

- [ ] **Task 2.2: Cython Fast PGN Validator (`FasterCode`)**
  - Target Files: `fast_pgn_validator.pyx`, `setup.py` (or compilation wrapper)
  - Action: Write Cython parser for raw PGNs returning `SOURCE_HASH`, `CLEAN_HASH`, ply count, issues list, and atomic flags (`has_valid_pgn`, `has_players`, `has_result`, `has_authoritative_elo`).

- [ ] **Task 2.3: Pure Python Tier Derivation Logic**
  - Target File: `tier_derivation.py`
  - Action: Implement `derive_tier(flags: dict) -> int` mapping Tiers 0–3. Cap tier at Tier 1 if `has_authoritative_elo` is False, even if full analysis exists.

- [ ] **Task 2.4: DuckDB & SQLite Query Gating Alignment**
  - Target Files: `analytics_engine.py`, `WDB_Perfomance.py`
  - Action: Audit and strip out hardcoded `1500` / `350` fallback queries. Ensure DuckDB and SQLite filtering queries strictly enforce tier gating and return `NULL` for missing metrics.

- [ ] **Task 2.5: Integrated Readiness & Validation Test Suite**
  - Target File: `tests/test_phase2_validation.py`
  - Action: Write pytest assertions verifying zero-fallback enforcement, tier gating edge cases, and SQLite/DuckDB query parity.