import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { fetchOpeningBooksList, probeOpeningBook, OpeningBookCandidate } from "../../lib/api";
import { UXTheme } from "../../lib/theme";
import { useClickLogger } from "../../lib/clickLogger";
import { BookOpen, Compass, Sparkles, ChevronRight } from "lucide-react";

interface OpeningBookPanelProps {
  fen: string;
  eco?: string;
  openingName?: string;
  uxTheme: UXTheme;
  onPlayMove?: (san: string) => void;
}

export function OpeningBookPanel({
  fen,
  eco,
  openingName,
  uxTheme,
  onPlayMove,
}: OpeningBookPanelProps) {
  const { logAction } = useClickLogger();
  const [selectedBook, setSelectedBook] = useState<string>("GMopenings.bin");
  const isLight = uxTheme.mode === "light";

  // Query available opening books
  const { data: booksList } = useQuery({
    queryKey: ["opening_books"],
    queryFn: fetchOpeningBooksList,
  });

  // Probe opening book for current position FEN
  const { data: probeResult, isLoading: isProbing } = useQuery({
    queryKey: ["probe_book", fen, selectedBook],
    queryFn: () => probeOpeningBook(fen, selectedBook),
    enabled: !!fen,
  });

  const availableBooks = booksList || [];
  const inBook = Boolean(probeResult?.in_book && (probeResult?.candidates?.length ?? 0) > 0);
  const candidates: OpeningBookCandidate[] = probeResult?.candidates || [];

  const handleSelectCandidate = (candidate: OpeningBookCandidate) => {
    logAction("BOARD", `Selected Book Move: ${candidate.san}`, `Book: ${selectedBook} (${candidate.weight_pct}%)`);
    if (onPlayMove) {
      onPlayMove(candidate.san);
    }
  };

  return (
    <div
      className={`rounded-3xl border p-4 shadow-2xl flex flex-col transition-colors duration-200 ${uxTheme.panel} ${uxTheme.border}`}
    >
      {/* Header */}
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <BookOpen className="w-4 h-4 text-purple-400" />
          <h2
            className={`font-extrabold text-xs uppercase tracking-wider ${
              isLight ? "text-slate-900" : "text-white"
            }`}
          >
            Opening Book
          </h2>
        </div>

        {/* Book Selector Dropdown */}
        <select
          value={selectedBook}
          onChange={(e) => {
            setSelectedBook(e.target.value);
            logAction("CLICK", `Switched Analysis Opening Book: ${e.target.value}`);
          }}
          className={`text-[11px] font-mono font-bold rounded-lg px-2 py-1 border outline-none cursor-pointer ${
            isLight
              ? "bg-slate-100 border-slate-300 text-slate-800"
              : "bg-black/60 border-white/15 text-slate-200"
          }`}
        >
          {availableBooks.length > 0 ? (
            availableBooks.map((b) => (
              <option key={b.filename} value={b.filename}>
                {b.name.replace(/\.(bin|ctg|pgn)$/i, "")}
              </option>
            ))
          ) : (
            <>
              <option value="GMopenings.bin">GMopenings.bin</option>
              <option value="fics15.bin">fics15.bin</option>
              <option value="Perfect2023.bin">Perfect2023.bin</option>
            </>
          )}
        </select>
      </div>

      {/* Opening Meta Tag */}
      <div
        className={`p-2.5 rounded-2xl border mb-3 flex items-center justify-between gap-2 ${
          isLight
            ? "bg-purple-500/10 border-purple-300/60 text-purple-950"
            : "bg-purple-950/30 border-purple-500/30 text-purple-200"
        }`}
      >
        <div className="flex items-center gap-2 min-w-0">
          <span className="px-1.5 py-0.5 rounded font-mono font-black text-[10px] bg-purple-500/20 border border-purple-500/40 text-purple-700 dark:text-purple-300">
            {eco || "ECO"}
          </span>
          <span className="text-xs font-bold truncate">
            {openingName || "Classified System"}
          </span>
        </div>

        <span
          className={`text-[10px] font-mono font-bold px-2 py-0.5 rounded-md flex items-center gap-1 flex-shrink-0 ${
            inBook
              ? "bg-emerald-500/20 text-emerald-700 dark:text-emerald-300 border border-emerald-500/40"
              : "bg-slate-500/20 text-slate-600 dark:text-slate-400 border border-slate-500/30"
          }`}
        >
          {inBook ? (
            <>
              <Sparkles className="w-3 h-3 text-emerald-400" />
              <span>In Book</span>
            </>
          ) : (
            <>
              <Compass className="w-3 h-3 text-slate-400" />
              <span>Out of Book</span>
            </>
          )}
        </span>
      </div>

      {/* Candidate Book Moves List */}
      <div className="space-y-1.5">
        <div className="flex items-center justify-between text-[11px] font-mono px-1">
          <span className={isLight ? "text-slate-600 font-bold" : "text-slate-400"}>
            Candidate Lines {inBook ? `(${candidates.length})` : ""}
          </span>
          {inBook && (
            <span className="text-[10px] text-purple-600 dark:text-purple-400 font-semibold">
              Weight %
            </span>
          )}
        </div>

        {isProbing ? (
          <div className="py-4 text-center text-xs text-slate-400 font-mono italic animate-pulse">
            Probing opening book...
          </div>
        ) : inBook ? (
          <div className="space-y-1 max-h-44 overflow-y-auto pr-1">
            {candidates.map((cand, idx) => (
              <button
                key={idx}
                onClick={() => handleSelectCandidate(cand)}
                className={`w-full p-2 rounded-xl border text-xs font-mono transition-all flex items-center justify-between gap-2 cursor-pointer group ${
                  isLight
                    ? "bg-slate-100/90 border-slate-300 text-slate-900 hover:border-purple-500 hover:bg-purple-50"
                    : "bg-black/40 border-white/10 text-white hover:border-purple-500/50 hover:bg-purple-950/20"
                }`}
              >
                <div className="flex items-center gap-2">
                  <span className="w-5 h-5 rounded-md bg-purple-500/20 text-purple-700 dark:text-purple-300 flex items-center justify-center text-[10px] font-black border border-purple-500/30">
                    {idx + 1}
                  </span>
                  <span className="font-extrabold text-sm">{cand.san}</span>
                  {idx === 0 && (
                    <span className="text-[9px] px-1 py-0.2 rounded bg-emerald-500/20 text-emerald-600 dark:text-emerald-400 font-bold border border-emerald-500/30">
                      Main
                    </span>
                  )}
                </div>

                <div className="flex items-center gap-2">
                  {/* Progress bar */}
                  <div className="w-16 h-1.5 rounded-full bg-slate-700/40 overflow-hidden hidden sm:block">
                    <div
                      className="h-full bg-gradient-to-r from-purple-500 to-indigo-500 rounded-full"
                      style={{ width: `${Math.min(100, cand.weight_pct)}%` }}
                    />
                  </div>
                  <span className="text-[11px] font-bold text-purple-600 dark:text-purple-300 font-mono w-10 text-right">
                    {cand.weight_pct}%
                  </span>
                  <ChevronRight className="w-3.5 h-3.5 text-slate-400 group-hover:translate-x-0.5 transition-transform" />
                </div>
              </button>
            ))}
          </div>
        ) : (
          <div
            className={`p-3 rounded-2xl border text-center text-xs font-mono ${
              isLight
                ? "bg-slate-100 border-slate-300 text-slate-600"
                : "bg-black/30 border-white/10 text-slate-400"
            }`}
          >
            Position is outside of <strong className={isLight ? "text-slate-900" : "text-white"}>{selectedBook}</strong>.
            <div className="text-[10px] text-slate-400 dark:text-slate-500 mt-0.5">
              Novelty or tactical deviation from master opening theory.
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
