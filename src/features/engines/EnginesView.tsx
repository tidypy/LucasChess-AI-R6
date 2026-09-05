import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  fetchEngineList,
  browseEngineFile,
  testUciEngine,
  registerCustomEngine,
  updateCustomEngine,
  cloneEngine,
  removeCustomEngine,
  fetchEngineOptions,
  EngineInfo,
  TestUciResult,
} from "../../lib/api";
import { UXTheme } from "../../lib/theme";
import { UciOptionsInspector } from "./UciOptionsInspector";
import { useClickLogger } from "../../lib/clickLogger";
import {
  Cpu,
  Plus,
  Sliders,
  Copy,
  Trash2,
  Swords,
  CheckCircle2,
  FolderOpen,
  Search,
  Check,
  X,
  Zap,
} from "lucide-react";

interface EnginesViewProps {
  uxTheme: UXTheme;
  onLaunchSparring?: (engineId: string) => void;
}

const AVATAR_ICONS = [
  "🤖", "🐉", "🎩", "🐟", "🦗", "⚔️", "⚡", "🍎", "🏛️", "🐭",
  "🛡️", "🎖️", "🎯", "🏰", "🏅", "🧠", "🌱", "👑", "🔥", "💎",
];

export function EnginesView({ uxTheme, onLaunchSparring }: EnginesViewProps) {
  const { logAction } = useClickLogger();
  const queryClient = useQueryClient();
  const isLight = uxTheme?.mode === "light" || uxTheme?.id === "clean-light";

  // Search and Filter State
  const [searchQuery, setSearchQuery] = useState("");
  const [filterType, setFilterType] = useState<"all" | "elo" | "neural" | "custom" | "builtin">("all");

  // Active Modals State
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [isCloneModalOpen, setIsCloneModalOpen] = useState(false);
  const [activeEngine, setActiveEngine] = useState<EngineInfo | null>(null);

  // Add Engine Form State
  const [addPath, setAddPath] = useState("");
  const [addName, setAddName] = useState("");
  const [addElo, setAddElo] = useState("2400");
  const [addStyle, setAddStyle] = useState("Tactical Attacking Engine");
  const [addIcon, setAddIcon] = useState("⚔️");
  const [testResult, setTestResult] = useState<TestUciResult | null>(null);
  const [isTesting, setIsTesting] = useState(false);
  const [testError, setTestError] = useState<string | null>(null);
  const [addCustomOptions, setAddCustomOptions] = useState<Record<string, any>>({});

  // Clone Form State
  const [cloneSourceName, setCloneSourceName] = useState("");
  const [cloneSourceId, setCloneSourceId] = useState("");
  const [cloneNewName, setCloneNewName] = useState("");

  // Edit Engine Form State
  const [editName, setEditName] = useState("");
  const [editElo, setEditElo] = useState("2400");
  const [editStyle, setEditStyle] = useState("");
  const [editIcon, setEditIcon] = useState("⚔️");
  const [editOptions, setEditOptions] = useState<Record<string, any>>({});
  const [editTab, setEditTab] = useState<"sliders" | "special">("sliders");
  const [saveSuccess, setSaveSuccess] = useState(false);

  // Queries
  const { data: engines = [] } = useQuery({
    queryKey: ["engines"],
    queryFn: fetchEngineList,
  });

  // Query full native UCI options for active engine in edit modal
  const { data: activeEngineAllOptions = {} } = useQuery({
    queryKey: ["engineOptions", activeEngine?.id],
    queryFn: () => (activeEngine ? fetchEngineOptions(activeEngine.id) : {}),
    enabled: !!activeEngine && isEditModalOpen,
  });

  // Mutations
  const registerMutation = useMutation({
    mutationFn: registerCustomEngine,
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["engines"] });
      setIsAddModalOpen(false);
      resetAddForm();
      logAction("API", `Registered Custom Engine: ${data.name}`);
    },
  });

  const updateMutation = useMutation({
    mutationFn: ({ engineId, data }: { engineId: string; data: any }) =>
      updateCustomEngine(engineId, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["engines"] });
      setSaveSuccess(true);
      setTimeout(() => {
        setSaveSuccess(false);
        setIsEditModalOpen(false);
      }, 700);
      logAction("API", `Updated Engine UCI Configuration`);
    },
  });

  const cloneMutation = useMutation({
    mutationFn: cloneEngine,
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["engines"] });
      setIsCloneModalOpen(false);
      logAction("API", `Cloned Engine Profile: ${data.name}`);
    },
  });

  const deleteMutation = useMutation({
    mutationFn: removeCustomEngine,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["engines"] });
      logAction("API", `Removed Custom Engine`);
    },
  });

  const resetAddForm = () => {
    setAddPath("");
    setAddName("");
    setAddElo("2400");
    setAddStyle("Tactical Attacking Engine");
    setAddIcon("⚔️");
    setTestResult(null);
    setIsTesting(false);
    setTestError(null);
    setAddCustomOptions({});
  };

  const handleBrowseFile = async () => {
    try {
      const res = await browseEngineFile();
      if (res.success && res.path) {
        setAddPath(res.path);
        handleTestEngine(res.path);
      }
    } catch (e: any) {
      setTestError(e.message || "Browse dialog failed");
    }
  };

  const handleTestEngine = async (path: string) => {
    if (!path.trim()) return;
    setIsTesting(true);
    setTestError(null);
    try {
      const res = await testUciEngine(path);
      setTestResult(res);
      if (!addName) setAddName(res.name);
      const opts: Record<string, any> = {};
      if (res.options) {
        Object.entries(res.options).forEach(([k, v]) => {
          if (v.default !== undefined && v.default !== null) opts[k] = v.default;
        });
      }
      setAddCustomOptions(opts);
    } catch (e: any) {
      setTestError(e.message || "UCI Handshake Failed");
      setTestResult(null);
    } finally {
      setIsTesting(false);
    }
  };

  const handleOpenEdit = (engine: EngineInfo) => {
    setActiveEngine(engine);
    setEditName(engine.name);
    setEditElo(engine.elo);
    setEditStyle(engine.style);
    setEditIcon(engine.icon || "⚔️");
    setEditOptions({ ...(engine.options || {}) });
    setEditTab("all_uci" as any);
    setIsEditModalOpen(true);
  };

  const handleOpenClone = (engine: EngineInfo) => {
    setCloneSourceId(engine.id);
    setCloneSourceName(engine.name);
    setCloneNewName(`${engine.name} (Custom Profile)`);
    setIsCloneModalOpen(true);
  };

  const handleSaveEdit = () => {
    if (!activeEngine) return;
    updateMutation.mutate({
      engineId: activeEngine.id,
      data: {
        name: editName,
        elo: editElo,
        style: editStyle,
        icon: editIcon,
        options: editOptions,
      },
    });
  };

  // Filtered list
  const filteredEngines = engines.filter((e) => {
    const matchesSearch =
      e.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      e.style.toLowerCase().includes(searchQuery.toLowerCase()) ||
      e.id.toLowerCase().includes(searchQuery.toLowerCase());
    if (!matchesSearch) return false;

    if (filterType === "elo") return e.supports_elo;
    if (filterType === "neural") return e.id.includes("maia") || e.style.toLowerCase().includes("neural");
    if (filterType === "custom") return e.is_custom;
    if (filterType === "builtin") return !e.is_custom;
    return true;
  });

  return (
    <div className="flex flex-col gap-6 max-w-7xl mx-auto pb-12 select-none animate-in fade-in duration-200 font-sans">
      {/* Header Toolbar */}
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
        <div>
          <div className="text-[11px] font-mono uppercase tracking-widest text-cyan-500 dark:text-cyan-400 font-extrabold mb-1 flex items-center gap-1.5">
            <Cpu className="w-4 h-4 text-cyan-500" />
            UCI Engine Management &amp; Customization Studio
          </div>
          <h1 className={`text-3xl font-extrabold tracking-tight ${isLight ? "text-slate-900" : "text-white"} flex items-center gap-3`}>
            UCI Engine Lab
            <span className={`text-xs font-mono font-bold ${isLight ? "text-slate-700" : "text-slate-300"}`}>
              — Customize UCI Options, Resource Sliders &amp; Custom Bots
            </span>
          </h1>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={() => {
              resetAddForm();
              setIsAddModalOpen(true);
            }}
            className="px-4 py-2.5 rounded-xl bg-gradient-to-r from-rose-600 to-red-600 hover:from-rose-500 hover:to-red-500 text-white text-xs font-extrabold transition-all flex items-center gap-2 cursor-pointer shadow-lg shadow-rose-950/40 border border-rose-400/40"
          >
            <Plus className="w-4 h-4" />
            <span>Add UCI Bot (.exe)</span>
          </button>
        </div>
      </div>

      {/* Summary KPI Bar */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className={`p-4 rounded-2xl border ${isLight ? "bg-white border-slate-200 shadow-sm" : "bg-[#14171c] border-white/10"}`}>
          <span className={`text-[11px] font-mono font-bold block ${isLight ? "text-slate-700" : "text-slate-400"}`}>Total Engines</span>
          <span className="text-2xl font-extrabold text-cyan-500 font-mono">{engines.length}</span>
        </div>
        <div className={`p-4 rounded-2xl border ${isLight ? "bg-white border-slate-200 shadow-sm" : "bg-[#14171c] border-white/10"}`}>
          <span className={`text-[11px] font-mono font-bold block ${isLight ? "text-slate-700" : "text-slate-400"}`}>Elo Scalable</span>
          <span className="text-2xl font-extrabold text-emerald-500 font-mono">
            {engines.filter((e) => e.supports_elo).length}
          </span>
        </div>
        <div className={`p-4 rounded-2xl border ${isLight ? "bg-white border-slate-200 shadow-sm" : "bg-[#14171c] border-white/10"}`}>
          <span className={`text-[11px] font-mono font-bold block ${isLight ? "text-slate-700" : "text-slate-400"}`}>Neural / Maia</span>
          <span className="text-2xl font-extrabold text-purple-400 font-mono">
            {engines.filter((e) => e.id.includes("maia") || e.style.toLowerCase().includes("neural")).length}
          </span>
        </div>
        <div className={`p-4 rounded-2xl border ${isLight ? "bg-white border-slate-200 shadow-sm" : "bg-[#14171c] border-white/10"}`}>
          <span className={`text-[11px] font-mono font-bold block ${isLight ? "text-slate-700" : "text-slate-400"}`}>Custom Profiles</span>
          <span className="text-2xl font-extrabold text-rose-500 font-mono">
            {engines.filter((e) => e.is_custom).length}
          </span>
        </div>
      </div>

      {/* Filter & Search Bar */}
      <div className={`p-3 rounded-2xl border flex flex-col sm:flex-row items-center justify-between gap-3 ${isLight ? "bg-white border-slate-200 shadow-sm" : "bg-[#14171c] border-white/10"}`}>
        <div className="flex items-center gap-2 w-full sm:w-80">
          <Search className="w-4 h-4 text-slate-400" />
          <input
            type="text"
            placeholder="Search engine name, author, style..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className={`w-full text-xs font-mono outline-none bg-transparent ${isLight ? "text-slate-900 placeholder:text-slate-400" : "text-white placeholder:text-slate-500"}`}
          />
        </div>

        <div className="flex items-center gap-1.5 overflow-x-auto w-full sm:w-auto">
          {[
            { id: "all", label: "All Bots" },
            { id: "elo", label: "Elo Scalable" },
            { id: "neural", label: "Neural Networks" },
            { id: "custom", label: "Custom Profiles" },
            { id: "builtin", label: "Built-In" },
          ].map((tab) => (
            <button
              key={tab.id}
              onClick={() => setFilterType(tab.id as any)}
              className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                filterType === tab.id
                  ? isLight
                    ? "bg-slate-900 text-white shadow-sm"
                    : "bg-cyan-500/20 text-cyan-300 border border-cyan-500/40"
                  : isLight
                  ? "bg-slate-100 hover:bg-slate-200 text-slate-700"
                  : "bg-black/30 hover:bg-white/5 text-slate-400"
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      {/* Engines Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {filteredEngines.map((eng) => (
          <div
            key={eng.id}
            className={`p-5 rounded-3xl border transition-all flex flex-col justify-between shadow-lg relative group ${
              eng.is_custom
                ? isLight
                  ? "bg-rose-50/40 border-rose-200 text-slate-900"
                  : "bg-gradient-to-br from-rose-950/20 to-[#14171c] border-rose-500/30 text-white"
                : isLight
                ? "bg-white border-slate-200 text-slate-900"
                : "bg-[#14171c] border-white/10 text-white"
            }`}
          >
            <div>
              {/* Header Badge */}
              <div className="flex items-center justify-between gap-2 mb-3">
                <div className="flex items-center gap-2.5">
                  <span className="text-2xl">{eng.icon || "⚔️"}</span>
                  <div>
                    <h3 className="font-extrabold text-sm flex items-center gap-1.5">
                      {eng.name}
                    </h3>
                    <span className={`text-[11px] font-mono font-bold ${isLight ? "text-slate-700" : "text-slate-400"}`}>
                      {eng.author ? `by ${eng.author}` : eng.id}
                    </span>
                  </div>
                </div>

                <div className="flex items-center gap-1">
                  {eng.is_custom ? (
                    <span className="text-[10px] font-mono font-extrabold px-2 py-0.5 rounded-full bg-rose-500/20 text-rose-500 dark:text-rose-300 border border-rose-500/30">
                      Custom
                    </span>
                  ) : (
                    <span className="text-[10px] font-mono font-extrabold px-2 py-0.5 rounded-full bg-cyan-500/20 text-cyan-600 dark:text-cyan-300 border border-cyan-500/30">
                      Built-in
                    </span>
                  )}
                </div>
              </div>

              {/* Playing Style */}
              <p className={`text-xs leading-relaxed mb-4 ${isLight ? "text-slate-700" : "text-slate-300"}`}>
                {eng.style}
              </p>

              {/* Rating & Capabilities */}
              <div className="space-y-2 mb-5">
                <div className={`flex items-center justify-between text-xs font-mono p-2 rounded-xl border ${isLight ? "bg-slate-100 border-slate-200" : "bg-black/30 border-white/5"}`}>
                  <span className="text-slate-400">Strength / Elo:</span>
                  <span className="font-extrabold text-emerald-500 font-mono">
                    {eng.elo} {eng.supports_elo && <span className="text-[10px] font-bold text-cyan-400">(Scalable)</span>}
                  </span>
                </div>

                <div className="flex flex-wrap gap-1.5">
                  {eng.supports_elo && (
                    <span className="text-[10px] font-mono px-2 py-0.5 rounded-lg bg-emerald-500/10 text-emerald-500 border border-emerald-500/20 font-bold">
                      ✓ Elo Slider
                    </span>
                  )}
                  {eng.options && Object.keys(eng.options).length > 0 && (
                    <span className="text-[10px] font-mono px-2 py-0.5 rounded-lg bg-purple-500/10 text-purple-400 border border-purple-500/20 font-bold">
                      ⚙️ {Object.keys(eng.options).length} Custom Options
                    </span>
                  )}
                  {eng.id.includes("maia") && (
                    <span className="text-[10px] font-mono px-2 py-0.5 rounded-lg bg-purple-500/10 text-purple-400 border border-purple-500/20 font-bold">
                      🧠 Neural Net
                    </span>
                  )}
                  {eng.name.toLowerCase().includes("komodo") && (
                    <span className="text-[10px] font-mono px-2 py-0.5 rounded-lg bg-amber-500/10 text-amber-400 border border-amber-500/20 font-bold">
                      🐉 MCTS / Tactical
                    </span>
                  )}
                </div>
              </div>
            </div>

            {/* Action Bar */}
            <div className={`pt-3 border-t flex items-center justify-between gap-2 ${isLight ? "border-slate-200" : "border-white/10"}`}>
              <div className="flex items-center gap-1">
                <button
                  onClick={() => handleOpenEdit(eng)}
                  className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer ${
                    isLight
                      ? "bg-slate-100 hover:bg-slate-200 text-slate-900 border border-slate-300"
                      : "bg-white/5 hover:bg-white/10 text-slate-200 border border-white/10"
                  }`}
                  title="Configure UCI options and resource sliders"
                >
                  <Sliders className="w-3.5 h-3.5 text-cyan-400" />
                  <span>Customize</span>
                </button>

                <button
                  onClick={() => handleOpenClone(eng)}
                  className={`p-1.5 rounded-xl transition-all cursor-pointer ${
                    isLight
                      ? "bg-slate-100 hover:bg-slate-200 text-slate-700 border border-slate-300"
                      : "bg-white/5 hover:bg-white/10 text-slate-300 border border-white/10"
                  }`}
                  title="Clone into a new custom profile"
                >
                  <Copy className="w-3.5 h-3.5" />
                </button>

                {eng.is_custom && (
                  <button
                    onClick={() => deleteMutation.mutate(eng.id)}
                    className="p-1.5 rounded-xl bg-rose-500/10 hover:bg-rose-500/20 text-rose-400 border border-rose-500/30 transition-all cursor-pointer"
                    title="Delete custom engine"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>

              {onLaunchSparring && (
                <button
                  onClick={() => onLaunchSparring(eng.id)}
                  className="px-3 py-1.5 rounded-xl bg-gradient-to-r from-rose-600 to-red-600 hover:from-rose-500 hover:to-red-500 text-white text-xs font-extrabold transition-all flex items-center gap-1.5 cursor-pointer shadow-md shadow-rose-950/30"
                  title="Launch Sparring match against this engine"
                >
                  <Swords className="w-3.5 h-3.5" />
                  <span>Spar</span>
                </button>
              )}
            </div>
          </div>
        ))}
      </div>

      {/* 1. Add Engine Modal */}
      {isAddModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4 animate-in fade-in duration-200">
          <div className={`w-full max-w-2xl max-h-[90vh] overflow-y-auto rounded-3xl border shadow-2xl p-6 space-y-6 ${isLight ? "bg-white border-slate-300 text-slate-900" : "bg-[#14171c] border-slate-800 text-white"}`}>
            <div className="flex items-center justify-between border-b pb-3 border-white/10">
              <div className="flex items-center gap-2">
                <Plus className="w-5 h-5 text-rose-500" />
                <h2 className="text-base font-extrabold">Register New UCI Engine</h2>
              </div>
              <button onClick={() => setIsAddModalOpen(false)} className="p-1 text-slate-400 hover:text-white">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-4">
              {/* File Path & Browse */}
              <div className="space-y-1.5">
                <label className="text-xs font-extrabold block">UCI Executable File (.exe):</label>
                <div className="flex gap-2">
                  <input
                    type="text"
                    placeholder="C:\path\to\engine.exe"
                    value={addPath}
                    onChange={(e) => setAddPath(e.target.value)}
                    className={`flex-1 px-3 py-2 text-xs font-mono rounded-xl border outline-none ${isLight ? "bg-slate-100 border-slate-300 text-slate-900" : "bg-black/60 border-white/15 text-white"}`}
                  />
                  <button
                    onClick={handleBrowseFile}
                    className="px-3.5 py-2 bg-slate-800 hover:bg-slate-700 text-white text-xs font-bold rounded-xl border border-white/15 flex items-center gap-1.5 cursor-pointer"
                  >
                    <FolderOpen className="w-4 h-4 text-cyan-400" />
                    Browse
                  </button>
                  <button
                    onClick={() => handleTestEngine(addPath)}
                    disabled={isTesting || !addPath}
                    className="px-3.5 py-2 bg-cyan-600 hover:bg-cyan-500 text-white text-xs font-bold rounded-xl shadow cursor-pointer disabled:opacity-50 flex items-center gap-1.5"
                  >
                    <Zap className="w-4 h-4" />
                    {isTesting ? "Testing..." : "Test UCI"}
                  </button>
                </div>
                {testError && <p className="text-xs text-rose-400 font-mono">{testError}</p>}
              </div>

              {testResult && (
                <div className="p-3 rounded-2xl bg-emerald-500/10 border border-emerald-500/30 text-xs font-mono text-emerald-400 flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4 text-emerald-400 flex-shrink-0" />
                  <span>
                    UCI Handshake Verified: <strong>{testResult.name}</strong> by {testResult.author || "Unknown"} ({Object.keys(testResult.options || {}).length} UCI options parsed)
                  </span>
                </div>
              )}

              {/* Profile Details */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <label className="text-xs font-extrabold block">Display Name:</label>
                  <input
                    type="text"
                    value={addName}
                    onChange={(e) => setAddName(e.target.value)}
                    className={`w-full px-3 py-2 text-xs font-bold rounded-xl border outline-none ${isLight ? "bg-slate-100 border-slate-300 text-slate-900" : "bg-black/60 border-white/15 text-white"}`}
                  />
                </div>

                <div className="space-y-1.5">
                  <label className="text-xs font-extrabold block">Estimated / Native Elo:</label>
                  <input
                    type="text"
                    value={addElo}
                    onChange={(e) => setAddElo(e.target.value)}
                    className={`w-full px-3 py-2 text-xs font-mono font-bold rounded-xl border outline-none ${isLight ? "bg-slate-100 border-slate-300 text-slate-900" : "bg-black/60 border-white/15 text-white"}`}
                  />
                </div>
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-extrabold block">Playing Style Description:</label>
                <input
                  type="text"
                  value={addStyle}
                  onChange={(e) => setAddStyle(e.target.value)}
                  className={`w-full px-3 py-2 text-xs font-sans rounded-xl border outline-none ${isLight ? "bg-slate-100 border-slate-300 text-slate-900" : "bg-black/60 border-white/15 text-white"}`}
                />
              </div>

              {/* Avatar Icon Selector */}
              <div className="space-y-1.5">
                <label className="text-xs font-extrabold block">Choose Avatar Emoji:</label>
                <div className="flex flex-wrap gap-2">
                  {AVATAR_ICONS.map((icon) => (
                    <button
                      key={icon}
                      type="button"
                      onClick={() => setAddIcon(icon)}
                      className={`w-9 h-9 rounded-xl text-lg flex items-center justify-center transition-all cursor-pointer ${
                        addIcon === icon
                          ? "bg-rose-500 text-white scale-110 shadow-md ring-2 ring-rose-400"
                          : isLight
                          ? "bg-slate-100 hover:bg-slate-200 border border-slate-200"
                          : "bg-black/40 hover:bg-white/10 border border-white/10"
                      }`}
                    >
                      {icon}
                    </button>
                  ))}
                </div>
              </div>

              {/* Native UCI Protocol Options (Printed by Engine) */}
              {testResult && testResult.options && Object.keys(testResult.options).length > 0 && (
                <div className="space-y-2 pt-2 border-t border-white/10">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-extrabold flex items-center gap-1.5 text-cyan-400">
                      <Sliders className="w-4 h-4 text-cyan-400" />
                      Native UCI Protocol Options ({Object.keys(testResult.options).length} detected):
                    </span>
                    <span className="text-[11px] font-mono text-slate-400">
                      Adjust options below; they will stick to this engine profile
                    </span>
                  </div>

                  <UciOptionsInspector
                    optionsMap={testResult.options}
                    currentValues={addCustomOptions}
                    onChange={(key, val) =>
                      setAddCustomOptions((prev) => ({ ...prev, [key]: val }))
                    }
                    isLight={isLight}
                  />
                </div>
              )}
            </div>

            <div className="flex items-center justify-end gap-2 border-t pt-4 border-white/10">
              <button
                onClick={() => setIsAddModalOpen(false)}
                className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-white text-xs font-bold rounded-xl cursor-pointer"
              >
                Cancel
              </button>
              <button
                onClick={() =>
                  registerMutation.mutate({
                    name: addName,
                    path: addPath,
                    elo: addElo,
                    style: addStyle,
                    icon: addIcon,
                    options: addCustomOptions,
                  })
                }
                disabled={!addName || !addPath || registerMutation.isPending}
                className="px-5 py-2 bg-rose-600 hover:bg-rose-500 text-white text-xs font-extrabold rounded-xl shadow-lg shadow-rose-950/40 cursor-pointer disabled:opacity-50 flex items-center gap-1.5"
              >
                <Check className="w-4 h-4" />
                <span>Save Engine Profile</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 2. Clone Profile Modal */}
      {isCloneModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4 animate-in fade-in duration-200">
          <div className={`w-full max-w-md rounded-3xl border shadow-2xl p-6 space-y-5 ${isLight ? "bg-white border-slate-300 text-slate-900" : "bg-[#14171c] border-slate-800 text-white"}`}>
            <div className="flex items-center justify-between border-b pb-3 border-white/10">
              <div className="flex items-center gap-2">
                <Copy className="w-5 h-5 text-cyan-400" />
                <h2 className="text-base font-extrabold">Clone Engine Profile</h2>
              </div>
              <button onClick={() => setIsCloneModalOpen(false)} className="p-1 text-slate-400 hover:text-white">
                <X className="w-5 h-5" />
              </button>
            </div>

            <p className="text-xs text-slate-400">
              Duplicating <strong>{cloneSourceName}</strong>. You can configure specialized UCI options (e.g. Armageddon mode, 1-thread bullet, custom hash) that will stick to this new profile.
            </p>

            <div className="space-y-1.5">
              <label className="text-xs font-extrabold block">New Profile Name:</label>
              <input
                type="text"
                value={cloneNewName}
                onChange={(e) => setCloneNewName(e.target.value)}
                className={`w-full px-3 py-2 text-xs font-bold rounded-xl border outline-none ${isLight ? "bg-slate-100 border-slate-300 text-slate-900" : "bg-black/60 border-white/15 text-white"}`}
              />
            </div>

            <div className="flex items-center justify-end gap-2 border-t pt-3 border-white/10">
              <button onClick={() => setIsCloneModalOpen(false)} className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-white text-xs font-bold rounded-xl cursor-pointer">
                Cancel
              </button>
              <button
                onClick={() =>
                  cloneMutation.mutate({
                    source_id: cloneSourceId,
                    new_name: cloneNewName,
                  })
                }
                disabled={!cloneNewName || cloneMutation.isPending}
                className="px-5 py-2 bg-cyan-600 hover:bg-cyan-500 text-white text-xs font-extrabold rounded-xl shadow cursor-pointer disabled:opacity-50"
              >
                Create Clone Profile
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 3. Edit UCI Options & Sliders Modal */}
      {isEditModalOpen && activeEngine && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4 animate-in fade-in duration-200">
          <div className={`w-full max-w-3xl max-h-[90vh] overflow-y-auto rounded-3xl border shadow-2xl p-6 space-y-5 ${isLight ? "bg-white border-slate-300 text-slate-900" : "bg-[#14171c] border-slate-800 text-white"}`}>
            <div className="flex items-center justify-between border-b pb-3 border-white/10">
              <div className="flex items-center gap-2.5">
                <Sliders className="w-5 h-5 text-cyan-400" />
                <div>
                  <h2 className="text-base font-extrabold flex items-center gap-2">
                    Customize UCI Options: {activeEngine.name}
                  </h2>
                  <span className="text-[11px] font-mono text-slate-400">
                    {activeEngine.is_custom ? "Custom Engine Profile" : "Built-in Engine (Will save as customized profile)"}
                  </span>
                </div>
              </div>
              <button onClick={() => setIsEditModalOpen(false)} className="p-1 text-slate-400 hover:text-white">
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Modal Tabs */}
            <div className="flex items-center gap-2 border-b pb-2 border-white/10 text-xs font-bold">
              <button
                onClick={() => setEditTab("sliders")}
                className={`px-3 py-1.5 rounded-xl transition-all cursor-pointer ${
                  editTab === "sliders"
                    ? "bg-cyan-500/20 text-cyan-300 border border-cyan-500/40 font-extrabold"
                    : "text-slate-400 hover:text-white"
                }`}
              >
                Simple Resource Sliders
              </button>
              <button
                onClick={() => setEditTab("all_uci" as any)}
                className={`px-3 py-1.5 rounded-xl transition-all cursor-pointer ${
                  (editTab as string) === "all_uci"
                    ? "bg-cyan-500/20 text-cyan-300 border border-cyan-500/40 font-extrabold"
                    : "text-slate-400 hover:text-white"
                }`}
              >
                All Native UCI Options ({Object.keys(activeEngineAllOptions || activeEngine.all_options || {}).length || "Inspect"})
              </button>
              <button
                onClick={() => setEditTab("special")}
                className={`px-3 py-1.5 rounded-xl transition-all cursor-pointer ${
                  editTab === "special"
                    ? "bg-cyan-500/20 text-cyan-300 border border-cyan-500/40 font-extrabold"
                    : "text-slate-400 hover:text-white"
                }`}
              >
                Special Features &amp; Modes
              </button>
            </div>

            {/* TAB 1: Simple Sliders */}
            {editTab === "sliders" && (
              <div className="space-y-4">
                {/* Threads */}
                <div className={`p-3.5 rounded-2xl border space-y-1.5 ${isLight ? "bg-slate-50 border-slate-200" : "bg-black/30 border-white/5"}`}>
                  <div className="flex justify-between text-xs font-mono">
                    <span className="font-bold">CPU Threads (Threads):</span>
                    <span className="text-cyan-400 font-extrabold">{editOptions["Threads"] ?? 1} Threads</span>
                  </div>
                  <input
                    type="range"
                    min="1"
                    max="16"
                    step="1"
                    value={editOptions["Threads"] ?? 1}
                    onChange={(e) => setEditOptions({ ...editOptions, Threads: Number(e.target.value) })}
                    className="w-full accent-cyan-500 cursor-pointer"
                  />
                  <span className="text-[10px] text-slate-500 block">Lower threads for fast sparring; increase for deep tactical analysis.</span>
                </div>

                {/* Hash MB */}
                <div className={`p-3.5 rounded-2xl border space-y-1.5 ${isLight ? "bg-slate-50 border-slate-200" : "bg-black/30 border-white/5"}`}>
                  <div className="flex justify-between text-xs font-mono">
                    <span className="font-bold">Hash Memory Table (Hash):</span>
                    <span className="text-cyan-400 font-extrabold">{editOptions["Hash"] ?? 64} MB</span>
                  </div>
                  <input
                    type="range"
                    min="16"
                    max="1024"
                    step="16"
                    value={editOptions["Hash"] ?? 64}
                    onChange={(e) => setEditOptions({ ...editOptions, Hash: Number(e.target.value) })}
                    className="w-full accent-cyan-500 cursor-pointer"
                  />
                </div>

                {/* Multi-PV */}
                <div className={`p-3.5 rounded-2xl border space-y-1.5 ${isLight ? "bg-slate-50 border-slate-200" : "bg-black/30 border-white/5"}`}>
                  <div className="flex justify-between text-xs font-mono">
                    <span className="font-bold">Multi-PV Lines (MultiPV):</span>
                    <span className="text-cyan-400 font-extrabold">{editOptions["MultiPV"] ?? 1} Line(s)</span>
                  </div>
                  <input
                    type="range"
                    min="1"
                    max="8"
                    step="1"
                    value={editOptions["MultiPV"] ?? 1}
                    onChange={(e) => setEditOptions({ ...editOptions, MultiPV: Number(e.target.value) })}
                    className="w-full accent-cyan-500 cursor-pointer"
                  />
                  <span className="text-[10px] text-slate-500 block">Set to 1 for maximum sparring speed; set to 3+ for multi-line kibitzer analysis.</span>
                </div>

                {/* Contempt / Aggressiveness if supported */}
                <div className={`p-3.5 rounded-2xl border space-y-1.5 ${isLight ? "bg-slate-50 border-slate-200" : "bg-black/30 border-white/5"}`}>
                  <div className="flex justify-between text-xs font-mono">
                    <span className="font-bold">Contempt / Play Dynamism:</span>
                    <span className="text-cyan-400 font-extrabold">{editOptions["Contempt"] ?? 0}</span>
                  </div>
                  <input
                    type="range"
                    min="-100"
                    max="100"
                    step="5"
                    value={editOptions["Contempt"] ?? 0}
                    onChange={(e) => setEditOptions({ ...editOptions, Contempt: Number(e.target.value) })}
                    className="w-full accent-cyan-500 cursor-pointer"
                  />
                  <span className="text-[10px] text-slate-500 block">Positive values encourage engine to avoid draws and attack actively.</span>
                </div>
              </div>
            )}

            {/* TAB 2: Special Features */}
            {editTab === "special" && (
              <div className="space-y-4">
                {/* Armageddon Mode (e.g. Dragon) */}
                <div className={`p-3.5 rounded-2xl border flex items-center justify-between ${isLight ? "bg-slate-50 border-slate-200" : "bg-black/30 border-white/5"}`}>
                  <div>
                    <span className="text-xs font-bold block">Armageddon Mode</span>
                    <span className="text-[11px] text-slate-400">Forces engine to play strictly for wins as White or Black</span>
                  </div>
                  <select
                    value={editOptions["Armageddon"] || "Off"}
                    onChange={(e) => setEditOptions({ ...editOptions, Armageddon: e.target.value })}
                    className={`px-3 py-1.5 rounded-xl border text-xs font-mono outline-none ${isLight ? "bg-white border-slate-300 text-slate-900" : "bg-black/60 border-white/20 text-white"}`}
                  >
                    <option value="Off">Off</option>
                    <option value="White Must Win">White Must Win</option>
                    <option value="Black Must Win">Black Must Win</option>
                  </select>
                </div>

                {/* Ponder */}
                <div className={`p-3.5 rounded-2xl border flex items-center justify-between ${isLight ? "bg-slate-50 border-slate-200" : "bg-black/30 border-white/5"}`}>
                  <div>
                    <span className="text-xs font-bold block">Ponder (Think on User's Time)</span>
                    <span className="text-[11px] text-slate-400">Allows engine to calculate during opponent turn</span>
                  </div>
                  <input
                    type="checkbox"
                    checked={Boolean(editOptions["Ponder"])}
                    onChange={(e) => setEditOptions({ ...editOptions, Ponder: e.target.checked })}
                    className="w-4 h-4 accent-cyan-500 cursor-pointer"
                  />
                </div>

                {/* Auto Skill */}
                <div className={`p-3.5 rounded-2xl border flex items-center justify-between ${isLight ? "bg-slate-50 border-slate-200" : "bg-black/30 border-white/5"}`}>
                  <div>
                    <span className="text-xs font-bold block">Auto Skill Tuning</span>
                    <span className="text-[11px] text-slate-400">Automatically adjust engine depth &amp; error rate</span>
                  </div>
                  <input
                    type="checkbox"
                    checked={Boolean(editOptions["Auto Skill"])}
                    onChange={(e) => setEditOptions({ ...editOptions, "Auto Skill": e.target.checked })}
                    className="w-4 h-4 accent-cyan-500 cursor-pointer"
                  />
                </div>

                {/* Syzygy Tablebases Path */}
                <div className={`p-3.5 rounded-2xl border space-y-1.5 ${isLight ? "bg-slate-50 border-slate-200" : "bg-black/30 border-white/5"}`}>
                  <label className="text-xs font-bold block">Syzygy Tablebases Path:</label>
                  <input
                    type="text"
                    placeholder="C:\Tablebases\Syzygy345"
                    value={editOptions["SyzygyPath"] || ""}
                    onChange={(e) => setEditOptions({ ...editOptions, SyzygyPath: e.target.value })}
                    className={`w-full px-3 py-2 text-xs font-mono rounded-xl border outline-none ${isLight ? "bg-white border-slate-300 text-slate-900" : "bg-black/60 border-white/20 text-white"}`}
                  />
                </div>
              </div>
            )}

            {/* Footer Buttons */}
            <div className="flex items-center justify-between border-t pt-4 border-white/10">
              {saveSuccess ? (
                <div className="flex items-center gap-1.5 text-xs text-emerald-400 font-bold font-mono">
                  <CheckCircle2 className="w-4 h-4" />
                  <span>Saved &amp; Populated to Sparring/Analysis!</span>
                </div>
              ) : <div />}

              <div className="flex items-center gap-2">
                <button
                  onClick={() => setIsEditModalOpen(false)}
                  className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-white text-xs font-bold rounded-xl cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  onClick={handleSaveEdit}
                  disabled={updateMutation.isPending || cloneMutation.isPending}
                  className="px-5 py-2 bg-cyan-600 hover:bg-cyan-500 text-white text-xs font-extrabold rounded-xl shadow cursor-pointer disabled:opacity-50 flex items-center gap-1.5"
                >
                  <Check className="w-4 h-4" />
                  <span>Save UCI Configuration</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
