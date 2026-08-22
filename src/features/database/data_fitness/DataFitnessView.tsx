import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { UXTheme } from "../../../lib/theme";
import { useClickLogger } from "../../../lib/clickLogger";
import {
  fetchDatabases,
  uploadAndIngestDatabase,
  setActiveDatabase,
  fetchFitnessAudit,
  sanitizeDatabase,
  generateSilverStats,
  startMassAnalysis,
  fetchMassAnalysisStatus,
  cancelMassAnalysis,
} from "../../../lib/api";
import { Tooltip } from "../../../components/common/Tooltip";
import {
  ShieldCheck,
  AlertTriangle,
  Zap,
  RefreshCw,
  CheckCircle2,
  XCircle,
  Database,
  Sparkles,
  Play,
  Flame,
  Layers,
} from "lucide-react";

interface DataFitnessViewProps {
  uxTheme: UXTheme;
  initialDbName?: string;
  pendingImportFile?: File | null;
  onClearImportFile?: () => void;
  onNavigateToBrowser?: () => void;
  onNavigateToDossier?: () => void;
}

export function DataFitnessView({
  uxTheme,
  initialDbName,
  pendingImportFile,
  onClearImportFile,
  onNavigateToBrowser,
  onNavigateToDossier,
}: DataFitnessViewProps) {
  const { logAction } = useClickLogger();
  const queryClient = useQueryClient();
  const isLight = uxTheme?.mode === "light" || uxTheme?.id === "clean-light";

  const [selectedDb, setSelectedDb] = useState<string>(initialDbName || "patriciaTourny.lcdb");
  const [activeTab, setActiveTab] = useState<"audit" | "silver" | "gold">("audit");

  // Ingestion & Import Setup State
  const [importStrategy, setImportStrategy] = useState<"fast" | "sanitize" | "gold" | "repertoire">("sanitize");
  const [targetDbName, setTargetDbName] = useState<string>(
    pendingImportFile ? pendingImportFile.name.replace(/\.[^/.]+$/, "") + ".lcdb" : "NewDatabase.lcdb"
  );
  const [isImporting, setIsImporting] = useState<boolean>(false);
  const [importSuccess, setImportSuccess] = useState<boolean>(false);
  const [importError, setImportError] = useState<string | null>(null);

  // Sanitization options
  const [purgeStubs, setPurgeStubs] = useState(true);
  const [autoRepairResults, setAutoRepairResults] = useState(true);
  const [normalizeNames, setNormalizeNames] = useState(true);

  // Mass analysis options
  const [analysisDepth, setAnalysisDepth] = useState<number>(16);
  const [analysisMode, setAnalysisMode] = useState<"MISSING_ONLY" | "OVERWRITE">("MISSING_ONLY");
  const [activeJobId, setActiveJobId] = useState<string | null>(null);

  // 1. Fetch available databases
  const { data: databases } = useQuery({
    queryKey: ["databases"],
    queryFn: fetchDatabases,
  });

  useEffect(() => {
    if (pendingImportFile) {
      setTargetDbName(pendingImportFile.name.replace(/\.[^/.]+$/, "") + ".lcdb");
      setImportError(null);
    }
  }, [pendingImportFile]);

  useEffect(() => {
    if (databases && databases.length > 0 && !selectedDb) {
      setSelectedDb(databases[0].name);
    }
  }, [databases, selectedDb]);

  // 2. Fetch Database Audit Report
  const { data: auditData, isLoading: isLoadingAudit, refetch: refetchAudit } = useQuery({
    queryKey: ["fitnessAudit", selectedDb],
    queryFn: () => fetchFitnessAudit(selectedDb),
    enabled: !!selectedDb,
  });

  // 3. Sanitization Mutation
  const sanitizeMutation = useMutation({
    mutationFn: () =>
      sanitizeDatabase({
        db_name: selectedDb,
        purge_short_stubs: purgeStubs,
        auto_repair_results: autoRepairResults,
        normalize_names_dates: normalizeNames,
      }),
    onSuccess: (data) => {
      logAction("API", `Sanitized database: ${selectedDb}`, `Normalized: ${data.normalized_records_count}, Repaired: ${data.repaired_results_count}`);
      refetchAudit();
      queryClient.invalidateQueries({ queryKey: ["databases"] });
    },
  });

  // 4. Silver Stats Mutation
  const silverMutation = useMutation({
    mutationFn: () => generateSilverStats(selectedDb),
    onSuccess: (data) => {
      logAction("API", `Generated Silver Stats for ${selectedDb}`, `Assigned ECOs: ${data.ecos_assigned}`);
      refetchAudit();
      queryClient.invalidateQueries({ queryKey: ["databases"] });
    },
  });

  // 5. Mass Analysis Start Mutation
  const startAnalysisMutation = useMutation({
    mutationFn: () =>
      startMassAnalysis({
        db_name: selectedDb,
        depth: analysisDepth,
        mode: analysisMode,
      }),
    onSuccess: (data) => {
      setActiveJobId(data.job_id);
      logAction("API", `Started Mass Analysis job: ${data.job_id} at depth ${analysisDepth}`);
    },
  });

  // 6. Polling active analysis job status
  const { data: jobStatus } = useQuery({
    queryKey: ["analysisJobStatus", activeJobId],
    queryFn: () => (activeJobId ? fetchMassAnalysisStatus(activeJobId) : null),
    enabled: !!activeJobId,
    refetchInterval: activeJobId ? 1000 : false,
  });

  // Reset or refresh when job completes
  useEffect(() => {
    if (jobStatus && jobStatus.status === "completed") {
      refetchAudit();
      queryClient.invalidateQueries({ queryKey: ["databases"] });
    }
  }, [jobStatus, refetchAudit, queryClient]);

  const handleCancelAnalysis = async () => {
    if (activeJobId) {
      await cancelMassAnalysis(activeJobId);
      logAction("API", `Cancelled Mass Analysis job: ${activeJobId}`);
      setActiveJobId(null);
      refetchAudit();
    }
  };

  const tiers = auditData?.tiers || { tier_0_quarantine: 0, tier_1_sanitized: 0, tier_2_silver: 0, tier_3_gold: 0 };
  const totalGames = auditData?.total_games ?? 0;

  const t0Pct = totalGames > 0 ? Math.round((tiers.tier_0_quarantine / totalGames) * 100) : 0;
  const t1Pct = totalGames > 0 ? Math.round((tiers.tier_1_sanitized / totalGames) * 100) : 0;
  const t2Pct = totalGames > 0 ? Math.round((tiers.tier_2_silver / totalGames) * 100) : 0;
  const t3Pct = totalGames > 0 ? Math.round((tiers.tier_3_gold / totalGames) * 100) : 0;

  return (
    <div className="flex flex-col gap-6 max-w-6xl mx-auto pb-12 select-none animate-in fade-in duration-200 font-sans">
      {/* Top Banner & Navigation */}
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
        <div>
          <div className="text-[10px] font-mono uppercase tracking-widest text-emerald-400 font-bold mb-1 flex items-center gap-1.5">
            <ShieldCheck className="w-3.5 h-3.5" />
            Data Fitness & Statistical Enrichment Studio
          </div>
          <h1 className="text-3xl font-extrabold tracking-tight text-white flex items-center gap-3">
            Data Fitness Pipeline
            <span className="text-xs font-mono font-normal text-slate-400">
              — Elevate Raw Data to Tier 3 Gold Analytics
            </span>
          </h1>
        </div>

        {/* Database Selector Dropdown */}
        <div className="flex items-center gap-3">
          <div className="flex items-center bg-[#14171c] border border-slate-800 rounded-2xl px-3 py-1.5 shadow-md">
            <Database className="w-3.5 h-3.5 text-blue-400 mr-2" />
            <select
              value={selectedDb}
              onChange={(e) => {
                setSelectedDb(e.target.value);
                logAction("NAV", `Selected Database for Fitness: ${e.target.value}`);
              }}
              className="bg-transparent text-xs font-mono text-white outline-none cursor-pointer"
            >
              {databases?.map((db) => (
                <option key={db.name} value={db.name} className="bg-slate-900 text-white">
                  {db.name} ({db.size_mb} MB)
                </option>
              ))}
            </select>
          </div>

          <Tooltip content="Browse Database Games">
            <button
              onClick={() => {
                logAction("NAV", "Opened Database Browser from Fitness View");
                if (onNavigateToBrowser) onNavigateToBrowser();
              }}
              className="px-3.5 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-bold rounded-xl border border-slate-700 shadow-md transition-all flex items-center gap-1.5"
            >
              <Layers className="w-3.5 h-3.5 text-emerald-400" />
              Shelf Browser
            </button>
          </Tooltip>
        </div>
      </div>

      {/* Database Ingestion & Import Configuration Card */}
      {pendingImportFile && (
        <div className="p-6 rounded-3xl bg-gradient-to-br from-emerald-950/40 via-[#14171c] to-slate-900 border border-emerald-500/40 shadow-2xl space-y-4 animate-in fade-in duration-200">
          <div className="flex items-center justify-between border-b border-emerald-500/20 pb-3">
            <div className="flex items-center gap-3">
              <div className="p-2.5 rounded-2xl bg-emerald-500/20 border border-emerald-500/30 text-emerald-400">
                <Database className="w-5 h-5" />
              </div>
              <div>
                <h2 className="text-sm font-bold text-white flex items-center gap-2">
                  Importing File: <span className="text-emerald-400 font-mono">{pendingImportFile.name}</span>
                </h2>
                <span className="text-xs text-slate-400 font-mono">
                  File Size: {(pendingImportFile.size / (1024 * 1024)).toFixed(2)} MB · Configure ingestion pipeline below
                </span>
              </div>
            </div>

            {onClearImportFile && (
              <button
                onClick={onClearImportFile}
                className="text-xs text-slate-400 hover:text-white px-3 py-1 rounded-xl bg-black/40 border border-white/10 transition-colors"
              >
                Cancel
              </button>
            )}
          </div>

          {/* Strategy Selector Grid */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
            {[
              { id: "fast", title: "1. Fast Ingest", desc: "Direct PGN to SQLite conversion without engine eval", icon: Zap },
              { id: "sanitize", title: "2. Sanitize & Repair", desc: "Tier 1 & 2: Normalize tags, deduplicate, repair results", icon: ShieldCheck },
              { id: "gold", title: "3. Gold Mass Analysis", desc: "Tier 3: Live Stockfish 17 evaluation & ACPL tagging", icon: Sparkles },
              { id: "repertoire", title: "4. Repertoire Factory", desc: "Extract Polyglot opening tree (.bin) during import", icon: Layers },
            ].map((strat) => {
              const Icon = strat.icon;
              const isSelected = importStrategy === strat.id;
              return (
                <button
                  key={strat.id}
                  onClick={() => {
                    setImportStrategy(strat.id as any);
                    logAction("CLICK", `Selected Ingest Strategy: ${strat.title}`);
                  }}
                  className={`p-3.5 rounded-2xl text-left border transition-all flex flex-col justify-between cursor-pointer ${
                    isSelected
                      ? "bg-emerald-500/20 border-emerald-500/60 shadow-lg text-white"
                      : "bg-black/30 border-white/5 text-slate-400 hover:bg-white/5"
                  }`}
                >
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-xs font-bold text-slate-200">{strat.title}</span>
                    <Icon className={`w-4 h-4 ${isSelected ? "text-emerald-400" : "text-slate-500"}`} />
                  </div>
                  <p className="text-[10px] opacity-80 leading-relaxed font-sans">{strat.desc}</p>
                </button>
              );
            })}
          </div>

          {/* Target Database Name & Action */}
          <div className="flex flex-col md:flex-row items-center justify-between gap-4 pt-2">
            <div className="w-full md:w-auto flex-1 flex items-center gap-2">
              <label className="text-xs font-mono text-slate-400 whitespace-nowrap">Target DB Name:</label>
              <input
                type="text"
                value={targetDbName}
                onChange={(e) => setTargetDbName(e.target.value)}
                className="w-full md:w-64 bg-black/50 border border-white/10 rounded-xl px-3 py-1.5 text-xs font-mono text-emerald-400 outline-none focus:border-emerald-500"
              />
            </div>

            <button
              onClick={async () => {
                if (!pendingImportFile) return;
                setIsImporting(true);
                logAction("API", `Executing Database Ingestion: ${targetDbName}`, `Strategy: ${importStrategy}`);
                try {
                  const res = await uploadAndIngestDatabase(pendingImportFile, targetDbName, importStrategy);
                  logAction("API", `Ingestion Complete: ${res.db_name}`, `Imported ${res.imported_games} games`);
                  setImportSuccess(true);
                  setImportError(null);
                  await setActiveDatabase(res.db_name);
                  queryClient.invalidateQueries({ queryKey: ["databases"] });
                  queryClient.invalidateQueries({ queryKey: ["storageTelemetry"] });
                  setTimeout(() => {
                    setIsImporting(false);
                    if (onNavigateToBrowser) onNavigateToBrowser();
                    if (onClearImportFile) onClearImportFile();
                  }, 1200);
                } catch (err: any) {
                  logAction("ERROR", "Ingestion Failed", err.message);
                  setIsImporting(false);
                  setImportError(err.message || "Database Ingestion Failed");
                }
              }}
              disabled={isImporting}
              className="w-full md:w-auto px-6 py-2.5 bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs rounded-2xl shadow-xl transition-all flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50"
            >
              {isImporting ? (
                <>
                  <RefreshCw className="w-4 h-4 animate-spin" />
                  Ingesting &amp; Processing Pipeline...
                </>
              ) : importSuccess ? (
                <>
                  <CheckCircle2 className="w-4 h-4 text-white" />
                  Database Added to Shelf!
                </>
              ) : (
                <>
                  <Play className="w-4 h-4" />
                  Start Ingestion Pipeline
                </>
              )}
            </button>
          </div>

          {importError && (
            <div className="p-3 rounded-xl bg-rose-500/20 border border-rose-500/40 text-rose-300 text-xs font-mono flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 flex-shrink-0 text-rose-400" />
              <span>Ingestion Error: {importError}</span>
            </div>
          )}
        </div>
      )}

      {/* 4-Tier Distribution & Overall Health Card */}
      <div className={`p-6 rounded-3xl ${isLight ? "bg-white border-slate-200 shadow-lg text-slate-900" : "bg-[#14171c] border-slate-800 shadow-2xl text-white"} border space-y-5`}>
        <div className={`flex flex-col md:flex-row md:items-center justify-between gap-4 border-b ${isLight ? "border-slate-200" : "border-white/5"} pb-4`}>
          <div className="flex items-center gap-4">
            <div className="w-16 h-16 rounded-2xl bg-gradient-to-tr from-emerald-600 to-teal-500 text-slate-950 font-black text-2xl flex items-center justify-center shadow-lg flex-shrink-0">
              {isLoadingAudit ? <RefreshCw className="w-6 h-6 animate-spin text-slate-950" /> : (auditData?.grade || "N/A")}
            </div>
            <div className="min-w-0">
              <div className={`text-xl font-bold ${isLight ? "text-slate-900" : "text-white"} flex items-center gap-2 flex-wrap`}>
                {isLoadingAudit ? "Scanning Database..." : `${auditData?.health_score ?? 0}% Health Score`}
                <span className={`text-xs font-mono px-2 py-0.5 rounded ${
                  (auditData?.health_score ?? 0) >= 80
                    ? "bg-emerald-500/10 text-emerald-500 border-emerald-500/20"
                    : (auditData?.health_score ?? 0) >= 60
                    ? "bg-amber-500/10 text-amber-500 border-amber-500/20"
                    : "bg-rose-500/10 text-rose-500 border-rose-500/20"
                } border font-bold`}>
                  {auditData?.grade === "A+" || auditData?.grade === "A" ? "Analytics Ready" : (auditData?.health_score ?? 0) >= 70 ? "Silver Theory Ready" : "Sanitization Recommended"}
                </span>
              </div>
              <div className={`text-xs font-mono ${isLight ? "text-slate-500" : "text-slate-400"} mt-0.5 truncate`}>
                {auditData?.total_games?.toLocaleString() || 0} Total Games Indexed in <span className="font-bold">{selectedDb}</span>
              </div>
            </div>
          </div>

          {/* Tier Counts Badges */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-center font-mono text-xs">
            <div className={`p-2 rounded-xl ${isLight ? "bg-rose-50 border-rose-200" : "bg-black/40 border-rose-500/30"} border`}>
              <span className="text-[10px] text-rose-500 block font-bold truncate">Tier 0 (Quarantine)</span>
              <span className={`text-sm font-bold ${isLight ? "text-slate-900" : "text-white"}`}>{tiers.tier_0_quarantine}</span>
            </div>
            <div className={`p-2 rounded-xl ${isLight ? "bg-amber-50 border-amber-200" : "bg-black/40 border-amber-500/30"} border`}>
              <span className="text-[10px] text-amber-500 block font-bold truncate">Tier 1 (Sanitized)</span>
              <span className={`text-sm font-bold ${isLight ? "text-slate-900" : "text-white"}`}>{tiers.tier_1_sanitized}</span>
            </div>
            <div className={`p-2 rounded-xl ${isLight ? "bg-emerald-50 border-emerald-200" : "bg-black/40 border-emerald-500/30"} border`}>
              <span className="text-[10px] text-emerald-500 block font-bold truncate">Tier 2 (Silver Stats)</span>
              <span className="text-sm font-bold text-emerald-500">{tiers.tier_2_silver}</span>
            </div>
            <div className={`p-2 rounded-xl ${isLight ? "bg-purple-50 border-purple-200" : "bg-black/40 border-purple-500/30"} border`}>
              <span className="text-[10px] text-purple-500 block font-bold truncate">Tier 3 (Gold Evaluated)</span>
              <span className="text-sm font-bold text-purple-500">{tiers.tier_3_gold}</span>
            </div>
          </div>
        </div>

        {/* Tier Distribution Multi-Bar */}
        <div className="space-y-1.5">
          <div className={`flex justify-between text-[11px] font-mono ${isLight ? "text-slate-500" : "text-slate-400"}`}>
            <span>Tier Lifecycle Progress:</span>
            <span>{tiers.tier_2_silver + tiers.tier_3_gold} of {totalGames} games Tier 2+</span>
          </div>
          <div className={`h-3 w-full ${isLight ? "bg-slate-200" : "bg-black/50"} rounded-full flex overflow-hidden shadow-inner`}>
            {t0Pct > 0 && <div style={{ width: `${t0Pct}%` }} className="bg-rose-500" title={`Tier 0: ${t0Pct}%`} />}
            {t1Pct > 0 && <div style={{ width: `${t1Pct}%` }} className="bg-amber-500" title={`Tier 1: ${t1Pct}%`} />}
            {t2Pct > 0 && <div style={{ width: `${t2Pct}%` }} className="bg-emerald-500" title={`Tier 2 (Silver): ${t2Pct}%`} />}
            {t3Pct > 0 && <div style={{ width: `${t3Pct}%` }} className="bg-purple-600" title={`Tier 3 (Gold): ${t3Pct}%`} />}
          </div>
        </div>
      </div>

      {/* Stage Navigation Tabs */}
      <div className="flex gap-2 border-b border-slate-800 pb-2">
        <button
          onClick={() => {
            setActiveTab("audit");
            logAction("NAV", "Switched to Health Audit tab");
          }}
          className={`px-4 py-2 text-xs font-bold font-mono rounded-xl transition-all flex items-center gap-2 ${
            activeTab === "audit"
              ? "bg-emerald-500/15 text-emerald-400 border border-emerald-500/30 shadow-md"
              : "text-slate-400 hover:text-white hover:bg-white/5"
          }`}
        >
          <ShieldCheck className="w-4 h-4" />
          1. Health Audit & Sanitization
        </button>

        <button
          onClick={() => {
            setActiveTab("silver");
            logAction("NAV", "Switched to Silver Statistics tab");
          }}
          className={`px-4 py-2 text-xs font-bold font-mono rounded-xl transition-all flex items-center gap-2 ${
            activeTab === "silver"
              ? "bg-blue-500/15 text-blue-400 border border-blue-500/30 shadow-md"
              : "text-slate-400 hover:text-white hover:bg-white/5"
          }`}
        >
          <Zap className="w-4 h-4" />
          2. Silver Statistics (Instant)
        </button>

        <button
          onClick={() => {
            setActiveTab("gold");
            logAction("NAV", "Switched to Gold Mass Analysis tab");
          }}
          className={`px-4 py-2 text-xs font-bold font-mono rounded-xl transition-all flex items-center gap-2 ${
            activeTab === "gold"
              ? "bg-purple-500/15 text-purple-400 border border-purple-500/30 shadow-md"
              : "text-slate-400 hover:text-white hover:bg-white/5"
          }`}
        >
          <Flame className="w-4 h-4" />
          3. Gold Mass Analysis (Stockfish)
        </button>
      </div>

      {/* TAB 1: Health Audit & Sanitization */}
      {activeTab === "audit" && (
        <div className="grid grid-cols-1 md:grid-cols-12 gap-6 animate-in fade-in duration-150">
          {/* Anomaly Cards (7 cols) */}
          <div className="md:col-span-7 p-6 rounded-3xl bg-[#14171c] border border-slate-800 shadow-xl space-y-4">
            <h2 className="text-xs font-bold uppercase tracking-wider text-slate-200 flex items-center gap-2 border-b border-white/5 pb-3">
              <AlertTriangle className="w-4 h-4 text-amber-400" />
              Identified Data Anomalies
            </h2>

            <div className="space-y-3 font-sans text-xs">
              <div className="p-3.5 rounded-2xl bg-black/30 border border-white/5 flex items-center justify-between">
                <div>
                  <span className="font-bold text-white block">Ambiguous / Missing Results (*)</span>
                  <span className="text-[10px] text-slate-500">Un-adjudicated games that distort performance ratings</span>
                </div>
                <span className={`font-mono font-bold text-sm ${auditData?.issues?.missing_results ? "text-rose-400" : "text-emerald-400"}`}>
                  {auditData?.issues?.missing_results || 0}
                </span>
              </div>

              <div className="p-3.5 rounded-2xl bg-black/30 border border-white/5 flex items-center justify-between">
                <div>
                  <span className="font-bold text-white block">Unclassified ECOs (A00 / Missing)</span>
                  <span className="text-[10px] text-slate-500">Games without opening theory categorization</span>
                </div>
                <span className={`font-mono font-bold text-sm ${auditData?.issues?.unclassified_ecos ? "text-amber-400" : "text-emerald-400"}`}>
                  {auditData?.issues?.unclassified_ecos || 0}
                </span>
              </div>

              <div className="p-3.5 rounded-2xl bg-black/30 border border-white/5 flex items-center justify-between">
                <div>
                  <span className="font-bold text-white block">Unrated / Missing Elo Ratings</span>
                  <span className="text-[10px] text-slate-500">Opponents missing authorative FIDE/National ratings</span>
                </div>
                <span className="font-mono font-bold text-sm text-slate-400">
                  {auditData?.issues?.missing_elos || 0}
                </span>
              </div>

              <div className="p-3.5 rounded-2xl bg-black/30 border border-white/5 flex items-center justify-between">
                <div>
                  <span className="font-bold text-white block">Short Stubs & Accidental Aborts (&lt; 3 plies)</span>
                  <span className="text-[10px] text-slate-500">Corrupted zero-move records to purge from analytics</span>
                </div>
                <span className={`font-mono font-bold text-sm ${auditData?.issues?.short_stubs ? "text-rose-400" : "text-emerald-400"}`}>
                  {auditData?.issues?.short_stubs || 0}
                </span>
              </div>
            </div>
          </div>

          {/* Sanitization Action Rules (5 cols) */}
          <div className="md:col-span-5 p-6 rounded-3xl bg-[#14171c] border border-slate-800 shadow-xl space-y-5 flex flex-col justify-between">
            <div className="space-y-4">
              <h2 className="text-xs font-bold uppercase tracking-wider text-slate-200 flex items-center gap-2 border-b border-white/5 pb-3">
                <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                Sanitization Rules
              </h2>

              <div className="space-y-3 text-xs">
                <label className="flex items-start gap-2.5 cursor-pointer p-2.5 rounded-xl bg-black/30 border border-white/5 hover:bg-white/5 transition-all">
                  <input
                    type="checkbox"
                    checked={autoRepairResults}
                    onChange={(e) => setAutoRepairResults(e.target.checked)}
                    className="mt-0.5"
                  />
                  <div>
                    <span className="font-bold text-slate-200 block">Adjudication Cascade</span>
                    <span className="text-[10px] text-slate-500">Resolve '*' via Termination tag &amp; terminal checkmate</span>
                  </div>
                </label>

                <label className="flex items-start gap-2.5 cursor-pointer p-2.5 rounded-xl bg-black/30 border border-white/5 hover:bg-white/5 transition-all">
                  <input
                    type="checkbox"
                    checked={normalizeNames}
                    onChange={(e) => setNormalizeNames(e.target.checked)}
                    className="mt-0.5"
                  />
                  <div>
                    <span className="font-bold text-slate-200 block">Normalize Names &amp; Dates</span>
                    <span className="text-[10px] text-slate-500">Standardize player casing &amp; ISO YYYY.MM.DD dates</span>
                  </div>
                </label>

                <label className="flex items-start gap-2.5 cursor-pointer p-2.5 rounded-xl bg-black/30 border border-white/5 hover:bg-white/5 transition-all">
                  <input
                    type="checkbox"
                    checked={purgeStubs}
                    onChange={(e) => setPurgeStubs(e.target.checked)}
                    className="mt-0.5"
                  />
                  <div>
                    <span className="font-bold text-slate-200 block">Purge Zero-Move Stubs</span>
                    <span className="text-[10px] text-slate-500">Delete unusable &lt; 3 ply records safely via WAL</span>
                  </div>
                </label>
              </div>
            </div>

            <button
              onClick={() => sanitizeMutation.mutate()}
              disabled={sanitizeMutation.isPending || isLoadingAudit}
              className="w-full py-3 bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold text-xs rounded-2xl shadow-xl transition-all flex items-center justify-center gap-2 cursor-pointer disabled:opacity-40"
            >
              {sanitizeMutation.isPending ? (
                <>
                  <RefreshCw className="w-4 h-4 animate-spin" />
                  Sanitizing Records...
                </>
              ) : (
                <>
                  <ShieldCheck className="w-4 h-4" />
                  Run Full Sanitization Pass
                </>
              )}
            </button>
          </div>
        </div>
      )}

      {/* TAB 2: Silver Statistics (Instant) */}
      {activeTab === "silver" && (
        <div className="p-8 rounded-3xl bg-[#14171c] border border-slate-800 shadow-2xl space-y-6 animate-in fade-in duration-150">
          <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4 border-b border-white/5 pb-4">
            <div>
              <h2 className="text-lg font-bold text-white flex items-center gap-2">
                <Zap className="w-5 h-5 text-blue-400" />
                Stage A: Silver Statistics &amp; Opening Repertoire
              </h2>
              <p className="text-xs text-slate-400 mt-1 max-w-2xl leading-relaxed">
                Extracts metadata, classifies all opening lines via Polyglot tree, generates Glicko-2 ratings (&mu;, RD, &sigma;), and preserves pre-existing [%eval] and [Accuracy] annotations. Elevates games to <strong>Tier 2 (Silver)</strong> instantly without engine overhead.
              </p>
            </div>

            <div className="flex items-center gap-2">
              {onNavigateToDossier && (
                <button
                  onClick={() => {
                    logAction("NAV", "Opened Dossier from Silver Stats tab");
                    onNavigateToDossier();
                  }}
                  className="px-4 py-3 bg-slate-800 hover:bg-slate-700 text-slate-200 font-bold text-xs rounded-2xl border border-slate-700 shadow-md transition-all flex items-center gap-2"
                >
                  <Sparkles className="w-4 h-4 text-emerald-400" />
                  View in Dossier
                </button>
              )}

              <button
                onClick={() => silverMutation.mutate()}
                disabled={silverMutation.isPending}
                className="px-6 py-3 bg-blue-600 hover:bg-blue-500 text-white font-bold text-xs rounded-2xl shadow-xl transition-all flex items-center gap-2 whitespace-nowrap disabled:opacity-40"
              >
                {silverMutation.isPending ? (
                  <>
                    <RefreshCw className="w-4 h-4 animate-spin" />
                    Generating Statistics...
                  </>
                ) : (
                  <>
                    <Sparkles className="w-4 h-4 text-cyan-300" />
                    Generate Silver Statistics
                  </>
                )}
              </button>
            </div>
          </div>

          {/* Capabilities Grid */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 font-sans text-xs">
            <div className="p-4 rounded-2xl bg-black/30 border border-white/5 space-y-1.5">
              <span className="font-bold text-blue-400 block">Polyglot ECO Classification</span>
              <p className="text-slate-400 text-[11px] leading-relaxed">
                Infers Italian, Sicilian, French, and Queen&apos;s Gambit lines from move sequences and updates database records.
              </p>
            </div>

            <div className="p-4 rounded-2xl bg-black/30 border border-white/5 space-y-1.5">
              <span className="font-bold text-emerald-400 block">Glicko-2 Rating Matrix</span>
              <p className="text-slate-400 text-[11px] leading-relaxed">
                Computes true skill ratings, uncertainty (RD), and volatility across all active players in the tournament.
              </p>
            </div>

            <div className="p-4 rounded-2xl bg-black/30 border border-white/5 space-y-1.5">
              <span className="font-bold text-amber-400 block">Instant Dossier Readiness</span>
              <p className="text-slate-400 text-[11px] leading-relaxed">
                Unlocks the Player Dossier, Head-to-Head Compare view, and Opening Fashion Index immediately.
              </p>
            </div>
          </div>
        </div>
      )}

      {/* TAB 3: Gold Mass Analysis (Stockfish Engine) */}
      {activeTab === "gold" && (
        <div className="p-8 rounded-3xl bg-[#14171c] border border-slate-800 shadow-2xl space-y-6 animate-in fade-in duration-150">
          <div className="border-b border-white/5 pb-4">
            <h2 className="text-lg font-bold text-white flex items-center gap-2">
              <Flame className="w-5 h-5 text-purple-400" />
              Stage B: Mass Engine Analysis (Gold Standard · Tier 3)
            </h2>
            <p className="text-xs text-slate-400 mt-1 max-w-2xl leading-relaxed">
              Launches an asynchronous Stockfish worker to evaluate every game move-by-move. Computes Phase ACPL (Opening, Middlegame, Endgame), CAPS accuracy curves, blunder spectra, and attaches an immutable <code>AnalysisProvenance</code> stamp with atomic per-game WAL commits.
            </p>
          </div>

          {/* Engine Parameters & Controls */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 font-sans text-xs">
            <div className="space-y-4 p-5 rounded-2xl bg-black/30 border border-white/5">
              <span className="font-bold text-slate-200 block uppercase tracking-wider text-[11px]">
                Engine Configuration
              </span>

              <div className="space-y-2">
                <label className="text-slate-400 block">Analysis Depth:</label>
                <div className="grid grid-cols-4 gap-2">
                  {[12, 16, 20, 22].map((d) => (
                    <button
                      key={d}
                      onClick={() => setAnalysisDepth(d)}
                      className={`py-1.5 rounded-xl font-mono font-bold transition-all border ${
                        analysisDepth === d
                          ? "bg-purple-600 text-white border-purple-400 shadow-md"
                          : "bg-black/40 text-slate-400 border-white/10 hover:text-white"
                      }`}
                    >
                      d={d} {d === 12 ? "(Fast)" : d === 16 ? "(Std)" : d === 20 ? "(Deep)" : "(GM)"}
                    </button>
                  ))}
                </div>
              </div>

              <div className="space-y-2 pt-2">
                <label className="text-slate-400 block">Analysis Mode:</label>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    onClick={() => setAnalysisMode("MISSING_ONLY")}
                    className={`py-1.5 rounded-xl font-mono font-bold transition-all border ${
                      analysisMode === "MISSING_ONLY"
                        ? "bg-purple-600 text-white border-purple-400 shadow-md"
                        : "bg-black/40 text-slate-400 border-white/10 hover:text-white"
                    }`}
                  >
                    Missing Only (Skip Tier 3)
                  </button>
                  <button
                    onClick={() => setAnalysisMode("OVERWRITE")}
                    className={`py-1.5 rounded-xl font-mono font-bold transition-all border ${
                      analysisMode === "OVERWRITE"
                        ? "bg-purple-600 text-white border-purple-400 shadow-md"
                        : "bg-black/40 text-slate-400 border-white/10 hover:text-white"
                    }`}
                  >
                    Overwrite (Re-evaluate All)
                  </button>
                </div>
              </div>
            </div>

            {/* Live Progress or Launcher Box */}
            <div className="p-5 rounded-2xl bg-black/30 border border-white/5 flex flex-col justify-between space-y-4">
              <div>
                <span className="font-bold text-slate-200 block uppercase tracking-wider text-[11px]">
                  Job Status &amp; Execution
                </span>

                {activeJobId && jobStatus ? (
                  <div className="space-y-3 mt-3">
                    <div className="flex justify-between text-xs font-mono">
                      <span className="text-purple-400 font-bold">Status: {jobStatus.status}</span>
                      <span className="text-slate-300 font-bold">{jobStatus.progress_pct}%</span>
                    </div>

                    <div className="h-3 w-full bg-black/60 rounded-full overflow-hidden">
                      <div
                        className="h-full bg-gradient-to-r from-purple-600 to-cyan-400 rounded-full transition-all duration-300"
                        style={{ width: `${jobStatus.progress_pct}%` }}
                      />
                    </div>

                    <div className="text-[11px] font-mono text-slate-400 truncate">
                      Current: <span className="text-slate-200">{jobStatus.current_game || "Initializing..."}</span>
                    </div>

                    <div className="text-[11px] font-mono text-slate-500">
                      Processed {jobStatus.processed} of {jobStatus.total} games
                    </div>
                  </div>
                ) : (
                  <div className="text-xs text-slate-400 mt-3 space-y-2">
                    <p>
                      Analysis runs at low CPU priority with atomic per-game commits. You can pause, cancel, or navigate away at any time without losing completed evaluations.
                    </p>
                  </div>
                )}
              </div>

              {activeJobId && jobStatus?.status === "running" ? (
                <button
                  onClick={handleCancelAnalysis}
                  className="w-full py-2.5 bg-rose-600 hover:bg-rose-500 text-white font-bold text-xs rounded-xl shadow-lg transition-all flex items-center justify-center gap-2"
                >
                  <XCircle className="w-4 h-4" />
                  Cancel Mass Analysis
                </button>
              ) : (
                <button
                  onClick={() => startAnalysisMutation.mutate()}
                  disabled={startAnalysisMutation.isPending}
                  className="w-full py-3 bg-purple-600 hover:bg-purple-500 text-white font-bold text-xs rounded-2xl shadow-xl transition-all flex items-center justify-center gap-2 disabled:opacity-40"
                >
                  {startAnalysisMutation.isPending ? (
                    <>
                      <RefreshCw className="w-4 h-4 animate-spin" />
                      Starting Worker Pool...
                    </>
                  ) : (
                    <>
                      <Play className="w-4 h-4 text-emerald-400" />
                      Start Mass Analysis (Depth {analysisDepth})
                    </>
                  )}
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
