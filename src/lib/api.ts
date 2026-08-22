export const API_BASE = "http://127.0.0.1:8000/api/v1";

export interface GameSummary {
  id: number;
  WHITE: string;
  BLACK: string;
  RESULT: string;
  DATE: string;
  EVENT: string;
  ECO: string;
  OPENING: string;
  PLYCOUNT: number;
  WHITEELO?: string;
  BLACKELO?: string;
}

export interface GameListResponse {
  games: GameSummary[];
  total: number;
  page: number;
  page_size: number;
  total_pages: number;
}

export interface DatabaseInfo {
  name: string;
  path: string;
  size_mb: number;
  is_active: boolean;
}

export interface DatabaseStats {
  total_games: number;
  results: Record<string, number>;
  top_openings: Array<{ eco: string; opening: string; count: number }>;
  path: string;
}

export const fetchHealth = async () => {
  const res = await fetch(`${API_BASE}/system/health`);
  if (!res.ok) throw new Error("Health check failed");
  return res.json();
};

export const fetchGame = async (id: number, dbName?: string) => {
  const url = new URL(`${API_BASE}/games/${id}`);
  if (dbName) url.searchParams.set("db_name", dbName);
  const res = await fetch(url.toString());
  if (!res.ok) throw new Error(`Game #${id} not found`);
  return res.json();
};

export const fetchDatabases = async (): Promise<DatabaseInfo[]> => {
  const res = await fetch(`${API_BASE}/databases`);
  if (!res.ok) throw new Error("Failed to fetch databases");
  return res.json();
};

export interface StorageTelemetry {
  total_size_mb: number;
  total_size_gb: number;
  active_size_mb: number;
  active_size_gb: number;
  trash_size_mb: number;
  active_count: number;
  trash_count: number;
}

export const fetchStorageTelemetry = async (): Promise<StorageTelemetry> => {
  const res = await fetch(`${API_BASE}/databases/storage`);
  if (!res.ok) throw new Error("Failed to fetch storage telemetry");
  return res.json();
};

export const fetchTrash = async (): Promise<Array<{ name: string; path: string; size_mb: number }>> => {
  const res = await fetch(`${API_BASE}/databases/trash`);
  if (!res.ok) throw new Error("Failed to fetch trash databases");
  return res.json();
};

export const trashDatabase = async (dbName: string): Promise<{ success: boolean; trashed: string; size_mb: number }> => {
  const res = await fetch(`${API_BASE}/databases/trash/${encodeURIComponent(dbName)}`, {
    method: "POST",
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: "Failed to move database to trash" }));
    throw new Error(err.detail || "Failed to move database to trash");
  }
  return res.json();
};

export const restoreDatabase = async (dbName: string): Promise<{ success: boolean; restored: string }> => {
  const res = await fetch(`${API_BASE}/databases/restore/${encodeURIComponent(dbName)}`, {
    method: "POST",
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: "Failed to restore database" }));
    throw new Error(err.detail || "Failed to restore database");
  }
  return res.json();
};

export const purgeTrash = async (
  dbNames?: string[]
): Promise<{ success: boolean; purged_count: number; purged_databases: string[]; freed_mb: number }> => {
  const res = await fetch(`${API_BASE}/databases/purge`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ db_names: dbNames || null }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: "Failed to purge trash" }));
    throw new Error(err.detail || "Failed to purge trash");
  }
  return res.json();
};

export const deleteDatabase = async (dbName: string): Promise<{ success: boolean; deleted: string }> => {
  const res = await trashDatabase(dbName);
  return { success: res.success, deleted: res.trashed };
};

export const uploadAndIngestDatabase = async (
  file: File,
  targetName: string,
  strategy: string = "fast"
): Promise<{ success: boolean; db_name: string; imported_games: number; size_mb: number; strategy: string }> => {
  const formData = new FormData();
  formData.append("file", file);
  formData.append("target_name", targetName);
  formData.append("strategy", strategy);

  const res = await fetch(`${API_BASE}/databases/upload-ingest`, {
    method: "POST",
    body: formData,
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: "Failed to upload and ingest database" }));
    throw new Error(err.detail || "Failed to upload and ingest database");
  }
  return res.json();
};

export interface ExportFilteredPayload {
  source_db: string;
  target_name: string;
  search?: string;
  white?: string;
  black?: string;
  eco?: string;
  result?: string;
  game_ids?: number[];
}

export const exportFilteredDatabase = async (
  payload: ExportFilteredPayload
): Promise<{ success: boolean; target_db: string; exported_games: number; size_mb?: number }> => {
  const res = await fetch(`${API_BASE}/databases/export-filtered`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: "Failed to export sub-database" }));
    throw new Error(err.detail || "Failed to export sub-database");
  }
  return res.json();
};

export const setActiveDatabase = async (dbName: string) => {
  const res = await fetch(`${API_BASE}/databases/active`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ db_name: dbName }),
  });
  if (!res.ok) throw new Error("Failed to switch database");
  return res.json();
};

export const fetchDatabaseStats = async (dbName?: string): Promise<DatabaseStats> => {
  const url = new URL(`${API_BASE}/databases/stats`);
  if (dbName) url.searchParams.set("db_name", dbName);
  const res = await fetch(url.toString());
  if (!res.ok) throw new Error("Failed to fetch database stats");
  return res.json();
};

export const fetchGamesList = async (params: {
  page?: number;
  page_size?: number;
  search?: string;
  white?: string;
  black?: string;
  result?: string;
  eco?: string;
  sort_by?: string;
  sort_order?: string;
  db_name?: string;
}): Promise<GameListResponse> => {
  const url = new URL(`${API_BASE}/databases/games`);
  Object.entries(params).forEach(([key, val]) => {
    if (val !== undefined && val !== null && val !== "") {
      url.searchParams.set(key, String(val));
    }
  });
  const res = await fetch(url.toString());
  if (!res.ok) throw new Error("Failed to fetch games list");
  return res.json();
};

export const fetchPlayers = async (search?: string, limit: number = 100): Promise<Array<{ player: string; count: number }>> => {
  const url = new URL(`${API_BASE}/databases/players`);
  if (search) url.searchParams.set("search", search);
  url.searchParams.set("limit", String(limit));
  const res = await fetch(url.toString());
  if (!res.ok) throw new Error("Failed to fetch players");
  return res.json();
};

export const importPgn = async (pgnText: string, dbName?: string): Promise<{ status: string; imported_count: number }> => {
  const res = await fetch(`${API_BASE}/databases/import`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ pgn_text: pgnText, db_name: dbName }),
  });
  if (!res.ok) throw new Error("Failed to import PGN");
  return res.json();
};

export interface AIConfig {
  backend_type: "lm_studio" | "byok";
  lm_url: string;
  byok_url: string;
  byok_key: string;
  model_name: string;
  verbosity: "concise" | "detailed";
  active_persona: string;
  temperature: number;
}

export interface AIPersona {
  id: string;
  name: string;
  title: string;
  style: string;
  aggression: number;
  rigidity: number;
  precision: number;
  avatar: string;
  system_prompt: string;
}

export const fetchAIConfig = async (): Promise<AIConfig> => {
  const res = await fetch(`${API_BASE}/ai/config`);
  if (!res.ok) throw new Error("Failed to fetch AI configuration");
  return res.json();
};

export const updateAIConfig = async (config: Partial<AIConfig>): Promise<AIConfig> => {
  const res = await fetch(`${API_BASE}/ai/config`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(config),
  });
  if (!res.ok) throw new Error("Failed to update AI configuration");
  return res.json();
};

export const fetchAIPersonas = async (): Promise<AIPersona[]> => {
  const res = await fetch(`${API_BASE}/ai/personas`);
  if (!res.ok) throw new Error("Failed to fetch AI personas");
  return res.json();
};

export const testAIConnection = async (data: {
  backend_type: string;
  base_url: string;
  api_key?: string;
}): Promise<{ success: boolean; message: string; models: string[] }> => {
  const res = await fetch(`${API_BASE}/ai/test-connection`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
  if (!res.ok) throw new Error("Failed to test AI connection");
  return res.json();
};

export const generateAICommentary = async (data: {
  fen: string;
  eval_str: string;
  main_line: string;
  persona_id?: string;
  context_notes?: string;
}): Promise<{ success: boolean; commentary: string; persona?: string; avatar?: string }> => {
  const res = await fetch(`${API_BASE}/ai/commentary`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
  if (!res.ok) throw new Error("Failed to generate AI commentary");
  return res.json();
};

export const fetchAIProfile = async (): Promise<{ profile: string }> => {
  const res = await fetch(`${API_BASE}/ai/profile`);
  if (!res.ok) throw new Error("Failed to fetch AI profile");
  return res.json();
};

export const updateAIProfile = async (content: string): Promise<{ profile: string }> => {
  const res = await fetch(`${API_BASE}/ai/profile`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ content }),
  });
  if (!res.ok) throw new Error("Failed to update AI profile");
  return res.json();
};

// ----------------------------------------------------
// Data Fitness & Ingestion APIs
// ----------------------------------------------------

export interface FitnessAuditReport {
  database_name: string;
  database_path: string;
  total_games: number;
  health_score: number;
  grade: string;
  tiers: {
    tier_0_quarantine: number;
    tier_1_sanitized: number;
    tier_2_silver: number;
    tier_3_gold: number;
  };
  issues: {
    missing_results: number;
    unclassified_ecos: number;
    missing_elos: number;
    short_stubs: number;
    corrupt_moves: number;
  };
}

export const fetchFitnessAudit = async (dbName: string): Promise<FitnessAuditReport> => {
  const res = await fetch(`${API_BASE}/fitness/audit?db_name=${encodeURIComponent(dbName)}`);
  if (!res.ok) throw new Error("Failed to load audit report");
  return res.json();
};

export const sanitizeDatabase = async (payload: {
  db_name: string;
  purge_short_stubs: boolean;
  auto_repair_results: boolean;
  normalize_names_dates: boolean;
}): Promise<{
  status: string;
  database_name: string;
  purged_stubs_count: number;
  repaired_results_count: number;
  normalized_records_count: number;
}> => {
  const res = await fetch(`${API_BASE}/fitness/sanitize`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  if (!res.ok) throw new Error("Sanitization pass failed");
  return res.json();
};

export const generateSilverStats = async (dbName: string): Promise<{
  status: string;
  database_name: string;
  ecos_assigned: number;
  tier_2_silver_games: number;
  current_health_score: number;
  grade: string;
}> => {
  const res = await fetch(`${API_BASE}/fitness/generate-silver-stats`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ db_name: dbName }),
  });
  if (!res.ok) throw new Error("Silver statistics generation failed");
  return res.json();
};

export const startMassAnalysis = async (payload: {
  db_name: string;
  depth: number;
  mode: string;
}): Promise<{ job_id: string; status: string; total_games: number }> => {
  const res = await fetch(`${API_BASE}/fitness/mass-analysis/start`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  if (!res.ok) throw new Error("Failed to start mass analysis");
  return res.json();
};

export const fetchMassAnalysisStatus = async (jobId: string) => {
  const res = await fetch(`${API_BASE}/fitness/mass-analysis/status/${encodeURIComponent(jobId)}`);
  if (!res.ok) return null;
  return res.json();
};

export const cancelMassAnalysis = async (jobId: string) => {
  const res = await fetch(`${API_BASE}/fitness/mass-analysis/cancel/${encodeURIComponent(jobId)}`, {
    method: "POST",
  });
  return res.json();
};

// ----------------------------------------------------
// Analytics (Dossier, Compare, Fashion Index) APIs
// ----------------------------------------------------

export const fetchDossierPlayer = async (
  player: string,
  options?: { time_control?: string; date_range?: string; db_name?: string }
) => {
  const url = new URL(`${API_BASE}/dossier/player/${encodeURIComponent(player)}`);
  if (options?.time_control) url.searchParams.set("time_control", options.time_control);
  if (options?.date_range) url.searchParams.set("date_range", options.date_range);
  if (options?.db_name) url.searchParams.set("db_name", options.db_name);
  const res = await fetch(url.toString());
  if (!res.ok) throw new Error(`Dossier for ${player} not found`);
  return res.json();
};

export const fetchDossierCompare = async (playerA: string, playerB: string, dbName?: string) => {
  const url = new URL(`${API_BASE}/dossier/compare`);
  url.searchParams.set("player_a", playerA);
  url.searchParams.set("player_b", playerB);
  if (dbName) url.searchParams.set("db_name", dbName);
  const res = await fetch(url.toString());
  if (!res.ok) throw new Error("Comparison failed");
  return res.json();
};

export const fetchOpeningFashion = async (
  eco: string,
  options?: { time_range?: string; db_name?: string }
) => {
  const url = new URL(`${API_BASE}/openings/fashion`);
  url.searchParams.set("eco", eco);
  if (options?.time_range) url.searchParams.set("time_range", options.time_range);
  if (options?.db_name) url.searchParams.set("db_name", options.db_name);
  const res = await fetch(url.toString());
  if (!res.ok) throw new Error("Failed to fetch fashion index");
  return res.json();
};

export const fetchOpeningPioneers = async () => {
  const res = await fetch(`${API_BASE}/openings/pioneer`);
  if (!res.ok) throw new Error("Failed to fetch opening pioneers");
  return res.json();
};

// ----------------------------------------------------
// Consolidator / Merge APIs
// ----------------------------------------------------

export const mergeDatabases = async (payload: {
  source_dbs: string[];
  target_db_name: string;
  deduplicate: boolean;
}) => {
  const res = await fetch(`${API_BASE}/consolidator/merge`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: "Database merge failed" }));
    throw new Error(err.detail || "Database merge failed");
  }
  return res.json();
};


