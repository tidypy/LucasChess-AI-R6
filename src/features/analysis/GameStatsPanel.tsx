import { UXTheme } from "../../lib/theme";
import { BarChart2, Zap, RefreshCw, CheckCircle2, AlertCircle } from "lucide-react";
import { AnalysisGameStats } from "../../components/chessboard/ResponsiveChessboard";

interface GameStatsPanelProps {
  stats?: AnalysisGameStats;
  gameDetails?: {
    white?: string;
    black?: string;
    white_elo?: string;
    black_elo?: string;
    result?: string;
    event?: string;
    date?: string;
    eco?: string;
    opening?: string;
  } | null;
  uxTheme: UXTheme;
  isAnalyzingFullGame?: boolean;
  analysisProgress?: { current: number; total: number } | null;
  onRunFullAnalysis?: () => void;
}

export function GameStatsPanel({
  stats,
  gameDetails,
  uxTheme,
  isAnalyzingFullGame,
  analysisProgress,
  onRunFullAnalysis,
}: GameStatsPanelProps) {
  const isLight = uxTheme.mode === "light";

  const hasAnalysis = stats?.hasEngineAnalysis ?? false;
  const whiteAcpl = stats?.whiteAcpl;
  const blackAcpl = stats?.blackAcpl;
  const whiteAccuracy = stats?.whiteAccuracy;
  const blackAccuracy = stats?.blackAccuracy;

  const totalMoves = stats?.totalMoves ?? 0;
  const totalPlies = stats?.totalPlies ?? 0;

  const blunderCount = stats?.blunderCount ?? 0;
  const mistakeCount = stats?.mistakeCount ?? 0;
  const inaccuracyCount = stats?.inaccuracyCount ?? 0;
  const goodCount = stats?.goodCount ?? 0;
  const bestCount = stats?.bestCount ?? 0;
  const bookCount = stats?.bookCount ?? 0;
  const tacticalCount = stats?.tacticalCount ?? 0;

  const resultStr = gameDetails?.result || "*";
  const isWhiteWin = resultStr === "1-0";
  const isBlackWin = resultStr === "0-1";

  return (
    <div
      className={`rounded-3xl border p-4 shadow-2xl flex flex-col transition-colors duration-200 ${uxTheme.panel} ${uxTheme.border}`}
    >
      {/* Header */}
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <BarChart2 className="w-4 h-4 text-emerald-400" />
          <h2
            className={`font-extrabold text-xs uppercase tracking-wider ${
              isLight ? "text-slate-900" : "text-white"
            }`}
          >
            Game Stats
          </h2>
        </div>

        <span className="text-[10px] font-mono font-bold px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-700 dark:text-emerald-300 border border-emerald-500/30">
          {totalMoves} Moves ({totalPlies} Plies)
        </span>
      </div>

      {/* Accuracy & ACPL Head-to-Head */}
      {hasAnalysis ? (
        <div className="grid grid-cols-2 gap-2 mb-3">
          {/* White Player Stats */}
          <div
            className={`p-2.5 rounded-2xl border flex flex-col justify-between ${
              isLight
                ? "bg-slate-100/90 border-slate-300 text-slate-900"
                : "bg-black/40 border-white/10 text-white"
            } ${isWhiteWin ? "ring-1 ring-emerald-500/50" : ""}`}
          >
            <div className="flex items-center justify-between text-[11px] font-bold mb-1">
              <span className="truncate max-w-[90px]">{gameDetails?.white || "White"}</span>
              {isWhiteWin && <span className="text-[10px] text-emerald-500 font-black">WIN</span>}
            </div>
            <div className="flex items-baseline justify-between font-mono">
              <span className="text-lg font-black text-emerald-600 dark:text-emerald-400">
                {whiteAccuracy !== undefined ? `${whiteAccuracy}%` : "—"}
              </span>
              <span className="text-[10px] text-slate-500 dark:text-slate-400 font-bold">
                {whiteAcpl !== undefined ? `${whiteAcpl} cp loss` : "—"}
              </span>
            </div>
            <div className="w-full h-1.5 rounded-full bg-slate-700/30 mt-1 overflow-hidden">
              <div
                className="h-full bg-emerald-500 rounded-full"
                style={{ width: `${whiteAccuracy ?? 0}%` }}
              />
            </div>
          </div>

          {/* Black Player Stats */}
          <div
            className={`p-2.5 rounded-2xl border flex flex-col justify-between ${
              isLight
                ? "bg-slate-100/90 border-slate-300 text-slate-900"
                : "bg-black/40 border-white/10 text-white"
            } ${isBlackWin ? "ring-1 ring-cyan-500/50" : ""}`}
          >
            <div className="flex items-center justify-between text-[11px] font-bold mb-1">
              <span className="truncate max-w-[90px]">{gameDetails?.black || "Black"}</span>
              {isBlackWin && <span className="text-[10px] text-cyan-500 font-black">WIN</span>}
            </div>
            <div className="flex items-baseline justify-between font-mono">
              <span className="text-lg font-black text-cyan-600 dark:text-cyan-400">
                {blackAccuracy !== undefined ? `${blackAccuracy}%` : "—"}
              </span>
              <span className="text-[10px] text-slate-500 dark:text-slate-400 font-bold">
                {blackAcpl !== undefined ? `${blackAcpl} cp loss` : "—"}
              </span>
            </div>
            <div className="w-full h-1.5 rounded-full bg-slate-700/30 mt-1 overflow-hidden">
              <div
                className="h-full bg-cyan-500 rounded-full"
                style={{ width: `${blackAccuracy ?? 0}%` }}
              />
            </div>
          </div>
        </div>
      ) : (
        /* Unanalyzed Game Banner */
        <div
          className={`p-3 rounded-2xl border mb-3 flex flex-col gap-2.5 ${
            isLight
              ? "bg-amber-500/10 border-amber-300/60 text-amber-950"
              : "bg-amber-950/25 border-amber-500/30 text-amber-200"
          }`}
        >
          <div className="flex items-center justify-between text-xs font-mono">
            <div className="flex items-center gap-1.5 font-bold">
              <AlertCircle className="w-4 h-4 text-amber-500" />
              <span>Unanalyzed Game Record</span>
            </div>
            <span className="text-[10px] font-bold opacity-80 font-mono">Raw PGN</span>
          </div>

          <p className="text-[11px] leading-relaxed opacity-90">
            This match was loaded from an un-evaluated database. Run engine evaluation to calculate genuine ACPL, accuracy percentages, and blunder/tactical breakdown.
          </p>

          {onRunFullAnalysis && (
            <button
              onClick={onRunFullAnalysis}
              disabled={isAnalyzingFullGame}
              className="w-full py-2 bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white font-extrabold text-xs rounded-xl shadow-md transition-all flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50"
            >
              {isAnalyzingFullGame ? (
                <>
                  <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                  <span>
                    Analyzing Plies {analysisProgress?.current ?? 0}/{analysisProgress?.total ?? totalPlies}...
                  </span>
                </>
              ) : (
                <>
                  <Zap className="w-3.5 h-3.5 text-amber-300" />
                  <span>⚡ Run Full Game Analysis</span>
                </>
              )}
            </button>
          )}
        </div>
      )}

      {/* Move Quality Distribution Grid */}
      <div className="space-y-1.5">
        <div className="flex items-center justify-between px-1 text-[11px] font-mono font-bold">
          <span className={isLight ? "text-slate-600" : "text-slate-400"}>
            Move Quality Breakdown
          </span>
          {hasAnalysis && (
            <span className="text-[10px] text-emerald-600 dark:text-emerald-400 flex items-center gap-1 font-extrabold">
              <CheckCircle2 className="w-3 h-3" /> Evaluated
            </span>
          )}
        </div>

        <div className="grid grid-cols-4 gap-1.5 text-center font-mono">
          {/* Best */}
          <div
            className={`p-1.5 rounded-xl border flex flex-col items-center ${
              isLight
                ? "bg-emerald-50 border-emerald-200 text-emerald-950"
                : "bg-emerald-950/30 border-emerald-500/30 text-emerald-300"
            }`}
            title="Best Moves"
          >
            <span className="text-[10px] font-bold opacity-80 flex items-center gap-0.5">✨ Best</span>
            <span className="text-sm font-black">{hasAnalysis ? bestCount : "—"}</span>
          </div>

          {/* Good */}
          <div
            className={`p-1.5 rounded-xl border flex flex-col items-center ${
              isLight
                ? "bg-cyan-50 border-cyan-200 text-cyan-950"
                : "bg-cyan-950/30 border-cyan-500/30 text-cyan-300"
            }`}
            title="Good Moves"
          >
            <span className="text-[10px] font-bold opacity-80 flex items-center gap-0.5">✓ Good</span>
            <span className="text-sm font-black">{hasAnalysis ? goodCount : totalPlies}</span>
          </div>

          {/* Book */}
          <div
            className={`p-1.5 rounded-xl border flex flex-col items-center ${
              isLight
                ? "bg-purple-50 border-purple-200 text-purple-950"
                : "bg-purple-950/30 border-purple-500/30 text-purple-300"
            }`}
            title="Theory Book Moves"
          >
            <span className="text-[10px] font-bold opacity-80 flex items-center gap-0.5">📖 Book</span>
            <span className="text-sm font-black">{bookCount}</span>
          </div>

          {/* Tactics */}
          <div
            className={`p-1.5 rounded-xl border flex flex-col items-center ${
              isLight
                ? "bg-indigo-50 border-indigo-200 text-indigo-950"
                : "bg-indigo-950/30 border-indigo-500/30 text-indigo-300"
            }`}
            title="Decisive Tactical Combinations"
          >
            <span className="text-[10px] font-bold opacity-80 flex items-center gap-0.5">⚡ Tactic</span>
            <span className="text-sm font-black">{hasAnalysis ? tacticalCount : "—"}</span>
          </div>

          {/* Inaccuracies */}
          <div
            className={`p-1.5 rounded-xl border flex flex-col items-center ${
              isLight
                ? "bg-yellow-50 border-yellow-200 text-yellow-950"
                : "bg-yellow-950/30 border-yellow-500/30 text-yellow-300"
            }`}
            title="Inaccuracies"
          >
            <span className="text-[10px] font-bold opacity-80 flex items-center gap-0.5">?! Inacc</span>
            <span className="text-sm font-black">{hasAnalysis ? inaccuracyCount : "—"}</span>
          </div>

          {/* Mistakes */}
          <div
            className={`p-1.5 rounded-xl border flex flex-col items-center ${
              isLight
                ? "bg-orange-50 border-orange-200 text-orange-950"
                : "bg-orange-950/30 border-orange-500/30 text-orange-300"
            }`}
            title="Mistakes"
          >
            <span className="text-[10px] font-bold opacity-80 flex items-center gap-0.5">? Mistake</span>
            <span className="text-sm font-black">{hasAnalysis ? mistakeCount : "—"}</span>
          </div>

          {/* Blunders */}
          <div
            className={`p-1.5 rounded-xl border flex flex-col items-center col-span-2 ${
              isLight
                ? "bg-red-50 border-red-200 text-red-950"
                : "bg-red-950/30 border-red-500/30 text-red-300"
            }`}
            title="Blunders"
          >
            <span className="text-[10px] font-bold opacity-80 flex items-center gap-0.5">?? Blunders</span>
            <span className="text-sm font-black text-rose-600 dark:text-rose-400">
              {hasAnalysis ? blunderCount : "—"}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
