const API_BASE = "http://127.0.0.1:8000/api/v1";

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

