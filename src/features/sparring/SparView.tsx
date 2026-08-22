import { useState } from "react";
import { Chess } from "chess.js";
import { Chessboard } from "react-chessboard";
import { UXTheme, BoardTheme } from "../../lib/theme";
import { useClickLogger } from "../../lib/clickLogger";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  fetchEngineList,
  fetchEnginePlay,
  testUciEngine,
  registerCustomEngine,
  removeCustomEngine,
  importPgn,
  EngineInfo,
} from "../../lib/api";
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
  Cpu,
  Plus,
  Trash2,
  ShieldAlert,
  X,
} from "lucide-react";

interface SparViewProps {
  uxTheme: UXTheme;
  boardTheme: BoardTheme;
}

const DEFAULT_ENGINES: EngineInfo[] = [
  { id: "stockfish", name: "Stockfish 18", elo: "3500+", style: "Ultimate Tactical Precision & Elo Scale", icon: "🤖" },
  { id: "patricia", name: "Patricia 4", elo: "2800", style: "Sharp Alpha-Beta Tactical", icon: "⚡" },
  { id: "ct800", name: "CT800", elo: "1850", style: "Positional Classicist", icon: "🛡️" },
  { id: "maia1500", name: "Maia 1500", elo: "1500", style: "Human-like Neural Play", icon: "🧠" },
  { id: "maia1900", name: "Maia 1900", elo: "1900", style: "Club Master Simulation", icon: "🎯" },
];

const OPENING_BOOKS = [
  { id: "gm", name: "GMopenings.bin", desc: "Top Grandmaster tournament theory (20+ plies)" },
  { id: "sicilian", name: "Sicilian_Master.bin", desc: "1.e4 c5 Open & Closed variations" },
  { id: "italian", name: "Italian_Theory.bin", desc: "Giuoco Piano, Two Knights & Evans Gambit" },
  { id: "french", name: "French_Defense.bin", desc: "Winawer, Classical & Advance systems" },
  { id: "none", name: "No Book (Engine Scratch)", desc: "Calculates every move from scratch" },
];

const SPARRING_DB_NAME = "Sparring_Games.lcdb";

export function SparView({ uxTheme, boardTheme }: SparViewProps) {
  const { logAction } = useClickLogger();
  const queryClient = useQueryClient();
  const isLight = uxTheme?.mode === "light" || uxTheme?.id === "clean-light";

  const [game, setGame] = useState(new Chess());
  const [fen, setFen] = useState(game.fen());
  const [selectedEngine, setSelectedEngine] = useState("stockfish");
  const [selectedBook, setSelectedBook] = useState("gm");
  const [playerSide, setPlayerSide] = useState<"white" | "black">("white");
  const [targetElo, setTargetElo] = useState(1600);
  const [isGameActive, setIsGameActive] = useState(false);
  const [isEngineThinking, setIsEngineThinking] = useState(false);
  const [moveHistory, setMoveHistory] = useState<string[]>([]);
  const [evalScore, setEvalScore] = useState("+0.00");
  const [saveSuccessMsg, setSaveSuccessMsg] = useState<string | null>(null);
  const [autosaveAlert, setAutosaveAlert] = useState<string | null>(null);

  // Custom Engine Modal State
  const [isAddEngineModalOpen, setIsAddEngineModalOpen] = useState(false);
  const [newEnginePath, setNewEnginePath] = useState("");
  const [newEngineName, setNewEngineName] = useState("");
  const [newEngineElo, setNewEngineElo] = useState("2400");
  const [newEngineStyle, setNewEngineStyle] = useState("Custom Tactical Engine");
  const [newEngineIcon, setNewEngineIcon] = useState("⚔️");
  const [isTestingUci, setIsTestingUci] = useState(false);
  const [uciTestResult, setUciTestResult] = useState<any>(null);
  const [uciTestError, setUciTestError] = useState<string | null>(null);

  // Query Engine List
  const { data: enginesData } = useQuery({
    queryKey: ["engines"],
    queryFn: fetchEngineList,
    initialData: DEFAULT_ENGINES,
  });

  const engines = enginesData || DEFAULT_ENGINES;
  const currentEngineObj = engines.find((e) => e.id === selectedEngine) || engines[0] || DEFAULT_ENGINES[0];

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

  // Background Autosave to Sparring_Games.lcdb
  const autoSaveGame = async () => {
    if (moveHistory.length === 0) return;
    try {
      const pgnText = generatePgn();
      await importPgn(pgnText, SPARRING_DB_NAME);
      setAutosaveAlert(`Autosaved to ${SPARRING_DB_NAME}`);
      logAction("API", `Autosaved Sparring Game to ${SPARRING_DB_NAME}`);
      queryClient.invalidateQueries({ queryKey: ["databases"] });
      queryClient.invalidateQueries({ queryKey: ["browserGames"] });
      setTimeout(() => setAutosaveAlert(null), 4000);
    } catch (err: any) {
      logAction("ERROR", `Sparring autosave failed: ${err.message}`);
    }
  };

  const saveMutation = useMutation({
    mutationFn: async () => {
      const pgnText = generatePgn();
      return importPgn(pgnText, SPARRING_DB_NAME);
    },
    onSuccess: (data) => {
      setSaveSuccessMsg(`Saved game to ${SPARRING_DB_NAME} (${data.imported_count} record)!`);
      logAction("API", `Manually Saved Sparring Game to ${SPARRING_DB_NAME}`);
      queryClient.invalidateQueries({ queryKey: ["databases"] });
      queryClient.invalidateQueries({ queryKey: ["browserGames"] });
      setTimeout(() => setSaveSuccessMsg(null), 4000);
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

  // Trigger Engine Move using modern UCI
  const triggerEngineMove = async (currentFen: string) => {
    if (game.isGameOver()) return;
    setIsEngineThinking(true);
    try {
      const response = await fetchEnginePlay({
        fen: currentFen,
        engine_id: selectedEngine,
        elo: targetElo,
        time_limit_ms: 450,
      });

      if (response && response.best_move_san) {
        game.move(response.best_move_san);
        const newFen = game.fen();
        setFen(newFen);
        const nextMoves = game.history();
        setMoveHistory(nextMoves);
        if (response.eval_score) setEvalScore(response.eval_score);
        logAction("BOARD", `Engine (${currentEngineObj.name}) Move: ${response.best_move_san}`, `Eval: ${response.eval_score}, Depth: ${response.depth}`);

        // Check if move finished the game -> autosave
        if (game.isGameOver()) {
          autoSaveGame();
        }
      } else if (response && response.best_move_uci) {
        game.move({
          from: response.from_square,
          to: response.to_square,
          promotion: "q",
        });
        const newFen = game.fen();
        setFen(newFen);
        setMoveHistory(game.history());
        if (response.eval_score) setEvalScore(response.eval_score);
        if (game.isGameOver()) {
          autoSaveGame();
        }
      }
    } catch (err: any) {
      logAction("ERROR", `UCI Engine move failed: ${err.message}`);
    } finally {
      setIsEngineThinking(false);
    }
  };

  const handleStartGame = () => {
    const newG = new Chess();
    setGame(newG);
    setFen(newG.fen());
    setMoveHistory([]);
    setIsGameActive(true);
    setEvalScore("+0.00");
    setSaveSuccessMsg(null);
    setAutosaveAlert(null);
    logAction(
      "CLICK",
      `Started UCI Sparring Game vs ${currentEngineObj.name}`,
      `Side: ${playerSide}, Elo: ${targetElo}, Engine: ${selectedEngine}`
    );

    if (playerSide === "black") {
      triggerEngineMove(newG.fen());
    }
  };

  const handleResetGame = () => {
    // Autosave in-progress match before resetting if plies exist
    if (isGameActive && moveHistory.length > 0) {
      autoSaveGame();
    }
    const newG = new Chess();
    setGame(newG);
    setFen(newG.fen());
    setMoveHistory([]);
    setIsGameActive(false);
    setIsEngineThinking(false);
    setEvalScore("+0.00");
    setSaveSuccessMsg(null);
    logAction("CLICK", "Reset Sparring Arena (Autosaved prior match)");
  };

  const handlePieceDrop = ({ sourceSquare, targetSquare }: { piece: any; sourceSquare: string; targetSquare: string | null }): boolean => {
    if (!targetSquare || isGameOver || isEngineThinking) return false;
    try {
      const move = game.move({
        from: sourceSquare,
        to: targetSquare,
        promotion: "q",
      });

      if (move === null) return false;

      const newFen = game.fen();
      setFen(newFen);
      const nextMoves = game.history();
      setMoveHistory(nextMoves);
      logAction("BOARD", `Player Move: ${move.san}`, `FEN: ${newFen}`);

      if (game.isGameOver()) {
        autoSaveGame();
      } else {
        triggerEngineMove(newFen);
      }

      return true;
    } catch {
      return false;
    }
  };

  // Custom Engine Actions
  const handleTestUci = async () => {
    if (!newEnginePath.trim()) return;
    setIsTestingUci(true);
    setUciTestError(null);
    setUciTestResult(null);
    try {
      const res = await testUciEngine(newEnginePath);
      setUciTestResult(res);
      if (!newEngineName.trim() && res.name) {
        setNewEngineName(res.name);
      }
    } catch (err: any) {
      setUciTestError(err.message || "Failed to establish UCI handshake");
    } finally {
      setIsTestingUci(false);
    }
  };

  const handleRegisterEngine = async () => {
    if (!newEnginePath.trim() || !newEngineName.trim()) return;
    try {
      const registered = await registerCustomEngine({
        name: newEngineName,
        path: newEnginePath,
        elo: newEngineElo,
        style: newEngineStyle,
        icon: newEngineIcon,
      });
      await queryClient.invalidateQueries({ queryKey: ["engines"] });
      setSelectedEngine(registered.id);
      setIsAddEngineModalOpen(false);
      setNewEnginePath("");
      setNewEngineName("");
      setUciTestResult(null);
      setSaveSuccessMsg(`Registered custom engine: ${registered.name}!`);
      logAction("API", `Registered custom UCI engine ${registered.name}`);
    } catch (err: any) {
      setUciTestError(err.message || "Registration failed");
    }
  };

  const handleDeleteEngine = async (engineId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      await removeCustomEngine(engineId);
      await queryClient.invalidateQueries({ queryKey: ["engines"] });
      if (selectedEngine === engineId) {
        setSelectedEngine("stockfish");
      }
      logAction("API", `Removed custom engine ${engineId}`);
    } catch (err: any) {
      logAction("ERROR", `Failed to remove custom engine: ${err.message}`);
    }
  };

  return (
    <div className="flex flex-col gap-6 max-w-7xl mx-auto pb-12 select-none animate-in fade-in duration-200 font-sans">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
        <div>
          <div className="text-[10px] font-mono uppercase tracking-widest text-rose-500 font-bold mb-1 flex items-center gap-1.5">
            <Swords className="w-3.5 h-3.5" />
            Engine Sparring Arena &amp; Tactical Practice
          </div>
          <h1 className={`text-3xl font-extrabold tracking-tight ${isLight ? "text-slate-900" : "text-white"} flex items-center gap-3`}>
            Spar Against Engine
            <span className={`text-xs font-mono font-normal ${isLight ? "text-slate-500" : "text-slate-400"}`}>
              — Train openings, custom UCI bots, and Elo-scaled sparring (Autosaves to {SPARRING_DB_NAME})
            </span>
          </h1>
        </div>

        {/* Engine Match Badge & Autosave Status */}
        <div className="flex items-center gap-3">
          {autosaveAlert && (
            <div className="px-3 py-1.5 rounded-2xl bg-emerald-500/20 border border-emerald-500/40 text-emerald-300 text-xs font-mono font-bold flex items-center gap-1.5 animate-bounce">
              <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
              {autosaveAlert}
            </div>
          )}

          <div className={`px-3.5 py-1.5 rounded-2xl ${isLight ? "bg-white border-slate-200 text-slate-800" : "bg-black/40 border-slate-800 text-slate-200"} border flex items-center gap-2 shadow-sm font-mono text-xs`}>
            <span className="text-lg">{currentEngineObj.icon}</span>
            <span className="font-bold">{currentEngineObj.name}</span>
            <span className="opacity-40">|</span>
            <span className="text-rose-500 font-bold">Elo {targetElo}</span>
          </div>
        </div>
      </div>

      {/* Main Grid: Board + Match Config / Moves */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* Left: Chessboard (7 cols) */}
        <div className={`lg:col-span-7 flex flex-col items-center p-6 rounded-3xl ${isLight ? "bg-white border-slate-200 text-slate-900 shadow-md" : "bg-[#14171c] border-slate-800 text-white shadow-2xl"} border space-y-4`}>
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
                  title={`Save Game to ${SPARRING_DB_NAME}`}
                >
                  {saveMutation.isPending ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
                  Save
                </button>
              </div>
            </div>
          )}

          {saveSuccessMsg && (
            <div className="w-full max-w-[480px] p-2.5 rounded-xl bg-emerald-500/20 border border-emerald-500/30 text-emerald-300 text-xs font-mono font-bold flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 text-emerald-400" />
              {saveSuccessMsg}
            </div>
          )}

          {isEngineThinking && (
            <div className="w-full max-w-[480px] p-2 rounded-xl bg-blue-500/15 border border-blue-500/30 text-blue-300 text-xs font-mono font-semibold flex items-center justify-between animate-pulse shadow-sm">
              <div className="flex items-center gap-2">
                <Cpu className="w-3.5 h-3.5 text-blue-400 animate-spin" />
                <span>{currentEngineObj.name} thinking...</span>
              </div>
              <span className="text-[10px] text-blue-400 font-mono">UCI Elo {targetElo}</span>
            </div>
          )}

          <div className="w-full max-w-[480px] aspect-square rounded-2xl overflow-hidden shadow-2xl border border-slate-700 relative">
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
                title={`Save Game to ${SPARRING_DB_NAME}`}
              >
                {saveMutation.isPending ? <RefreshCw className="w-4 h-4 text-emerald-400 animate-spin" /> : <Save className="w-4 h-4 text-emerald-400" />}
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

          {/* Target DB & Autosave Badge */}
          <div className="w-full max-w-[480px] flex items-center justify-between text-[11px] font-mono opacity-80 pt-1">
            <span className="text-slate-400">Database Destination:</span>
            <span className="text-emerald-400 font-bold flex items-center gap-1">
              <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
              {SPARRING_DB_NAME} (Autosaved)
            </span>
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
          <div className={`p-6 rounded-3xl ${isLight ? "bg-white border-slate-200 text-slate-900 shadow-lg" : "bg-[#14171c] border-slate-800 text-white shadow-xl"} border space-y-5`}>
            <div className="flex items-center justify-between border-b pb-3 border-white/5">
              <h2 className={`text-xs font-bold uppercase tracking-wider ${isLight ? "text-slate-800" : "text-slate-200"} flex items-center gap-2`}>
                <Sliders className="w-4 h-4 text-rose-500" />
                Opponent &amp; Arena Setup
              </h2>

              <button
                onClick={() => {
                  setIsAddEngineModalOpen(true);
                  logAction("CLICK", "Opened Add UCI Engine Modal");
                }}
                className="px-2.5 py-1 text-[11px] font-bold rounded-lg bg-rose-500/20 hover:bg-rose-500/30 text-rose-400 border border-rose-500/40 flex items-center gap-1 cursor-pointer transition-all"
              >
                <Plus className="w-3 h-3" />
                Add UCI Engine
              </button>
            </div>

            {/* Select Engine */}
            <div className="space-y-2">
              <label className={`text-xs font-semibold ${isLight ? "text-slate-700" : "text-slate-300"} block`}>
                Sparring Engine:
              </label>
              <div className="grid grid-cols-2 gap-2">
                {engines.map((eng) => (
                  <div
                    key={eng.id}
                    onClick={() => {
                      setSelectedEngine(eng.id);
                      logAction("CLICK", `Selected sparring engine: ${eng.name}`);
                    }}
                    className={`p-2.5 rounded-xl text-left border text-xs font-sans transition-all flex items-center justify-between cursor-pointer group ${
                      selectedEngine === eng.id
                        ? "bg-rose-500/15 border-rose-500/40 text-rose-600 dark:text-white font-bold shadow-sm"
                        : isLight
                        ? "bg-slate-50 border-slate-200 text-slate-600 hover:bg-slate-100"
                        : "bg-black/30 border-white/5 text-slate-400 hover:bg-white/5"
                    }`}
                  >
                    <div className="flex items-center gap-2 truncate">
                      <span>{eng.icon}</span>
                      <div className="truncate">
                        <span className="block truncate">{eng.name}</span>
                        <span className="text-[10px] opacity-60 font-mono">{eng.elo}</span>
                      </div>
                    </div>

                    {eng.is_custom && (
                      <button
                        onClick={(e) => handleDeleteEngine(eng.id, e)}
                        className="opacity-0 group-hover:opacity-100 text-slate-400 hover:text-rose-400 p-1 rounded transition-opacity"
                        title="Remove custom engine"
                      >
                        <Trash2 className="w-3 h-3" />
                      </button>
                    )}
                  </div>
                ))}
              </div>
            </div>

            {/* Elo Slider */}
            <div className="space-y-1.5 pt-1">
              <div className="flex justify-between text-xs font-mono">
                <span className={isLight ? "text-slate-600" : "text-slate-400"}>Target Strength / Elo:</span>
                <span className="text-rose-500 font-bold">{targetElo} Elo</span>
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
              <div className={`flex justify-between text-[10px] font-mono ${isLight ? "text-slate-400" : "text-slate-500"}`}>
                <span>Beginner (800)</span>
                <span>Club (1600)</span>
                <span>Grandmaster (2800)</span>
              </div>
            </div>

            {/* Opening Book Selection */}
            <div className="space-y-1.5 pt-1">
              <label className={`text-xs font-semibold ${isLight ? "text-slate-700" : "text-slate-300"} block flex items-center gap-1.5`}>
                <BookOpen className="w-3.5 h-3.5 text-purple-400" />
                Opening Book (Polyglot .bin):
              </label>
              <select
                value={selectedBook}
                onChange={(e) => setSelectedBook(e.target.value)}
                className={`w-full ${isLight ? "bg-slate-50 border-slate-200 text-slate-800" : "bg-black/40 border-white/10 text-slate-200"} border rounded-xl px-3 py-2 text-xs font-mono outline-none cursor-pointer focus:border-rose-500`}
              >
                {OPENING_BOOKS.map((b) => (
                  <option key={b.id} value={b.id} className={isLight ? "bg-white text-slate-900" : "bg-slate-900 text-white"}>
                    {b.name} — {b.desc}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Move Log History */}
          <div className={`p-6 rounded-3xl ${isLight ? "bg-white border-slate-200 text-slate-900 shadow-lg" : "bg-[#14171c] border-slate-800 text-white shadow-xl"} border space-y-3`}>
            <h3 className={`text-xs font-bold uppercase tracking-wider ${isLight ? "text-slate-800 border-slate-200" : "text-slate-200 border-white/5"} flex items-center justify-between border-b pb-2`}>
              <span>Move History</span>
              <span className={`font-mono text-[10px] ${isLight ? "text-slate-400" : "text-slate-500"}`}>{moveHistory.length} plies</span>
            </h3>

            <div className={`h-40 overflow-y-auto font-mono text-xs space-y-1 p-2 ${isLight ? "bg-slate-50 border-slate-200 text-slate-800" : "bg-black/30 border-white/5 text-slate-200"} rounded-xl border`}>
              {moveHistory.length === 0 ? (
                <div className="text-slate-400 italic text-center py-8 text-xs">
                  Moves will appear here as the sparring match progresses.
                </div>
              ) : (
                <div className="grid grid-cols-2 gap-x-4 gap-y-1">
                  {moveHistory.map((m, i) => (
                    <div key={i} className="flex items-center gap-2">
                      <span className="text-slate-500 text-[10px] w-6">{Math.floor(i / 2) + 1}{i % 2 === 0 ? "." : "..."}</span>
                      <span className="font-bold text-slate-200">{m}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Add UCI Engine Modal */}
      {isAddEngineModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4">
          <div className={`w-full max-w-lg rounded-3xl border shadow-2xl p-6 space-y-5 animate-in zoom-in-95 duration-150 ${isLight ? "bg-white border-slate-200 text-slate-900" : "bg-[#14171c] border-slate-800 text-white"}`}>
            <div className="flex items-center justify-between border-b border-white/10 pb-3">
              <div className="flex items-center gap-2">
                <Cpu className="w-5 h-5 text-rose-500" />
                <h3 className="font-bold text-base">Register Custom UCI Engine</h3>
              </div>
              <button
                onClick={() => setIsAddEngineModalOpen(false)}
                className="p-1 rounded-lg text-slate-400 hover:text-white transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="space-y-4 text-xs font-sans">
              {/* Path Input */}
              <div className="space-y-1.5">
                <label className="font-semibold block text-slate-300">
                  Executable Path (.exe or Linux binary):
                </label>
                <div className="flex gap-2">
                  <input
                    type="text"
                    placeholder="C:\Engines\Berserk\berserk.exe"
                    value={newEnginePath}
                    onChange={(e) => setNewEnginePath(e.target.value)}
                    className="flex-1 px-3 py-2 bg-black/40 border border-white/10 rounded-xl font-mono text-xs text-white outline-none focus:border-rose-500"
                  />
                  <button
                    onClick={handleTestUci}
                    disabled={isTestingUci || !newEnginePath.trim()}
                    className="px-3 py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-xl font-bold transition-colors flex items-center gap-1.5 disabled:opacity-50"
                  >
                    {isTestingUci ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Play className="w-3.5 h-3.5" />}
                    Test UCI
                  </button>
                </div>
              </div>

              {/* Test Output Banner */}
              {uciTestResult && (
                <div className="p-3 rounded-xl bg-emerald-500/10 border border-emerald-500/30 text-emerald-300 space-y-1 font-mono text-[11px]">
                  <div className="font-bold flex items-center gap-1 text-emerald-400">
                    <CheckCircle2 className="w-3.5 h-3.5" />
                    UCI Handshake Verified: {uciTestResult.name}
                  </div>
                  <div className="opacity-80">Author: {uciTestResult.author || "Unknown"}</div>
                  <div className="opacity-70 text-[10px]">Elo limit supported: {uciTestResult.supports_elo ? "Yes (UCI_LimitStrength)" : "No"}</div>
                </div>
              )}

              {uciTestError && (
                <div className="p-3 rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-300 flex items-center gap-2 font-mono text-[11px]">
                  <ShieldAlert className="w-4 h-4 text-rose-400 flex-shrink-0" />
                  <span>{uciTestError}</span>
                </div>
              )}

              {/* Engine Name */}
              <div className="space-y-1.5">
                <label className="font-semibold block text-slate-300">Display Name:</label>
                <input
                  type="text"
                  placeholder="e.g. Berserk 13.0"
                  value={newEngineName}
                  onChange={(e) => setNewEngineName(e.target.value)}
                  className="w-full px-3 py-2 bg-black/40 border border-white/10 rounded-xl text-xs text-white outline-none focus:border-rose-500"
                />
              </div>

              {/* Icon & Elo Grid */}
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <label className="font-semibold block text-slate-300">Avatar Icon:</label>
                  <select
                    value={newEngineIcon}
                    onChange={(e) => setNewEngineIcon(e.target.value)}
                    className="w-full px-3 py-2 bg-black/40 border border-white/10 rounded-xl text-xs text-white outline-none focus:border-rose-500"
                  >
                    <option value="⚔️">⚔️ Swords</option>
                    <option value="🐉">🐉 Dragon</option>
                    <option value="⚡">⚡ Lightning</option>
                    <option value="🤖">🤖 Robot</option>
                    <option value="🧠">🧠 Neural</option>
                    <option value="🛡️">🛡️ Shield</option>
                    <option value="👾">👾 Monster</option>
                    <option value="🎯">🎯 Target</option>
                  </select>
                </div>

                <div className="space-y-1.5">
                  <label className="font-semibold block text-slate-300">Estimated Elo:</label>
                  <input
                    type="text"
                    placeholder="3000+"
                    value={newEngineElo}
                    onChange={(e) => setNewEngineElo(e.target.value)}
                    className="w-full px-3 py-2 bg-black/40 border border-white/10 rounded-xl text-xs font-mono text-white outline-none focus:border-rose-500"
                  />
                </div>
              </div>

              {/* Style */}
              <div className="space-y-1.5">
                <label className="font-semibold block text-slate-300">Playing Style:</label>
                <input
                  type="text"
                  placeholder="Aggressive Tactical Alpha-Beta"
                  value={newEngineStyle}
                  onChange={(e) => setNewEngineStyle(e.target.value)}
                  className="w-full px-3 py-2 bg-black/40 border border-white/10 rounded-xl text-xs text-white outline-none focus:border-rose-500"
                />
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 pt-2 border-t border-white/10">
              <button
                onClick={() => setIsAddEngineModalOpen(false)}
                className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-bold transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleRegisterEngine}
                disabled={!newEnginePath.trim() || !newEngineName.trim()}
                className="px-4 py-2 rounded-xl bg-rose-600 hover:bg-rose-500 text-white text-xs font-bold transition-colors disabled:opacity-50 flex items-center gap-1.5 cursor-pointer shadow-lg"
              >
                <Plus className="w-3.5 h-3.5" />
                Register Engine
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
