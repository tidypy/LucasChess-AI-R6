import { useState } from "react";
import { Chess } from "chess.js";
import { Chessboard } from "react-chessboard";
import { UXTheme, BoardTheme } from "../../lib/theme";
import { useClickLogger } from "../../lib/clickLogger";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { fetchDatabases, API_BASE } from "../../lib/api";
import { AskGrandmasterAction } from "../ai_grandmaster/AskGrandmasterAction";
import {
  Swords,
  RotateCcw,
  Play,
  Sliders,
  ArrowUpDown,
  BookOpen,
  Save,
  Trophy,
  Download,
  CheckCircle2,
  RefreshCw,
} from "lucide-react";

interface SparViewProps {
  uxTheme: UXTheme;
  boardTheme: BoardTheme;
}

const ENGINES = [
  { id: "stockfish", name: "Stockfish 17", elo: "3500+", style: "Ultimate Tactical Precision", icon: "🤖" },
  { id: "maia1500", name: "Maia 1500", elo: "1500", style: "Human-like Neural Play", icon: "🧠" },
  { id: "maia1900", name: "Maia 1900", elo: "1900", style: "Club Master Simulation", icon: "🎯" },
  { id: "rodent", name: "Rodent IV", elo: "2200", style: "Aggressive Personality", icon: "🐭" },
  { id: "ct800", name: "CT800", elo: "1850", style: "Positional Classicist", icon: "🛡️" },
  { id: "patricia", name: "Patricia 3", elo: "2800", style: "Sharp Alpha-Beta Tactical", icon: "⚡" },
];

const OPENING_BOOKS = [
  { id: "gm", name: "GMopenings.bin", desc: "Top Grandmaster tournament theory (20+ plies)" },
  { id: "sicilian", name: "Sicilian_Master.bin", desc: "1.e4 c5 Open & Closed variations" },
  { id: "italian", name: "Italian_Theory.bin", desc: "Giuoco Piano, Two Knights & Evans Gambit" },
  { id: "french", name: "French_Defense.bin", desc: "Winawer, Classical & Advance systems" },
  { id: "none", name: "No Book (Engine Scratch)", desc: "Calculates every move from scratch" },
];

export function SparView({ boardTheme }: SparViewProps) {
  const { logAction } = useClickLogger();
  const queryClient = useQueryClient();

  const [game, setGame] = useState(new Chess());
  const [fen, setFen] = useState(game.fen());
  const [selectedEngine, setSelectedEngine] = useState("maia1500");
  const [selectedBook, setSelectedBook] = useState("gm");
  const [playerSide, setPlayerSide] = useState<"white" | "black">("white");
  const [targetElo, setTargetElo] = useState(1600);
  const [isGameActive, setIsGameActive] = useState(false);
  const [moveHistory, setMoveHistory] = useState<string[]>([]);
  const [evalScore, setEvalScore] = useState("+0.00");
  const [saveSuccessMsg, setSaveSuccessMsg] = useState<string | null>(null);

  const { data: databases } = useQuery({
    queryKey: ["databases"],
    queryFn: fetchDatabases,
  });

  const currentEngineObj = ENGINES.find((e) => e.id === selectedEngine) || ENGINES[0];

  const isCheckmate = game.isCheckmate();
  const isDraw = game.isDraw();
  const isStalemate = game.isStalemate();
  const isThreefold = game.isThreefoldRepetition();
  const isGameOver = game.isGameOver();

  const getWinnerDescription = () => {
    if (isCheckmate) {
      const winnerColor = game.turn() === "w" ? "Black" : "White";
      const isPlayerWinner =
        (winnerColor === "White" && playerSide === "white") ||
        (winnerColor === "Black" && playerSide === "black");
      return {
        title: "CHECKMATE!",
        subtitle: isPlayerWinner
          ? `Victory! You defeated ${currentEngineObj.name} by checkmate!`
          : `${currentEngineObj.name} won by checkmate.`,
        isWin: isPlayerWinner,
      };
    }
    if (isStalemate) return { title: "DRAW (Stalemate)", subtitle: "The game ended in a stalemate.", isWin: false };
    if (isThreefold) return { title: "DRAW (3-Fold Repetition)", subtitle: "Position repeated 3 times.", isWin: false };
    if (isDraw) return { title: "DRAW", subtitle: "Game drawn by chess rules.", isWin: false };
    return null;
  };

  const gameOverInfo = getWinnerDescription();

  const generatePgn = () => {
    const dateStr = new Date().toISOString().split("T")[0].replace(/-/g, ".");
    const resultStr = isCheckmate ? (game.turn() === "w" ? "0-1" : "1-0") : isDraw ? "1/2-1/2" : "*";
    const whiteName = playerSide === "white" ? "Player (Human)" : `${currentEngineObj.name} (${targetElo})`;
    const blackName = playerSide === "black" ? "Player (Human)" : `${currentEngineObj.name} (${targetElo})`;

    return `[Event "DeepScout Engine Sparring"]
[Site "Local Chess Studio"]
[Date "${dateStr}"]
[Round "1"]
[White "${whiteName}"]
[Black "${blackName}"]
[Result "${resultStr}"]
[WhiteElo "${playerSide === "white" ? 1800 : targetElo}"]
[BlackElo "${playerSide === "black" ? 1800 : targetElo}"]
[ECO "—"]
[Opening "${selectedBook}"]

${game.pgn()}`;
  };

  const saveMutation = useMutation({
    mutationFn: async () => {
      const pgnText = generatePgn();
      const targetDb = databases && databases.length > 0 ? databases[0].name : "patriciaTourny.lcdb";
      const res = await fetch(`${API_BASE}/databases/import`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pgn_text: pgnText, db_name: targetDb }),
      });
      if (!res.ok) throw new Error("Failed to save sparring game");
      return res.json();
    },
    onSuccess: () => {
      setSaveSuccessMsg("Game saved to active database!");
      logAction("API", "Saved Sparring Game to Database");
      queryClient.invalidateQueries({ queryKey: ["databases"] });
      queryClient.invalidateQueries({ queryKey: ["browserGames"] });
      setTimeout(() => setSaveSuccessMsg(null), 3000);
    },
  });

  const handleDownloadPgn = () => {
    const pgn = generatePgn();
    const blob = new Blob([pgn], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `Sparring_${currentEngineObj.name}_${Date.now()}.pgn`;
    link.click();
    URL.revokeObjectURL(url);
    logAction("CLICK", "Exported Sparring Game PGN");
  };

  const handleStartGame = () => {
    const newG = new Chess();
    setGame(newG);
    setFen(newG.fen());
    setMoveHistory([]);
    setIsGameActive(true);
    setEvalScore("+0.00");
    setSaveSuccessMsg(null);
    logAction(
      "CLICK",
      `Started Sparring Game vs ${currentEngineObj.name}`,
      `Side: ${playerSide}, Elo: ${targetElo}, Book: ${selectedBook}`
    );
  };

  const handleResetGame = () => {
    const newG = new Chess();
    setGame(newG);
    setFen(newG.fen());
    setMoveHistory([]);
    setIsGameActive(false);
    setEvalScore("+0.00");
    setSaveSuccessMsg(null);
    logAction("CLICK", "Reset Sparring Arena");
  };

  const handlePieceDrop = ({ sourceSquare, targetSquare }: { piece: any; sourceSquare: string; targetSquare: string | null }): boolean => {
    if (!targetSquare || isGameOver) return false;
    try {
      const move = game.move({
        from: sourceSquare,
        to: targetSquare,
        promotion: "q",
      });

      if (move === null) return false;

      const newFen = game.fen();
      setFen(newFen);
      setMoveHistory(game.history());
      logAction("BOARD", `Player Move: ${move.san}`, `FEN: ${newFen}`);

      // Simulate instant sparring engine response
      setTimeout(() => {
        if (!game.isGameOver()) {
          const possibleMoves = game.moves();
          if (possibleMoves.length > 0) {
            const randomMove = possibleMoves[Math.floor(Math.random() * possibleMoves.length)];
            game.move(randomMove);
            setFen(game.fen());
            setMoveHistory(game.history());
            logAction("BOARD", `Engine (${currentEngineObj.name}) Move: ${randomMove}`);
          }
        }
      }, 500);

      return true;
    } catch {
      return false;
    }
  };

  return (
    <div className="flex flex-col gap-6 max-w-7xl mx-auto pb-12 select-none animate-in fade-in duration-200 font-sans">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
        <div>
          <div className="text-[10px] font-mono uppercase tracking-widest text-rose-400 font-bold mb-1 flex items-center gap-1.5">
            <Swords className="w-3.5 h-3.5" />
            Engine Sparring Arena &amp; Tactical Practice
          </div>
          <h1 className="text-3xl font-extrabold tracking-tight text-white flex items-center gap-3">
            Spar Against Engine
            <span className="text-xs font-mono font-normal text-slate-400">
              — Train openings, human-like neural bots (Maia), and Elo-scaled sparring
            </span>
          </h1>
        </div>

        {/* Engine Match Badge */}
        <div className="flex items-center gap-3">
          <div className="px-3.5 py-1.5 rounded-2xl bg-black/40 border border-slate-800 flex items-center gap-2 shadow-sm font-mono text-xs">
            <span className="text-lg">{currentEngineObj.icon}</span>
            <span className="text-slate-200 font-bold">{currentEngineObj.name}</span>
            <span className="text-slate-500">|</span>
            <span className="text-rose-400 font-bold">Elo {targetElo}</span>
          </div>
        </div>
      </div>

      {/* Main Grid: Board + Match Config / Moves */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* Left: Chessboard (7 cols) */}
        <div className="lg:col-span-7 flex flex-col items-center p-6 rounded-3xl bg-[#14171c] border border-slate-800 shadow-2xl space-y-4">
          {/* Game Over Banner (Checkmate / Draw) */}
          {gameOverInfo && (
            <div className={`w-full max-w-[480px] p-4 rounded-2xl border shadow-xl animate-in zoom-in-95 duration-200 flex items-center justify-between gap-3 ${
              gameOverInfo.isWin
                ? "bg-emerald-950/70 border-emerald-500/50 text-emerald-200"
                : isCheckmate
                ? "bg-rose-950/70 border-rose-500/50 text-rose-200"
                : "bg-amber-950/70 border-amber-500/50 text-amber-200"
            }`}>
              <div className="flex items-center gap-3">
                <div className={`p-2.5 rounded-xl ${gameOverInfo.isWin ? "bg-emerald-500/20 text-emerald-400" : "bg-rose-500/20 text-rose-400"}`}>
                  <Trophy className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="font-extrabold text-sm font-mono tracking-wider">{gameOverInfo.title}</h3>
                  <p className="text-xs opacity-90">{gameOverInfo.subtitle}</p>
                </div>
              </div>

              <div className="flex items-center gap-1.5">
                <button
                  onClick={() => saveMutation.mutate()}
                  disabled={saveMutation.isPending}
                  className="px-3 py-1.5 bg-white/10 hover:bg-white/20 rounded-xl text-xs font-bold transition-all flex items-center gap-1 cursor-pointer"
                  title="Save Game to Active Database"
                >
                  {saveMutation.isPending ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
                  Save
                </button>
              </div>
            </div>
          )}

          {saveSuccessMsg && (
            <div className="w-full max-w-[480px] p-2.5 rounded-xl bg-emerald-500/20 border border-emerald-500/30 text-emerald-300 text-xs font-mono font-bold flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4" />
              {saveSuccessMsg}
            </div>
          )}

          <div className="w-full max-w-[480px] aspect-square rounded-2xl overflow-hidden shadow-2xl border border-slate-700">
            <Chessboard
              options={{
                position: fen,
                boardOrientation: playerSide,
                onPieceDrop: handlePieceDrop,
                darkSquareStyle: { backgroundColor: boardTheme?.boardDark || "#4a7c59" },
                lightSquareStyle: { backgroundColor: boardTheme?.boardLight || "#eae5c9" },
              }}
            />
          </div>

          {/* Controls Bar */}
          <div className="w-full max-w-[480px] flex items-center justify-between gap-2 pt-2">
            {!isGameActive ? (
              <button
                onClick={handleStartGame}
                className="flex-1 py-2.5 bg-rose-600 hover:bg-rose-500 text-white text-xs font-bold rounded-xl shadow-lg transition-all flex items-center justify-center gap-2 cursor-pointer"
              >
                <Play className="w-4 h-4" />
                Start Sparring Match
              </button>
            ) : (
              <button
                onClick={handleResetGame}
                className="flex-1 py-2.5 bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-bold rounded-xl border border-slate-700 transition-all flex items-center justify-center gap-2 cursor-pointer"
              >
                <RotateCcw className="w-4 h-4" />
                {isGameOver ? "New Match" : "Resign & New Game"}
              </button>
            )}

            {/* Save Game Button */}
            {moveHistory.length > 0 && (
              <button
                onClick={() => saveMutation.mutate()}
                disabled={saveMutation.isPending}
                className="px-3 py-2.5 bg-slate-800 hover:bg-slate-700 text-slate-200 hover:text-white rounded-xl border border-white/10 text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
                title="Save Game to Shelf Database"
              >
                <Save className="w-4 h-4 text-emerald-400" />
                Save
              </button>
            )}

            {/* Export PGN Button */}
            {moveHistory.length > 0 && (
              <button
                onClick={handleDownloadPgn}
                className="px-3 py-2.5 bg-slate-800 hover:bg-slate-700 text-slate-200 hover:text-white rounded-xl border border-white/10 text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer"
                title="Download PGN File"
              >
                <Download className="w-4 h-4 text-blue-400" />
                PGN
              </button>
            )}

            <button
              onClick={() => {
                const next = playerSide === "white" ? "black" : "white";
                setPlayerSide(next);
                logAction("BOARD", `Flipped spar orientation to ${next}`);
              }}
              className="p-2.5 rounded-xl bg-black/40 border border-white/10 text-slate-300 hover:text-white transition-colors"
              title="Flip Board"
            >
              <ArrowUpDown className="w-4 h-4" />
            </button>
          </div>

          {/* Ask Grandmaster Integration */}
          <div className="w-full max-w-[480px]">
            <AskGrandmasterAction
              fen={fen}
              evalStr={evalScore}
              mainLine={moveHistory.slice(-3).join(" ")}
              contextNotes={`Sparring vs ${currentEngineObj.name} (${targetElo} Elo)`}
              variant="banner"
            />
          </div>
        </div>

        {/* Right: Engine Parameters & Move Log (5 cols) */}
        <div className="lg:col-span-5 space-y-6">
          {/* Match Configuration */}
          <div className="p-6 rounded-3xl bg-[#14171c] border border-slate-800 shadow-xl space-y-5">
            <h2 className="text-xs font-bold uppercase tracking-wider text-slate-200 flex items-center gap-2 border-b border-white/5 pb-3">
              <Sliders className="w-4 h-4 text-rose-400" />
              Opponent &amp; Arena Setup
            </h2>

            {/* Select Engine */}
            <div className="space-y-2">
              <label className="text-xs font-semibold text-slate-300 block">Sparring Engine:</label>
              <div className="grid grid-cols-2 gap-2">
                {ENGINES.map((eng) => (
                  <button
                    key={eng.id}
                    onClick={() => {
                      setSelectedEngine(eng.id);
                      logAction("CLICK", `Selected sparring engine: ${eng.name}`);
                    }}
                    className={`p-2.5 rounded-xl text-left border text-xs font-sans transition-all flex items-center gap-2 ${
                      selectedEngine === eng.id
                        ? "bg-rose-500/15 border-rose-500/40 text-white font-bold shadow-sm"
                        : "bg-black/30 border-white/5 text-slate-400 hover:bg-white/5"
                    }`}
                  >
                    <span>{eng.icon}</span>
                    <div className="truncate">
                      <span className="block truncate">{eng.name}</span>
                      <span className="text-[10px] opacity-60 font-mono">{eng.elo}</span>
                    </div>
                  </button>
                ))}
              </div>
            </div>

            {/* Elo Slider */}
            <div className="space-y-1.5 pt-1">
              <div className="flex justify-between text-xs font-mono">
                <span className="text-slate-400">Target Strength / Elo:</span>
                <span className="text-rose-400 font-bold">{targetElo} Elo</span>
              </div>
              <input
                type="range"
                min="800"
                max="2800"
                step="50"
                value={targetElo}
                onChange={(e) => setTargetElo(Number(e.target.value))}
                className="w-full accent-rose-500 cursor-pointer"
              />
              <div className="flex justify-between text-[10px] font-mono text-slate-500">
                <span>Beginner (800)</span>
                <span>Club (1600)</span>
                <span>Grandmaster (2800)</span>
              </div>
            </div>

            {/* Opening Book Selection */}
            <div className="space-y-1.5 pt-1">
              <label className="text-xs font-semibold text-slate-300 block flex items-center gap-1.5">
                <BookOpen className="w-3.5 h-3.5 text-purple-400" />
                Opening Book (Polyglot .bin):
              </label>
              <select
                value={selectedBook}
                onChange={(e) => setSelectedBook(e.target.value)}
                className="w-full bg-black/40 border border-white/10 rounded-xl px-3 py-2 text-xs font-mono text-slate-200 outline-none cursor-pointer focus:border-rose-500"
              >
                {OPENING_BOOKS.map((b) => (
                  <option key={b.id} value={b.id} className="bg-slate-900 text-white">
                    {b.name} — {b.desc}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Move Log History */}
          <div className="p-6 rounded-3xl bg-[#14171c] border border-slate-800 shadow-xl space-y-3">
            <h3 className="text-xs font-bold uppercase tracking-wider text-slate-200 flex items-center justify-between border-b border-white/5 pb-2">
              <span>Move History</span>
              <span className="font-mono text-[10px] text-slate-500">{moveHistory.length} plies</span>
            </h3>

            <div className="h-40 overflow-y-auto font-mono text-xs space-y-1 p-2 bg-black/30 rounded-xl border border-white/5">
              {moveHistory.length === 0 ? (
                <div className="text-slate-500 italic text-center py-8 text-xs">
                  Moves will appear here as the sparring match progresses.
                </div>
              ) : (
                <div className="grid grid-cols-2 gap-x-4 gap-y-1">
                  {moveHistory.map((m, i) => (
                    <div key={i} className="flex items-center gap-2">
                      <span className="text-slate-500 text-[10px] w-6">{Math.floor(i / 2) + 1}{i % 2 === 0 ? "." : "..."}</span>
                      <span className={i % 2 === 0 ? "text-slate-200 font-bold" : "text-rose-400 font-bold"}>
                        {m}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
