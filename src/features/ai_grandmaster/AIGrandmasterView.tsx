import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { UXTheme } from "../../lib/theme";
import { useClickLogger } from "../../lib/clickLogger";
import {
  fetchAIConfig,
  updateAIConfig,
  fetchAIPersonas,
  testAIConnection,
  generateAICommentary,
  fetchAIProfile,
  updateAIProfile,
  AIConfig,
  AIPersona,
} from "../../lib/api";
import {
  Sparkles,
  Server,
  Key,
  Flame,
  CheckCircle2,
  AlertCircle,
  RefreshCw,
  Send,
  Save,
  Sliders,
  Eye,
  EyeOff,
  Brain,
} from "lucide-react";

interface AIGrandmasterViewProps {
  uxTheme: UXTheme;
}

export function AIGrandmasterView({ }: AIGrandmasterViewProps) {
  const { logAction } = useClickLogger();
  const queryClient = useQueryClient();

  const [activeTab, setActiveTab] = useState<"personas" | "config" | "memory">("personas");
  const [showKey, setShowKey] = useState(false);

  // Live Position Test Inputs
  const [testFen, setTestFen] = useState("r1bqkb1r/pppp1ppp/2n5/4p3/2B1n3/5N2/PPPP1PPP/RNBQK2R w KQkq - 0 5");
  const [testEval, setTestEval] = useState("+1.40 pawns");
  const [testLine, setTestLine] = useState("5.d4 exd4 6.O-O d5 7.Bxd5");
  const [testCommentary, setTestCommentary] = useState<string | null>(null);

  // Provider Form State
  const [localForm, setLocalForm] = useState<Partial<AIConfig>>({
    backend_type: "lm_studio",
    lm_url: "http://localhost:1234/v1",
    byok_url: "https://api.openai.com/v1",
    byok_key: "",
    model_name: "gpt-4o-mini",
    verbosity: "concise",
    active_persona: "tal",
    temperature: 0.7,
  });

  // Connection Test Status
  const [testStatus, setTestStatus] = useState<{
    testing: boolean;
    success?: boolean;
    message?: string;
    models?: string[];
  }>({ testing: false });

  // Memory Editor State
  const [profileText, setProfileText] = useState("");

  // Queries
  const { data: configData } = useQuery({
    queryKey: ["ai_config"],
    queryFn: fetchAIConfig,
  });

  const { data: personasData } = useQuery({
    queryKey: ["ai_personas"],
    queryFn: fetchAIPersonas,
  });

  const { data: profileData } = useQuery({
    queryKey: ["ai_profile"],
    queryFn: fetchAIProfile,
  });

  useEffect(() => {
    if (configData) {
      setLocalForm(configData);
    }
  }, [configData]);

  useEffect(() => {
    if (profileData) {
      setProfileText(profileData.profile);
    }
  }, [profileData]);

  // Mutations
  const configMutation = useMutation({
    mutationFn: (newCfg: Partial<AIConfig>) => updateAIConfig(newCfg),
    onSuccess: (saved) => {
      setLocalForm(saved);
      queryClient.invalidateQueries({ queryKey: ["ai_config"] });
      logAction("API", "Saved AI Configuration", `Backend: ${saved.backend_type}`);
    },
  });

  const profileMutation = useMutation({
    mutationFn: (content: string) => updateAIProfile(content),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["ai_profile"] });
      logAction("API", "Updated AI Memory Profile");
    },
  });

  const commentaryMutation = useMutation({
    mutationFn: generateAICommentary,
    onSuccess: (data) => {
      setTestCommentary(data.commentary);
      logAction("API", "Generated AI Grandmaster Commentary", `Persona: ${data.persona}`);
    },
  });

  const handleTestConnection = async (type: "lm_studio" | "byok") => {
    setTestStatus({ testing: true });
    logAction("API", `Testing connection to ${type}`);
    try {
      const res = await testAIConnection({
        backend_type: type,
        base_url: type === "lm_studio" ? localForm.lm_url || "" : localForm.byok_url || "",
        api_key: type === "byok" ? localForm.byok_key : undefined,
      });
      setTestStatus({
        testing: false,
        success: res.success,
        message: res.message,
        models: res.models,
      });
    } catch (e: any) {
      setTestStatus({
        testing: false,
        success: false,
        message: e.message || "Connection failed",
      });
    }
  };

  const handleSelectPersona = (persona: AIPersona) => {
    const updated = { ...localForm, active_persona: persona.id };
    setLocalForm(updated);
    configMutation.mutate(updated);
    logAction("CLICK", `Selected Grandmaster Persona: ${persona.name}`);
  };

  const activePersonaObj = personasData?.find((p) => p.id === (localForm.active_persona || "tal")) || personasData?.[0];

  return (
    <div className="flex flex-col gap-6 max-w-6xl mx-auto pb-12 select-none animate-in fade-in duration-200 font-sans">
      {/* Top Banner */}
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
        <div>
          <div className="text-[10px] font-mono uppercase tracking-widest text-fuchsia-400 font-bold mb-1 flex items-center gap-1.5">
            <Sparkles className="w-3.5 h-3.5" />
            Neural Persona &amp; BYOK Grandmaster Coach
          </div>
          <h1 className="text-3xl font-extrabold tracking-tight text-white flex items-center gap-3">
            AI Grandmaster Lab
            <span className="text-xs font-mono font-normal text-slate-400">
              — Bring Your Own Key (OpenAI / OpenRouter) &amp; Local LLM (LM Studio)
            </span>
          </h1>
        </div>

        {/* Status Pill */}
        <div className="flex items-center gap-3">
          <div className="px-3.5 py-1.5 rounded-2xl bg-black/40 border border-slate-800 flex items-center gap-2 shadow-sm font-mono text-xs">
            <span
              className={`w-2 h-2 rounded-full ${
                localForm.backend_type === "lm_studio" ? "bg-emerald-400" : "bg-blue-400"
              }`}
            />
            <span className="text-slate-300">
              {localForm.backend_type === "lm_studio" ? "Tile 1: LM Studio (Local)" : "Tile 2: Cloud BYOK"}
            </span>
            <span className="text-slate-500">|</span>
            <span className="text-fuchsia-400 font-bold">{activePersonaObj?.name || "Mikhail Tal"}</span>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-2 border-b border-slate-800 pb-2">
        <button
          onClick={() => {
            setActiveTab("personas");
            logAction("NAV", "Switched to AI Personas & Sparring tab");
          }}
          className={`px-4 py-2 text-xs font-bold font-mono rounded-xl transition-all flex items-center gap-2 ${
            activeTab === "personas"
              ? "bg-fuchsia-500/15 text-fuchsia-400 border border-fuchsia-500/30 shadow-md"
              : "text-slate-400 hover:text-white hover:bg-white/5"
          }`}
        >
          <Flame className="w-4 h-4" />
          1. Grandmaster Personas &amp; Live Commentary
        </button>

        <button
          onClick={() => {
            setActiveTab("config");
            logAction("NAV", "Switched to AI BYOK Configuration tab");
          }}
          className={`px-4 py-2 text-xs font-bold font-mono rounded-xl transition-all flex items-center gap-2 ${
            activeTab === "config"
              ? "bg-blue-500/15 text-blue-400 border border-blue-500/30 shadow-md"
              : "text-slate-400 hover:text-white hover:bg-white/5"
          }`}
        >
          <Sliders className="w-4 h-4" />
          2. Provider Setup (BYOK &amp; LM Studio)
        </button>

        <button
          onClick={() => {
            setActiveTab("memory");
            logAction("NAV", "Switched to AI Memory Profile tab");
          }}
          className={`px-4 py-2 text-xs font-bold font-mono rounded-xl transition-all flex items-center gap-2 ${
            activeTab === "memory"
              ? "bg-emerald-500/15 text-emerald-400 border border-emerald-500/30 shadow-md"
              : "text-slate-400 hover:text-white hover:bg-white/5"
          }`}
        >
          <Brain className="w-4 h-4" />
          3. Player Memory Profile (Markdown)
        </button>
      </div>

      {/* TAB 1: PERSONAS & LIVE COACHING */}
      {activeTab === "personas" && (
        <div className="space-y-6 animate-in fade-in duration-150">
          {/* Persona Selection Grid */}
          <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-5 gap-3.5">
            {personasData?.map((p) => {
              const isSelected = (localForm.active_persona || "tal") === p.id;
              return (
                <div
                  key={p.id}
                  onClick={() => handleSelectPersona(p)}
                  className={`p-4 rounded-3xl border cursor-pointer transition-all flex flex-col justify-between group ${
                    isSelected
                      ? "bg-fuchsia-500/10 border-fuchsia-500/40 text-white ring-2 ring-fuchsia-500/20 shadow-xl"
                      : "bg-[#14171c] border-slate-800 text-slate-400 hover:border-slate-700 hover:bg-white/5"
                  }`}
                >
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="text-2xl">{p.avatar}</span>
                      {isSelected && (
                        <div className="w-5 h-5 rounded-full bg-fuchsia-500 text-slate-950 flex items-center justify-center font-bold">
                          <CheckCircle2 className="w-3.5 h-3.5" />
                        </div>
                      )}
                    </div>
                    <div>
                      <h3 className="font-bold text-sm text-white group-hover:text-fuchsia-300 transition-colors">
                        {p.name}
                      </h3>
                      <span className="text-[10px] font-mono text-fuchsia-400 block">{p.title}</span>
                      <span className="text-[11px] text-slate-500 leading-tight block mt-1">{p.style}</span>
                    </div>
                  </div>

                  {/* Attribute Bars */}
                  <div className="mt-4 pt-3 border-t border-white/5 space-y-1.5 font-mono text-[10px]">
                    <div className="flex justify-between">
                      <span className="text-slate-500">Aggression</span>
                      <span className="text-rose-400 font-bold">{p.aggression}%</span>
                    </div>
                    <div className="w-full bg-slate-900 rounded-full h-1 overflow-hidden">
                      <div className="bg-rose-500 h-full rounded-full" style={{ width: `${p.aggression}%` }} />
                    </div>

                    <div className="flex justify-between pt-1">
                      <span className="text-slate-500">Precision</span>
                      <span className="text-emerald-400 font-bold">{p.precision}%</span>
                    </div>
                    <div className="w-full bg-slate-900 rounded-full h-1 overflow-hidden">
                      <div className="bg-emerald-500 h-full rounded-full" style={{ width: `${p.precision}%` }} />
                    </div>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Interactive Live Coach Sandbox */}
          <div className="p-6 rounded-3xl bg-[#14171c] border border-slate-800 shadow-2xl space-y-5">
            <div className="flex items-center justify-between border-b border-white/5 pb-3">
              <h2 className="text-xs font-bold uppercase tracking-wider text-slate-200 flex items-center gap-2">
                <Sparkles className="w-4 h-4 text-fuchsia-400" />
                Live Grandmaster Explanation Sandbox
              </h2>
              <span className="text-xs font-mono text-fuchsia-400 font-bold flex items-center gap-1.5">
                <span>Active Coach:</span>
                <span className="text-white">{activePersonaObj?.name}</span>
                <span>{activePersonaObj?.avatar}</span>
              </span>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 font-mono text-xs">
              <div className="space-y-1.5">
                <label className="text-[11px] text-slate-400 font-bold">Position FEN:</label>
                <input
                  type="text"
                  value={testFen}
                  onChange={(e) => setTestFen(e.target.value)}
                  className="w-full bg-black/40 border border-white/10 rounded-xl px-3 py-2 text-[11px] text-slate-200 focus:outline-none focus:border-fuchsia-500"
                />
              </div>

              <div className="space-y-1.5">
                <label className="text-[11px] text-slate-400 font-bold">Stockfish Evaluation:</label>
                <input
                  type="text"
                  value={testEval}
                  onChange={(e) => setTestEval(e.target.value)}
                  className="w-full bg-black/40 border border-white/10 rounded-xl px-3 py-2 text-[11px] text-emerald-400 focus:outline-none focus:border-fuchsia-500"
                />
              </div>

              <div className="space-y-1.5">
                <label className="text-[11px] text-slate-400 font-bold">Engine Main Line:</label>
                <input
                  type="text"
                  value={testLine}
                  onChange={(e) => setTestLine(e.target.value)}
                  className="w-full bg-black/40 border border-white/10 rounded-xl px-3 py-2 text-[11px] text-blue-400 focus:outline-none focus:border-fuchsia-500"
                />
              </div>
            </div>

            <div className="flex items-center justify-between gap-4 pt-2">
              <span className="text-xs text-slate-400">
                Mode: <strong className="text-slate-200 capitalize">{localForm.verbosity}</strong> ({localForm.verbosity === "concise" ? "1-2 punchy sentences" : "2-paragraph masterclass"})
              </span>

              <button
                onClick={() =>
                  commentaryMutation.mutate({
                    fen: testFen,
                    eval_str: testEval,
                    main_line: testLine,
                    persona_id: localForm.active_persona,
                  })
                }
                disabled={commentaryMutation.isPending}
                className="px-6 py-2.5 bg-fuchsia-600 hover:bg-fuchsia-500 text-white font-bold text-xs rounded-2xl shadow-lg transition-all flex items-center gap-2 disabled:opacity-50 cursor-pointer"
              >
                {commentaryMutation.isPending ? (
                  <>
                    <RefreshCw className="w-4 h-4 animate-spin" />
                    Generating Commentary...
                  </>
                ) : (
                  <>
                    <Send className="w-4 h-4" />
                    Ask {activePersonaObj?.name}
                  </>
                )}
              </button>
            </div>

            {/* Commentary Output Bubble */}
            {testCommentary && (
              <div className="p-5 rounded-2xl bg-black/50 border border-fuchsia-500/30 space-y-2 animate-in fade-in duration-200">
                <div className="flex items-center gap-2 font-bold text-xs text-fuchsia-400">
                  <span>{activePersonaObj?.avatar}</span>
                  <span>{activePersonaObj?.name} says:</span>
                </div>
                <p className="text-xs text-slate-200 leading-relaxed font-sans italic pl-6 border-l-2 border-fuchsia-500/40">
                  "{testCommentary}"
                </p>
              </div>
            )}
          </div>
        </div>
      )}

      {/* TAB 2: CONFIGURATION (2-TILE) */}
      {activeTab === "config" && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 animate-in fade-in duration-150">
          {/* TILE 1: LM STUDIO */}
          <div
            className={`p-6 rounded-3xl border shadow-xl flex flex-col justify-between space-y-4 ${
              localForm.backend_type === "lm_studio"
                ? "bg-[#14171c] border-emerald-500/40 ring-1 ring-emerald-500/30"
                : "bg-[#14171c]/60 border-slate-800 opacity-80"
            }`}
          >
            <div className="space-y-4">
              <div className="flex items-center justify-between border-b border-white/5 pb-3">
                <div className="flex items-center gap-2.5">
                  <Server className="w-5 h-5 text-emerald-400" />
                  <h2 className="text-sm font-bold text-white">Tile 1: Local LLM (LM Studio / Ollama)</h2>
                </div>
                <input
                  type="radio"
                  name="backend_type"
                  checked={localForm.backend_type === "lm_studio"}
                  onChange={() => {
                    const updated = { ...localForm, backend_type: "lm_studio" as const };
                    setLocalForm(updated);
                    configMutation.mutate(updated);
                  }}
                  className="w-4 h-4 cursor-pointer accent-emerald-500"
                />
              </div>

              <p className="text-xs text-slate-400 leading-relaxed">
                Run models locally (e.g. <code>Llama-3-8B-Instruct</code> or <code>Mistral-7B</code>) with 100% offline privacy and zero cost.
              </p>

              <div className="space-y-1.5 text-xs font-mono">
                <label className="text-slate-300 font-bold block">Local Server Endpoint:</label>
                <input
                  type="text"
                  value={localForm.lm_url}
                  onChange={(e) => setLocalForm({ ...localForm, lm_url: e.target.value })}
                  placeholder="http://localhost:1234/v1"
                  className="w-full bg-black/40 border border-white/10 rounded-xl px-3 py-2 text-slate-200 focus:outline-none focus:border-emerald-500"
                />
              </div>
            </div>

            <div className="pt-4 border-t border-white/5 flex items-center justify-between">
              <button
                onClick={() => handleTestConnection("lm_studio")}
                disabled={testStatus.testing}
                className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-bold rounded-xl border border-slate-700 transition-all flex items-center gap-2 cursor-pointer"
              >
                {testStatus.testing ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Server className="w-3.5 h-3.5" />}
                Test Local Server
              </button>

              <button
                onClick={() => configMutation.mutate(localForm)}
                className="px-4 py-2 bg-emerald-500 hover:bg-emerald-400 text-slate-950 text-xs font-bold rounded-xl shadow-md transition-all flex items-center gap-1.5 cursor-pointer"
              >
                <Save className="w-3.5 h-3.5" />
                Save Local Settings
              </button>
            </div>
          </div>

          {/* TILE 2: CLOUD BYOK */}
          <div
            className={`p-6 rounded-3xl border shadow-xl flex flex-col justify-between space-y-4 ${
              localForm.backend_type === "byok"
                ? "bg-[#14171c] border-blue-500/40 ring-1 ring-blue-500/30"
                : "bg-[#14171c]/60 border-slate-800 opacity-80"
            }`}
          >
            <div className="space-y-4">
              <div className="flex items-center justify-between border-b border-white/5 pb-3">
                <div className="flex items-center gap-2.5">
                  <Key className="w-5 h-5 text-blue-400" />
                  <h2 className="text-sm font-bold text-white">Tile 2: Cloud API (Bring Your Own Key)</h2>
                </div>
                <input
                  type="radio"
                  name="backend_type"
                  checked={localForm.backend_type === "byok"}
                  onChange={() => {
                    const updated = { ...localForm, backend_type: "byok" as const };
                    setLocalForm(updated);
                    configMutation.mutate(updated);
                  }}
                  className="w-4 h-4 cursor-pointer accent-blue-500"
                />
              </div>

              <p className="text-xs text-slate-400 leading-relaxed">
                Connect directly to OpenAI (GPT-4o), OpenRouter, DeepSeek, or Groq with your personal API key.
              </p>

              <div className="space-y-3 text-xs font-mono">
                <div className="space-y-1">
                  <label className="text-slate-300 font-bold block">Base URL:</label>
                  <input
                    type="text"
                    value={localForm.byok_url}
                    onChange={(e) => setLocalForm({ ...localForm, byok_url: e.target.value })}
                    placeholder="https://api.openai.com/v1"
                    className="w-full bg-black/40 border border-white/10 rounded-xl px-3 py-2 text-slate-200 focus:outline-none focus:border-blue-500"
                  />
                </div>

                <div className="space-y-1">
                  <label className="text-slate-300 font-bold block">API Key (Stored Locally):</label>
                  <div className="relative">
                    <input
                      type={showKey ? "text" : "password"}
                      value={localForm.byok_key}
                      onChange={(e) => setLocalForm({ ...localForm, byok_key: e.target.value })}
                      placeholder="sk-..."
                      className="w-full bg-black/40 border border-white/10 rounded-xl px-3 py-2 text-slate-200 focus:outline-none focus:border-blue-500 pr-9"
                    />
                    <button
                      type="button"
                      onClick={() => setShowKey(!showKey)}
                      className="absolute right-2.5 top-2 text-slate-500 hover:text-white"
                    >
                      {showKey ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                </div>

                <div className="space-y-1">
                  <label className="text-slate-300 font-bold block">Model Name:</label>
                  <input
                    type="text"
                    value={localForm.model_name}
                    onChange={(e) => setLocalForm({ ...localForm, model_name: e.target.value })}
                    placeholder="gpt-4o-mini"
                    className="w-full bg-black/40 border border-white/10 rounded-xl px-3 py-2 text-slate-200 focus:outline-none focus:border-blue-500"
                  />
                </div>
              </div>
            </div>

            <div className="pt-4 border-t border-white/5 flex items-center justify-between">
              <button
                onClick={() => handleTestConnection("byok")}
                disabled={testStatus.testing}
                className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-bold rounded-xl border border-slate-700 transition-all flex items-center gap-2 cursor-pointer"
              >
                {testStatus.testing ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Key className="w-3.5 h-3.5" />}
                Test Cloud Key
              </button>

              <button
                onClick={() => configMutation.mutate(localForm)}
                className="px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white text-xs font-bold rounded-xl shadow-md transition-all flex items-center gap-1.5 cursor-pointer"
              >
                <Save className="w-3.5 h-3.5" />
                Save Cloud Settings
              </button>
            </div>
          </div>

          {/* Test Status Banner */}
          {testStatus.message && (
            <div
              className={`md:col-span-2 p-4 rounded-2xl border flex items-start gap-3 text-xs font-mono animate-in fade-in duration-150 ${
                testStatus.success
                  ? "bg-emerald-950/20 border-emerald-500/40 text-emerald-300"
                  : "bg-rose-950/20 border-rose-500/40 text-rose-300"
              }`}
            >
              {testStatus.success ? <CheckCircle2 className="w-4 h-4 mt-0.5" /> : <AlertCircle className="w-4 h-4 mt-0.5" />}
              <div className="space-y-1">
                <div className="font-bold">{testStatus.message}</div>
                {testStatus.models && testStatus.models.length > 0 && (
                  <div className="text-[10px] opacity-80">
                    Discovered Models: {testStatus.models.slice(0, 5).join(", ")}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Global Coaching Verbosity */}
          <div className="md:col-span-2 p-5 rounded-3xl bg-[#14171c] border border-slate-800 flex flex-col md:flex-row items-center justify-between gap-4">
            <div>
              <h3 className="text-xs font-bold text-white uppercase tracking-wider">Coach Commentary Verbosity</h3>
              <p className="text-xs text-slate-400 mt-0.5">Control how concise or comprehensive grandmaster explanations are.</p>
            </div>

            <div className="flex items-center gap-2">
              <button
                onClick={() => {
                  const updated = { ...localForm, verbosity: "concise" as const };
                  setLocalForm(updated);
                  configMutation.mutate(updated);
                }}
                className={`px-4 py-2 rounded-xl text-xs font-bold font-mono transition-all ${
                  localForm.verbosity === "concise" ? "bg-fuchsia-600 text-white shadow" : "bg-black/30 text-slate-400"
                }`}
              >
                Concise (1-2 Sentences)
              </button>

              <button
                onClick={() => {
                  const updated = { ...localForm, verbosity: "detailed" as const };
                  setLocalForm(updated);
                  configMutation.mutate(updated);
                }}
                className={`px-4 py-2 rounded-xl text-xs font-bold font-mono transition-all ${
                  localForm.verbosity === "detailed" ? "bg-fuchsia-600 text-white shadow" : "bg-black/30 text-slate-400"
                }`}
              >
                Detailed (2 Paragraphs)
              </button>
            </div>
          </div>
        </div>
      )}

      {/* TAB 3: PLAYER MEMORY PROFILE */}
      {activeTab === "memory" && (
        <div className="p-6 rounded-3xl bg-[#14171c] border border-slate-800 shadow-2xl space-y-4 animate-in fade-in duration-150">
          <div className="flex items-center justify-between border-b border-white/5 pb-3">
            <div>
              <h2 className="text-xs font-bold uppercase tracking-wider text-slate-200 flex items-center gap-2">
                <Brain className="w-4 h-4 text-emerald-400" />
                Persistent Markdown Player Profile (AI_Player_Profile.md)
              </h2>
              <p className="text-xs text-slate-400 mt-0.5">
                The Grandmaster coach reads this memory context before every explanation to tailor advice to your openings and blindspots.
              </p>
            </div>

            <button
              onClick={() => profileMutation.mutate(profileText)}
              disabled={profileMutation.isPending}
              className="px-5 py-2 bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold text-xs rounded-xl shadow transition-all flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
            >
              {profileMutation.isPending ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
              Save Memory Profile
            </button>
          </div>

          <textarea
            value={profileText}
            onChange={(e) => setProfileText(e.target.value)}
            rows={12}
            className="w-full bg-black/40 border border-white/10 rounded-2xl p-4 font-mono text-xs text-emerald-400 leading-relaxed focus:outline-none focus:border-emerald-500 resize-y"
          />
        </div>
      )}
    </div>
  );
}
