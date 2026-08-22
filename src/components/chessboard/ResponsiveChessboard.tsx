import { useState, useEffect, useRef, useCallback } from "react";
import { Chessboard } from "react-chessboard";
import { Chess } from "chess.js";
import {
  ChevronLeft,
  ChevronRight,
  ChevronsLeft,
  ChevronsRight,
  RotateCcw,
  Play,
  Pause,
  ArrowUpDown,
  Copy,
  Check,
} from "lucide-react";
import { useClickLogger } from "../../lib/clickLogger";
import { Tooltip } from "../common/Tooltip";
import { UXTheme, BoardTheme } from "../../lib/theme";

interface ResponsiveChessboardProps {
  pgn?: string;
  boardTheme: BoardTheme;
  uxTheme: UXTheme;
}

export function ResponsiveChessboard({
  pgn,
  boardTheme,
  uxTheme,
}: ResponsiveChessboardProps) {
  const { logAction } = useClickLogger();
  const [game] = useState(new Chess());
  const [currentPosition, setCurrentPosition] = useState(game.fen());
  const [history, setHistory] = useState<string[]>([]);
  const [historyIndex, setHistoryIndex] = useState(-1);
  const [orientation, setOrientation] = useState<"white" | "black">("white");
  const [isPlaying, setIsPlaying] = useState(false);
  const [copiedType, setCopiedType] = useState<"fen" | "pgn" | null>(null);

  const timerRef = useRef<number | null>(null);

  // Load PGN into game
  useEffect(() => {
    if (pgn) {
      try {
        game.loadPgn(pgn);
        const moves = game.history();
        setHistory(moves);
        setHistoryIndex(moves.length - 1);
        setCurrentPosition(game.fen());
        logAction("BOARD", `Loaded PGN with ${moves.length} moves`, `Final FEN: ${game.fen()}`);
      } catch (e) {
        console.error("Failed to load PGN", e);
        logAction("BOARD", "Error loading PGN", String(e));
      }
    }
  }, [pgn, game, logAction]);

  const updateToMove = useCallback((index: number) => {
    if (index < -1 || index >= history.length) return;

    const tempGame = new Chess();
    for (let i = 0; i <= index; i++) {
      tempGame.move(history[i]);
    }

    const newFen = tempGame.fen();
    setCurrentPosition(newFen);
    setHistoryIndex(index);
    const moveText = index >= 0 ? `${Math.floor(index / 2) + 1}${index % 2 === 0 ? "." : "..."} ${history[index]}` : "Start Position";
    logAction("NAV", `Navigated to Move ${index + 1}/${history.length}`, moveText);
  }, [history, logAction]);

  const handleFirst = () => {
    setIsPlaying(false);
    updateToMove(-1);
  };

  const handlePrev = () => {
    setIsPlaying(false);
    updateToMove(historyIndex - 1);
  };

  const handleNext = () => {
    setIsPlaying(false);
    updateToMove(historyIndex + 1);
  };

  const handleLast = () => {
    setIsPlaying(false);
    updateToMove(history.length - 1);
  };

  const handleFlip = () => {
    const nextOrientation = orientation === "white" ? "black" : "white";
    setOrientation(nextOrientation);
    logAction("BOARD", `Flipped board orientation to ${nextOrientation}`);
  };

  const handleCopyFen = async () => {
    await navigator.clipboard.writeText(currentPosition);
    setCopiedType("fen");
    logAction("BOARD", "Copied FEN to clipboard", currentPosition);
    setTimeout(() => setCopiedType(null), 2000);
  };

  const handleCopyPgn = async () => {
    if (pgn) {
      await navigator.clipboard.writeText(pgn);
      setCopiedType("pgn");
      logAction("BOARD", "Copied PGN to clipboard");
      setTimeout(() => setCopiedType(null), 2000);
    }
  };

  const toggleAutoPlay = () => {
    setIsPlaying((prev) => {
      const next = !prev;
      logAction("BOARD", next ? "Started Auto-Play" : "Paused Auto-Play");
      return next;
    });
  };

  // Auto-play timer
  useEffect(() => {
    if (isPlaying) {
      timerRef.current = window.setInterval(() => {
        setHistoryIndex((prevIndex) => {
          if (prevIndex >= history.length - 1) {
            setIsPlaying(false);
            return prevIndex;
          }
          const nextIndex = prevIndex + 1;
          const tempGame = new Chess();
          for (let i = 0; i <= nextIndex; i++) {
            tempGame.move(history[i]);
          }
          setCurrentPosition(tempGame.fen());
          return nextIndex;
        });
      }, 1000);
    } else {
      if (timerRef.current) clearInterval(timerRef.current);
    }
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [isPlaying, history]);

  // Keyboard navigation
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (["ArrowLeft", "ArrowRight", "Home", "End", "Space", "KeyF"].includes(e.code)) {
        if (e.code === "Space") e.preventDefault();
      }
      if (e.code === "ArrowLeft") handlePrev();
      if (e.code === "ArrowRight") handleNext();
      if (e.code === "Home") handleFirst();
      if (e.code === "End") handleLast();
      if (e.code === "KeyF") handleFlip();
      if (e.code === "Space") toggleAutoPlay();
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [historyIndex, history.length, orientation, isPlaying, handlePrev, handleNext, handleFirst, handleLast, handleFlip, toggleAutoPlay]);

  // Group moves into pairs
  const movePairs: Array<{ moveNum: number; white: string; black?: string; whiteIdx: number; blackIdx?: number }> = [];
  for (let i = 0; i < history.length; i += 2) {
    movePairs.push({
      moveNum: Math.floor(i / 2) + 1,
      white: history[i],
      black: history[i + 1],
      whiteIdx: i,
      blackIdx: i + 1 < history.length ? i + 1 : undefined,
    });
  }

  const isLightUX = uxTheme.mode === "light";

  return (
    <div className="flex flex-col lg:flex-row h-full gap-6 select-none">
      {/* Chessboard Container */}
      <div
        className={`flex-grow flex flex-col rounded-3xl shadow-2xl overflow-hidden border ${uxTheme.panel} ${uxTheme.border}`}
      >
        <div className="flex-grow p-4 md:p-6 flex items-center justify-center min-h-0">
          <div className="w-full max-w-[540px] aspect-square rounded-2xl overflow-hidden shadow-2xl border border-black/20">
            <Chessboard
              options={{
                position: currentPosition,
                boardOrientation: orientation,
                darkSquareStyle: { backgroundColor: boardTheme.boardDark },
                lightSquareStyle: { backgroundColor: boardTheme.boardLight },
                animationDurationInMs: 200,
              }}
            />
          </div>
        </div>

        {/* Board Control Bar */}
        <div
          className={`h-16 border-t flex items-center justify-between px-6 ${
            isLightUX ? "bg-slate-50 border-slate-200" : "bg-black/40 border-white/10"
          }`}
        >
          <div className="flex items-center gap-1.5">
            <Tooltip content="First Move" description="Jump to initial position" shortcut="Home">
              <button
                onClick={handleFirst}
                disabled={historyIndex === -1}
                className={`p-2 rounded-xl transition-colors disabled:opacity-30 ${
                  isLightUX
                    ? "text-slate-600 hover:text-slate-900 hover:bg-slate-200"
                    : "text-slate-400 hover:text-white hover:bg-white/10"
                }`}
              >
                <ChevronsLeft className="w-5 h-5" />
              </button>
            </Tooltip>

            <Tooltip content="Previous Move" description="Step back one ply" shortcut="←">
              <button
                onClick={handlePrev}
                disabled={historyIndex === -1}
                className={`p-2 rounded-xl transition-colors disabled:opacity-30 ${
                  isLightUX
                    ? "text-slate-600 hover:text-slate-900 hover:bg-slate-200"
                    : "text-slate-400 hover:text-white hover:bg-white/10"
                }`}
              >
                <ChevronLeft className="w-5 h-5" />
              </button>
            </Tooltip>

            <Tooltip
              content={isPlaying ? "Pause Auto-Play" : "Play Moves"}
              description="Step through moves automatically"
              shortcut="Space"
            >
              <button
                onClick={toggleAutoPlay}
                className="p-2 text-emerald-500 hover:text-emerald-400 rounded-xl hover:bg-emerald-500/10 transition-colors"
              >
                {isPlaying ? <Pause className="w-5 h-5" /> : <Play className="w-5 h-5" />}
              </button>
            </Tooltip>

            <Tooltip content="Next Move" description="Step forward one ply" shortcut="→">
              <button
                onClick={handleNext}
                disabled={historyIndex >= history.length - 1}
                className={`p-2 rounded-xl transition-colors disabled:opacity-30 ${
                  isLightUX
                    ? "text-slate-600 hover:text-slate-900 hover:bg-slate-200"
                    : "text-slate-400 hover:text-white hover:bg-white/10"
                }`}
              >
                <ChevronRight className="w-5 h-5" />
              </button>
            </Tooltip>

            <Tooltip content="Last Move" description="Jump to final position" shortcut="End">
              <button
                onClick={handleLast}
                disabled={historyIndex >= history.length - 1}
                className={`p-2 rounded-xl transition-colors disabled:opacity-30 ${
                  isLightUX
                    ? "text-slate-600 hover:text-slate-900 hover:bg-slate-200"
                    : "text-slate-400 hover:text-white hover:bg-white/10"
                }`}
              >
                <ChevronsRight className="w-5 h-5" />
              </button>
            </Tooltip>
          </div>

          <div
            className={`font-mono text-xs px-3 py-1.5 rounded-xl border ${
              isLightUX
                ? "bg-white text-slate-700 border-slate-200"
                : "bg-black/30 text-slate-300 border-white/10"
            }`}
          >
            Ply {historyIndex + 1} / {history.length}
          </div>

          <div className="flex items-center gap-1.5">
            <Tooltip content="Flip Board Orientation" description="Switch view between White and Black" shortcut="F">
              <button
                onClick={handleFlip}
                className={`p-2 rounded-xl transition-colors ${
                  isLightUX
                    ? "text-slate-600 hover:text-slate-900 hover:bg-slate-200"
                    : "text-slate-400 hover:text-white hover:bg-white/10"
                }`}
              >
                <ArrowUpDown className="w-4 h-4" />
              </button>
            </Tooltip>

            <Tooltip content="Copy FEN String" description="Copy current position FEN to clipboard">
              <button
                onClick={handleCopyFen}
                className={`p-2 rounded-xl transition-colors ${
                  isLightUX
                    ? "text-slate-600 hover:text-slate-900 hover:bg-slate-200"
                    : "text-slate-400 hover:text-white hover:bg-white/10"
                }`}
              >
                {copiedType === "fen" ? (
                  <Check className="w-4 h-4 text-emerald-500" />
                ) : (
                  <Copy className="w-4 h-4" />
                )}
              </button>
            </Tooltip>

            <Tooltip content="Reset Game Position" description="Reload game from start">
              <button
                onClick={handleFirst}
                className={`p-2 rounded-xl transition-colors ${
                  isLightUX
                    ? "text-slate-600 hover:text-rose-600 hover:bg-slate-200"
                    : "text-slate-400 hover:text-rose-400 hover:bg-white/10"
                }`}
              >
                <RotateCcw className="w-4 h-4" />
              </button>
            </Tooltip>
          </div>
        </div>
      </div>

      {/* Move Notation Table */}
      <div
        className={`w-full lg:w-72 flex-shrink-0 rounded-3xl shadow-2xl border flex flex-col overflow-hidden ${uxTheme.panel} ${uxTheme.border}`}
      >
        <div
          className={`px-4 py-3 border-b flex items-center justify-between ${
            isLightUX ? "bg-slate-50 border-slate-200" : "bg-black/40 border-white/10"
          }`}
        >
          <span
            className={`text-xs font-bold uppercase tracking-wider ${
              isLightUX ? "text-slate-700" : "text-slate-300"
            }`}
          >
            Move Notation
          </span>
          <Tooltip content="Copy entire PGN notation">
            <button
              onClick={handleCopyPgn}
              className="text-[11px] font-mono text-emerald-500 hover:text-emerald-400 flex items-center gap-1 transition-colors font-semibold"
            >
              {copiedType === "pgn" ? <Check className="w-3 h-3 text-emerald-500" /> : <Copy className="w-3 h-3" />}
              Copy PGN
            </button>
          </Tooltip>
        </div>

        {/* Interactive Move List */}
        <div className="flex-grow overflow-y-auto p-2 space-y-0.5 font-mono text-xs">
          {movePairs.map((pair) => (
            <div
              key={pair.moveNum}
              className={`flex items-center rounded-lg px-2 py-1 transition-colors ${
                isLightUX ? "hover:bg-slate-100" : "hover:bg-white/5"
              }`}
            >
              <span className={`w-8 font-semibold ${isLightUX ? "text-slate-400" : "text-slate-500"}`}>
                {pair.moveNum}.
              </span>

              <button
                onClick={() => updateToMove(pair.whiteIdx)}
                className={`flex-1 text-left px-2 py-0.5 rounded-md transition-colors ${
                  historyIndex === pair.whiteIdx
                    ? "bg-emerald-500/20 text-emerald-600 dark:text-emerald-300 font-bold border border-emerald-500/40"
                    : isLightUX
                    ? "text-slate-800 hover:bg-slate-200"
                    : "text-slate-200 hover:bg-white/10"
                }`}
              >
                {pair.white}
              </button>

              {pair.black && (
                <button
                  onClick={() => updateToMove(pair.blackIdx!)}
                  className={`flex-1 text-left px-2 py-0.5 rounded-md transition-colors ${
                    historyIndex === pair.blackIdx
                      ? "bg-emerald-500/20 text-emerald-600 dark:text-emerald-300 font-bold border border-emerald-500/40"
                      : isLightUX
                      ? "text-slate-800 hover:bg-slate-200"
                      : "text-slate-200 hover:bg-white/10"
                  }`}
                >
                  {pair.black}
                </button>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
