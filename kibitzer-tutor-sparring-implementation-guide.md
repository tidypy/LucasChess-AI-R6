# Kibitzer / Tutor / Sparring — Implementation Guide

Companion engine subsystem for the sparring workspace. Three independent UCI
engine consumers, each with a different job, sharing only mechanical
plumbing — never judgment/classification logic.

---

## 1. Scope & Non-Goals

**In scope:** engine lifecycle (start/stop/log), pre-game configuration,
database schemas for the three logging stores, resource management,
cross-module interaction rules (get-advise, interrupt behavior).

**Explicitly shelved (do not build yet):**
- DB merge tooling (cross-referencing Kibitzer/Tutor saves from the same game into one training set)
- "Plays like Kramnik/Spassky" style-fingerprinting (recycle the existing repertoire-hash / Komodo-tuner apps later)
- Any lichess/master-game corpus integration — no live API, no move-popularity data. Move quality is engine-derived (ACPL/centipawn math), by design, not corpus-derived.

---

## 2. Module Responsibilities

| | **Kibitzer** | **Tutor** | **Sparring** |
|---|---|---|---|
| Engine | User-selectable (e.g. Patricia) | User-selectable, often capped (e.g. Stockfish @2500) | User-selectable (e.g. Maia 1900) |
| Runs | Passive (continuous/polling) or on-demand ("get advise") | Passive (continuous/polling) or triggered by blunder/tactic/best-move flags | Always (it's the opponent) |
| Training frame | **"Roads not taken"** — alternative lines, played or not | **"Reinforcement"** — should this specific move/habit be strengthened | Game record only; analysis deferred |
| Logs | User-saved variations (opt-in), metadata only unless verbose is chosen | Flag events: blunder/tactic/best-move + centipawn/WDL at trigger point | FEN + moves; live analysis considered low-value |
| DB | `Kibitzer_Analysis.sqlite` | `Tutor_Games.sqlite` (proposed) | `Sparring_Games.sqlite` |

Overlay: Tutor only. Kibitzer never overlays the board — separate module/window.

---

## 3. Shared Primitives — "Mechanics," Not "Judgment"

Rule of thumb carried through this whole design: **share plumbing, never
share classification/tagging logic.** Kibitzer's engine and Tutor's engine
must never be the same process or share state — but *how* any engine is
talked to, throttled, and logged is one implementation, reused three times.

### 3.1 Async per-process UCI I/O (`core/engine/uci_process.py`)
- One class wrapping a single UCI subprocess (stdin/stdout), fully async.
- **Hard requirement:** no blocking reads on the main event loop. This is
  what keeps Sparring's UI responsive while Kibitzer/Tutor churn in the
  background — verify this at the transport layer, not per-feature.
- Exposes: `go(params) -> AsyncIterator[InfoLine]`, `stop() -> BestMove`,
  `is_thinking: bool`.

### 3.2 `EngineRunMode` — shared config shape, per-module instance
```python
class EngineRunMode(TypedDict):
    mode: Literal["on_demand", "polling", "continuous", "opponent_clock_bound"]
    ply: int | None          # cap for on_demand/polling bursts
    multipv: int             # number of candidate lines
    threads: int
    hash_mb: int
    poll_interval_s: float | None   # only used when mode == "polling"
```
Kibitzer and Tutor each get their **own instance** of this shape in their
pre-game options — same schema, independently configured, independently
enforced. Do not let them share a live object.

### 3.3 `request_variations` primitive
```python
async def request_variations(
    engine: UciProcess, fen: str, ply: int, multipv: int
) -> list[VariationLine]:
    ...
```
Backs both Tutor's flag-suggestions and Kibitzer's "get advise" /
passive output. Each caller decides independently what happens to the
result (display-and-discard vs. display-and-optionally-persist) — this
function has no opinion about logging.

### 3.4 Startup thread-budget check
- Per-engine: keep the existing trimmed UCI presets (already shipped —
  prevents e.g. Stockfish @2000 + 2 threads + 1GB hash nonsense).
- **New:** a *sum-across-live-engines* check at the moment more than one
  engine could be concurrently active (Sparring + Kibitzer + Tutor all
  configured to run). Budget = logical cores minus a reserved margin for
  OS/UI. If the user's combined config exceeds budget, surface a resource
  warning — do not silently throttle.

---

## 4. Engine Lifecycle & Logging Rule

**The entire logging model reduces to one rule:**

> An engine logs when it stops. Nothing is logged while an engine hasn't
> run. No partial-search logging, no exceptions.

### 4.1 State machine (per engine instance)
```
IDLE ──go()──▶ THINKING ──stop()──▶ LOGGING ──write complete──▶ IDLE
                   │
                   └── interrupted (external stop(), e.g. by get-advise) ──▶ LOGGING (immediate) ──▶ IDLE
```
- `THINKING → LOGGING` always writes immediately on stop, whether the stop
  was natural (user/engine moved) or forced (interrupted by another
  module's get-advise).
- No resume-from-partial-search. A `stop()` always terminates the search;
  a later `go()` is a fresh search on the (possibly still current) FEN.

### 4.2 Default background-thinking policy: opponent-clock-bound
Per-module toggle, **defaults to YES**:
- `think_during_user: bool` — Tutor
- `think_during_user: bool` — Kibitzer

When **YES** (default): Kibitzer/Tutor background thinking is scoped to
run *while the sparring opponent engine is thinking*, not tied to the
user's own clock. This is what makes "user has unlimited time" a
non-issue — background compute was never bound to the user's clock in
the first place.

When set to **on_demand only**: background engines stay `IDLE` until the
user explicitly invokes get-advise; nothing logs until then.

### 4.3 Get-advise pause semantics
- Pressing "get advise" on Kibitzer (or Tutor) issues `stop()` to any
  other currently-`THINKING` engine instance (including the sparring
  opponent's background analysis, if applicable) → immediate log per §4.1
  → then `go()` on the requesting module.
- Sparring engine's actual move-search (its role as the opponent) is
  never interrupted by this — only *analysis* processes are paused. The
  live game and the UI are president; get-advise pauses analysis
  engines, never gameplay itself.

### 4.4 Tutor interrupt mode (pre-game option)
```python
tutor_interrupt_mode: Literal["freeze_on_flag", "passive_log"]
```
- `freeze_on_flag`: play pauses when Tutor flags a blunder/book-diversion,
  user must engage before continuing (classic chess-GUI behavior).
- `passive_log` (**default**): Tutor logs the flag silently, play
  continues uninterrupted — blitz now, review in post-mortem.
- **Stored with the game record.** Downstream stats (e.g. "how often does
  this user take Tutor's advice") must join on this field — in
  `passive_log` mode, an unactioned flag means "never seen," not
  "rejected." Do not treat `ignored_flag` rows as equivalent across modes.

---

## 5. Database Schemas

Three physically separate SQLite files. They stay separate — Kibitzer and
Tutor are different training frames producing different data on purpose.
What must be consistent across all three, from game start, is the join
key set.

### 5.1 Shared join key contract (non-negotiable)
Every row in all three DBs that relates to a given sparring game carries:
- `game_id` — minted **once**, at the moment a sparring game begins, by
  the Sparring module. Passed as context to Kibitzer/Tutor whenever
  invoked during that game.
- `ply` — move index at the position the row concerns.
- `fen` — position snapshot (redundant with ply+movelist, but cheap and
  makes ad-hoc queries/merge-tooling trivial later without replaying the
  game).

Without this, the future "merge DB for training" feature degrades from a
join to fuzzy PGN-prefix matching. Lock this in before implementation.

### 5.2 `Sparring_Games.sqlite`
```sql
CREATE TABLE games (
    game_id         TEXT PRIMARY KEY,
    started_at      TEXT NOT NULL,
    opponent_engine TEXT NOT NULL,       -- e.g. "Maia 1900"
    user_time_control TEXT,
    tutor_interrupt_mode TEXT,           -- 'freeze_on_flag' | 'passive_log', for downstream stat joins
    pgn             TEXT,                -- full game, populated as it's played
    result          TEXT                 -- filled at game end
);
```
Analysis at play-time is intentionally thin — this table is the game
record. Post-hoc analysis is a Data Fitness concern, not written here
live.

### 5.3 `Kibitzer_Analysis.sqlite`
```sql
CREATE TABLE variations (
    id              INTEGER PRIMARY KEY,
    game_id         TEXT NOT NULL,       -- FK → Sparring_Games.games.game_id
    ply             INTEGER NOT NULL,
    fen             TEXT NOT NULL,
    engine          TEXT NOT NULL,       -- e.g. "Patricia"
    pgn_fragment    TEXT NOT NULL,       -- intentionally incomplete: no Result, no full headers
    eval_data       TEXT,                -- engine output as available (cp/mate/WDL)
    trigger_source  TEXT NOT NULL,       -- 'continuous' | 'polling' | 'get_advise'
    logged_by       TEXT NOT NULL,       -- 'user_save' | 'auto_verbose'
    was_played      INTEGER,             -- boolean, nullable: NULL until game reaches/passes this ply
    saved_at        TEXT NOT NULL
);
```
- `pgn_fragment` is deliberately non-conformant to full PGN spec (no
  Result tag, no full metadata) — it's training material, not a game
  record. If external portability is ever needed (e.g. export to a study
  tool), generate a spec-valid PGN at export time (`Result "*"` etc.)
  rather than storing one.
- `auto_verbose` logging is opt-in (storage-cost is the user's call, per
  their own disk budget) — default is `user_save` only.

### 5.4 `Tutor_Games.sqlite` (proposed)
```sql
CREATE TABLE flags (
    id                  INTEGER PRIMARY KEY,
    game_id             TEXT NOT NULL,      -- FK → Sparring_Games.games.game_id
    ply                 INTEGER NOT NULL,
    fen                 TEXT NOT NULL,
    flag_type           TEXT NOT NULL,      -- 'user_blunder' | 'engine_blunder' | 'tactic' | 'best_move_available'
    engine              TEXT NOT NULL,      -- e.g. "Stockfish @2500"
    centipawn_data      TEXT,               -- cp loss / WDL at trigger point
    suggested_variations TEXT,              -- top-K alternatives, each tagged (see §6)
    tutor_outcome       TEXT NOT NULL,      -- 'accepted_suggestion' | 'played_own_move' | 'ignored_flag'
    trigger_source      TEXT NOT NULL,      -- 'continuous' | 'polling' | 'flag_triggered'
    logged_at           TEXT NOT NULL
);
```
- `tutor_outcome` is captured **at the moment of choice**, not inferred
  later by replaying the game — this is the signal that makes
  "reinforcement" training meaningful. In `passive_log` interrupt mode,
  expect this to skew heavily toward `ignored_flag` by construction (the
  user never saw the flag in-the-moment) — that's expected, not a data
  quality problem, but downstream stats must join on
  `games.tutor_interrupt_mode` to interpret it correctly.

### 5.5 Cross-module save event (the "Tutor flags, user checks Kibitzer" case)
No new table or handoff mechanic needed — confirmed during design that
`ResponsiveChessboard`/`App.tsx` already centralizes the current FEN
(`onPositionChange`), so Kibitzer and Tutor always read the same live
position. A Kibitzer save triggered by dissatisfaction with a Tutor flag
is just an ordinary `variations` row with `trigger_source = 'get_advise'`
— the two DBs are correlated after the fact purely via shared `game_id` +
`ply`, not via any live coupling between the modules.

---

## 6. Move/Variation Tag Classifier (placeholder — formula TBD)

Tags (`aggressive`, `tactical`, `brilliant`, `attacking`, etc.) are
computed from **ACPL / centipawn-delta math against engine output only**
— no external game corpus, consistent with the anti-memorization design
goal. Exact banding rules are not finalized; treat this as a config-driven
rules table, not hardcoded thresholds, so tuning doesn't require a
redeploy:

```python
class TagRule(TypedDict):
    tag: str                  # 'aggressive' | 'tactical' | 'brilliant' | 'attacking'
    cp_delta_min: int         # centipawn loss lower bound vs. best move
    cp_delta_max: int
    # additional heuristic inputs (sac detection, exchange imbalance, etc.) TBD
```

This classifier function is the one piece of logic legitimately shared
between Kibitzer and Tutor — not the engines, not the data, just the
"given MultiPV output, what tag(s) apply" math. Same function, two
callers: Kibitzer uses it to *filter* (surface only appealing lines),
Tutor uses it to *label* (attach visible tags to suggestions).

**Decision needed before implementation:** finalize the ACPL/cp-delta
rules table. Everything else in this guide is unblocked without it.

---

## 7. Resource Management Summary

| Mechanism | Applies to | Behavior |
|---|---|---|
| Trimmed UCI presets | All engines individually | Already shipped for Sparring; extend to Kibitzer/Tutor |
| Startup thread-budget check | Sum across all *concurrently configured* engines | Warn, don't silently throttle, when combined config exceeds logical cores minus reserve |
| `opponent_clock_bound` default | Kibitzer/Tutor background thinking | Default ON — background compute scoped to opponent's think time, not user's clock |
| Resource-saver override | User-visible toggle | Manual full-off escape hatch, independent of the above |
| Get-advise | Kibitzer/Tutor on-demand | Manual full-power exception; pauses other analysis engines first |

Single-worker-at-a-time UX constraint (analysis / sparring / DB-filtering
/ data-fitness are mutually exclusive app modes) means DB and analysis
features are out of scope for this concurrency discussion entirely — they
only ever run one or two engines, never competing with a live sparring
session.

---

## 8. Open Items Before Implementation

1. **ACPL/cp-delta tag rules table (§6)** — the one real blocker; everything else here is implementable now.
2. Whether `Tutor_Games.sqlite` should also get a lightweight `variations` shape mirrored from Kibitzer for consistency, or stay as the `flags`-only shape above (current design assumes the latter).
3. Data Fitness / post-analysis layer that consumes all three DBs — not scoped in this guide, referenced only as "fills the gap later."

## 9. Explicitly Deferred (do not build now)
- Cross-DB merge tooling for training-set construction (move-15-Tutor + move-22-Kibitzer example from design discussion)
- Style-fingerprinting ("plays like Kramnik") — recycle existing repertoire-hash/Komodo-tuner work when this is picked back up
- Any external game-corpus/API dependency (lichess, master databases)
