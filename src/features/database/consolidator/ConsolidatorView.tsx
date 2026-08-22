import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { UXTheme } from "../../../lib/theme";
import { useClickLogger } from "../../../lib/clickLogger";
import { fetchDatabases } from "../../../lib/api";
import {
  Layers,
  CheckSquare,
  Square,
  FileCheck,
  RefreshCw,
  Database,
  ArrowRight,
} from "lucide-react";

interface ConsolidatorViewProps {
  uxTheme: UXTheme;
}

interface MergeResult {
  status: string;
  target_database: string;
  target_path: string;
  total_imported: number;
  total_duplicates_skipped: number;
  file_size_mb: number;
}

export function ConsolidatorView({ }: ConsolidatorViewProps) {
  const { logAction } = useClickLogger();
  const queryClient = useQueryClient();

  const [selectedDbs, setSelectedDbs] = useState<string[]>([]);
  const [targetName, setTargetName] = useState("Consolidated_Master.Tournament.sqlite");
  const [deduplicate, setDeduplicate] = useState(true);
  const [resultSummary, setResultSummary] = useState<MergeResult | null>(null);

  const { data: databases } = useQuery({
    queryKey: ["databases"],
    queryFn: fetchDatabases,
  });

  // Dynamically initialize selected databases from available databases
  useEffect(() => {
    if (databases && databases.length > 0 && selectedDbs.length === 0) {
      setSelectedDbs(databases.slice(0, 2).map((d) => d.name));
    }
  }, [databases]);

  const mergeMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch("http://127.0.0.1:8000/api/v1/consolidator/merge", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          source_dbs: selectedDbs,
          target_db_name: targetName,
          deduplicate,
        }),
      });
      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.detail || "Consolidation merge failed");
      }
      return res.json() as Promise<MergeResult>;
    },
    onSuccess: (data: MergeResult) => {
      logAction("API", `Consolidated ${data.total_imported} games into ${data.target_database}`);
      setResultSummary(data);
      queryClient.invalidateQueries({ queryKey: ["databases"] });
    },
  });

  const toggleSelectDb = (name: string) => {
    setSelectedDbs((prev) =>
      prev.includes(name) ? prev.filter((d) => d !== name) : [...prev, name]
    );
    logAction("CLICK", `Toggled database selection: ${name}`);
  };

  return (
    <div className="flex flex-col gap-6 max-w-5xl mx-auto pb-10 select-none animate-in fade-in duration-200">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
        <div>
          <div className="text-[10px] font-mono uppercase tracking-widest text-emerald-400 font-bold mb-1">
            Database Consolidator & ETL Merger
          </div>
          <h1 className="text-3xl font-extrabold tracking-tight text-white flex items-center gap-3">
            Database Consolidator
            <span className="text-xs font-mono font-normal text-slate-400">
              — Merge, deduplicate & export standard SQLite (.sqlite)
            </span>
          </h1>
        </div>
      </div>

      {/* Main Consolidation Grid */}
      <div className="grid grid-cols-1 md:grid-cols-12 gap-6">
        {/* Source Databases Selection (6 cols) */}
        <div className="md:col-span-6 p-6 rounded-3xl bg-[#14171c] border border-slate-800 shadow-xl space-y-4">
          <div className="flex items-center justify-between border-b border-white/5 pb-3">
            <h2 className="text-xs font-bold uppercase tracking-wider text-slate-200 flex items-center gap-2">
              <Database className="w-4 h-4 text-emerald-400" />
              1. Select Source Databases
            </h2>
            <span className="text-[10px] font-mono text-slate-500">
              {selectedDbs.length} of {databases?.length || 0} selected
            </span>
          </div>

          <div className="space-y-2 max-h-72 overflow-y-auto">
            {databases?.map((db) => {
              const isSelected = selectedDbs.includes(db.name);
              return (
                <div
                  key={db.name}
                  onClick={() => toggleSelectDb(db.name)}
                  className={`p-3 rounded-2xl border cursor-pointer transition-all flex items-center justify-between ${
                    isSelected
                      ? "bg-emerald-500/10 border-emerald-500/40 text-white shadow-sm"
                      : "bg-black/30 border-white/5 text-slate-400 hover:bg-white/5"
                  }`}
                >
                  <div className="flex items-center gap-3">
                    {isSelected ? (
                      <CheckSquare className="w-4 h-4 text-emerald-400" />
                    ) : (
                      <Square className="w-4 h-4 opacity-40" />
                    )}
                    <div>
                      <span className="text-xs font-bold block">{db.name}</span>
                      <span className="text-[10px] font-mono opacity-60">{db.size_mb} MB</span>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Target Options & Merge Action (6 cols) */}
        <div className="md:col-span-6 p-6 rounded-3xl bg-[#14171c] border border-slate-800 shadow-xl space-y-5 flex flex-col justify-between">
          <div className="space-y-4">
            <div className="flex items-center justify-between border-b border-white/5 pb-3">
              <h2 className="text-xs font-bold uppercase tracking-wider text-slate-200 flex items-center gap-2">
                <Layers className="w-4 h-4 text-blue-400" />
                2. Target Output & Rules
              </h2>
            </div>

            <div className="space-y-2">
              <label className="text-xs font-semibold text-slate-300 block">
                Target SQLite Filename:
              </label>
              <input
                type="text"
                value={targetName}
                onChange={(e) => setTargetName(e.target.value)}
                className="w-full bg-black/40 border border-white/10 rounded-xl px-3 py-2 text-xs font-mono text-emerald-400 focus:outline-none focus:border-emerald-500"
              />
              <span className="text-[10px] text-slate-500 block">
                Uses standard suffix naming: <span className="text-slate-400">*.Tournament.sqlite</span>
              </span>
            </div>

            <div className="pt-2">
              <label
                onClick={() => setDeduplicate(!deduplicate)}
                className="flex items-center gap-2.5 cursor-pointer text-xs text-slate-300"
              >
                {deduplicate ? (
                  <CheckSquare className="w-4 h-4 text-emerald-400" />
                ) : (
                  <Square className="w-4 h-4 opacity-40" />
                )}
                <span>Deduplicate records by SHA-256 move & header hash</span>
              </label>
            </div>
          </div>

          <button
            onClick={() => mergeMutation.mutate()}
            disabled={selectedDbs.length === 0 || mergeMutation.isPending}
            className="w-full py-3 bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold text-xs rounded-2xl shadow-xl disabled:opacity-40 transition-all flex items-center justify-center gap-2 cursor-pointer"
          >
            {mergeMutation.isPending ? (
              <>
                <RefreshCw className="w-4 h-4 animate-spin" />
                Consolidating & Deduplicating Databases...
              </>
            ) : (
              <>
                <ArrowRight className="w-4 h-4" />
                Merge & Consolidate ({selectedDbs.length} Databases)
              </>
            )}
          </button>
        </div>
      </div>

      {/* Merge Result Summary Card */}
      {resultSummary && (
        <div className="p-6 rounded-3xl bg-emerald-950/20 border border-emerald-500/30 shadow-2xl space-y-3 animate-in fade-in duration-150">
          <div className="flex items-center gap-2.5 text-emerald-400 font-bold text-sm">
            <FileCheck className="w-5 h-5" />
            Consolidation Completed Successfully!
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 pt-2 font-mono text-xs">
            <div className="p-3 rounded-2xl bg-black/40 border border-white/5">
              <span className="text-[10px] opacity-60 uppercase block">Games Written</span>
              <span className="text-xl font-bold text-emerald-400">
                {resultSummary.total_imported.toLocaleString()}
              </span>
            </div>

            <div className="p-3 rounded-2xl bg-black/40 border border-white/5">
              <span className="text-[10px] opacity-60 uppercase block">Duplicates Skipped</span>
              <span className="text-xl font-bold text-amber-400">
                {resultSummary.total_duplicates_skipped.toLocaleString()}
              </span>
            </div>

            <div className="p-3 rounded-2xl bg-black/40 border border-white/5">
              <span className="text-[10px] opacity-60 uppercase block">File Size</span>
              <span className="text-xl font-bold text-slate-100">
                {resultSummary.file_size_mb} MB
              </span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
