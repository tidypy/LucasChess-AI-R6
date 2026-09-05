"""
Companion Engine Subsystem - Shared Data Shapes and Types
Strict typing for Kibitzer, Tutor, and Sparring modules.
"""

from typing import TypedDict, Literal, Optional, List, Dict, Any
from pydantic import BaseModel, Field

# -----------------------------------------------------------------------------
# Section 3.2: EngineRunMode Shared Shape
# -----------------------------------------------------------------------------

EngineModeLiteral = Literal["on_demand", "polling", "continuous", "opponent_clock_bound", "user_clock_bound"]

class EngineRunMode(TypedDict):
    """
    Shared configuration shape, instantiated independently per engine consumer
    (Kibitzer, Tutor, Sparring).
    """
    mode: EngineModeLiteral
    ply: Optional[int]                 # cap for on_demand/polling bursts
    multipv: int                       # number of candidate lines
    threads: int                       # allocated CPU threads
    hash_mb: int                       # hash table allocation in MB
    poll_interval_s: Optional[float]   # only used when mode == 'polling'

# -----------------------------------------------------------------------------
# Section 4.4 & 5.2: Sparring Game Types
# -----------------------------------------------------------------------------

TutorInterruptMode = Literal["freeze_on_flag", "passive_log"]

class SparringGameRecord(TypedDict):
    game_id: str                       # UUID minted at game start
    started_at: str                    # ISO 8601 timestamp
    opponent_engine: str               # e.g. 'Stockfish 18', 'Maia 1900'
    user_time_control: Optional[str]   # e.g. '10+0', '5+3', 'unlimited'
    tutor_interrupt_mode: TutorInterruptMode
    pgn: Optional[str]                 # full live game PGN
    result: Optional[str]              # '1-0', '0-1', '1/2-1/2', '*'

# -----------------------------------------------------------------------------
# Section 5.3: Kibitzer Analysis Types
# -----------------------------------------------------------------------------

KibitzerTriggerSource = Literal["continuous", "polling", "get_advise"]
KibitzerLoggedBy = Literal["user_save", "auto_verbose"]

class KibitzerVariationRecord(TypedDict):
    id: Optional[int]
    game_id: str                       # FK -> Sparring_Games.games.game_id
    ply: int                           # move index snapshot
    fen: str                           # position snapshot
    engine: str                        # e.g. 'Patricia'
    pgn_fragment: str                  # partial PGN line
    eval_data: Optional[str]           # JSON string or cp/WDL output
    trigger_source: KibitzerTriggerSource
    logged_by: KibitzerLoggedBy
    was_played: Optional[bool]         # True/False once game reaches ply, NULL until then
    saved_at: str                      # ISO 8601 timestamp

# -----------------------------------------------------------------------------
# Section 5.4: Tutor Game Flag Types
# -----------------------------------------------------------------------------

TutorFlagType = Literal["user_blunder", "engine_blunder", "tactic", "best_move_available"]
TutorOutcome = Literal["accepted_suggestion", "played_own_move", "ignored_flag"]
TutorTriggerSource = Literal["continuous", "polling", "flag_triggered"]

class TutorFlagRecord(TypedDict):
    id: Optional[int]
    game_id: str                       # FK -> Sparring_Games.games.game_id
    ply: int                           # move index snapshot
    fen: str                           # position snapshot
    flag_type: TutorFlagType
    engine: str                        # e.g. 'Stockfish @2500'
    centipawn_data: Optional[str]      # JSON string containing cp loss & win prob
    suggested_variations: Optional[str]# JSON array of VariationLine items
    tutor_outcome: TutorOutcome
    trigger_source: TutorTriggerSource
    logged_at: str                     # ISO 8601 timestamp

# -----------------------------------------------------------------------------
# Section 6: Variation Lines and Tag Classifier Rules
# -----------------------------------------------------------------------------

class TagRule(TypedDict):
    tag: str                           # 'best' | 'excellent' | 'inaccuracy' | 'mistake' | 'blunder' | 'tactical' | 'aggressive' | 'brilliant' | 'solid'
    cp_delta_min: int                  # centipawn delta lower bound vs best move
    cp_delta_max: int                  # centipawn delta upper bound vs best move
    win_delta_min: Optional[float]     # win probability delta lower bound
    requires_sacrifice: bool
    requires_tactical_forcing: bool

class VariationLine(TypedDict):
    pv_san: str                        # primary move or variation string in SAN
    pv_uci: str                        # primary move or variation in UCI
    score_cp: Optional[int]            # centipawn score from POV of side to move
    is_mate: bool                      # True if forced mate
    mate_in: Optional[int]             # moves to mate (positive if winning, negative if losing)
    cp_delta: int                      # diff vs best move (0 for best move, negative for suboptimal)
    win_prob: float                    # 0.0 to 1.0
    win_prob_delta: float              # diff in win prob vs best move
    depth: int                         # search depth
    nps: Optional[int]                 # nodes per second
    tags: List[str]                    # computed classification tags

# -----------------------------------------------------------------------------
# Pydantic Schemas for API Requests & Responses
# -----------------------------------------------------------------------------

class CreateSparringGameRequest(BaseModel):
    game_id: Optional[str] = Field(None, description="Optional UUID; minted if omitted")
    opponent_engine: str = Field(..., description="Engine name/ID")
    user_time_control: Optional[str] = Field("unlimited", description="Time control")
    tutor_interrupt_mode: TutorInterruptMode = Field("passive_log", description="Interrupt behavior")

class LogKibitzerVariationRequest(BaseModel):
    game_id: str
    ply: int
    fen: str
    engine: str
    pgn_fragment: str
    eval_data: Optional[Dict[str, Any]] = None
    trigger_source: KibitzerTriggerSource = "get_advise"
    logged_by: KibitzerLoggedBy = "user_save"
    was_played: Optional[bool] = None

class LogTutorFlagRequest(BaseModel):
    game_id: str
    ply: int
    fen: str
    flag_type: TutorFlagType
    engine: str
    centipawn_data: Optional[Dict[str, Any]] = None
    suggested_variations: Optional[List[Dict[str, Any]]] = None
    tutor_outcome: TutorOutcome = "ignored_flag"
    trigger_source: TutorTriggerSource = "flag_triggered"
