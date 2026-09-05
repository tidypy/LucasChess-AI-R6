import { useState } from "react";
import { Chess } from "chess.js";
import { Chessboard } from "react-chessboard";
import { UXTheme, BoardTheme } from "../../lib/theme";
import { UciOptionsInspector } from "../engines/UciOptionsInspector";
import { useClickLogger } from "../../lib/clickLogger";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  fetchEngineList,
  fetchEnginePlay,
  fetchEngineVariations,
  fetchEngineEvaluate,
  testUciEngine,
  browseEngineFile,
  registerCustomEngine,
  removeCustomEngine,
  importPgn,
  createSparringGame,
  logKibitzerVariation,
  logTutorFlag,
  EngineInfo,
  fetchOpeningBooksList,
  probeOpeningBook,
  VariationLine,
  TutorInterruptMode,
} from "../../lib/api";
import { AskGrandmasterAction } from "../ai_grandmaster/AskGrandmasterAction";
import { customChessPieces } from "../../components/chessboard/customPieces";
import {
  Swords,
  RotateCcw,
  BookOpen,
  Play,
  Sliders,
  ArrowUpDown,
  Save,
  Trophy,
  Download,
  RefreshCw,
  Cpu,
  Plus,
  Trash2,
  X,
  FolderOpen,
  Gauge,
  Sparkles,
  GraduationCap,
  Lightbulb,
  BookmarkPlus,
  Zap,
  Flame,
  Shield,
  Settings,
  Layers,
  Filter,
  CheckCircle2,
  Undo2,
} from "lucide-react";

interface SparViewProps {
  uxTheme: UXTheme;
  boardTheme: BoardTheme;
}

export interface SparMoveRecord {
  ply: number;
  moveNumber: number;
  turn: "white" | "black";
  san: string;
  uci?: string;
  eval?: string;
  evalCp?: number;
  cpLoss?: number;
  tag?: "best" | "brilliant" | "tactical" | "good" | "inaccuracy" | "mistake" | "blunder" | "book" | "solid";
  badge?: string;
  badgeLabel?: string;
  depth?: number;
  nps?: string | number;
  time_ms?: number;
  source?: "user" | "engine" | "book";
  book_name?: string;
  weight?: number;
}

const classifyMoveQuality = (
  cpLoss: number,
  isBook: boolean,
  tags: string[] = []
): { tag: "best" | "brilliant" | "tactical" | "good" | "inaccuracy" | "mistake" | "blunder" | "book"; badge: string; label: string } => {
  if (isBook) {
    return { tag: "book", badge: "📖", label: "Book" };
  }
  if (tags.includes("brilliant")) {
    return { tag: "brilliant", badge: "!!", label: "Brilliant" };
  }
  if (tags.includes("tactical")) {
    return { tag: "tactical", badge: "⚡", label: "Tactic" };
  }
  if (cpLoss <= 10) {
    return { tag: "best", badge: "✨", label: "Best" };
  }
  if (cpLoss <= 35) {
    return { tag: "good", badge: "✓", label: "Good" };
  }
  if (cpLoss <= 90) {
    return { tag: "inaccuracy", badge: "?!", label: "Inaccuracy" };
  }
  if (cpLoss <= 200) {
    return { tag: "mistake", badge: "?", label: "Mistake" };
  }
  return { tag: "blunder", badge: "??", label: "Blunder" };
};

const getMoveBadgeStyle = (tag?: string) => {
  switch (tag) {
    case "brilliant":
      return "bg-amber-500/25 text-amber-300 border border-amber-500/50 shadow-sm";
    case "best":
      return "bg-emerald-500/25 text-emerald-300 border border-emerald-500/40";
    case "good":
      return "bg-cyan-500/20 text-cyan-300 border border-cyan-500/30";
    case "book":
      return "bg-purple-500/25 text-purple-300 border border-purple-500/40";
    case "inaccuracy":
      return "bg-yellow-500/25 text-yellow-300 border border-yellow-500/40";
    case "mistake":
      return "bg-orange-500/30 text-orange-300 border border-orange-500/50";
    case "blunder":
      return "bg-red-600/30 text-red-300 border border-red-500/60 font-black";
    case "tactical":
      return "bg-indigo-500/30 text-indigo-300 border border-indigo-500/40";
    default:
      return "bg-slate-500/20 text-slate-300 border border-slate-500/30";
  }
};

const DEFAULT_ENGINES: EngineInfo[] = [
  { id: "stockfish", name: "Stockfish 18", elo: "3500+", style: "Grandmaster Dynamic & Elo Scale", icon: "🤖", supports_elo: true, min_elo: 1320, max_elo: 3190 },
  { id: "dragon", name: "Dragon by Komodo", elo: "3500+", style: "Ultra-Sharp Tactical & Active Play", icon: "🐉", supports_elo: true, min_elo: 1000, max_elo: 3500 },
  { id: "houdini", name: "Houdini 1.5a", elo: "3300", style: "Legendary Tactical King Hunter", icon: "🎩", supports_elo: false },
  { id: "rybka", name: "Rybka 2.3", elo: "3200", style: "Dynamic Sacrificial & Aggressive", icon: "🐟", supports_elo: true, min_elo: 1200, max_elo: 2400 },
  { id: "critter", name: "Critter 1.6a", elo: "3100", style: "Sharp Tactical & Counter-Attack", icon: "🦗", supports_elo: false },
  { id: "andscacs", name: "Andscacs 0.94", elo: "3100", style: "Modern Precise Tactical Defense", icon: "⚔️", supports_elo: false },
  { id: "patricia", name: "Patricia 4.0", elo: "2800", style: "Fast Alpha-Beta NNUE Tactician", icon: "⚡", supports_elo: true, min_elo: 1000, max_elo: 2800 },
  { id: "fruit", name: "Fruit 2.3.1", elo: "2850", style: "Classical Positional Calculator", icon: "🍎", supports_elo: false },
  { id: "toga", name: "Deep Toga", elo: "2800", style: "Relentless King-Side Attacker", icon: "🏛️", supports_elo: false },
  { id: "rodent", name: "Rodent II", elo: "2700", style: "Flexible Classical Club Master", icon: "🐭", supports_elo: false },
  { id: "cheng", name: "Cheng 4.41", elo: "2600", style: "Solid Balanced Endgame Specialist", icon: "🛡️", supports_elo: true, min_elo: 800, max_elo: 2600 },
  { id: "cdrill2000", name: "CDrill 2000", elo: "2000", style: "Master Practice Sparring Partner", icon: "🎖️", supports_elo: false },
  { id: "maia1900", name: "Maia 1900", elo: "1900", style: "Human Club Master Neural Network", icon: "🎯", supports_elo: false },
  { id: "ct800", name: "CT800 V1.46", elo: "1850", style: "Clean Positional Classicist", icon: "🏰", supports_elo: true, min_elo: 1000, max_elo: 2400 },
  { id: "cdrill", name: "CDrill 1800", elo: "1800", style: "Intermediate Training Partner", icon: "🏅", supports_elo: false },
  { id: "maia1500", name: "Maia 1500", elo: "1500", style: "Human-like Neural Play (Lichess 1500)", icon: "🧠", supports_elo: false },
  { id: "maia1100", name: "Maia 1100", elo: "1100", style: "Casual Enthusiast Neural Simulation", icon: "🌱", supports_elo: false },
];

const SPARRING_DB_NAME = "Sparring_Games.sqlite";
const KIBITZER_DB_NAME = "Kibitzer_Analysis.sqlite";
const TUTOR_DB_NAME = "Tutor_Games.sqlite";

export function SparView({ uxTheme, boardTheme }: SparViewProps) {
  const { logAction } = useClickLogger();
  const queryClient = useQueryClient();
  const isLight = uxTheme?.mode === "light" || uxTheme?.id === "clean-light";

  // Game & Match State
  const [game, setGame] = useState(new Chess());
  const [fen, setFen] = useState(game.fen());
  const [currentGameId, setCurrentGameId] = useState<string>("");
  const [selectedEngine, setSelectedEngine] = useState("stockfish");
  const [selectedBook, setSelectedBook] = useState("GMopenings.bin");
  const [playerSide, setPlayerSide] = useState<"white" | "black">("white");
  const [targetElo, setTargetElo] = useState(1600);
  const [isGameActive, setIsGameActive] = useState(false);
  const [isEngineThinking, setIsEngineThinking] = useState(false);
  const [moveHistory, setMoveHistory] = useState<string[]>([]);
  const [moveRecords, setMoveRecords] = useState<SparMoveRecord[]>([]);
  const [showAcpl, setShowAcpl] = useState(true);
  const [showMoveQualityBadges, setShowMoveQualityBadges] = useState(true);
  const [evalScore, setEvalScore] = useState("+0.00");
  const [saveSuccessMsg, setSaveSuccessMsg] = useState<string | null>(null);
  const [autosaveAlert, setAutosaveAlert] = useState<string | null>(null);
  const [isBookPanelOpen, setIsBookPanelOpen] = useState<boolean>(true);

  // Tabbed Right Pane: 'sparring' | 'kibitzer' | 'tutor'
  const [rightPanelTab, setRightPanelTab] = useState<"sparring" | "kibitzer" | "tutor">("sparring");

  // Kibitzer Companion State & Advanced Settings
  const [kibitzerEngine, setKibitzerEngine] = useState("patricia");
  const [kibitzerMode, setKibitzerMode] = useState<"on_demand" | "continuous" | "opponent_clock_bound" | "user_clock_bound">("on_demand");
  const [kibitzerMultipv, setKibitzerMultipv] = useState(3);
  const [kibitzerDepth, setKibitzerDepth] = useState(20);
  const [kibitzerSearchMode, setKibitzerSearchMode] = useState<"depth" | "time" | "both">("depth");
  const [kibitzerTimeLimitMs, setKibitzerTimeLimitMs] = useState(1000);
  const [kibitzerThreads, setKibitzerThreads] = useState(1);
  const [kibitzerHashMb, setKibitzerHashMb] = useState(64);
  const [kibitzerDisplayFormat, setKibitzerDisplayFormat] = useState<"both" | "cp" | "win_prob">("both");
  const [kibitzerShowArrows, setKibitzerShowArrows] = useState(true);
  const [kibitzerAutoSave, setKibitzerAutoSave] = useState(false);
  const [kibitzerTagFilter, setKibitzerTagFilter] = useState<"all" | "tactical" | "brilliant" | "solid">("all");
  const [isKibitzerThinking, setIsKibitzerThinking] = useState(false);
  const [kibitzerVariations, setKibitzerVariations] = useState<VariationLine[]>([]);
  const [isKibitzerSettingsOpen, setIsKibitzerSettingsOpen] = useState(false);

  // Tutor Companion State & Advanced Settings
  const [tutorEngine, setTutorEngine] = useState("stockfish");
  const [tutorInterruptMode, setTutorInterruptMode] = useState<TutorInterruptMode>("freeze_on_flag");
  const [isTutorEnabled, setIsTutorEnabled] = useState(true);
  const [tutorBlunderThresholdCp, setTutorBlunderThresholdCp] = useState(150);
  const [tutorMistakeThresholdCp, setTutorMistakeThresholdCp] = useState(75);
  const [tutorAlertTactics, setTutorAlertTactics] = useState(true);
  const [tutorHintDepth, setTutorHintDepth] = useState<"full" | "piece_only" | "strategic">("full");
  const [tutorShowArrow, setTutorShowArrow] = useState(true);
  const [isTutorSettingsOpen, setIsTutorSettingsOpen] = useState(false);
  const [activeTutorFlag, setActiveTutorFlag] = useState<{
    flag_type: "user_blunder" | "engine_blunder" | "tactic" | "best_move_available" | "mistake";
    loss_cp: number;
    best_move_san: string;
    best_move_uci: string;
    eval_score: string;
    tags: string[];
    fen_before?: string;
    played_san?: string;
    ply?: number;
  } | null>(null);

  // Custom Engine Modal State
  const [isAddEngineModalOpen, setIsAddEngineModalOpen] = useState(false);
  const [isQuickTuningOpen, setIsQuickTuningOpen] = useState(false);
  const [opponentThinkTimeMs, setOpponentThinkTimeMs] = useState(450);
  const [opponentThreads, setOpponentThreads] = useState(1);
  const [opponentHashMb, setOpponentHashMb] = useState(64);
  const [newEnginePath, setNewEnginePath] = useState("");
  const [newEngineName, setNewEngineName] = useState("");
  const [newEngineElo, setNewEngineElo] = useState("2400");
  const [newEngineStyle, setNewEngineStyle] = useState("Custom Tactical Engine");
  const [newEngineIcon, setNewEngineIcon] = useState("⚔️");
  const [isBrowsingEngine, setIsBrowsingEngine] = useState(false);
  const [uciTestError, setUciTestError] = useState<string | null>(null);
  const [testedUciOptions, setTestedUciOptions] = useState<Record<string, any>>({});
  const [newEngineCustomOptions, setNewEngineCustomOptions] = useState<Record<string, any>>({});

  // Query Engine List
  const { data: enginesData } = useQuery({
    queryKey: ["engines"],
    queryFn: fetchEngineList,
    initialData: DEFAULT_ENGINES,
  });

  // Query Opening Books List
  const { data: booksData } = useQuery({
    queryKey: ["opening_books"],
    queryFn: fetchOpeningBooksList,
  });

  // Live Position Book Probe for Sparring HUD
  const { data: bookProbeData } = useQuery({
    queryKey: ["sparringBookProbe", fen, selectedBook],
    queryFn: () => probeOpeningBook(fen, selectedBook),
    enabled: !!selectedBook && selectedBook !== "none",
  });

  const engines = enginesData || DEFAULT_ENGINES;
  const currentEngineObj = engines.find((e) => e.id === selectedEngine) || engines[0] || DEFAULT_ENGINES[0];
  const kibitzerEngineObj = engines.find((e) => e.id === kibitzerEngine) || engines[1] || DEFAULT_ENGINES[1];
  const tutorEngineObj = engines.find((e) => e.id === tutorEngine) || engines[0] || DEFAULT_ENGINES[0];

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
          ? "Victory! You defeated " + currentEngineObj.name + " by checkmate!"
          : currentEngineObj.name + " won by checkmate.",
        isWin: isPlayerWinner,
      };
    }
    if (isStalemate) return { title: "DRAW (Stalemate)", subtitle: "The game ended in a stalemate.", isWin: false };
    if (isThreefold) return { title: "DRAW (3-Fold Repetition)", subtitle: "Position repeated 3 times.", isWin: false };
    if (isDraw) return { title: "DRAW", subtitle: "Game drawn by chess rules.", isWin: false };
    return null;
  };

  const classifyOpeningEco = (history: string[], bookName?: string): { eco: string; name: string } => {
    const line = history.slice(0, 6).join(" ").toLowerCase();
    if (line.startsWith("e4 c5") || line.startsWith("1. e4 c5")) return { eco: "B20", name: "Sicilian Defense" };
    if (line.startsWith("e4 e5") || line.startsWith("1. e4 e5")) {
      if (line.includes("bb5") || line.includes("Bb5")) return { eco: "C60", name: "Ruy Lopez" };
      if (line.includes("bc4") || line.includes("Bc4")) return { eco: "C50", name: "Italian Game" };
      return { eco: "C20", name: "Open Game" };
    }
    if (line.startsWith("e4 e6") || line.startsWith("1. e4 e6")) return { eco: "C00", name: "French Defense" };
    if (line.startsWith("e4 c6") || line.startsWith("1. e4 c6")) return { eco: "B10", name: "Caro-Kann Defense" };
    if (line.startsWith("d4 d5") || line.startsWith("1. d4 d5")) {
      if (line.includes("c4")) return { eco: "D06", name: "Queen's Gambit" };
      return { eco: "D00", name: "Queen's Pawn Game" };
    }
    if (line.startsWith("d4 nf6") || line.startsWith("1. d4 Nf6")) {
      if (line.includes("g6")) return { eco: "E60", name: "King's Indian Defense" };
      return { eco: "A45", name: "Indian Defense" };
    }
    if (line.startsWith("c4") || line.startsWith("1. c4")) return { eco: "A10", name: "English Opening" };
    if (line.startsWith("nf3") || line.startsWith("1. Nf3")) return { eco: "A04", name: "Reti Opening" };
    const fallbackBook = bookName && bookName !== "none" ? bookName.replace(/\.(bin|ctg)$/i, "") : "Standard Chess";
    return { eco: "A00", name: fallbackBook };
  };

  const gameOverInfo = getWinnerDescription();

  const generatePgn = (overrideResult?: string) => {
    const dateStr = new Date().toISOString().split("T")[0].replace(/-/g, ".");
    const resultStr = overrideResult || (isCheckmate ? (game.turn() === "w" ? "0-1" : "1-0") : isDraw ? "1/2-1/2" : "*");
    const whiteName = playerSide === "white" ? "Player (Human)" : currentEngineObj.name;
    const blackName = playerSide === "black" ? "Player (Human)" : currentEngineObj.name;
    const whiteElo = playerSide === "white" ? 1800 : targetElo;
    const blackElo = playerSide === "black" ? 1800 : targetElo;

    const openingInfo = classifyOpeningEco(moveHistory, selectedBook);

    // Compute match stats
    const userMoves = moveRecords.filter((r) => r.source === "user" && typeof r.cpLoss === "number");
    const userAcpl = userMoves.length > 0
      ? Math.round(userMoves.reduce((acc, m) => acc + (m.cpLoss || 0), 0) / userMoves.length)
      : 0;
    const engineMoves = moveRecords.filter((r) => r.source === "engine" && typeof r.cpLoss === "number");
    const engineAcpl = engineMoves.length > 0
      ? Math.round(engineMoves.reduce((acc, m) => acc + (m.cpLoss || 0), 0) / engineMoves.length)
      : 0;
    const userAccuracy = Math.max(40, Math.min(100, Math.round(100 - userAcpl * 0.35)));
    const engineAccuracy = Math.max(70, Math.min(100, Math.round(100 - engineAcpl * 0.25)));

    const blunderCount = moveRecords.filter((r) => r.tag === "blunder").length;
    const mistakeCount = moveRecords.filter((r) => r.tag === "mistake").length;
    const inaccuracyCount = moveRecords.filter((r) => r.tag === "inaccuracy").length;
    const bestCount = moveRecords.filter((r) => r.tag === "best" || r.tag === "brilliant").length;

    let movesBody = "";
    if (moveRecords.length > 0) {
      const parts: string[] = [];
      for (let i = 0; i < moveRecords.length; i++) {
        const rec = moveRecords[i];
        const moveNum = Math.floor(i / 2) + 1;
        if (i % 2 === 0) {
          parts.push(moveNum + ".");
        }
        parts.push(rec.san);

        const annotations: string[] = [];
        if (rec.eval) annotations.push("[%eval " + rec.eval + "]");
        if (rec.depth) annotations.push("[%depth " + rec.depth + "]");
        if (rec.nps) annotations.push("[%nps " + rec.nps + "]");
        if (rec.source === "book") annotations.push("[book: " + (rec.book_name || selectedBook) + "]");

        if (annotations.length > 0) {
          parts.push("{ " + annotations.join(" ") + " }");
        }
      }
      movesBody = parts.join(" ");
    } else {
      const hist = game.history();
      const parts: string[] = [];
      for (let i = 0; i < hist.length; i++) {
        if (i % 2 === 0) parts.push(Math.floor(i / 2) + 1 + ".");
        parts.push(hist[i]);
      }
      movesBody = parts.join(" ");
    }

    const summaryComment = ` { [%acpl global="${((userAcpl + engineAcpl) / 2).toFixed(1)}" user="${userAcpl}" engine="${engineAcpl}"] [%caps user_accuracy="${userAccuracy}%" engine_accuracy="${engineAccuracy}%"] [%stats best="${bestCount}" inaccuracy="${inaccuracyCount}" mistake="${mistakeCount}" blunder="${blunderCount}"] [%provenance engine="${currentEngineObj.name}" elo="${targetElo}" date="${new Date().toISOString()}"] [%sparring mode="UCI Sparring Arena" tutor_mode="${tutorInterruptMode}"] }`;

    const headerLines = [
      '[Event "DeepScout Engine Sparring"]',
      '[Site "DeepScout Arena"]',
      '[Date "' + dateStr + '"]',
      '[Round "1"]',
      '[White "' + whiteName + '"]',
      '[Black "' + blackName + '"]',
      '[Result "' + resultStr + '"]',
      '[WhiteElo "' + whiteElo + '"]',
      '[BlackElo "' + blackElo + '"]',
      '[ECO "' + openingInfo.eco + '"]',
      '[Opening "' + openingInfo.name + '"]',
      '[GameId "' + (currentGameId || "sparring-session") + '"]',
      "",
      (movesBody ? movesBody + summaryComment + " " : "") + resultStr,
    ];

    return headerLines.join("\n");
  };

  // Autosave to Sparring_Games.sqlite
  const autoSaveGame = async (overrideResult?: string) => {
    if (moveHistory.length === 0) return;
    try {
      const pgnText = generatePgn(overrideResult);
      await importPgn(pgnText, SPARRING_DB_NAME);
      setAutosaveAlert("Autosaved to " + SPARRING_DB_NAME);
      logAction("API", "Autosaved Sparring Game to " + SPARRING_DB_NAME, `Result: ${overrideResult || (isCheckmate ? "Checkmate" : "*")}`);
      queryClient.invalidateQueries({ queryKey: ["databases"] });
      queryClient.invalidateQueries({ queryKey: ["browserGames"] });
      setTimeout(() => setAutosaveAlert(null), 4000);
    } catch (err: any) {
      logAction("ERROR", "Sparring autosave failed: " + err.message);
    }
  };

  const saveMutation = useMutation({
    mutationFn: async () => {
      const pgnText = generatePgn();
      return importPgn(pgnText, SPARRING_DB_NAME);
    },
    onSuccess: (data) => {
      setSaveSuccessMsg("Saved game to " + SPARRING_DB_NAME + " (" + data.imported_count + " record)!");
      logAction("API", "Manually Saved Sparring Game to " + SPARRING_DB_NAME);
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
    link.download = "Sparring_" + currentEngineObj.name + "_" + Date.now() + ".pgn";
    link.click();
    URL.revokeObjectURL(url);
    logAction("CLICK", "Exported Sparring Game PGN");
  };

  // Kibitzer Get Advise Action ("Roads Not Taken")
  const handleGetAdvise = async (
    overrideFen?: string,
    overrides?: {
      engine?: string;
      depth?: number;
      multipv?: number;
      searchMode?: "depth" | "time" | "both";
      timeLimitMs?: number;
      threads?: number;
      hashMb?: number;
    }
  ) => {
    setIsKibitzerThinking(true);
    const targetFen = overrideFen || fen;
    const engineToUse = overrides?.engine ?? kibitzerEngine;
    const depthToUse = overrides?.depth ?? kibitzerDepth;
    const multipvToUse = overrides?.multipv ?? kibitzerMultipv;
    const modeToUse = overrides?.searchMode ?? kibitzerSearchMode;
    const timeMsToUse = overrides?.timeLimitMs ?? kibitzerTimeLimitMs;
    const threadsToUse = overrides?.threads ?? kibitzerThreads;
    const hashToUse = overrides?.hashMb ?? kibitzerHashMb;

    // In 'depth' mode, do not send time cap so the engine reaches depth 24 / 33 / 50 plies!
    const effectiveTimeLimitMs = modeToUse === "depth" ? null : timeMsToUse;
    const effectiveDepth = modeToUse === "time" ? undefined : depthToUse;

    try {
      const res = await fetchEngineVariations({
        fen: targetFen,
        engine_id: engineToUse,
        depth: effectiveDepth,
        multipv: multipvToUse,
        time_limit_ms: effectiveTimeLimitMs,
        threads: threadsToUse,
        hash_mb: hashToUse,
      });
      if (res && res.variations) {
        setKibitzerVariations(res.variations);
        logAction("API", "Fetched " + res.variations.length + " variations via " + engineToUse + " (Depth: " + (effectiveDepth || depthToUse) + ")");

        if (kibitzerAutoSave && res.variations.length > 0) {
          res.variations.forEach((v) => {
            logKibitzerVariation({
              game_id: currentGameId || "sparring-session-standalone",
              ply: moveRecords.length,
              fen: targetFen,
              engine: engineToUse,
              pgn_fragment: v.pv_san,
              eval_data: { score_cp: v.score_cp, win_prob: v.win_prob, depth: v.depth, tags: v.tags },
              trigger_source: "get_advise",
              logged_by: "auto_verbose",
              was_played: false,
            }).catch(() => {});
          });
        }
      }
    } catch (err: any) {
      logAction("ERROR", "Kibitzer advice failed: " + err.message);
    } finally {
      setIsKibitzerThinking(false);
    }
  };

  // Kibitzer Save Variation to Kibitzer_Analysis.sqlite
  const handleSaveKibitzerVariation = async (variation: VariationLine) => {
    try {
      await logKibitzerVariation({
        game_id: currentGameId || "sparring-session-standalone",
        ply: moveRecords.length,
        fen: fen,
        engine: kibitzerEngineObj.name,
        pgn_fragment: variation.pv_san,
        eval_data: {
          score_cp: variation.score_cp,
          win_prob: variation.win_prob,
          depth: variation.depth,
          tags: variation.tags,
        },
        trigger_source: "get_advise",
        logged_by: "user_save",
        was_played: false,
      });
      setSaveSuccessMsg("Saved variation " + variation.pv_san + " to " + KIBITZER_DB_NAME + "!");
      logAction("API", "Saved variation " + variation.pv_san + " to " + KIBITZER_DB_NAME);
      queryClient.invalidateQueries({ queryKey: ["databases"] });
      setTimeout(() => setSaveSuccessMsg(null), 3500);
    } catch (err: any) {
      logAction("ERROR", "Failed to save Kibitzer variation: " + err.message);
    }
  };

  // Tutor Response Handler
  const handleTutorOutcome = async (
    outcome: "accepted_suggestion" | "played_own_move" | "ignored_flag" | "takeback",
    suggestedSan?: string
  ) => {
    if (!activeTutorFlag) return;
    const flagCopy = { ...activeTutorFlag };
    try {
      await logTutorFlag({
        game_id: currentGameId || "sparring-session-standalone",
        ply: flagCopy.ply || moveRecords.length,
        fen: fen,
        flag_type: flagCopy.flag_type,
        engine: tutorEngineObj.name,
        centipawn_data: { loss_cp: flagCopy.loss_cp, eval: flagCopy.eval_score },
        suggested_variations: [{ san: flagCopy.best_move_san, tags: flagCopy.tags }],
        tutor_outcome: outcome === "takeback" ? "ignored_flag" : outcome,
        trigger_source: "flag_triggered",
      });
      logAction("API", "Tutor flag resolved with outcome: " + outcome);
      queryClient.invalidateQueries({ queryKey: ["databases"] });
    } catch (err: any) {
      console.warn("Failed to log tutor flag outcome", err);
    }

    if (outcome === "accepted_suggestion" && (suggestedSan || flagCopy.best_move_san)) {
      const bestSan = suggestedSan || flagCopy.best_move_san;
      try {
        // Rewind to prior history and play suggested move instead of blunder
        const priorHistory = moveHistory.slice(0, -1);
        const correctedGame = new Chess();
        for (const h of priorHistory) {
          correctedGame.move(h);
        }
        const acceptedMove = correctedGame.move(bestSan);
        if (acceptedMove) {
          const newFen = correctedGame.fen();
          const nextMoves = correctedGame.history();
          const currentPly = nextMoves.length;
          const moveNum = Math.floor((currentPly - 1) / 2) + 1;
          const turnName: "white" | "black" = currentPly % 2 === 1 ? "white" : "black";

          setGame(correctedGame);
          setFen(newFen);
          setMoveHistory(nextMoves);

          const correctedRec: SparMoveRecord = {
            ply: currentPly,
            moveNumber: moveNum,
            turn: turnName,
            san: acceptedMove.san,
            uci: acceptedMove.from + acceptedMove.to + (acceptedMove.promotion || ""),
            source: "user",
            cpLoss: 0,
            tag: "best",
            badge: "✨",
            badgeLabel: "Tutor Accepted",
            eval: flagCopy.eval_score,
          };

          setMoveRecords((prev) => [...prev.slice(0, -1), correctedRec]);
          setActiveTutorFlag(null);

          if (!correctedGame.isGameOver()) {
            setTimeout(() => triggerEngineMove(newFen, correctedGame), 200);
          }
          return;
        }
      } catch (err: any) {
        console.error("Failed executing accepted tutor move", err);
      }
    } else if (outcome === "takeback") {
      // Takeback: rewind the blunder so user can play another move manually
      try {
        const priorHistory = moveHistory.slice(0, -1);
        const rewindGame = new Chess();
        for (const h of priorHistory) {
          rewindGame.move(h);
        }
        setGame(rewindGame);
        setFen(rewindGame.fen());
        setMoveHistory(priorHistory);
        setMoveRecords((prev) => prev.slice(0, -1));
        setActiveTutorFlag(null);
        return;
      } catch (err: any) {
        console.error("Failed executing takeback", err);
      }
    } else if (outcome === "played_own_move" || outcome === "ignored_flag") {
      // Keep played move and let opponent engine respond!
      setActiveTutorFlag(null);
      if (!game.isGameOver()) {
        setTimeout(() => triggerEngineMove(fen, game), 150);
      }
      return;
    }

    setActiveTutorFlag(null);
  };

  // Trigger Opponent Engine Move using UCI
  const triggerEngineMove = async (currentFen: string, activeGameInstance?: Chess) => {
    const currentG = activeGameInstance || game;
    if (currentG.isGameOver()) return;
    setIsEngineThinking(true);
    try {
      if (kibitzerMode === "opponent_clock_bound") {
        fetchEngineVariations({
          fen: currentFen,
          engine_id: kibitzerEngine,
          depth: kibitzerDepth,
          multipv: kibitzerMultipv,
          time_limit_ms: kibitzerTimeLimitMs,
          threads: kibitzerThreads,
          hash_mb: kibitzerHashMb,
        }).then((res) => {
          if (res?.variations) setKibitzerVariations(res.variations);
        }).catch(() => {});
      }

      const response = await fetchEnginePlay({
        fen: currentFen,
        engine_id: selectedEngine,
        elo: currentEngineObj.supports_elo ? targetElo : undefined,
        time_limit_ms: opponentThinkTimeMs || 450,
        book_name: selectedBook,
        use_book: Boolean(selectedBook && selectedBook !== "none"),
      });

      if (response && (response.best_move_san || response.best_move_uci)) {
        // Reconstruct game from moveHistory to ensure continuous full history
        const nextG = new Chess();
        for (const h of currentG.history()) {
          nextG.move(h);
        }

        let moveResult = null;
        if (response.best_move_san) {
          try {
            moveResult = nextG.move(response.best_move_san);
          } catch {}
        }
        if (!moveResult && response.best_move_uci && response.best_move_uci.length >= 4) {
          try {
            moveResult = nextG.move({
              from: response.best_move_uci.slice(0, 2),
              to: response.best_move_uci.slice(2, 4),
              promotion: response.best_move_uci.slice(4, 5) || "q",
            });
          } catch {}
        }

        if (moveResult) {
          const newFen = nextG.fen();
          const nextMoves = nextG.history();
          const currentPly = nextMoves.length;
          const moveNum = Math.floor((currentPly - 1) / 2) + 1;
          const turnName: "white" | "black" = currentPly % 2 === 1 ? "white" : "black";

          setGame(nextG);
          setFen(newFen);
          setMoveHistory(nextMoves);
          if (response.eval_score) setEvalScore(response.eval_score);

          const qual = response.is_book_move
            ? { tag: "book", badge: "📖", label: "Book" }
            : { tag: "best", badge: "✨", label: "Engine" };

          const engineRec: SparMoveRecord = {
            ply: currentPly,
            moveNumber: moveNum,
            turn: turnName,
            san: moveResult.san,
            uci: moveResult.from + moveResult.to + (moveResult.promotion || ""),
            eval: response.eval_score,
            evalCp: response.eval_cp,
            cpLoss: response.is_book_move ? 0 : 5,
            tag: qual.tag as any,
            badge: qual.badge,
            badgeLabel: qual.label,
            depth: response.depth,
            nps: response.telemetry?.nps,
            time_ms: response.telemetry?.time_ms,
            source: response.is_book_move ? "book" : "engine",
            book_name: response.book_name,
            weight: response.book_weight,
          };

          setMoveRecords((prev) => [...prev, engineRec]);
          logAction("BOARD", `Engine Move: ${moveResult.san} (Ply ${currentPly})`, `Eval: ${response.eval_score || "+0.00"}`);

          if (nextG.isGameOver()) {
            autoSaveGame();
          } else if (kibitzerMode === "user_clock_bound" || kibitzerMode === "continuous") {
            const effectiveTimeLimitMs = kibitzerSearchMode === "depth" ? null : kibitzerTimeLimitMs;
            const effectiveDepth = kibitzerSearchMode === "time" ? undefined : kibitzerDepth;
            fetchEngineVariations({
              fen: newFen,
              engine_id: kibitzerEngine,
              depth: effectiveDepth,
              multipv: kibitzerMultipv,
              time_limit_ms: effectiveTimeLimitMs,
              threads: kibitzerThreads,
              hash_mb: kibitzerHashMb,
            }).then((res) => {
              if (res?.variations) setKibitzerVariations(res.variations);
            }).catch(() => {});
          }
        }
      }
    } catch (err: any) {
      logAction("ERROR", "UCI Engine move failed: " + err.message);
    } finally {
      setIsEngineThinking(false);
    }
  };

  const handleStartGame = async () => {
    const newG = new Chess();
    setGame(newG);
    setFen(newG.fen());
    setMoveHistory([]);
    setMoveRecords([]);
    setIsGameActive(true);
    setEvalScore("+0.00");
    setSaveSuccessMsg(null);
    setAutosaveAlert(null);
    setActiveTutorFlag(null);

    try {
      const session = await createSparringGame({
        opponent_engine: currentEngineObj.name,
        user_time_control: "unlimited",
        tutor_interrupt_mode: tutorInterruptMode,
      });
      if (session?.game?.game_id) {
        setCurrentGameId(session.game.game_id);
      }
    } catch (e) {
      console.warn("Failed creating sparring session in DB:", e);
    }

    logAction(
      "CLICK",
      "Started UCI Sparring Match vs " + currentEngineObj.name,
      "Side: " + playerSide + ", Elo: " + targetElo + ", Engine: " + selectedEngine + ", Book: " + selectedBook
    );

    if (playerSide === "black") {
      triggerEngineMove(newG.fen(), newG);
    } else if (kibitzerMode === "user_clock_bound" || kibitzerMode === "continuous") {
      const effectiveTimeLimitMs = kibitzerSearchMode === "depth" ? null : kibitzerTimeLimitMs;
      const effectiveDepth = kibitzerSearchMode === "time" ? undefined : kibitzerDepth;
      fetchEngineVariations({
        fen: newG.fen(),
        engine_id: kibitzerEngine,
        depth: effectiveDepth,
        multipv: kibitzerMultipv,
        time_limit_ms: effectiveTimeLimitMs,
        threads: kibitzerThreads,
        hash_mb: kibitzerHashMb,
      }).then((res) => {
        if (res?.variations) setKibitzerVariations(res.variations);
      }).catch(() => {});
    }
  };

  const handleResetGame = () => {
    if (isGameActive && moveHistory.length > 0) {
      const resignResult = !game.isGameOver()
        ? playerSide === "white"
          ? "0-1"
          : "1-0"
        : undefined;
      autoSaveGame(resignResult);
    }
    const newG = new Chess();
    setGame(newG);
    setFen(newG.fen());
    setMoveHistory([]);
    setMoveRecords([]);
    setIsGameActive(false);
    setIsEngineThinking(false);
    setEvalScore("+0.00");
    setSaveSuccessMsg(null);
    setActiveTutorFlag(null);
    logAction("CLICK", "Reset Sparring Arena (Autosaved prior match)");
  };

  const handleFollowBookMove = (candidateMoveSan?: string, candidateMoveUci?: string) => {
    if (isEngineThinking || game.isGameOver()) return;
    const bestCandidate = candidateMoveSan || bookProbeData?.best_move_san;
    if (!bestCandidate) return;

    const nextG = new Chess();
    for (const h of moveHistory) nextG.move(h);
    try {
      let moveResult = null;
      try {
        moveResult = nextG.move(bestCandidate);
      } catch {}
      if (!moveResult && candidateMoveUci && candidateMoveUci.length >= 4) {
        try {
          moveResult = nextG.move({
            from: candidateMoveUci.slice(0, 2),
            to: candidateMoveUci.slice(2, 4),
            promotion: candidateMoveUci.slice(4, 5) || "q",
          });
        } catch {}
      }

      if (moveResult) {
        const newFen = nextG.fen();
        const nextMoves = nextG.history();
        const currentPly = nextMoves.length;
        const moveNum = Math.floor((currentPly - 1) / 2) + 1;
        const turnName: "white" | "black" = currentPly % 2 === 1 ? "white" : "black";

        setGame(nextG);
        setFen(newFen);
        setMoveHistory(nextMoves);
        if (!isGameActive) setIsGameActive(true);

        const userRec: SparMoveRecord = {
          ply: currentPly,
          moveNumber: moveNum,
          turn: turnName,
          san: moveResult.san,
          uci: moveResult.from + moveResult.to + (moveResult.promotion || ""),
          source: "book",
          cpLoss: 0,
          tag: "book",
          badge: "📖",
          badgeLabel: "Book",
          eval: "+0.00",
          book_name: selectedBook,
          weight: bookProbeData?.weight,
        };

        setMoveRecords((prev) => [...prev, userRec]);
        logAction("BOARD", `Followed Book Move: ${moveResult.san} (Ply ${currentPly})`, `Theory: ${selectedBook}`);

        if (nextG.isGameOver()) {
          autoSaveGame();
        } else {
          triggerEngineMove(newFen, nextG);
        }
      }
    } catch (err) {
      console.warn("Could not play book candidate move:", err);
    }
  };

  const handlePieceDrop = ({ sourceSquare, targetSquare }: { piece: any; sourceSquare: string; targetSquare: string | null }): boolean => {
    if (!targetSquare || isEngineThinking) return false;
    try {
      const prevFen = game.fen();
      const prevHistory = [...moveHistory];
      const nextGame = new Chess();
      for (const h of prevHistory) {
        nextGame.move(h);
      }
      if (nextGame.isGameOver()) return false;

      const move = nextGame.move({
        from: sourceSquare,
        to: targetSquare,
        promotion: "q",
      });

      if (move === null) return false;

      const newFen = nextGame.fen();
      const nextMoves = nextGame.history();
      const currentPly = nextMoves.length;
      const moveNum = Math.floor((currentPly - 1) / 2) + 1;
      const turnName: "white" | "black" = currentPly % 2 === 1 ? "white" : "black";

      setGame(nextGame);
      setFen(newFen);
      setMoveHistory(nextMoves);
      if (!isGameActive) setIsGameActive(true);

      const userRec: SparMoveRecord = {
        ply: currentPly,
        moveNumber: moveNum,
        turn: turnName,
        san: move.san,
        uci: move.from + move.to + (move.promotion || ""),
        source: "user",
        cpLoss: 0,
        tag: "good",
        badge: "✓",
        badgeLabel: "Played",
      };

      // Check if move is in active opening book theory
      let isBookMove = false;
      let bookWeight = 0;
      if (bookProbeData && bookProbeData.in_book && bookProbeData.candidates) {
        const cand = bookProbeData.candidates.find(
          (c) => c.san === move.san || (c.uci && userRec.uci && c.uci === userRec.uci)
        );
        if (cand) {
          isBookMove = true;
          bookWeight = cand.weight;
        }
      }

      if (isBookMove) {
        // Book moves strictly receive 0 ACPL loss (100% accuracy)
        const updatedRec: SparMoveRecord = {
          ...userRec,
          source: "book",
          cpLoss: 0,
          tag: "book",
          badge: "📖",
          badgeLabel: "Book",
          eval: "+0.00",
          book_name: selectedBook,
          weight: bookWeight,
        };
        setMoveRecords((prev) => [...prev, updatedRec]);
        logAction("BOARD", `Player Book Move: ${move.san} (Ply ${currentPly})`, `Theory: ${selectedBook} (0 ACPL Loss)`);

        if (nextGame.isGameOver()) {
          autoSaveGame();
        } else {
          triggerEngineMove(newFen, nextGame);
        }
        return true;
      }

      setMoveRecords((prev) => [...prev, userRec]);
      logAction("BOARD", `Player Move: ${move.san} (Ply ${currentPly})`, `FEN: ${newFen}`);

      // If Tutor is enabled, evaluate the move against the previous position
      if (isTutorEnabled) {
        fetchEngineVariations({
          fen: prevFen,
          engine_id: tutorEngine,
          depth: 14,
          multipv: 3,
          time_limit_ms: 350,
        }).then(async (res) => {
          if (res?.variations && res.variations.length > 0) {
            const bestVar = res.variations[0];
            const isPlayedBest = bestVar.pv_san === move.san || (bestVar.pv_uci && bestVar.pv_uci.startsWith(userRec.uci || ""));

            let cpLoss = 0;
            if (isPlayedBest) {
              cpLoss = 0;
            } else {
              const matchingVar = res.variations.find((v) => v.pv_san === move.san || (v.pv_uci && userRec.uci && v.pv_uci.startsWith(userRec.uci)));
              if (matchingVar && typeof matchingVar.cp_delta === "number") {
                cpLoss = Math.abs(matchingVar.cp_delta);
              } else {
                // Secondary check of position after move
                try {
                  const evalRes = await fetchEngineEvaluate({ fen: newFen, engine_id: tutorEngine, depth: 12, time_limit_ms: 250 });
                  const evalAfterCp = -(evalRes.eval_cp || 0);
                  const bestCp = bestVar.score_cp || 0;
                  cpLoss = Math.max(0, bestCp - evalAfterCp);
                } catch {
                  cpLoss = 100;
                }
              }
            }

            const qual = classifyMoveQuality(cpLoss, false, isPlayedBest ? bestVar.tags : []);
            const updatedRec: SparMoveRecord = {
              ...userRec,
              cpLoss,
              tag: qual.tag as any,
              badge: qual.badge,
              badgeLabel: qual.label,
              eval: "" + ((bestVar.score_cp || 0) / 100.0).toFixed(2),
            };

            setMoveRecords((prev) => prev.map((r) => (r.ply === currentPly ? updatedRec : r)));

            const isBlunder = cpLoss >= tutorBlunderThresholdCp || qual.tag === "blunder";
            const isMistake = !isBlunder && (cpLoss >= tutorMistakeThresholdCp || qual.tag === "mistake");
            const isTactic = tutorAlertTactics && bestVar.tags.includes("tactical") && !isPlayedBest;

            if (isBlunder || isMistake || isTactic) {
              const flagData = {
                flag_type: (isBlunder ? "user_blunder" : isTactic ? "tactic" : "mistake") as any,
                loss_cp: cpLoss,
                best_move_san: bestVar.pv_san,
                best_move_uci: bestVar.pv_uci,
                eval_score: "" + ((bestVar.score_cp || 0) / 100.0).toFixed(2),
                tags: bestVar.tags,
                fen_before: prevFen,
                played_san: move.san,
                ply: currentPly,
              };

              if (tutorInterruptMode === "freeze_on_flag") {
                setActiveTutorFlag(flagData);
                // Pause play for user feedback - do not trigger opponent engine!
                return;
              } else {
                logTutorFlag({
                  game_id: currentGameId || "sparring-session-standalone",
                  ply: currentPly,
                  fen: newFen,
                  flag_type: flagData.flag_type,
                  engine: tutorEngineObj.name,
                  centipawn_data: { loss_cp: flagData.loss_cp, eval: flagData.eval_score },
                  suggested_variations: [{ san: flagData.best_move_san, tags: flagData.tags }],
                  tutor_outcome: "ignored_flag",
                  trigger_source: "continuous",
                }).catch(() => {});
              }
            }
          }

          if (nextGame.isGameOver()) {
            autoSaveGame();
          } else {
            triggerEngineMove(newFen, nextGame);
          }
        }).catch(() => {
          if (nextGame.isGameOver()) {
            autoSaveGame();
          } else {
            triggerEngineMove(newFen, nextGame);
          }
        });
      } else {
        if (nextGame.isGameOver()) {
          autoSaveGame();
        } else {
          triggerEngineMove(newFen, nextGame);
        }
      }

      return true;
    } catch {
      return false;
    }
  };

  const handleTestEnginePath = async (path: string) => {
    if (!path.trim()) return;
    setUciTestError(null);
    try {
      const testRes = await testUciEngine(path);
      if (testRes && testRes.name) {
        setNewEngineName(testRes.name);
        if (testRes.options) {
          setTestedUciOptions(testRes.options);
          const initialOpts: Record<string, any> = {};
          Object.entries(testRes.options).forEach(([k, v]: [string, any]) => {
            if (v.default !== undefined && v.default !== null) initialOpts[k] = v.default;
          });
          setNewEngineCustomOptions(initialOpts);
        }
      }
    } catch (err: any) {
      setUciTestError(err.message || "Failed to test UCI engine handshake");
      setTestedUciOptions({});
    }
  };

  const handleBrowseEngine = async () => {
    setIsBrowsingEngine(true);
    setUciTestError(null);
    try {
      const res = await browseEngineFile();
      if (res && res.success && res.path) {
        setNewEnginePath(res.path);
        await handleTestEnginePath(res.path);
      }
    } catch (err: any) {
      setUciTestError(err.message || "Failed to browse engine executable");
    } finally {
      setIsBrowsingEngine(false);
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
        options: newEngineCustomOptions,
      });
      await queryClient.invalidateQueries({ queryKey: ["engines"] });
      setSelectedEngine(registered.id);
      setIsAddEngineModalOpen(false);
      setNewEnginePath("");
      setNewEngineName("");
      setSaveSuccessMsg("Registered custom engine: " + registered.name + "!");
      logAction("API", "Registered custom UCI engine " + registered.name);
    } catch (err: any) {
      setUciTestError(err.message || "Registration failed");
    }
  };

  const handleDeleteEngine = async (engineId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      await removeCustomEngine(engineId);
      await queryClient.invalidateQueries({ queryKey: ["engines"] });
      if (selectedEngine === engineId) setSelectedEngine("stockfish");
      logAction("API", "Removed custom engine " + engineId);
    } catch (err: any) {
      logAction("ERROR", "Failed to remove custom engine: " + err.message);
    }
  };

  const handleFlipOrientation = () => {
    const next = playerSide === "white" ? "black" : "white";
    setPlayerSide(next);
    logAction("BOARD", "Flipped board orientation to " + next);
  };

  const minElo = currentEngineObj.min_elo || 1000;
  const maxElo = currentEngineObj.max_elo || 3500;

  const getTagBadge = (tag: string) => {
    switch (tag) {
      case "best":
        return <span key={tag} className="px-1.5 py-0.5 rounded bg-emerald-500/20 text-emerald-300 font-bold text-[9px] border border-emerald-500/30">✨ Best</span>;
      case "brilliant":
        return <span key={tag} className="px-1.5 py-0.5 rounded bg-amber-500/20 text-amber-300 font-bold text-[9px] border border-amber-500/30 flex items-center gap-0.5"><Flame className="w-2.5 h-2.5" /> Brilliant</span>;
      case "tactical":
        return <span key={tag} className="px-1.5 py-0.5 rounded bg-purple-500/20 text-purple-300 font-bold text-[9px] border border-purple-500/30 flex items-center gap-0.5"><Zap className="w-2.5 h-2.5" /> Tactical</span>;
      case "aggressive":
        return <span key={tag} className="px-1.5 py-0.5 rounded bg-rose-500/20 text-rose-300 font-bold text-[9px] border border-rose-500/30">⚔️ Attack</span>;
      case "solid":
        return <span key={tag} className="px-1.5 py-0.5 rounded bg-blue-500/20 text-blue-300 font-bold text-[9px] border border-blue-500/30 flex items-center gap-0.5"><Shield className="w-2.5 h-2.5" /> Solid</span>;
      case "blunder":
        return <span key={tag} className="px-1.5 py-0.5 rounded bg-red-600/30 text-red-300 font-bold text-[9px] border border-red-500/40">⚠️ Blunder</span>;
      case "mistake":
        return <span key={tag} className="px-1.5 py-0.5 rounded bg-orange-500/20 text-orange-300 font-bold text-[9px] border border-orange-500/30">Mistake</span>;
      case "inaccuracy":
        return <span key={tag} className="px-1.5 py-0.5 rounded bg-yellow-500/20 text-yellow-300 font-bold text-[9px] border border-yellow-500/30">Inaccuracy</span>;
      default:
        return <span key={tag} className="px-1.5 py-0.5 rounded bg-slate-500/20 text-slate-300 text-[9px]">{tag}</span>;
    }
  };

  // Filter variations based on kibitzerTagFilter
  const filteredVariations = kibitzerVariations.filter((v) => {
    if (kibitzerTagFilter === "all") return true;
    return v.tags.includes(kibitzerTagFilter);
  });

  // Calculate dynamic board square visual highlights and arrows for Tutor / Kibitzer
  const boardCustomSquareStyles: Record<string, React.CSSProperties> = {};
  const boardArrows: Array<{ startSquare: string; endSquare: string; color: string }> = [];

  if (activeTutorFlag && tutorShowArrow && activeTutorFlag.best_move_uci && activeTutorFlag.best_move_uci.length >= 4) {
    const from = activeTutorFlag.best_move_uci.slice(0, 2);
    const to = activeTutorFlag.best_move_uci.slice(2, 4);
    boardCustomSquareStyles[from] = { backgroundColor: "rgba(245, 158, 11, 0.4)", borderRadius: "20%" };
    boardCustomSquareStyles[to] = { backgroundColor: "rgba(245, 158, 11, 0.65)", borderRadius: "20%" };
    boardArrows.push({ startSquare: from, endSquare: to, color: "rgb(245, 158, 11)" });
  } else if (kibitzerShowArrows && filteredVariations.length > 0) {
    const top = filteredVariations[0];
    if (top.pv_uci && top.pv_uci.length >= 4) {
      const from = top.pv_uci.slice(0, 2);
      const to = top.pv_uci.slice(2, 4);
      boardCustomSquareStyles[from] = { backgroundColor: "rgba(6, 182, 212, 0.35)", borderRadius: "20%" };
      boardCustomSquareStyles[to] = { backgroundColor: "rgba(6, 182, 212, 0.6)", borderRadius: "20%" };
      boardArrows.push({ startSquare: from, endSquare: to, color: "rgb(6, 182, 212)" });
    }
  }

  // Get formatted hint text for Tutor based on hint depth
  const getTutorHintText = (flag: typeof activeTutorFlag) => {
    if (!flag) return "";
    if (tutorHintDepth === "piece_only") {
      const firstChar = flag.best_move_san.charAt(0);
      let pieceName = "Pawn";
      if (firstChar === "N") pieceName = "Knight";
      else if (firstChar === "B") pieceName = "Bishop";
      else if (firstChar === "R") pieceName = "Rook";
      else if (firstChar === "Q") pieceName = "Queen";
      else if (firstChar === "K") pieceName = "King";
      return "Hint: Consider moving your " + pieceName;
    }
    if (tutorHintDepth === "strategic") {
      if (flag.tags.includes("tactical")) return "Hint: A decisive tactical combination exists!";
      if (flag.tags.includes("brilliant")) return "Hint: Look for an advantageous piece sacrifice!";
      return "Hint: Improve your defensive king safety & piece coordination.";
    }
    return "Suggested Move: " + flag.best_move_san;
  };

  // Calculate match-wide summary statistics (ACPL & Accuracy)
  const userMoves = moveRecords.filter((r) => r.source === "user" && typeof r.cpLoss === "number");
  const userAcpl = userMoves.length > 0
    ? Math.round(userMoves.reduce((acc, m) => acc + (m.cpLoss || 0), 0) / userMoves.length)
    : 0;
  const engineMoves = moveRecords.filter((r) => r.source === "engine" && typeof r.cpLoss === "number");
  const engineAcpl = engineMoves.length > 0
    ? Math.round(engineMoves.reduce((acc, m) => acc + (m.cpLoss || 0), 0) / engineMoves.length)
    : 0;
  const userAccuracy = Math.max(40, Math.min(100, Math.round(100 - userAcpl * 0.35)));
  const engineAccuracy = Math.max(70, Math.min(100, Math.round(100 - engineAcpl * 0.25)));

  const contextNotesStr = "Sparring vs " + currentEngineObj.name + " (" + (currentEngineObj.supports_elo ? targetElo + " Elo" : currentEngineObj.elo + " Native") + ")";

  return (
    <div className="flex flex-col gap-6 max-w-7xl mx-auto pb-12 select-none animate-in fade-in duration-200 font-sans">
      {/* Header Toolbar */}
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
        <div>
          <div className="text-[11px] font-mono uppercase tracking-widest text-rose-400 font-extrabold mb-1 flex items-center gap-1.5">
            <Swords className="w-4 h-4 text-rose-400" />
            Companion Subsystem — Sparring, Kibitzer &amp; Tutor
          </div>
          <h1 className={"text-3xl font-extrabold tracking-tight " + (isLight ? "text-slate-900" : "text-white") + " flex items-center gap-3"}>
            Spar Against Engine
            <span className={"text-xs font-mono font-bold " + (isLight ? "text-slate-700" : "text-slate-300")}>
              — Multi-Engine Companion Subsystem ({SPARRING_DB_NAME}, {KIBITZER_DB_NAME}, {TUTOR_DB_NAME})
            </span>
          </h1>
        </div>

        {/* Companion Quick Buttons */}
        <div className="flex items-center gap-2">
          <button
            onClick={() => {
              setRightPanelTab("kibitzer");
              handleGetAdvise();
            }}
            disabled={isKibitzerThinking}
            className="px-3.5 py-2.5 rounded-xl bg-gradient-to-r from-cyan-600 to-blue-600 hover:from-cyan-500 hover:to-blue-500 text-white text-xs font-extrabold transition-all flex items-center gap-2 cursor-pointer shadow-md shadow-cyan-950/40 border border-cyan-400/40 disabled:opacity-50"
          >
            <Sparkles className={`w-4 h-4 ${isKibitzerThinking ? "animate-spin text-cyan-200" : "text-cyan-300"}`} />
            <span>{isKibitzerThinking ? "Analyzing..." : "💡 Get Advise"}</span>
          </button>

          {/* Master Tutor Power Quick Button */}
          <button
            onClick={() => {
              const nextState = !isTutorEnabled;
              setIsTutorEnabled(nextState);
              if (!nextState) {
                setActiveTutorFlag(null);
              }
              logAction("CLICK", `Toggled Tutor Engine: ${nextState ? "ON" : "OFF"}`);
            }}
            className={"px-3.5 py-2.5 rounded-xl border text-xs font-extrabold transition-all flex items-center gap-2 cursor-pointer shadow-sm " + (isTutorEnabled ? (isLight ? "bg-emerald-500/15 hover:bg-emerald-500/25 text-emerald-950 border-emerald-600/40 ring-1 ring-emerald-500/30" : "bg-emerald-600/20 hover:bg-emerald-600/30 text-emerald-300 border-emerald-500/40 ring-1 ring-emerald-400/30") : (isLight ? "bg-slate-200 hover:bg-slate-300 text-slate-700 border-slate-300" : "bg-slate-800/80 hover:bg-slate-800 text-slate-400 border-white/10"))}
            title={isTutorEnabled ? "Tutor Active: Click to turn OFF tutor" : "Tutor Disabled: Click to turn ON tutor"}
          >
            <GraduationCap className={"w-4 h-4 " + (isTutorEnabled ? (isLight ? "text-emerald-700" : "text-emerald-400") : "text-slate-500")} />
            <span>{isTutorEnabled ? "🎓 Tutor: ON" : "🎓 Tutor: OFF"}</span>
          </button>

          <button
            onClick={() => setRightPanelTab("sparring")}
            className={"px-3.5 py-2.5 rounded-xl border text-xs font-extrabold transition-all flex items-center gap-2 cursor-pointer shadow-sm " + (isLight ? "bg-rose-500/15 hover:bg-rose-500/25 text-rose-950 border-rose-600/40" : "bg-rose-600/20 hover:bg-rose-600/30 text-rose-300 border border-rose-500/40")}
          >
            <Swords className={"w-4 h-4 " + (isLight ? "text-rose-700" : "text-rose-400")} />
            Arena Setup
          </button>
        </div>
      </div>

      {/* Main Grid: Left Chessboard (7 cols) + Right Companion Control Hub (5 cols) */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
        {/* Left Column: Board with Fixed Anti-Flicker Dimensions */}
        <div className="lg:col-span-7 flex flex-col items-center gap-3">
          {/* Fixed Height Status Header Container (Clean, High-Contrast Status) */}
          <div className="w-full max-w-[520px] min-h-[46px] flex flex-col justify-center">
            {gameOverInfo ? (
              <div className={"w-full p-3 rounded-2xl border shadow-xl flex items-center justify-between gap-2 " + (gameOverInfo.isWin ? "bg-emerald-950/90 border-emerald-500 text-emerald-100" : "bg-rose-950/90 border-rose-500 text-rose-100")}>
                <div className="flex items-center gap-2 text-xs font-bold">
                  <Trophy className="w-4 h-4 text-amber-400" />
                  <span className="font-extrabold text-sm">{gameOverInfo.title}</span>
                  <span className="text-xs opacity-90">— {gameOverInfo.subtitle}</span>
                </div>
                <button
                  onClick={() => saveMutation.mutate()}
                  className="px-3 py-1 bg-white/20 hover:bg-white/30 text-white rounded-lg text-xs font-bold cursor-pointer"
                >
                  Save
                </button>
              </div>
            ) : isEngineThinking ? (
              <div className="w-full px-4 py-2.5 rounded-2xl bg-blue-950/80 border border-blue-500/50 text-blue-200 text-xs font-sans font-bold flex items-center justify-between shadow-lg animate-pulse">
                <div className="flex items-center gap-2.5">
                  <Cpu className="w-4 h-4 text-blue-400 animate-spin" />
                  <span className="text-white font-bold">{currentEngineObj.name} is calculating...</span>
                </div>
                <span className="text-xs text-blue-300 font-mono font-bold bg-blue-900/60 px-2 py-0.5 rounded-lg border border-blue-500/30">
                  {currentEngineObj.supports_elo ? `${targetElo} Elo` : `${currentEngineObj.elo} Native`}
                </span>
              </div>
            ) : (
              <div className={"w-full px-4 py-2 rounded-2xl border text-xs font-mono font-bold flex items-center justify-between shadow-md " + (isLight ? "bg-white border-slate-300 text-slate-900" : "bg-slate-900/90 border-white/15 text-white")}>
                <div className="flex items-center gap-2.5">
                  <Gauge className={"w-4 h-4 " + (isLight ? "text-emerald-600" : "text-emerald-400")} />
                  <span className={isLight ? "text-slate-900 font-extrabold" : "text-white"}>
                    Eval: <strong className={isLight ? "text-emerald-700 font-black" : "text-emerald-400 font-extrabold"}>{evalScore}</strong> (Ply {moveRecords.length})
                  </span>
                  {selectedBook && selectedBook !== "none" && (
                    <span className={"text-[11px] px-2 py-0.5 rounded-md border font-mono font-bold " + (isLight ? "bg-purple-100 text-purple-950 border-purple-300" : "text-purple-300 bg-purple-950/60 border-purple-500/30")}>
                      📖 {selectedBook}
                    </span>
                  )}
                </div>
                <span className={"text-xs font-black " + (isLight ? "text-cyan-800" : "text-cyan-300")}>
                  {game.turn() === "w" ? "White's Turn" : "Black's Turn"} {playerSide === (game.turn() === "w" ? "white" : "black") ? "(You)" : "(Engine)"}
                </span>
              </div>
            )}
          </div>

          {/* Stable Chessboard Frame with Rigid Dimensions & Tutor In-Game Overlay */}
          <div className="w-[520px] h-[520px] aspect-square rounded-2xl overflow-hidden shadow-2xl border border-slate-700 relative bg-slate-900 flex-shrink-0">
            <Chessboard
              options={{
                position: fen,
                boardOrientation: playerSide,
                onPieceDrop: handlePieceDrop,
                pieces: customChessPieces,
                squareStyles: Object.keys(boardCustomSquareStyles).length > 0 ? boardCustomSquareStyles : undefined,
                arrows: boardArrows.length > 0 ? boardArrows : undefined,
                darkSquareStyle: { backgroundColor: boardTheme?.boardDark || "#4a7c59" },
                lightSquareStyle: { backgroundColor: boardTheme?.boardLight || "#eae5c9" },
              }}
            />

            {/* Quick In-Match Opponent Engine Tuning Modal */}
      {isQuickTuningOpen && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4 animate-in fade-in duration-200">
          <div className={`w-full max-w-md rounded-3xl border shadow-2xl p-6 space-y-5 ${isLight ? "bg-white border-slate-300 text-slate-900" : "bg-[#14171c] border-slate-800 text-white"}`}>
            <div className="flex items-center justify-between border-b pb-3 border-white/10">
              <div className="flex items-center gap-2">
                <Sliders className="w-5 h-5 text-cyan-400" />
                <div>
                  <h3 className="text-sm font-extrabold flex items-center gap-1.5">
                    Quick Tuning: {currentEngineObj.name}
                  </h3>
                  <span className="text-[10px] font-mono text-slate-400">
                    Live match resource controls — adjusts speed &amp; strength instantly
                  </span>
                </div>
              </div>
              <button onClick={() => setIsQuickTuningOpen(false)} className="p-1 text-slate-400 hover:text-white">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-4">
              {/* Thinking Time */}
              <div className={`p-3 rounded-2xl border space-y-1 ${isLight ? "bg-slate-50 border-slate-200" : "bg-black/30 border-white/5"}`}>
                <div className="flex justify-between text-xs font-mono">
                  <span className="font-bold">Thinking Time / Move:</span>
                  <span className="text-cyan-400 font-extrabold">{opponentThinkTimeMs} ms</span>
                </div>
                <input
                  type="range"
                  min="100"
                  max="3000"
                  step="50"
                  value={opponentThinkTimeMs}
                  onChange={(e) => setOpponentThinkTimeMs(Number(e.target.value))}
                  className="w-full accent-cyan-500 cursor-pointer"
                />
                <div className="flex justify-between text-[10px] text-slate-500 font-mono">
                  <span>Fast (100ms)</span>
                  <span>Normal (450ms)</span>
                  <span>Deep (3000ms)</span>
                </div>
              </div>

              {/* Strength Elo if supported */}
              {currentEngineObj.supports_elo && (
                <div className={`p-3 rounded-2xl border space-y-1 ${isLight ? "bg-slate-50 border-slate-200" : "bg-black/30 border-white/5"}`}>
                  <div className="flex justify-between text-xs font-mono">
                    <span className="font-bold">Engine Strength / Skill:</span>
                    <span className="text-emerald-500 font-extrabold">{targetElo} Elo</span>
                  </div>
                  <input
                    type="range"
                    min={minElo}
                    max={maxElo}
                    step="25"
                    value={targetElo}
                    onChange={(e) => setTargetElo(Number(e.target.value))}
                    className="w-full accent-emerald-500 cursor-pointer"
                  />
                  <div className="flex justify-between text-[10px] text-slate-500 font-mono">
                    <span>{minElo} Elo</span>
                    <span>{maxElo} Elo</span>
                  </div>
                </div>
              )}

              {/* CPU Threads */}
              <div className={`p-3 rounded-2xl border space-y-1 ${isLight ? "bg-slate-50 border-slate-200" : "bg-black/30 border-white/5"}`}>
                <div className="flex justify-between text-xs font-mono">
                  <span className="font-bold">CPU Threads:</span>
                  <span className="text-cyan-400 font-extrabold">{opponentThreads} Thread(s)</span>
                </div>
                <input
                  type="range"
                  min="1"
                  max="16"
                  step="1"
                  value={opponentThreads}
                  onChange={(e) => setOpponentThreads(Number(e.target.value))}
                  className="w-full accent-cyan-500 cursor-pointer"
                />
              </div>

              {/* Hash Memory */}
              <div className={`p-3 rounded-2xl border space-y-1 ${isLight ? "bg-slate-50 border-slate-200" : "bg-black/30 border-white/5"}`}>
                <div className="flex justify-between text-xs font-mono">
                  <span className="font-bold">Hash Table Memory:</span>
                  <span className="text-cyan-400 font-extrabold">{opponentHashMb} MB</span>
                </div>
                <input
                  type="range"
                  min="16"
                  max="512"
                  step="16"
                  value={opponentHashMb}
                  onChange={(e) => setOpponentHashMb(Number(e.target.value))}
                  className="w-full accent-cyan-500 cursor-pointer"
                />
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 border-t pt-3 border-white/10">
              <button
                onClick={() => setIsQuickTuningOpen(false)}
                className="px-5 py-2 bg-cyan-600 hover:bg-cyan-500 text-white rounded-xl text-xs font-extrabold shadow cursor-pointer"
              >
                Apply &amp; Continue Match
              </button>
            </div>
          </div>
        </div>
      )}

      {/* In-Game Tutor Flag Overlay */}
            {activeTutorFlag && (
              <div className="absolute inset-x-3 bottom-3 p-3.5 rounded-2xl bg-slate-950/95 border-2 border-amber-500/80 shadow-2xl backdrop-blur-md animate-in slide-in-from-bottom-3 duration-200 z-30">
                <div className="flex items-start justify-between gap-2 mb-2">
                  <div className="flex items-center gap-2">
                    <div className="p-1.5 rounded-lg bg-amber-500/20 text-amber-400">
                      <GraduationCap className="w-4 h-4" />
                    </div>
                    <div>
                      <h4 className="text-xs font-extrabold text-amber-300 font-mono flex items-center gap-1.5">
                        Tutor Feedback: {activeTutorFlag.flag_type === "user_blunder" ? "Blunder Detected" : activeTutorFlag.flag_type === "mistake" ? "Mistake Detected" : "Tactical Alert"}
                        <span className="text-xs text-rose-400 font-bold">(-{activeTutorFlag.loss_cp} cp)</span>
                      </h4>
                      <p className="text-xs text-slate-100 font-semibold">
                        {getTutorHintText(activeTutorFlag)}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-1">
                    {activeTutorFlag.tags.map(getTagBadge)}
                  </div>
                </div>

                <div className="flex items-center gap-2 pt-1 flex-wrap sm:flex-nowrap">
                  {tutorHintDepth === "full" ? (
                    <button
                      onClick={() => handleTutorOutcome("accepted_suggestion", activeTutorFlag.best_move_san)}
                      className="flex-1 py-1.5 px-2.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg text-xs font-bold transition-colors cursor-pointer flex items-center justify-center gap-1 shadow-md shadow-emerald-950/40"
                    >
                      <CheckCircle2 className="w-3.5 h-3.5" />
                      Accept Move ({activeTutorFlag.best_move_san})
                    </button>
                  ) : (
                    <button
                      onClick={() => handleTutorOutcome("accepted_suggestion", activeTutorFlag.best_move_san)}
                      className="flex-1 py-1.5 px-2.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg text-xs font-bold transition-colors cursor-pointer flex items-center justify-center gap-1 shadow-md shadow-emerald-950/40"
                    >
                      <CheckCircle2 className="w-3.5 h-3.5" />
                      Play Best Move
                    </button>
                  )}
                  <button
                    onClick={() => handleTutorOutcome("takeback")}
                    className="py-1.5 px-2.5 bg-amber-600/30 hover:bg-amber-600/50 text-amber-200 rounded-lg text-xs font-bold border border-amber-500/40 cursor-pointer flex items-center gap-1"
                    title="Takeback move to try another one on your own"
                  >
                    <Undo2 className="w-3.5 h-3.5" />
                    Retry
                  </button>
                  <button
                    onClick={() => handleTutorOutcome("played_own_move")}
                    className="py-1.5 px-2.5 bg-slate-800 hover:bg-slate-700 text-white rounded-lg text-xs font-bold border border-white/15 cursor-pointer"
                    title="Keep your played move and continue"
                  >
                    Keep Mine
                  </button>
                  <button
                    onClick={() => handleTutorOutcome("ignored_flag")}
                    className="p-1.5 text-slate-300 hover:text-white rounded-lg cursor-pointer"
                    title="Dismiss"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* Action Toolbar */}
          <div className="w-full max-w-[520px] flex items-center justify-between gap-2 pt-1">
            {!isGameActive ? (
              <button
                onClick={handleStartGame}
                className="flex-1 py-3 bg-gradient-to-r from-rose-600 to-red-600 hover:from-rose-500 hover:to-red-500 text-white text-xs font-extrabold uppercase tracking-wider rounded-xl shadow-lg shadow-rose-950/40 border border-rose-400/30 transition-all flex items-center justify-center gap-2 cursor-pointer active:scale-95"
              >
                <Play className="w-4 h-4 fill-current" />
                Start Sparring Match
              </button>
            ) : (
              <button
                onClick={handleResetGame}
                className="flex-1 py-3 bg-slate-800 hover:bg-slate-700 active:scale-95 text-white text-xs font-extrabold uppercase tracking-wider rounded-xl border border-slate-600 shadow-md transition-all flex items-center justify-center gap-2 cursor-pointer"
              >
                <RotateCcw className="w-4 h-4" />
                {isGameOver ? "New Match" : "Resign & Reset"}
              </button>
            )}

            {/* Prominent GET ADVISE Button */}
            <button
              onClick={() => {
                setRightPanelTab("kibitzer");
                handleGetAdvise();
              }}
              disabled={isKibitzerThinking}
              className="px-4 py-3 bg-gradient-to-r from-cyan-600 to-blue-600 hover:from-cyan-500 hover:to-blue-500 active:scale-95 text-white text-xs font-extrabold uppercase tracking-wider rounded-xl shadow-lg shadow-cyan-950/40 border border-cyan-400/40 transition-all flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
              title="Get Kibitzer Analysis & Advice for Current Position"
            >
              <Sparkles className={`w-4 h-4 ${isKibitzerThinking ? "animate-spin text-cyan-200" : "text-cyan-300"}`} />
              <span>{isKibitzerThinking ? "Thinking..." : "Get Advise"}</span>
            </button>

            {moveHistory.length > 0 && (
              <>
                <button
                  onClick={() => saveMutation.mutate()}
                  disabled={saveMutation.isPending}
                  className="px-3 py-3 bg-slate-800 hover:bg-slate-700 active:scale-95 text-white rounded-xl border border-white/15 text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
                  title={"Save Game to " + SPARRING_DB_NAME}
                >
                  <Save className="w-4 h-4 text-emerald-400" />
                  Save
                </button>

                <button
                  onClick={handleDownloadPgn}
                  className="px-3 py-3 bg-slate-800 hover:bg-slate-700 active:scale-95 text-white rounded-xl border border-white/15 text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer"
                  title="Download PGN File"
                >
                  <Download className="w-4 h-4 text-blue-400" />
                  PGN
                </button>
              </>
            )}

            <button
              onClick={() => setIsBookPanelOpen(!isBookPanelOpen)}
              className={`p-3 rounded-xl border text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer ${
                isBookPanelOpen
                  ? "bg-purple-600 text-white border-purple-400 shadow-md ring-1 ring-purple-400/30"
                  : "bg-slate-800 hover:bg-slate-700 text-purple-300 border-white/15"
              }`}
              title="Toggle Interactive Opening Book Panel"
            >
              <BookOpen className="w-4 h-4" />
              <span>Book</span>
            </button>

            <button
              onClick={handleFlipOrientation}
              className="p-3 rounded-xl bg-slate-800 hover:bg-slate-700 border border-white/15 text-white transition-colors cursor-pointer"
              title="Flip Board Orientation"
            >
              <ArrowUpDown className="w-4 h-4" />
            </button>
          </div>

          {/* Database Destinations Bar */}
          <div className={"w-full max-w-[520px] flex items-center justify-between text-xs font-mono pt-0.5 " + (isLight ? "text-slate-700" : "text-slate-300")}>
            <span>Stores: <strong className={isLight ? "text-slate-950 font-bold" : "text-white font-bold"}>{SPARRING_DB_NAME}</strong>, <strong className={isLight ? "text-slate-950 font-bold" : "text-white font-bold"}>{KIBITZER_DB_NAME}</strong>, <strong className={isLight ? "text-slate-950 font-bold" : "text-white font-bold"}>{TUTOR_DB_NAME}</strong></span>
            {autosaveAlert && <span className="text-emerald-600 dark:text-emerald-400 font-bold">{autosaveAlert}</span>}
            {saveSuccessMsg && <span className="text-cyan-600 dark:text-cyan-400 font-bold">{saveSuccessMsg}</span>}
          </div>

          {/* Ask Grandmaster Integration */}
          <div className="w-full max-w-[520px]">
            <AskGrandmasterAction
              fen={fen}
              evalStr={evalScore}
              mainLine={moveHistory.slice(-3).join(" ")}
              contextNotes={contextNotesStr}
              variant="banner"
            />
          </div>

          {/* Interactive Opening Book Repertoire HUD */}
          {isBookPanelOpen && (
            <div
              className={`w-full max-w-[520px] p-4 rounded-3xl border shadow-xl transition-all space-y-3 ${
                isLight ? "bg-white border-slate-300 text-slate-900" : "bg-[#14171c] border-slate-800 text-white"
              }`}
            >
              <div className="flex items-center justify-between border-b pb-2.5 border-white/10">
                <div className="flex items-center gap-2">
                  <BookOpen className="w-4 h-4 text-purple-400" />
                  <span className="font-extrabold text-xs uppercase tracking-wider">Opening Book Theory</span>
                  {bookProbeData?.in_book ? (
                    <span className="text-[10px] font-mono font-bold px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-600 dark:text-emerald-300 border border-emerald-500/40">
                      In Book
                    </span>
                  ) : (
                    <span className="text-[10px] font-mono font-bold px-2 py-0.5 rounded-full bg-amber-500/20 text-amber-600 dark:text-amber-300 border border-amber-500/40">
                      Out of Book (Novelty)
                    </span>
                  )}
                </div>

                <select
                  value={selectedBook}
                  onChange={(e) => setSelectedBook(e.target.value)}
                  className={`text-[11px] font-mono font-bold rounded-lg px-2 py-1 border outline-none cursor-pointer ${
                    isLight ? "bg-slate-100 border-slate-300 text-slate-900" : "bg-black/60 border-white/20 text-white"
                  }`}
                >
                  {booksData?.map((b) => (
                    <option key={b.filename} value={b.filename}>
                      {b.filename}
                    </option>
                  ))}
                </select>
              </div>

              {/* Theory Info & Candidate Lines */}
              {bookProbeData?.in_book && bookProbeData.candidates && bookProbeData.candidates.length > 0 ? (
                <div className="space-y-2">
                  <div className="flex items-center justify-between text-xs">
                    <span className="font-mono text-slate-400">Candidate Book Moves ({bookProbeData.candidates.length}):</span>
                    {bookProbeData.best_move_san && (
                      <button
                        onClick={() => handleFollowBookMove(bookProbeData.best_move_san, bookProbeData.best_move_uci)}
                        disabled={isEngineThinking || game.isGameOver()}
                        className="px-2.5 py-1 bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-500 hover:to-indigo-500 text-white text-[11px] font-bold rounded-lg transition-all shadow cursor-pointer disabled:opacity-40 flex items-center gap-1"
                      >
                        <Play className="w-3 h-3 fill-current" />
                        Follow Main ({bookProbeData.best_move_san})
                      </button>
                    )}
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5 font-mono text-xs">
                    {bookProbeData.candidates.map((cand, idx) => (
                      <button
                        key={idx}
                        onClick={() => handleFollowBookMove(cand.san, cand.uci)}
                        disabled={isEngineThinking || game.isGameOver()}
                        className={`p-2 rounded-xl border flex items-center justify-between text-left transition-all cursor-pointer disabled:opacity-40 ${
                          cand.san === bookProbeData.best_move_san
                            ? isLight
                              ? "bg-purple-50 border-purple-300 text-purple-950 font-bold"
                              : "bg-purple-950/40 border-purple-500/50 text-purple-200 font-bold"
                            : isLight
                            ? "bg-slate-100 hover:bg-purple-100/60 border-slate-200 text-slate-800"
                            : "bg-black/40 hover:bg-purple-950/20 border-white/10 text-slate-200"
                        }`}
                        title={`Play ${cand.san} (Theory Weight: ${cand.weight}, 0 ACPL loss)`}
                      >
                        <div className="flex items-center gap-1.5">
                          <span className="font-extrabold text-sm">{cand.san}</span>
                          {cand.san === bookProbeData.best_move_san && (
                            <span className="text-[9px] px-1 py-0.2 bg-purple-500/30 text-purple-300 rounded font-bold uppercase">
                              Main
                            </span>
                          )}
                        </div>
                        <div className="flex items-center gap-2">
                          <div className="w-12 h-1.5 rounded-full bg-slate-700/40 overflow-hidden">
                            <div
                              className="h-full bg-purple-500 rounded-full"
                              style={{ width: `${cand.weight_pct}%` }}
                            />
                          </div>
                          <span className="text-[11px] font-bold opacity-90">{cand.weight_pct}%</span>
                        </div>
                      </button>
                    ))}
                  </div>
                </div>
              ) : (
                <div className="p-3 rounded-xl bg-black/20 border border-white/5 text-center text-xs text-slate-400 font-mono">
                  Current position is beyond opening book theory (Novelty / Endgame / Deviation).
                </div>
              )}
            </div>
          )}
        </div>

        {/* Right Column: 3-Tab Companion Control Hub (5 cols) */}
        <div className="lg:col-span-5 space-y-5">
          {/* Navigation Sub-Tabs */}
          <div className={"flex items-center gap-1.5 p-1 rounded-2xl border " + (isLight ? "bg-slate-200/90 border-slate-300 shadow-inner" : "bg-black/40 border-white/10")}>
            <button
              onClick={() => setRightPanelTab("sparring")}
              className={"flex-1 py-2.5 rounded-xl text-xs font-extrabold transition-all flex items-center justify-center gap-1.5 cursor-pointer " + (rightPanelTab === "sparring" ? "bg-rose-600 text-white shadow-lg" : isLight ? "text-slate-800 hover:text-black hover:bg-slate-300/60 font-black" : "text-slate-200 hover:text-white")}
            >
              <Swords className="w-4 h-4" />
              Opponent Setup
            </button>
            <button
              onClick={() => setRightPanelTab("kibitzer")}
              className={"flex-1 py-2.5 rounded-xl text-xs font-extrabold transition-all flex items-center justify-center gap-1.5 cursor-pointer " + (rightPanelTab === "kibitzer" ? "bg-cyan-600 text-white shadow-lg" : isLight ? "text-slate-800 hover:text-black hover:bg-slate-300/60 font-black" : "text-slate-200 hover:text-white")}
            >
              <Sparkles className="w-4 h-4" />
              🧐 Kibitzer
            </button>
            <button
              onClick={() => setRightPanelTab("tutor")}
              className={"flex-1 py-2.5 rounded-xl text-xs font-extrabold transition-all flex items-center justify-center gap-1.5 cursor-pointer " + (rightPanelTab === "tutor" ? "bg-emerald-600 text-white shadow-lg" : isLight ? "text-slate-800 hover:text-black hover:bg-slate-300/60 font-black" : "text-slate-200 hover:text-white")}
            >
              <GraduationCap className="w-4 h-4" />
              🎓 Tutor
            </button>
          </div>

          {/* TAB 1: SPARRING MATCH SETUP */}
          {rightPanelTab === "sparring" && (
            <div className={"p-5 rounded-3xl " + (isLight ? "bg-white border-slate-300 text-slate-900 shadow-lg" : "bg-[#14171c] border-slate-800 text-white shadow-xl") + " border space-y-4"}>
              <div className={"flex items-center justify-between border-b pb-3 " + (isLight ? "border-slate-200" : "border-white/5")}>
                <h2 className={"text-xs font-extrabold uppercase tracking-wider flex items-center gap-2 " + (isLight ? "text-rose-800" : "text-rose-400")}>
                  <Sliders className="w-4 h-4 text-rose-500" />
                  Opponent Engine Selection
                </h2>
                <div className="flex items-center gap-1.5">
                  <button
                    onClick={() => setIsQuickTuningOpen(true)}
                    className="px-2.5 py-1 text-[11px] font-extrabold rounded-lg bg-slate-800 hover:bg-slate-700 text-cyan-300 border border-cyan-500/30 flex items-center gap-1 cursor-pointer"
                    title="Quickly adjust opponent engine threads, hash, thinking time and resources"
                  >
                    <Sliders className="w-3 h-3 text-cyan-400" />
                    Tuning
                  </button>
                  <button
                    onClick={() => setIsAddEngineModalOpen(true)}
                    className="px-2.5 py-1 text-[11px] font-extrabold rounded-lg bg-rose-500/20 hover:bg-rose-500/30 text-rose-600 dark:text-rose-300 border border-rose-500/40 flex items-center gap-1 cursor-pointer"
                  >
                    <Plus className="w-3 h-3" />
                    Add Bot
                  </button>
                </div>
              </div>

              {/* Engine Grid */}
              <div className="grid grid-cols-2 gap-2">
                {engines.map((eng) => (
                  <div
                    key={eng.id}
                    onClick={() => setSelectedEngine(eng.id)}
                    className={"p-2.5 rounded-xl text-left border text-xs font-sans transition-all flex items-center justify-between cursor-pointer group " + (selectedEngine === eng.id ? "bg-rose-500/20 border-rose-500 text-rose-950 dark:text-white font-extrabold ring-1 ring-rose-500 shadow-sm" : isLight ? "bg-slate-100 border-slate-300 text-slate-900 font-bold hover:bg-slate-200" : "bg-black/30 border-white/10 text-slate-300 hover:bg-white/5")}
                  >
                    <div className="flex items-center gap-2 truncate">
                      <span className="text-base">{eng.icon}</span>
                      <div className="truncate">
                        <span className="block truncate font-extrabold">{eng.name}</span>
                        <span className={"text-[10px] font-mono " + (isLight ? "text-slate-700 font-extrabold" : "text-slate-400 font-bold")}>{eng.elo}</span>
                      </div>
                    </div>
                    {eng.is_custom && (
                      <button
                        onClick={(e) => handleDeleteEngine(eng.id, e)}
                        className="opacity-0 group-hover:opacity-100 text-slate-400 hover:text-rose-400 p-1"
                      >
                        <Trash2 className="w-3 h-3" />
                      </button>
                    )}
                  </div>
                ))}
              </div>

              {/* Target Elo */}
              {currentEngineObj.supports_elo ? (
                <div className="space-y-1.5 pt-1">
                  <div className="flex justify-between text-xs font-mono">
                    <span className={isLight ? "text-slate-900 font-extrabold" : "text-slate-200 font-bold"}>Strength Scale (UCI_LimitStrength):</span>
                    <span className="text-rose-600 dark:text-rose-400 font-extrabold">{targetElo} Elo</span>
                  </div>
                  <input
                    type="range"
                    min={minElo}
                    max={maxElo}
                    step="25"
                    value={targetElo}
                    onChange={(e) => setTargetElo(Number(e.target.value))}
                    className="w-full accent-rose-500 cursor-pointer"
                  />
                </div>
              ) : (
                <div className={"p-2.5 rounded-xl border text-[11px] flex items-center gap-2 " + (isLight ? "bg-slate-100 border-slate-300 text-slate-900 font-bold" : "bg-black/20 border-white/5 text-slate-200")}>
                  <span className="text-base">{currentEngineObj.icon}</span>
                  <span>Fixed rating: <strong className={isLight ? "text-slate-950 font-black" : "text-white"}>{currentEngineObj.elo}</strong> (neural/tactical default)</span>
                </div>
              )}

              {/* Opening Book */}
              <div className="space-y-1.5 pt-1">
                <label className={"text-xs font-extrabold block " + (isLight ? "text-slate-900" : "text-slate-200")}>Opening Theory Book (.bin):</label>
                <select
                  value={selectedBook}
                  onChange={(e) => setSelectedBook(e.target.value)}
                  className={"w-full " + (isLight ? "bg-slate-100 border-slate-300 text-slate-950 font-bold" : "bg-black/60 border-white/20 text-white font-bold") + " border rounded-xl px-3 py-2 text-xs font-mono outline-none cursor-pointer focus:border-rose-500"}
                >
                  <option value="GMopenings.bin">GMopenings.bin — Top Grandmaster Theory</option>
                  {booksData?.filter((b) => b.filename !== "GMopenings.bin").map((b) => (
                    <option key={b.filename} value={b.filename}>
                      {b.filename} ({b.category})
                    </option>
                  ))}
                  <option value="none">No Book (Calculate from Move 1)</option>
                </select>
              </div>
            </div>
          )}

          {/* TAB 2: KIBITZER COMPANION ("Roads Not Taken") */}
          {rightPanelTab === "kibitzer" && (
            <div className={"p-5 rounded-3xl " + (isLight ? "bg-white border-slate-300 text-slate-900 shadow-lg" : "bg-[#14171c] border-slate-800 text-white shadow-xl") + " border space-y-4"}>
              <div className={"flex items-center justify-between border-b pb-3 " + (isLight ? "border-slate-200" : "border-white/5")}>
                <div>
                  <h2 className={"text-xs font-extrabold uppercase tracking-wider flex items-center gap-1.5 " + (isLight ? "text-cyan-800" : "text-cyan-400")}>
                    <Sparkles className="w-4 h-4 text-cyan-500" />
                    Kibitzer Companion Engine
                  </h2>
                  <p className={"text-[11px] font-semibold " + (isLight ? "text-slate-700" : "text-slate-300")}>Roads not taken — Alternative variations analysis</p>
                </div>
                <div className="flex items-center gap-1.5">
                  <button
                    onClick={() => setIsKibitzerSettingsOpen(true)}
                    className={"p-2 rounded-xl border text-xs font-bold transition-all cursor-pointer " + (isLight ? "bg-slate-100 hover:bg-slate-200 text-slate-900 border-slate-300" : "bg-slate-800 hover:bg-slate-700 text-white border-white/10")}
                    title="Kibitzer Options & Engine Hardware Settings"
                  >
                    <Settings className="w-3.5 h-3.5 text-cyan-500" />
                  </button>
                  <button
                    onClick={() => handleGetAdvise()}
                    disabled={isKibitzerThinking}
                    className="px-3 py-1.5 rounded-xl bg-cyan-600 hover:bg-cyan-500 text-white text-xs font-extrabold flex items-center gap-1.5 cursor-pointer disabled:opacity-50 shadow-md shadow-cyan-950/20"
                  >
                    {isKibitzerThinking ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Lightbulb className="w-3.5 h-3.5" />}
                    Get Advise
                  </button>
                </div>
              </div>

              {/* Kibitzer Engine & Mode Configuration */}
              <div className="grid grid-cols-2 gap-3 text-xs">
                <div className="space-y-1">
                  <label className={"text-[11px] font-extrabold " + (isLight ? "text-slate-900" : "text-slate-200")}>Kibitzer Engine:</label>
                  <select
                    value={kibitzerEngine}
                    onChange={(e) => setKibitzerEngine(e.target.value)}
                    className={"w-full " + (isLight ? "bg-slate-100 border-slate-300 text-slate-950 font-bold" : "bg-black/60 border-white/20 text-white font-bold") + " border rounded-xl px-2.5 py-2 text-xs outline-none cursor-pointer"}
                  >
                    {engines.map((e) => (
                      <option key={e.id} value={e.id}>
                        {e.icon} {e.name} ({e.elo})
                      </option>
                    ))}
                  </select>
                </div>

                <div className="space-y-1">
                  <label className={"text-[11px] font-extrabold " + (isLight ? "text-slate-900" : "text-slate-200")}>Run Mode:</label>
                  <select
                    value={kibitzerMode}
                    onChange={(e) => {
                      const newMode = e.target.value as any;
                      setKibitzerMode(newMode);
                      if (newMode === "user_clock_bound" || newMode === "continuous") {
                        const effectiveTimeLimitMs = kibitzerSearchMode === "depth" ? null : kibitzerTimeLimitMs;
                        const effectiveDepth = kibitzerSearchMode === "time" ? undefined : kibitzerDepth;
                        fetchEngineVariations({
                          fen: fen,
                          engine_id: kibitzerEngine,
                          depth: effectiveDepth,
                          multipv: kibitzerMultipv,
                          time_limit_ms: effectiveTimeLimitMs,
                          threads: kibitzerThreads,
                          hash_mb: kibitzerHashMb,
                        }).then((res) => {
                          if (res?.variations) setKibitzerVariations(res.variations);
                        }).catch(() => {});
                      }
                    }}
                    className={"w-full " + (isLight ? "bg-slate-100 border-slate-300 text-slate-950 font-bold" : "bg-black/60 border-white/20 text-white font-bold") + " border rounded-xl px-2.5 py-2 text-xs outline-none cursor-pointer"}
                  >
                    <option value="on_demand">On Demand (Manual Click)</option>
                    <option value="user_clock_bound">User Clock Bound (User's Turn)</option>
                    <option value="opponent_clock_bound">Opponent Clock Bound (Opponent's Turn)</option>
                    <option value="continuous">Continuous Background (All Moves)</option>
                  </select>
                </div>
              </div>

              {/* MultiPV Lines Slider & Quick Filters */}
              <div className="space-y-2">
                <div className={"flex justify-between text-xs font-mono " + (isLight ? "text-slate-900 font-extrabold" : "text-slate-200 font-bold")}>
                  <span>Candidate Lines (MultiPV):</span>
                  <span className="text-cyan-600 dark:text-cyan-400 font-black">{kibitzerMultipv} Lines</span>
                </div>
                <input
                  type="range"
                  min="1"
                  max="5"
                  value={kibitzerMultipv}
                  onChange={(e) => setKibitzerMultipv(Number(e.target.value))}
                  className="w-full accent-cyan-500 cursor-pointer"
                />

                {/* Tag Filter Pills */}
                <div className="flex items-center gap-1.5 pt-1 text-[11px]">
                  <span className={"font-extrabold flex items-center gap-1 " + (isLight ? "text-slate-900" : "text-slate-200")}><Filter className="w-3 h-3" /> Filter:</span>
                  {(["all", "tactical", "brilliant", "solid"] as const).map((filterVal) => (
                    <button
                      key={filterVal}
                      onClick={() => setKibitzerTagFilter(filterVal)}
                      className={"px-2.5 py-1 rounded-lg font-extrabold capitalize transition-colors cursor-pointer " + (kibitzerTagFilter === filterVal ? "bg-cyan-600 text-white shadow-sm" : isLight ? "bg-slate-100 border-slate-300 text-slate-800 hover:text-black" : "bg-black/40 text-slate-300 hover:text-white border border-white/10")}
                    >
                      {filterVal}
                    </button>
                  ))}
                </div>
              </div>

              {/* Kibitzer Variations List */}
              <div className="space-y-2 pt-1">
                <h4 className={"text-xs font-extrabold uppercase tracking-wider flex items-center justify-between " + (isLight ? "text-slate-900" : "text-slate-200")}>
                  <span>Candidate Variations ({filteredVariations.length})</span>
                  {kibitzerShowArrows && <span className="text-[10px] text-cyan-600 dark:text-cyan-300 font-extrabold">Visual Arrow: Top Line</span>}
                </h4>
                {filteredVariations.length === 0 ? (
                  <div className={"p-6 rounded-2xl border text-center text-xs font-bold " + (isLight ? "bg-slate-100 border-slate-300 text-slate-800" : "bg-black/40 border-white/10 text-slate-300")}>
                    Click &quot;Get Advise&quot; or select User Clock Bound to compute alternative paths.
                  </div>
                ) : (
                  <div className="space-y-2.5 max-h-64 overflow-y-auto pr-1">
                    {filteredVariations.map((v, idx) => {
                      const scoreFormatted = v.is_mate ? "#" + v.mate_in : "" + ((v.score_cp || 0) / 100.0).toFixed(2);
                      const winProbFormatted = (v.win_prob <= 1 ? (v.win_prob * 100).toFixed(1) : v.win_prob.toFixed(1)) + "% Win";
                      return (
                        <div
                          key={idx}
                          className={"p-3.5 rounded-2xl border transition-all flex flex-col gap-2.5 font-mono text-xs shadow-md " + (isLight ? "bg-slate-100 border-slate-300 text-slate-900 hover:border-cyan-500" : "bg-black/50 border-slate-700/80 hover:border-cyan-500/50 text-white")}
                        >
                          <div className="flex items-center justify-between">
                            <div className="flex items-center gap-2">
                              <span className="w-6 h-6 rounded-lg bg-cyan-500/20 text-cyan-700 dark:text-cyan-300 flex items-center justify-center font-black text-[11px] border border-cyan-500/40">
                                #{idx + 1}
                              </span>
                              <span className={"font-black text-sm tracking-wide " + (isLight ? "text-slate-950" : "text-white")}>{v.pv_san}</span>
                              <span className="px-2 py-0.5 rounded-lg bg-emerald-500/20 text-emerald-700 dark:text-emerald-300 border border-emerald-500/40 font-extrabold text-xs">
                                {kibitzerDisplayFormat === "win_prob" ? winProbFormatted : kibitzerDisplayFormat === "cp" ? scoreFormatted : `${scoreFormatted} · ${winProbFormatted}`}
                              </span>
                            </div>
                            <button
                              onClick={() => handleSaveKibitzerVariation(v)}
                              className="px-3 py-1.5 rounded-xl bg-gradient-to-r from-cyan-600 to-blue-600 hover:from-cyan-500 hover:to-blue-500 active:scale-95 text-white text-xs font-bold flex items-center gap-1.5 cursor-pointer shadow-md shadow-cyan-950/40 border border-cyan-400/50"
                              title={"Save to " + KIBITZER_DB_NAME}
                            >
                              <BookmarkPlus className="w-3.5 h-3.5 fill-current" />
                              <span>Save Line</span>
                            </button>
                          </div>
                          <div className={"flex items-center gap-1.5 flex-wrap pt-1 border-t " + (isLight ? "border-slate-200" : "border-white/5")}>
                            {v.tags.map(getTagBadge)}
                            <span className="text-[10px] text-cyan-700 dark:text-cyan-300 ml-auto font-black font-mono">Depth {v.depth} plies</span>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* TAB 3: TUTOR COMPANION (Reinforcement Flags) */}
          {rightPanelTab === "tutor" && (
            <div className={"p-5 rounded-3xl " + (isLight ? "bg-white border-slate-300 text-slate-900 shadow-lg" : "bg-[#14171c] border-slate-800 text-white shadow-xl") + " border space-y-4"}>
              {/* Master Tutor Power Toggle Card */}
              <div className={"p-3.5 rounded-2xl border flex items-center justify-between transition-all " + (isTutorEnabled ? (isLight ? "bg-emerald-50 border-emerald-300 shadow-sm" : "bg-emerald-950/30 border-emerald-500/40") : (isLight ? "bg-slate-100 border-slate-300" : "bg-black/40 border-white/10"))}>
                <div className="flex items-center gap-2.5">
                  <div className={"p-2 rounded-xl " + (isTutorEnabled ? "bg-emerald-500/20 text-emerald-400" : "bg-slate-700/40 text-slate-400")}>
                    <GraduationCap className="w-5 h-5" />
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <h2 className={"text-xs font-extrabold uppercase tracking-wider " + (isTutorEnabled ? (isLight ? "text-emerald-900" : "text-emerald-300") : (isLight ? "text-slate-600" : "text-slate-400"))}>
                        Tutor Reinforcement Engine
                      </h2>
                      <span className={"text-[10px] font-black uppercase px-2 py-0.5 rounded-md font-mono " + (isTutorEnabled ? "bg-emerald-500 text-white shadow-sm" : "bg-slate-600 text-slate-200")}>
                        {isTutorEnabled ? "Active" : "Disabled"}
                      </span>
                    </div>
                    <p className={"text-[11px] font-medium " + (isLight ? "text-slate-700" : "text-slate-300")}>
                      {isTutorEnabled
                        ? `Real-time blunder detection & coaching overlay (Logs to ${TUTOR_DB_NAME})`
                        : "Tutor is turned off. Play proceeds without coaching interrupts or overlays."}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => setIsTutorSettingsOpen(true)}
                    className={"p-2 rounded-xl border text-xs font-bold transition-all cursor-pointer " + (isLight ? "bg-slate-100 hover:bg-slate-200 text-slate-900 border-slate-300" : "bg-slate-800 hover:bg-slate-700 text-white border-white/10")}
                    title="Tutor Options & Coaching Sensitivity Settings"
                  >
                    <Settings className="w-3.5 h-3.5 text-emerald-500" />
                  </button>
                  {/* Toggle Switch */}
                  <label className="relative inline-flex items-center cursor-pointer">
                    <input
                      type="checkbox"
                      checked={isTutorEnabled}
                      onChange={(e) => {
                        const val = e.target.checked;
                        setIsTutorEnabled(val);
                        if (!val) setActiveTutorFlag(null);
                      }}
                      className="sr-only peer"
                    />
                    <div className="w-11 h-6 bg-slate-700 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-emerald-600"></div>
                  </label>
                </div>
              </div>

              {/* Tutor Engine & Interrupt Mode */}
              <div className="space-y-3 text-xs">
                <div className="space-y-1">
                  <label className={"text-[11px] font-extrabold " + (isLight ? "text-slate-900" : "text-slate-200")}>Tutor Engine:</label>
                  <select
                    value={tutorEngine}
                    onChange={(e) => setTutorEngine(e.target.value)}
                    className={"w-full " + (isLight ? "bg-slate-100 border-slate-300 text-slate-950 font-bold" : "bg-black/60 border-white/20 text-white font-bold") + " border rounded-xl px-2.5 py-2 text-xs outline-none cursor-pointer"}
                  >
                    {engines.map((e) => (
                      <option key={e.id} value={e.id}>
                        {e.icon} {e.name}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="space-y-1.5">
                  <label className={"text-[11px] font-extrabold " + (isLight ? "text-slate-900" : "text-slate-200")}>Interrupt Behavior Mode:</label>
                  <div className="grid grid-cols-2 gap-2">
                    <div
                      onClick={() => setTutorInterruptMode("passive_log")}
                      className={"p-2.5 rounded-xl border text-left cursor-pointer transition-all " + (tutorInterruptMode === "passive_log" ? isLight ? "bg-emerald-500/25 border-emerald-600 text-emerald-950 font-extrabold ring-1 ring-emerald-600 shadow-sm" : "bg-emerald-500/20 border-emerald-500 text-emerald-200 font-bold" : isLight ? "bg-slate-100 border-slate-300 text-slate-900 font-bold hover:bg-slate-200" : "bg-black/40 border-white/10 text-slate-300 hover:bg-white/5")}
                    >
                      <div className={"text-xs font-black " + (tutorInterruptMode === "passive_log" && isLight ? "text-emerald-950" : "")}>Passive Log</div>
                      <div className={"text-[10px] leading-tight " + (tutorInterruptMode === "passive_log" && isLight ? "text-emerald-900 font-bold" : isLight ? "text-slate-700 font-medium" : "text-slate-400 font-normal")}>Logs silently in background; play continues uninterrupted.</div>
                    </div>

                    <div
                      onClick={() => setTutorInterruptMode("freeze_on_flag")}
                      className={"p-2.5 rounded-xl border text-left cursor-pointer transition-all " + (tutorInterruptMode === "freeze_on_flag" ? isLight ? "bg-emerald-500/25 border-emerald-600 text-emerald-950 font-extrabold ring-1 ring-emerald-600 shadow-sm" : "bg-emerald-500/20 border-emerald-500 text-emerald-200 font-bold" : isLight ? "bg-slate-100 border-slate-300 text-slate-900 font-bold hover:bg-slate-200" : "bg-black/40 border-white/10 text-slate-300 hover:bg-white/5")}
                    >
                      <div className={"text-xs font-black " + (tutorInterruptMode === "freeze_on_flag" && isLight ? "text-emerald-950" : "")}>Freeze on Flag</div>
                      <div className={"text-[10px] leading-tight " + (tutorInterruptMode === "freeze_on_flag" && isLight ? "text-emerald-900 font-bold" : isLight ? "text-slate-700 font-medium" : "text-slate-400 font-normal")}>Pauses play on blunders/tactics with interactive overlay.</div>
                    </div>
                  </div>
                </div>

                {/* Hint Depth Mode Selector */}
                <div className="space-y-1 pt-1">
                  <label className={"text-[11px] font-extrabold " + (isLight ? "text-slate-900" : "text-slate-200")}>Coaching Guidance Depth:</label>
                  <div className="grid grid-cols-3 gap-1.5 text-[10px]">
                    {[
                      { id: "full", label: "Full Move", desc: "e.g. 1... Nf6" },
                      { id: "piece_only", label: "Piece Only", desc: "Move Knight" },
                      { id: "strategic", label: "Theme Hint", desc: "Tactical Pin" },
                    ].map((h) => (
                      <button
                        key={h.id}
                        onClick={() => setTutorHintDepth(h.id as any)}
                        className={"p-2 rounded-xl border text-center transition-all cursor-pointer " + (tutorHintDepth === h.id ? isLight ? "bg-emerald-500/25 border-emerald-600 text-emerald-950 font-extrabold ring-1 ring-emerald-600 shadow-sm" : "bg-emerald-500/20 border-emerald-500 text-emerald-200 font-bold" : isLight ? "bg-slate-100 border-slate-300 text-slate-900 font-bold hover:bg-slate-200" : "bg-black/40 border-white/10 text-slate-300 hover:bg-white/5")}
                      >
                        <div className={"font-black text-xs " + (tutorHintDepth === h.id && isLight ? "text-emerald-950" : "")}>{h.label}</div>
                        <div className={"text-[9px] font-mono " + (tutorHintDepth === h.id && isLight ? "text-emerald-900 font-extrabold" : isLight ? "text-slate-700 font-bold" : "text-slate-400 font-medium")}>{h.desc}</div>
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              {/* Status Note */}
              <div className={"p-3 rounded-2xl border text-[11px] leading-relaxed flex items-center justify-between " + (isLight ? "bg-slate-100 border-slate-300 text-slate-900 font-bold shadow-sm" : "bg-black/40 border-white/10 text-slate-200 font-medium")}>
                <span>Threshold: <strong className={isLight ? "text-emerald-800 font-black" : "text-emerald-400 font-black"}>-{tutorBlunderThresholdCp} cp</strong> | Arrow Visualizer: <strong className={isLight ? "text-emerald-800 font-black" : "text-emerald-400 font-black"}>{tutorShowArrow ? "On" : "Off"}</strong></span>
                <button
                  onClick={() => setIsTutorSettingsOpen(true)}
                  className={isLight ? "text-emerald-800 hover:text-emerald-950 text-[11px] font-black underline cursor-pointer" : "text-emerald-400 hover:underline text-[10px] font-bold cursor-pointer"}
                >
                  Configure Options
                </button>
              </div>
            </div>
          )}

          {/* Live Move History List & Centipawn Analysis */}
          <div className={"p-5 rounded-3xl " + (isLight ? "bg-white border-slate-300 text-slate-900 shadow-lg" : "bg-[#14171c] border-slate-800 text-white shadow-xl") + " border space-y-3"}>
            <div className={"flex flex-col sm:flex-row sm:items-center justify-between border-b pb-2.5 gap-2 " + (isLight ? "border-slate-200" : "border-white/5")}>
              <div className="flex items-center gap-2">
                <h3 className={"text-xs font-extrabold uppercase tracking-wider " + (isLight ? "text-slate-900 font-black" : "text-white font-extrabold")}>
                  Match Move Record
                </h3>
                <span className={"font-mono text-[11px] px-2 py-0.5 rounded-md font-bold " + (isLight ? "bg-slate-200 text-slate-800" : "bg-slate-800 text-slate-300")}>
                  {moveRecords.length} plies ({Math.ceil(moveRecords.length / 2)} moves)
                </span>
              </div>

              {/* Checkbox Controls */}
              <div className="flex items-center gap-3 text-[11px]">
                <label className="flex items-center gap-1.5 cursor-pointer select-none font-bold">
                  <input
                    type="checkbox"
                    checked={showAcpl}
                    onChange={(e) => setShowAcpl(e.target.checked)}
                    className="accent-cyan-500 cursor-pointer rounded w-3.5 h-3.5"
                  />
                  <span className={isLight ? "text-slate-800" : "text-slate-300"}>Show ACPL / Eval</span>
                </label>

                <label className="flex items-center gap-1.5 cursor-pointer select-none font-bold">
                  <input
                    type="checkbox"
                    checked={showMoveQualityBadges}
                    onChange={(e) => setShowMoveQualityBadges(e.target.checked)}
                    className="accent-amber-500 cursor-pointer rounded w-3.5 h-3.5"
                  />
                  <span className={isLight ? "text-slate-800" : "text-slate-300"}>Move Badges (!, ?, ⚡)</span>
                </label>
              </div>
            </div>

            {/* Real-Time ACPL & Accuracy Dashboard Bar */}
            {moveRecords.length > 0 && showAcpl && (
              <div className={"grid grid-cols-2 gap-2 p-2 rounded-xl text-xs font-mono " + (isLight ? "bg-slate-100 border border-slate-300" : "bg-black/40 border border-white/10")}>
                <div className="flex items-center justify-between px-2">
                  <span className={isLight ? "text-slate-600 font-bold" : "text-slate-400"}>Player ACPL:</span>
                  <span className="font-extrabold text-emerald-400 font-mono">
                    {userAcpl} cp <span className="text-[10px] text-slate-400">({userAccuracy}%)</span>
                  </span>
                </div>
                <div className="flex items-center justify-between px-2 border-l border-white/10">
                  <span className={isLight ? "text-slate-600 font-bold" : "text-slate-400"}>Engine ACPL:</span>
                  <span className="font-extrabold text-cyan-400 font-mono">
                    {engineAcpl} cp <span className="text-[10px] text-slate-400">({engineAccuracy}%)</span>
                  </span>
                </div>
              </div>
            )}

            {/* Two-Column Move Sheet */}
            <div className={"h-44 overflow-y-auto font-mono text-xs p-2.5 rounded-xl border " + (isLight ? "bg-slate-100 border-slate-300 text-slate-900 shadow-inner" : "bg-black/40 border-white/10 text-white")}>
              {moveRecords.length === 0 ? (
                <div className={"italic text-center py-10 text-xs font-semibold " + (isLight ? "text-slate-600" : "text-slate-400")}>
                  Moves will appear here as the sparring match progresses.
                </div>
              ) : (
                <div className="space-y-1">
                  {/* Render pairs of moves (White & Black) */}
                  {Array.from({ length: Math.ceil(moveRecords.length / 2) }).map((_, moveIdx) => {
                    const whiteRec = moveRecords[moveIdx * 2];
                    const blackRec = moveRecords[moveIdx * 2 + 1];
                    const moveNumber = moveIdx + 1;

                    return (
                      <div key={moveNumber} className={"grid grid-cols-12 items-center gap-1.5 py-1 px-2 rounded-lg transition-colors " + (moveIdx % 2 === 0 ? (isLight ? "bg-slate-200/50" : "bg-white/5") : "bg-transparent")}>
                        <span className={"col-span-2 text-[11px] font-mono font-black " + (isLight ? "text-slate-700" : "text-slate-400")}>
                          {moveNumber}.
                        </span>

                        {/* White Move */}
                        <div className="col-span-5 flex items-center justify-between gap-1">
                          {whiteRec ? (
                            <>
                              <div className="flex items-center gap-1 overflow-hidden">
                                {showMoveQualityBadges && whiteRec.badge && (
                                  <span className={`text-[10px] font-black px-1 py-0.2 rounded font-sans ${getMoveBadgeStyle(whiteRec.tag)}`}>
                                    {whiteRec.badge}
                                  </span>
                                )}
                                <span className={"font-bold text-xs truncate " + (isLight ? "text-slate-950 font-black" : "text-white")}>
                                  {whiteRec.san}
                                </span>
                              </div>
                              {showAcpl && (
                                <span className="text-[10px] text-slate-400 font-mono font-bold">
                                  {whiteRec.eval ? whiteRec.eval : typeof whiteRec.cpLoss === "number" ? `-${whiteRec.cpLoss}cp` : ""}
                                </span>
                              )}
                            </>
                          ) : null}
                        </div>

                        {/* Black Move */}
                        <div className="col-span-5 flex items-center justify-between gap-1">
                          {blackRec ? (
                            <>
                              <div className="flex items-center gap-1 overflow-hidden">
                                {showMoveQualityBadges && blackRec.badge && (
                                  <span className={`text-[10px] font-black px-1 py-0.2 rounded font-sans ${getMoveBadgeStyle(blackRec.tag)}`}>
                                    {blackRec.badge}
                                  </span>
                                )}
                                <span className={"font-bold text-xs truncate " + (isLight ? "text-slate-950 font-black" : "text-white")}>
                                  {blackRec.san}
                                </span>
                              </div>
                              {showAcpl && (
                                <span className="text-[10px] text-slate-400 font-mono font-bold">
                                  {blackRec.eval ? blackRec.eval : typeof blackRec.cpLoss === "number" ? `-${blackRec.cpLoss}cp` : ""}
                                </span>
                              )}
                            </>
                          ) : null}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* KIBITZER ADVANCED SETTINGS POPUP MODAL */}
      {isKibitzerSettingsOpen && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4 z-50 animate-in fade-in">
          <div className="bg-[#181b20] border border-slate-700 w-full max-w-lg rounded-3xl p-6 shadow-2xl space-y-5 text-white">
            <div className="flex items-center justify-between border-b pb-3 border-white/10">
              <div className="flex items-center gap-2">
                <Sparkles className="w-5 h-5 text-cyan-400" />
                <h3 className="font-bold text-sm">Kibitzer Engine &amp; Display Options</h3>
              </div>
              <button onClick={() => setIsKibitzerSettingsOpen(false)} className="p-1 rounded-lg text-slate-400 hover:text-white cursor-pointer">
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="space-y-4 text-xs">
              {/* Hardware Allocation */}
              <div className="p-3.5 rounded-2xl bg-black/40 border border-white/5 space-y-3">
                <h4 className="font-bold text-cyan-300 text-[11px] uppercase tracking-wider flex items-center gap-1.5">
                  <Cpu className="w-3.5 h-3.5" />
                  Engine Hardware &amp; Search Limit Modes
                </h4>

                {/* 3-Way Search Mode Selector */}
                <div className="space-y-1.5 pt-0.5">
                  <label className="text-[11px] font-bold text-slate-300 block">Search Limit Mode:</label>
                  <div className="grid grid-cols-3 gap-2 text-[10px]">
                    {[
                      { id: "depth", label: "Exact Depth", desc: "No time cap (24-50 plies)" },
                      { id: "time", label: "Time Bound", desc: "Clock limit cap" },
                      { id: "both", label: "Hybrid", desc: "Depth + Time" },
                    ].map((m) => (
                      <button
                        key={m.id}
                        onClick={() => setKibitzerSearchMode(m.id as any)}
                        className={"p-2 rounded-xl border text-center transition-all cursor-pointer " + (kibitzerSearchMode === m.id ? "bg-cyan-500/30 border-cyan-400 text-cyan-200 font-extrabold shadow-sm" : "bg-black/40 border-white/10 text-slate-300 hover:text-white")}
                      >
                        <div className="font-bold">{m.label}</div>
                        <div className="text-[9px] opacity-70 font-mono">{m.desc}</div>
                      </button>
                    ))}
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3 pt-1">
                  <div className="space-y-1">
                    <div className="flex justify-between text-[11px] text-slate-400 font-mono">
                      <span>Threads:</span>
                      <span className="text-cyan-400 font-bold">{kibitzerThreads}</span>
                    </div>
                    <input
                      type="range"
                      min="1"
                      max="8"
                      value={kibitzerThreads}
                      onChange={(e) => setKibitzerThreads(Number(e.target.value))}
                      className="w-full accent-cyan-500 cursor-pointer"
                    />
                  </div>

                  <div className="space-y-1">
                    <div className="flex justify-between text-[11px] text-slate-400 font-mono">
                      <span>Hash Size (MB):</span>
                      <span className="text-cyan-400 font-bold">{kibitzerHashMb} MB</span>
                    </div>
                    <input
                      type="range"
                      min="16"
                      max="512"
                      step="16"
                      value={kibitzerHashMb}
                      onChange={(e) => setKibitzerHashMb(Number(e.target.value))}
                      className="w-full accent-cyan-500 cursor-pointer"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3 pt-1">
                  <div className="space-y-1">
                    <div className="flex justify-between items-center text-[11px] text-slate-400 font-mono">
                      <span className={kibitzerSearchMode === "time" ? "opacity-40" : ""}>Target Depth:</span>
                      <input
                        type="number"
                        min="1"
                        max="50"
                        disabled={kibitzerSearchMode === "time"}
                        value={kibitzerDepth}
                        onChange={(e) => setKibitzerDepth(Math.max(1, Math.min(50, Number(e.target.value))))}
                        className="w-14 bg-slate-900 border border-slate-700 text-cyan-400 font-bold rounded px-1 text-right text-xs disabled:opacity-40"
                      />
                    </div>
                    <input
                      type="range"
                      min="1"
                      max="50"
                      disabled={kibitzerSearchMode === "time"}
                      value={kibitzerDepth}
                      onChange={(e) => setKibitzerDepth(Number(e.target.value))}
                      className="w-full accent-cyan-500 cursor-pointer disabled:opacity-40"
                    />
                  </div>

                  <div className="space-y-1">
                    <div className="flex justify-between text-[11px] text-slate-400 font-mono">
                      <span className={kibitzerSearchMode === "depth" ? "opacity-40" : ""}>Time Limit:</span>
                      <span className="text-cyan-400 font-bold">{kibitzerTimeLimitMs} ms</span>
                    </div>
                    <input
                      type="range"
                      min="100"
                      max="5000"
                      step="100"
                      disabled={kibitzerSearchMode === "depth"}
                      value={kibitzerTimeLimitMs}
                      onChange={(e) => setKibitzerTimeLimitMs(Number(e.target.value))}
                      className="w-full accent-cyan-500 cursor-pointer disabled:opacity-40"
                    />
                  </div>
                </div>
              </div>

              {/* Display & Overlay Options */}
              <div className="p-3.5 rounded-2xl bg-black/40 border border-white/5 space-y-3">
                <h4 className="font-bold text-cyan-300 text-[11px] uppercase tracking-wider flex items-center gap-1.5">
                  <Layers className="w-3.5 h-3.5" />
                  Presentation &amp; Visual Overlays
                </h4>

                <div className="space-y-2">
                  <label className="text-[11px] text-slate-400 font-semibold block">Evaluation Format:</label>
                  <div className="grid grid-cols-3 gap-2 text-[10px]">
                    {[
                      { id: "both", label: "Hybrid (+1.25 • 65%)" },
                      { id: "cp", label: "Centipawns (+1.25)" },
                      { id: "win_prob", label: "Win % (65%)" },
                    ].map((fmt) => (
                      <button
                        key={fmt.id}
                        onClick={() => setKibitzerDisplayFormat(fmt.id as any)}
                        className={"p-2 rounded-xl border text-center transition-all cursor-pointer " + (kibitzerDisplayFormat === fmt.id ? "bg-cyan-500/20 border-cyan-500 text-cyan-200 font-bold" : "bg-black/30 border-white/5 text-slate-400")}
                      >
                        {fmt.label}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="flex items-center justify-between pt-1">
                  <span className="text-slate-300 text-[11px]">Show Graphical Board Arrows for Candidate Lines:</span>
                  <input
                    type="checkbox"
                    checked={kibitzerShowArrows}
                    onChange={(e) => setKibitzerShowArrows(e.target.checked)}
                    className="accent-cyan-500 cursor-pointer"
                  />
                </div>

                <div className="flex items-center justify-between">
                  <span className="text-slate-300 text-[11px]">Auto-Save Variations into {KIBITZER_DB_NAME}:</span>
                  <input
                    type="checkbox"
                    checked={kibitzerAutoSave}
                    onChange={(e) => setKibitzerAutoSave(e.target.checked)}
                    className="accent-cyan-500 cursor-pointer"
                  />
                </div>
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 pt-2 border-t border-white/10">
              <button
                onClick={() => {
                  setIsKibitzerSettingsOpen(false);
                  handleGetAdvise(undefined, {
                    engine: kibitzerEngine,
                    depth: kibitzerDepth,
                    multipv: kibitzerMultipv,
                    searchMode: kibitzerSearchMode,
                    timeLimitMs: kibitzerTimeLimitMs,
                    threads: kibitzerThreads,
                    hashMb: kibitzerHashMb,
                  });
                }}
                className="px-5 py-2.5 bg-gradient-to-r from-cyan-600 to-blue-600 hover:from-cyan-500 hover:to-blue-500 text-white rounded-xl text-xs font-extrabold shadow-lg transition-all cursor-pointer active:scale-95"
              >
                Apply &amp; Re-Analyze
              </button>
            </div>
          </div>
        </div>
      )}

      {/* TUTOR ADVANCED SETTINGS POPUP MODAL */}
      {isTutorSettingsOpen && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4 z-50 animate-in fade-in">
          <div className="bg-[#181b20] border border-slate-700 w-full max-w-lg rounded-3xl p-6 shadow-2xl space-y-5 text-white">
            <div className="flex items-center justify-between border-b pb-3 border-white/10">
              <div className="flex items-center gap-2">
                <GraduationCap className="w-5 h-5 text-emerald-400" />
                <h3 className="font-bold text-sm">Tutor Coaching &amp; Sensitivity Options</h3>
              </div>
              <button onClick={() => setIsTutorSettingsOpen(false)} className="p-1 rounded-lg text-slate-400 hover:text-white cursor-pointer">
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="space-y-4 text-xs">
              {/* Master Toggle */}
              <div className="p-3.5 rounded-2xl bg-emerald-950/30 border border-emerald-500/30 flex items-center justify-between">
                <div>
                  <div className="text-xs font-bold text-emerald-300">Tutor Reinforcement System</div>
                  <div className="text-[11px] text-slate-300">Enable real-time blunder detection and overlay interrupts</div>
                </div>
                <label className="relative inline-flex items-center cursor-pointer">
                  <input
                    type="checkbox"
                    checked={isTutorEnabled}
                    onChange={(e) => {
                      const val = e.target.checked;
                      setIsTutorEnabled(val);
                      if (!val) setActiveTutorFlag(null);
                    }}
                    className="sr-only peer"
                  />
                  <div className="w-11 h-6 bg-slate-700 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-emerald-600"></div>
                </label>
              </div>

              {/* Sensitivities */}
              <div className="p-3.5 rounded-2xl bg-black/40 border border-white/5 space-y-3">
                <h4 className="font-bold text-emerald-300 text-[11px] uppercase tracking-wider">
                  Detection Sensitivities
                </h4>

                <div className="space-y-1">
                  <div className="flex justify-between text-[11px] text-slate-400 font-mono">
                    <span>Blunder Alert Threshold:</span>
                    <span className="text-emerald-400 font-bold">-{tutorBlunderThresholdCp} cp</span>
                  </div>
                  <input
                    type="range"
                    min="100"
                    max="350"
                    step="25"
                    value={tutorBlunderThresholdCp}
                    onChange={(e) => setTutorBlunderThresholdCp(Number(e.target.value))}
                    className="w-full accent-emerald-500 cursor-pointer"
                  />
                  <div className="flex justify-between text-[9px] text-slate-500 font-mono">
                    <span>Strict (-100 cp)</span>
                    <span>Standard (-150 cp)</span>
                    <span>Forgiving (-350 cp)</span>
                  </div>
                </div>

                <div className="space-y-1 pt-1">
                  <div className="flex justify-between text-[11px] text-slate-400 font-mono">
                    <span>Mistake Warning Threshold:</span>
                    <span className="text-emerald-400 font-bold">-{tutorMistakeThresholdCp} cp</span>
                  </div>
                  <input
                    type="range"
                    min="50"
                    max="150"
                    step="25"
                    value={tutorMistakeThresholdCp}
                    onChange={(e) => setTutorMistakeThresholdCp(Number(e.target.value))}
                    className="w-full accent-emerald-500 cursor-pointer"
                  />
                </div>
              </div>

              {/* Coaching & Overlay Modes */}
              <div className="p-3.5 rounded-2xl bg-black/40 border border-white/5 space-y-3">
                <h4 className="font-bold text-emerald-300 text-[11px] uppercase tracking-wider">
                  Coaching Hints &amp; Visuals
                </h4>

                <div className="flex items-center justify-between">
                  <span className="text-slate-300 text-[11px]">Alert on Missed Tactical Shots / Sacrifices:</span>
                  <input
                    type="checkbox"
                    checked={tutorAlertTactics}
                    onChange={(e) => setTutorAlertTactics(e.target.checked)}
                    className="accent-emerald-500 cursor-pointer"
                  />
                </div>

                <div className="flex items-center justify-between">
                  <span className="text-slate-300 text-[11px]">Show Graphical Arrow on Suggested Move:</span>
                  <input
                    type="checkbox"
                    checked={tutorShowArrow}
                    onChange={(e) => setTutorShowArrow(e.target.checked)}
                    className="accent-emerald-500 cursor-pointer"
                  />
                </div>
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 pt-2 border-t border-white/10">
              <button
                onClick={() => setIsTutorSettingsOpen(false)}
                className="px-5 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl text-xs font-bold shadow-lg transition-all cursor-pointer"
              >
                Apply &amp; Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Add UCI Engine Modal */}
      {isAddEngineModalOpen && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4 z-50 animate-in fade-in">
          <div className="bg-[#181b20] border border-slate-700 w-full max-w-2xl max-h-[90vh] overflow-y-auto rounded-3xl p-6 shadow-2xl space-y-5 text-white">
            <div className="flex items-center justify-between border-b pb-3 border-white/10">
              <div className="flex items-center gap-2">
                <Cpu className="w-5 h-5 text-rose-500" />
                <div>
                  <h3 className="font-bold text-sm">Register Custom UCI Engine</h3>
                  <span className="text-[10px] font-mono text-slate-400">
                    Inspect all options printed by engine &amp; configure profile parameters
                  </span>
                </div>
              </div>
              <button onClick={() => setIsAddEngineModalOpen(false)} className="p-1 rounded-lg text-slate-400 hover:text-white">
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="space-y-3 text-xs">
              <div>
                <label className="text-[11px] font-semibold text-slate-300 block mb-1">Engine Binary Path (.exe):</label>
                <div className="flex gap-2">
                  <input
                    type="text"
                    placeholder="C:\Engines\my_engine.exe"
                    value={newEnginePath}
                    onChange={(e) => setNewEnginePath(e.target.value)}
                    className="flex-1 px-3 py-2 bg-black/40 border border-white/10 rounded-xl text-xs font-mono text-white outline-none focus:border-rose-500"
                  />
                  <button
                    onClick={handleBrowseEngine}
                    disabled={isBrowsingEngine}
                    className="px-3.5 py-2 bg-slate-800 hover:bg-slate-700 text-white rounded-xl text-xs font-bold flex items-center gap-1.5 cursor-pointer border border-white/10"
                  >
                    <FolderOpen className="w-3.5 h-3.5 text-cyan-400" />
                    Browse
                  </button>
                  <button
                    onClick={() => handleTestEnginePath(newEnginePath)}
                    disabled={isBrowsingEngine || !newEnginePath.trim()}
                    className="px-3.5 py-2 bg-rose-600 hover:bg-rose-500 text-white rounded-xl text-xs font-bold flex items-center gap-1.5 cursor-pointer shadow-md disabled:opacity-50"
                  >
                    <Zap className="w-3.5 h-3.5" />
                    Test UCI
                  </button>
                </div>
              </div>

              <div>
                <label className="text-[11px] font-semibold text-slate-300 block mb-1">Display Name:</label>
                <input
                  type="text"
                  placeholder="Engine Name"
                  value={newEngineName}
                  onChange={(e) => setNewEngineName(e.target.value)}
                  className="w-full px-3 py-2 bg-black/40 border border-white/10 rounded-xl text-xs text-white outline-none focus:border-rose-500"
                />
              </div>

              <div className="grid grid-cols-3 gap-2">
                <div>
                  <label className="text-[11px] font-semibold text-slate-300 block mb-1">Elo Rating:</label>
                  <input
                    type="text"
                    value={newEngineElo}
                    onChange={(e) => setNewEngineElo(e.target.value)}
                    className="w-full px-3 py-2 bg-black/40 border border-white/10 rounded-xl text-xs text-white outline-none focus:border-rose-500"
                  />
                </div>
                <div>
                  <label className="text-[11px] font-semibold text-slate-300 block mb-1">Icon:</label>
                  <input
                    type="text"
                    value={newEngineIcon}
                    onChange={(e) => setNewEngineIcon(e.target.value)}
                    className="w-full px-3 py-2 bg-black/40 border border-white/10 rounded-xl text-xs text-white outline-none focus:border-rose-500 text-center"
                  />
                </div>
                <div>
                  <label className="text-[11px] font-semibold text-slate-300 block mb-1">Style:</label>
                  <input
                    type="text"
                    value={newEngineStyle}
                    onChange={(e) => setNewEngineStyle(e.target.value)}
                    className="w-full px-3 py-2 bg-black/40 border border-white/10 rounded-xl text-xs text-white outline-none focus:border-rose-500"
                  />
                </div>
              </div>

              {uciTestError && (
                <div className="p-2.5 rounded-xl bg-rose-500/20 border border-rose-500/30 text-rose-300 text-xs font-mono">
                  {uciTestError}
                </div>
              )}

              {/* Native UCI Protocol Options Printed by Engine */}
              {testedUciOptions && Object.keys(testedUciOptions).length > 0 && (
                <div className="space-y-2 pt-2 border-t border-white/10">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-extrabold flex items-center gap-1.5 text-cyan-400">
                      <Sliders className="w-4 h-4 text-cyan-400" />
                      All UCI Protocol Options ({Object.keys(testedUciOptions).length} detected):
                    </span>
                    <span className="text-[10px] font-mono text-slate-400">
                      Adjust parameters below — settings will stick to this bot
                    </span>
                  </div>

                  <UciOptionsInspector
                    optionsMap={testedUciOptions}
                    currentValues={newEngineCustomOptions}
                    onChange={(key, val) =>
                      setNewEngineCustomOptions((prev) => ({ ...prev, [key]: val }))
                    }
                    isLight={false}
                  />
                </div>
              )}
            </div>

            <div className="flex items-center justify-end gap-2 pt-2 border-t border-white/10">
              <button
                onClick={() => setIsAddEngineModalOpen(false)}
                className="px-4 py-2 rounded-xl text-xs font-semibold text-slate-300 hover:text-white"
              >
                Cancel
              </button>
              <button
                onClick={handleRegisterEngine}
                disabled={!newEnginePath.trim() || !newEngineName.trim()}
                className="px-5 py-2 bg-rose-600 hover:bg-rose-500 text-white rounded-xl text-xs font-bold shadow-lg transition-all cursor-pointer disabled:opacity-50"
              >
                Save Engine
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
