/**
 * Companion Engine Subsystem - Frontend Type Definitions
 * Kibitzer / Tutor / Sparring shared interfaces matching the backend models.
 */

export type EngineModeLiteral = "on_demand" | "polling" | "continuous" | "opponent_clock_bound" | "user_clock_bound";

export interface EngineRunMode {
  mode: EngineModeLiteral;
  ply?: number | null;
  multipv: number;
  threads: number;
  hash_mb: number;
  poll_interval_s?: number | null;
}

export type TutorInterruptMode = "freeze_on_flag" | "passive_log";

export interface SparringGameRecord {
  game_id: string;
  started_at: string;
  opponent_engine: string;
  user_time_control?: string | null;
  tutor_interrupt_mode: TutorInterruptMode;
  pgn?: string | null;
  result?: string | null;
}

export type KibitzerTriggerSource = "continuous" | "polling" | "get_advise";
export type KibitzerLoggedBy = "user_save" | "auto_verbose";

export interface KibitzerVariationRecord {
  id?: number;
  game_id: string;
  ply: number;
  fen: string;
  engine: string;
  pgn_fragment: string;
  eval_data?: any;
  trigger_source: KibitzerTriggerSource;
  logged_by: KibitzerLoggedBy;
  was_played?: boolean | null;
  saved_at: string;
}

export type TutorFlagType = "user_blunder" | "engine_blunder" | "tactic" | "best_move_available";
export type TutorOutcome = "accepted_suggestion" | "played_own_move" | "ignored_flag";
export type TutorTriggerSource = "continuous" | "polling" | "flag_triggered";

export interface TutorFlagRecord {
  id?: number;
  game_id: string;
  ply: number;
  fen: string;
  flag_type: TutorFlagType;
  engine: string;
  centipawn_data?: any;
  suggested_variations?: any;
  tutor_outcome: TutorOutcome;
  trigger_source: TutorTriggerSource;
  logged_at: string;
}

export interface TagRule {
  tag: string;
  cp_delta_min: number;
  cp_delta_max: number;
  win_delta_min?: number;
  requires_sacrifice: boolean;
  requires_tactical_forcing: boolean;
}

export interface VariationLine {
  pv_san: string;
  pv_uci: string;
  score_cp?: number | null;
  is_mate: boolean;
  mate_in?: number | null;
  cp_delta: number;
  win_prob: number;
  win_prob_delta: number;
  depth: number;
  nps?: number | null;
  tags: string[];
}

export interface FullGameDossier {
  game: SparringGameRecord;
  timeline: Array<{
    ply: number;
    fen: string;
    tutor_flags: TutorFlagRecord[];
    kibitzer_variations: KibitzerVariationRecord[];
  }>;
  total_tutor_flags: number;
  total_kibitzer_variations: number;
}
