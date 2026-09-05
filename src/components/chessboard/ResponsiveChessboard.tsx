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
  Bot,
  Settings2,
  Bookmark,
  X,
  RefreshCw,
  Zap,
} from "lucide-react";
import { fetchEngineVariations, fetchEngineEvaluate, logKibitzerVariation, VariationLine } from "../../lib/api";
import { useClickLogger } from "../../lib/clickLogger";
import { Tooltip } from "../common/Tooltip";
import { UXTheme, BoardTheme } from "../../lib/theme";
import { customChessPieces } from "./customPieces";

export interface MoveAnnotation {
  ply: number;
  san: string;
  eval?: string;
  evalCp?: number;
  cpLoss?: number;
  tag?: "best" | "brilliant" | "tactical" | "good" | "inaccuracy" | "mistake" | "blunder" | "book";
  badge?: string;
  badgeLabel?: string;
  comment?: string;
}

export interface AnalysisGameStats {
  hasEngineAnalysis: boolean;
  whiteAcpl?: number;
  blackAcpl?: number;
  whiteAccuracy?: number;
  blackAccuracy?: number;
  totalPlies: number;
  totalMoves: number;
  blunderCount: number;
  mistakeCount: number;
  inaccuracyCount: number;
  goodCount: number;
  bestCount: number;
  bookCount: number;
  tacticalCount: number;
}

export interface ResponsiveChessboardProps {
  pgn?: string;
  boardTheme: BoardTheme;
  uxTheme: UXTheme;
  onPositionChange?: (fen: string) => void;
  onUciLog?: (logs: string[], options?: Record<string, any>) => void;
  onStatsChange?: (stats: AnalysisGameStats) => void;
  isAnalyzingFullGame?: boolean;
  analysisProgress?: { current: number; total: number } | null;
  onRunFullAnalysis?: () => void;
}

export const getMoveBadgeStyle = (tag?: string) => {
  switch (tag) {
    case "brilliant":
      return "bg-amber-500/20 text-amber-500 dark:text-amber-300 border border-amber-500/40 shadow-sm";
    case "best":
      return "bg-emerald-500/20 text-emerald-700 dark:text-emerald-300 border border-emerald-500/40 font-black";
    case "good":
      return "bg-cyan-500/20 text-cyan-700 dark:text-cyan-300 border border-cyan-500/30";
    case "book":
      return "bg-purple-500/20 text-purple-700 dark:text-purple-300 border border-purple-500/40 font-bold";
    case "inaccuracy":
      return "bg-yellow-500/25 text-yellow-800 dark:text-yellow-300 border border-yellow-500/50 font-bold";
    case "mistake":
      return "bg-orange-500/25 text-orange-800 dark:text-orange-300 border border-orange-500/50 font-black";
    case "blunder":
      return "bg-rose-500/25 text-rose-800 dark:text-rose-300 border border-rose-500/50 font-black";
    case "tactical":
      return "bg-indigo-500/25 text-indigo-700 dark:text-indigo-300 border border-indigo-500/40 font-bold";
    default:
      return "bg-slate-500/20 text-slate-700 dark:text-slate-300 border border-slate-500/30";
  }
};

function cleanPgnForChessJs(rawPgn: string): string {
  if (!rawPgn) return "";
  const lines = rawPgn.trim().split("\n");
  const headerLines: string[] = [];
  const bodyLines: string[] = [];
  let inHeader = true;

  for (const line of lines) {
    const trimmed = line.trim();
    if (inHeader) {
      if (trimmed.startsWith("[")) {
        headerLines.push(trimmed);
      } else if (trimmed === "") {
        inHeader = false;
      } else {
        inHeader = false;
        bodyLines.push(line);
      }
    } else {
      bodyLines.push(line);
    }
  }

  let body = bodyLines.join("\n");
  body = body.replace(/\[%[^\]]*\]/g, "");
  body = body.replace(/\{[^}]*\}/g, "");
  body = body.replace(/\s+/g, " ").trim();

  return [...headerLines, "", body].join("\n");
}

function parsePgnAnnotationsAndStats(
  rawPgn: string,
  moves: string[]
): { annotations: MoveAnnotation[]; stats: AnalysisGameStats } {
  if (!rawPgn || moves.length === 0) {
    return {
      annotations: [],
      stats: {
        hasEngineAnalysis: false,
        totalPlies: moves.length,
        totalMoves: Math.ceil(moves.length / 2),
        blunderCount: 0,
        mistakeCount: 0,
        inaccuracyCount: 0,
        goodCount: 0,
        bestCount: 0,
        bookCount: 0,
        tacticalCount: 0,
      },
    };
  }

  const annotations: MoveAnnotation[] = [];
  const lines = rawPgn.trim().split("\n");
  const bodyLines = lines.filter((l) => !l.trim().startsWith("[") || l.trim().startsWith("[%"));
  const fullBody = bodyLines.join(" ");

  let embeddedWhiteAcpl: number | undefined;
  let embeddedBlackAcpl: number | undefined;
  let embeddedWhiteAcc: number | undefined;
  let embeddedBlackAcc: number | undefined;

  const acplMatch =
    rawPgn.match(/\[%acpl[^\]]*user="(\d+)"[^\]]*engine="(\d+)"/i) ||
    rawPgn.match(/\[%acpl[^\]]*white="(\d+)"[^\]]*black="(\d+)"/i);
  if (acplMatch) {
    embeddedWhiteAcpl = parseInt(acplMatch[1], 10);
    embeddedBlackAcpl = parseInt(acplMatch[2], 10);
  }

  const capsMatch = rawPgn.match(/\[%caps[^\]]*user_accuracy="(\d+)%?"[^\]]*engine_accuracy="(\d+)%?"/i);
  if (capsMatch) {
    embeddedWhiteAcc = parseInt(capsMatch[1], 10);
    embeddedBlackAcc = parseInt(capsMatch[2], 10);
  }

  const tokenRegex = /(?:(\d+)\.+)?\s*([a-hKQRBN][a-h1-8x+#=\-0-8\?!]+)(?:\s*\{([^}]*)\})?/g;
  let match: RegExpExecArray | null;

  const moveCommentMap: Array<{ san: string; comment: string }> = [];
  while ((match = tokenRegex.exec(fullBody)) !== null) {
    const rawSan = match[2];
    const comment = match[3] || "";
    if (["1-0", "0-1", "1/2-1/2", "*"].includes(rawSan)) continue;
    moveCommentMap.push({ san: rawSan, comment });
  }

  let blunderCount = 0;
  let mistakeCount = 0;
  let inaccuracyCount = 0;
  let goodCount = 0;
  let bestCount = 0;
  let bookCount = 0;
  let tacticalCount = 0;

  const whiteLosses: number[] = [];
  const blackLosses: number[] = [];
  let prevEvalCp: number | null = null;
  let hasFoundEval = false;

  for (let i = 0; i < moves.length; i++) {
    const cleanSan = moves[i];
    const foundData = moveCommentMap[i];
    const rawSan = foundData?.san || cleanSan;
    const comment = foundData?.comment || "";

    let evalStr: string | undefined;
    let evalCp: number | undefined;
    let tag: MoveAnnotation["tag"] = undefined;
    let badge = "";
    let badgeLabel = "";

    if (rawSan.includes("??")) {
      tag = "blunder";
      badge = "??";
      badgeLabel = "Blunder";
    } else if (rawSan.includes("?!")) {
      tag = "inaccuracy";
      badge = "?!";
      badgeLabel = "Inaccuracy";
    } else if (rawSan.includes("?")) {
      tag = "mistake";
      badge = "?";
      badgeLabel = "Mistake";
    } else if (rawSan.includes("!!")) {
      tag = "brilliant";
      badge = "!!";
      badgeLabel = "Brilliant";
    } else if (rawSan.includes("!")) {
      tag = "good";
      badge = "!";
      badgeLabel = "Good";
    }

    if (comment) {
      const evalM = comment.match(/\[%eval\s+([+-]?\d+\.?\d*|#[+-]?\d+)\]/i);
      if (evalM) {
        evalStr = evalM[1];
        hasFoundEval = true;
        if (!evalStr.startsWith("#")) {
          evalCp = Math.round(parseFloat(evalStr) * 100);
        }
      }

      if (comment.includes("book:") || comment.includes("[book") || comment.toLowerCase().includes("book")) {
        tag = "book";
        badge = "📖";
        badgeLabel = "Book Move";
      } else if (comment.toLowerCase().includes("blunder") || comment.includes("??")) {
        tag = "blunder";
        badge = "??";
        badgeLabel = "Blunder";
      } else if (comment.toLowerCase().includes("mistake") || comment.includes("?")) {
        tag = "mistake";
        badge = "?";
        badgeLabel = "Mistake";
      } else if (comment.toLowerCase().includes("tactic") || comment.includes("⚡")) {
        tag = "tactical";
        badge = "⚡";
        badgeLabel = "Tactical Blow";
      } else if (comment.toLowerCase().includes("best") || comment.includes("✨")) {
        tag = "best";
        badge = "✨";
        badgeLabel = "Best Move";
      }
    }

    let cpLoss = 0;
    const isWhite = i % 2 === 0;
    if (evalCp !== undefined) {
      if (prevEvalCp !== null) {
        cpLoss = isWhite ? Math.max(0, prevEvalCp - evalCp) : Math.max(0, evalCp - prevEvalCp);
        if (isWhite) whiteLosses.push(cpLoss);
        else blackLosses.push(cpLoss);

        if (!tag) {
          if (cpLoss <= 12) {
            tag = "best";
            badge = "✨";
            badgeLabel = "Best Move";
          } else if (cpLoss <= 35) {
            tag = "good";
            badge = "✓";
            badgeLabel = "Good Move";
          } else if (cpLoss <= 90) {
            tag = "inaccuracy";
            badge = "?!";
            badgeLabel = "Inaccuracy";
          } else if (cpLoss <= 200) {
            tag = "mistake";
            badge = "?";
            badgeLabel = "Mistake";
          } else {
            tag = "blunder";
            badge = "??";
            badgeLabel = "Blunder";
          }
        }
      }
      prevEvalCp = evalCp;
    }

    if (tag === "blunder") blunderCount++;
    else if (tag === "mistake") mistakeCount++;
    else if (tag === "inaccuracy") inaccuracyCount++;
    else if (tag === "best" || tag === "brilliant") bestCount++;
    else if (tag === "book") bookCount++;
    else if (tag === "tactical") tacticalCount++;
    else if (tag === "good") goodCount++;

    annotations.push({
      ply: i,
      san: cleanSan,
      eval: evalStr,
      evalCp,
      cpLoss,
      tag,
      badge,
      badgeLabel,
      comment,
    });
  }

  const hasAnalysis = hasFoundEval || embeddedWhiteAcpl !== undefined || whiteLosses.length > 0;

  const calcWhiteAcpl = hasAnalysis
    ? whiteLosses.length > 0
      ? Math.round(whiteLosses.reduce((a, b) => a + b, 0) / whiteLosses.length)
      : embeddedWhiteAcpl
    : undefined;

  const calcBlackAcpl = hasAnalysis
    ? blackLosses.length > 0
      ? Math.round(blackLosses.reduce((a, b) => a + b, 0) / blackLosses.length)
      : embeddedBlackAcpl
    : undefined;

  const whiteAccuracy = hasAnalysis
    ? embeddedWhiteAcc ?? (calcWhiteAcpl !== undefined ? Math.max(35, Math.min(100, Math.round(100 - calcWhiteAcpl * 0.35))) : undefined)
    : undefined;

  const blackAccuracy = hasAnalysis
    ? embeddedBlackAcc ?? (calcBlackAcpl !== undefined ? Math.max(35, Math.min(100, Math.round(100 - calcBlackAcpl * 0.35))) : undefined)
    : undefined;

  return {
    annotations,
    stats: {
      hasEngineAnalysis: hasAnalysis,
      whiteAcpl: calcWhiteAcpl,
      blackAcpl: calcBlackAcpl,
      whiteAccuracy,
      blackAccuracy,
      totalPlies: moves.length,
      totalMoves: Math.ceil(moves.length / 2),
      blunderCount,
      mistakeCount,
      inaccuracyCount,
      goodCount,
      bestCount,
      bookCount,
      tacticalCount,
    },
  };
}

export function ResponsiveChessboard({
  pgn,
  boardTheme,
  uxTheme,
  onPositionChange,
  onUciLog,
  onStatsChange,
}: ResponsiveChessboardProps) {
  const { logAction } = useClickLogger();
  const [currentPosition, setCurrentPosition] = useState("rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1");
  const [history, setHistory] = useState<string[]>([]);
  const [positions, setPositions] = useState<string[]>([]);
  const [moveAnnotations, setMoveAnnotations] = useState<MoveAnnotation[]>([]);
  const [historyIndex, setHistoryIndex] = useState(-1);
  const [orientation, setOrientation] = useState<"white" | "black">("white");
  const [isPlaying, setIsPlaying] = useState(false);
  const [copiedType, setCopiedType] = useState<"fen" | "pgn" | null>(null);

  // Display toggles for Move Notation table
  const [showBadges, setShowBadges] = useState(true);
  const [showEvals, setShowEvals] = useState(true);

  // Live Batch Analysis State
  const [isAnalyzingFullGame, setIsAnalyzingFullGame] = useState(false);
  const [analysisProgress, setAnalysisProgress] = useState<{ current: number; total: number } | null>(null);

  const timerRef = useRef<number | null>(null);
  const lastLoadedPgnRef = useRef<string | null>(null);
  const onPositionChangeRef = useRef(onPositionChange);
  const onUciLogRef = useRef(onUciLog);
  const onStatsChangeRef = useRef(onStatsChange);
  const logActionRef = useRef(logAction);

  // Tab State: 'moves' | 'kibitzer'
  const [activeSideTab, setActiveSideTab] = useState<"moves" | "kibitzer">("moves");

  // Kibitzer Multi-PV Analysis State & Settings
  const [isKibitzerOpen, setIsKibitzerOpen] = useState(false);
  const [isKibitzerThinking, setIsKibitzerThinking] = useState(false);
  const [kibitzerVariations, setKibitzerVariations] = useState<VariationLine[]>([]);
  const [isKibitzerSettingsOpen, setIsKibitzerSettingsOpen] = useState(false);
  const [kibitzerContinuous, setKibitzerContinuous] = useState(true);
  const [kibitzerDepth, setKibitzerDepth] = useState(20);
  const [kibitzerMultipv, setKibitzerMultipv] = useState(3);
  const [kibitzerSearchMode, setKibitzerSearchMode] = useState<"depth" | "time" | "both">("depth");
  const [kibitzerTimeLimitMs] = useState(1000);
  const [kibitzerThreads, setKibitzerThreads] = useState(1);
  const [kibitzerHashMb, setKibitzerHashMb] = useState(64);
  const [kibitzerEngine, setKibitzerEngine] = useState("patricia");
  const [kibitzerSavedAlert, setKibitzerSavedAlert] = useState<string | null>(null);
  const [savedVariationKeys, setSavedVariationKeys] = useState<Record<string, boolean>>({});

  useEffect(() => {
    onPositionChangeRef.current = onPositionChange;
    onUciLogRef.current = onUciLog;
    onStatsChangeRef.current = onStatsChange;
    logActionRef.current = logAction;
  });

  const handleRequestKibitzerAdvice = useCallback(
    async (
      targetFen?: string,
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
      const fenToAnalyze = targetFen || currentPosition;
      const engineToUse = overrides?.engine ?? kibitzerEngine;
      const depthToUse = overrides?.depth ?? kibitzerDepth;
      const multipvToUse = overrides?.multipv ?? kibitzerMultipv;
      const modeToUse = overrides?.searchMode ?? kibitzerSearchMode;
      const timeMsToUse = overrides?.timeLimitMs ?? kibitzerTimeLimitMs;
      const threadsToUse = overrides?.threads ?? kibitzerThreads;
      const hashToUse = overrides?.hashMb ?? kibitzerHashMb;

      const effectiveTimeLimitMs = modeToUse === "depth" ? null : timeMsToUse;
      const effectiveDepth = modeToUse === "time" ? undefined : depthToUse;

      setIsKibitzerThinking(true);
      try {
        const res = await fetchEngineVariations({
          fen: fenToAnalyze,
          engine_id: engineToUse,
          depth: effectiveDepth,
          multipv: multipvToUse,
          time_limit_ms: effectiveTimeLimitMs,
          threads: threadsToUse,
          hash_mb: hashToUse,
        });

        if (res?.variations) {
          setKibitzerVariations(res.variations);
          if (res.uci_log && onUciLogRef.current) {
            onUciLogRef.current(res.uci_log, res.uci_options);
          }
        }
      } catch (err: any) {
        console.warn("Kibitzer analysis query failed:", err);
      } finally {
        setIsKibitzerThinking(false);
      }
    },
    [
      currentPosition,
      kibitzerEngine,
      kibitzerDepth,
      kibitzerMultipv,
      kibitzerSearchMode,
      kibitzerTimeLimitMs,
      kibitzerThreads,
      kibitzerHashMb,
    ]
  );

  // Live Batch Full-Game Engine Analysis
  const handleRunFullGameAnalysis = async () => {
    if (positions.length === 0 || isAnalyzingFullGame) return;
    setIsAnalyzingFullGame(true);
    setAnalysisProgress({ current: 0, total: positions.length });
    logActionRef.current("CLICK", "Started Full Game Batch Analysis", `Evaluating ${positions.length} plies`);

    const annotationsList: MoveAnnotation[] = [];
    const whiteLosses: number[] = [];
    const blackLosses: number[] = [];

    let blunderCount = 0;
    let mistakeCount = 0;
    let inaccuracyCount = 0;
    let goodCount = 0;
    let bestCount = 0;
    let bookCount = 0;
    let tacticalCount = 0;

    let prevCp = 0;

    for (let i = 0; i < positions.length; i++) {
      const fen = positions[i];
      setAnalysisProgress({ current: i + 1, total: positions.length });
      const san = history[i] || "";
      const isWhite = i % 2 === 0;

      try {
        const res = await fetchEngineEvaluate({
          fen,
          depth: 14,
          time_limit_ms: 300,
        });

        const currentCp = res.eval_cp ?? 0;
        const evalStr = res.eval_score || `${(currentCp / 100).toFixed(2)}`;

        const cpLoss = isWhite ? Math.max(0, prevCp - currentCp) : Math.max(0, currentCp - prevCp);
        if (isWhite) whiteLosses.push(cpLoss);
        else blackLosses.push(cpLoss);

        let tag: MoveAnnotation["tag"] = "good";
        let badge = "✓";
        let badgeLabel = "Good Move";

        if (cpLoss <= 10) {
          tag = "best";
          badge = "✨";
          badgeLabel = "Best Move";
          bestCount++;
        } else if (cpLoss <= 35) {
          tag = "good";
          badge = "✓";
          badgeLabel = "Good Move";
          goodCount++;
        } else if (cpLoss <= 90) {
          tag = "inaccuracy";
          badge = "?!";
          badgeLabel = "Inaccuracy";
          inaccuracyCount++;
        } else if (cpLoss <= 200) {
          tag = "mistake";
          badge = "?";
          badgeLabel = "Mistake";
          mistakeCount++;
        } else {
          tag = "blunder";
          badge = "??";
          badgeLabel = "Blunder";
          blunderCount++;
        }

        prevCp = currentCp;

        annotationsList.push({
          ply: i,
          san,
          eval: evalStr,
          evalCp: currentCp,
          cpLoss,
          tag,
          badge,
          badgeLabel,
        });
      } catch {
        annotationsList.push({
          ply: i,
          san,
          tag: "good",
          badge: "✓",
        });
        goodCount++;
      }
    }

    const calcWhiteAcpl = whiteLosses.length > 0 ? Math.round(whiteLosses.reduce((a, b) => a + b, 0) / whiteLosses.length) : 0;
    const calcBlackAcpl = blackLosses.length > 0 ? Math.round(blackLosses.reduce((a, b) => a + b, 0) / blackLosses.length) : 0;
    const whiteAccuracy = Math.max(30, Math.min(100, Math.round(100 - calcWhiteAcpl * 0.35)));
    const blackAccuracy = Math.max(30, Math.min(100, Math.round(100 - calcBlackAcpl * 0.35)));

    const newStats: AnalysisGameStats = {
      hasEngineAnalysis: true,
      whiteAcpl: calcWhiteAcpl,
      blackAcpl: calcBlackAcpl,
      whiteAccuracy,
      blackAccuracy,
      totalPlies: history.length,
      totalMoves: Math.ceil(history.length / 2),
      blunderCount,
      mistakeCount,
      inaccuracyCount,
      goodCount,
      bestCount,
      bookCount,
      tacticalCount,
    };

    setMoveAnnotations(annotationsList);
    if (onStatsChangeRef.current) {
      onStatsChangeRef.current(newStats);
    }
    setIsAnalyzingFullGame(false);
    setAnalysisProgress(null);
    logActionRef.current("API", "Completed Full Game Engine Analysis", `White Accuracy: ${whiteAccuracy}%, Black Accuracy: ${blackAccuracy}%`);
  };

  const handleSaveVariationToDb = async (variation: VariationLine, idx: number) => {
    const key = `${currentPosition}_${idx}`;
    try {
      await logKibitzerVariation({
        game_id: "Analysis-Session",
        ply: historyIndex + 1,
        fen: currentPosition,
        engine: kibitzerEngine === "stockfish" ? "Stockfish 18" : "Patricia v4",
        pgn_fragment: variation.pv_san || variation.pv_uci || "",
        eval_data: {
          score_cp: variation.score_cp,
          depth: variation.depth,
          nps: variation.nps,
        },
        trigger_source: "continuous",
        logged_by: "user_save",
        was_played: false,
      });

      setSavedVariationKeys((prev) => ({ ...prev, [key]: true }));
      setKibitzerSavedAlert(`Saved Variation #${idx + 1} to Kibitzer_Analysis.sqlite`);
      logActionRef.current("CLICK", `Saved Kibitzer Variation #${idx + 1} to DB`, variation.pv_san);
      setTimeout(() => setKibitzerSavedAlert(null), 3500);
    } catch (err: any) {
      logActionRef.current("ERROR", "Failed to save Kibitzer variation", err.message);
    }
  };

  useEffect(() => {
    if (!pgn || pgn === lastLoadedPgnRef.current) return;
    lastLoadedPgnRef.current = pgn;

    try {
      const chess = new Chess();
      const cleaned = cleanPgnForChessJs(pgn);
      chess.loadPgn(cleaned);
      const moves = chess.history();

      const runner = new Chess();
      const fens: string[] = [];
      for (const m of moves) {
        runner.move(m);
        fens.push(runner.fen());
      }

      const { annotations, stats } = parsePgnAnnotationsAndStats(pgn, moves);
      setMoveAnnotations(annotations);
      if (onStatsChangeRef.current) {
        onStatsChangeRef.current(stats);
      }

      const startFen = new Chess().fen();
      setHistory(moves);
      setPositions(fens);
      setHistoryIndex(-1);
      setCurrentPosition(startFen);

      if (onPositionChangeRef.current) onPositionChangeRef.current(startFen);
      logActionRef.current("BOARD", `Loaded Game with ${moves.length} moves`, `Start FEN: ${startFen}`);

      if (isKibitzerOpen && kibitzerContinuous) {
        handleRequestKibitzerAdvice(startFen);
      }
    } catch (e) {
      console.warn("Primary loadPgn failed, attempting token fallback...", e);
      try {
        const noHeaders = pgn.replace(/\[[^\]]*\]/g, "").replace(/\{[^}]*\}/g, "").replace(/\[%[^\]]*\]/g, "");
        const tokens = noHeaders.split(/\s+/).filter((t) => t && !t.includes(".") && !["1-0", "0-1", "1/2-1/2", "*"].includes(t));
        const runner = new Chess();
        const moves: string[] = [];
        const fens: string[] = [];
        for (const tok of tokens) {
          try {
            const mv = runner.move(tok);
            if (mv) {
              moves.push(mv.san);
              fens.push(runner.fen());
            }
          } catch {
            break;
          }
        }
        const { annotations, stats } = parsePgnAnnotationsAndStats(pgn, moves);
        setMoveAnnotations(annotations);
        if (onStatsChangeRef.current) {
          onStatsChangeRef.current(stats);
        }

        const startFen = new Chess().fen();
        setHistory(moves);
        setPositions(fens);
        setHistoryIndex(-1);
        setCurrentPosition(startFen);

        if (onPositionChangeRef.current) onPositionChangeRef.current(startFen);
        logActionRef.current("BOARD", `Loaded Game via fallback with ${moves.length} moves`, `Start FEN: ${startFen}`);

        if (isKibitzerOpen && kibitzerContinuous) {
          handleRequestKibitzerAdvice(startFen);
        }
      } catch (err2) {
        console.error("Failed to load PGN with fallback", err2);
        logActionRef.current("BOARD", "Error loading PGN", String(err2));
      }
    }
  }, [pgn, isKibitzerOpen, kibitzerContinuous, handleRequestKibitzerAdvice]);

  const updateToMove = useCallback(
    (index: number) => {
      if (index < -1 || index >= history.length) return;

      const startFen = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1";
      let newFen: string;
      if (index === -1) {
        newFen = startFen;
      } else if (positions[index]) {
        newFen = positions[index];
      } else {
        const tempGame = new Chess();
        for (let i = 0; i <= index; i++) {
          tempGame.move(history[i]);
        }
        newFen = tempGame.fen();
      }

      setCurrentPosition(newFen);
      setHistoryIndex(index);
      if (onPositionChangeRef.current) onPositionChangeRef.current(newFen);
      const moveText =
        index >= 0 ? `${Math.floor(index / 2) + 1}${index % 2 === 0 ? "." : "..."} ${history[index]}` : "Start Position";
      logActionRef.current("NAV", `Navigated to Move ${index + 1}/${history.length}`, moveText);

      if (isKibitzerOpen && kibitzerContinuous) {
        handleRequestKibitzerAdvice(newFen);
      }
    },
    [history, positions, isKibitzerOpen, kibitzerContinuous, handleRequestKibitzerAdvice]
  );

  const handlePieceDrop = useCallback(
    ({
      sourceSquare,
      targetSquare,
    }: {
      sourceSquare: string;
      targetSquare: string | null;
    }): boolean => {
      if (!targetSquare) return false;
      try {
        const currentBoard = new Chess(currentPosition);
        const move = currentBoard.move({
          from: sourceSquare,
          to: targetSquare,
          promotion: "q",
        });
        if (move) {
          const newFen = currentBoard.fen();
          setCurrentPosition(newFen);
          const newHistory = [...history.slice(0, historyIndex + 1), move.san];
          const newPositions = [...positions.slice(0, historyIndex + 1), newFen];
          setHistory(newHistory);
          setPositions(newPositions);
          setHistoryIndex(newHistory.length - 1);
          if (onPositionChangeRef.current) onPositionChangeRef.current(newFen);
          logActionRef.current("BOARD", `Played Move on Board: ${move.san}`, `New FEN: ${newFen}`);

          if (isKibitzerOpen && kibitzerContinuous) {
            handleRequestKibitzerAdvice(newFen);
          }
          return true;
        }
      } catch (err) {
        console.warn("Illegal move attempted", err);
      }
      return false;
    },
    [currentPosition, history, positions, historyIndex, isKibitzerOpen, kibitzerContinuous, handleRequestKibitzerAdvice]
  );

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
    logActionRef.current("BOARD", `Flipped board orientation to ${nextOrientation}`);
  };

  const handleCopyFen = async () => {
    await navigator.clipboard.writeText(currentPosition);
    setCopiedType("fen");
    logActionRef.current("BOARD", "Copied FEN to clipboard", currentPosition);
    setTimeout(() => setCopiedType(null), 2000);
  };

  const handleCopyPgn = async () => {
    if (pgn) {
      await navigator.clipboard.writeText(pgn);
      setCopiedType("pgn");
      logActionRef.current("BOARD", "Copied PGN to clipboard");
      setTimeout(() => setCopiedType(null), 2000);
    }
  };

  const toggleAutoPlay = () => {
    setIsPlaying((prev) => {
      const next = !prev;
      logActionRef.current("BOARD", next ? "Started Auto-Play" : "Paused Auto-Play");
      return next;
    });
  };

  useEffect(() => {
    if (isPlaying) {
      timerRef.current = window.setInterval(() => {
        setHistoryIndex((prevIndex) => {
          if (prevIndex >= history.length - 1) {
            setIsPlaying(false);
            return prevIndex;
          }
          const nextIndex = prevIndex + 1;
          const nextFen =
            positions[nextIndex] ||
            (() => {
              const temp = new Chess();
              for (let i = 0; i <= nextIndex; i++) temp.move(history[i]);
              return temp.fen();
            })();
          setCurrentPosition(nextFen);
          if (onPositionChangeRef.current) onPositionChangeRef.current(nextFen);
          if (isKibitzerOpen && kibitzerContinuous) {
            handleRequestKibitzerAdvice(nextFen);
          }
          return nextIndex;
        });
      }, 1000);
    } else {
      if (timerRef.current) clearInterval(timerRef.current);
    }
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [isPlaying, history, positions, isKibitzerOpen, kibitzerContinuous, handleRequestKibitzerAdvice]);

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

  const boardCustomSquareStyles: Record<string, { backgroundColor: string }> = {};
  if (isKibitzerOpen && kibitzerVariations.length > 0) {
    const colors = [
      "rgba(16, 185, 129, 0.45)",
      "rgba(6, 182, 212, 0.40)",
      "rgba(245, 158, 11, 0.40)",
    ];
    kibitzerVariations.slice(0, 3).forEach((v, idx) => {
      if (v.pv_uci && v.pv_uci.length >= 4) {
        const fromSq = v.pv_uci.slice(0, 2);
        const toSq = v.pv_uci.slice(2, 4);
        if (!boardCustomSquareStyles[fromSq]) {
          boardCustomSquareStyles[fromSq] = { backgroundColor: colors[idx] || colors[0] };
        }
        if (!boardCustomSquareStyles[toSq]) {
          boardCustomSquareStyles[toSq] = { backgroundColor: colors[idx] || colors[0] };
        }
      }
    });
  }

  const isLightUX = uxTheme.mode === "light";

  return (
    <div className="flex flex-col lg:flex-row h-full gap-6 select-none">
      {/* Chessboard Container */}
      <div
        className={`flex-grow flex flex-col rounded-3xl shadow-2xl overflow-hidden border ${uxTheme.panel} ${uxTheme.border}`}
      >
        <div className="flex-grow p-4 md:p-6 flex items-center justify-center min-h-0 relative">
          <div className="w-[min(100%,calc(100vh-270px))] max-w-[480px] xl:max-w-[530px] aspect-square rounded-2xl overflow-hidden shadow-2xl border border-black/20 relative">
            <Chessboard
              options={{
                position: currentPosition,
                boardOrientation: orientation,
                onPieceDrop: handlePieceDrop,
                pieces: customChessPieces,
                squareStyles: Object.keys(boardCustomSquareStyles).length > 0 ? boardCustomSquareStyles : undefined,
                darkSquareStyle: { backgroundColor: boardTheme.boardDark },
                lightSquareStyle: { backgroundColor: boardTheme.boardLight },
                animationDurationInMs: 200,
              }}
            />

            {kibitzerSavedAlert && (
              <div className="absolute top-3 inset-x-4 p-2.5 rounded-xl bg-emerald-950/90 border border-emerald-500 text-emerald-200 text-xs font-mono font-bold shadow-xl backdrop-blur-sm animate-in fade-in flex items-center gap-2 z-30">
                <Check className="w-4 h-4 text-emerald-400" />
                <span>{kibitzerSavedAlert}</span>
              </div>
            )}
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
                className={`p-2 rounded-xl transition-colors disabled:opacity-30 cursor-pointer ${
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
                className={`p-2 rounded-xl transition-colors disabled:opacity-30 cursor-pointer ${
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
                className="p-2 text-emerald-500 hover:text-emerald-400 rounded-xl hover:bg-emerald-500/10 transition-colors cursor-pointer"
              >
                {isPlaying ? <Pause className="w-5 h-5" /> : <Play className="w-5 h-5" />}
              </button>
            </Tooltip>

            <Tooltip content="Next Move" description="Step forward one ply" shortcut="→">
              <button
                onClick={handleNext}
                disabled={historyIndex >= history.length - 1}
                className={`p-2 rounded-xl transition-colors disabled:opacity-30 cursor-pointer ${
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
                className={`p-2 rounded-xl transition-colors disabled:opacity-30 cursor-pointer ${
                  isLightUX
                    ? "text-slate-600 hover:text-slate-900 hover:bg-slate-200"
                    : "text-slate-400 hover:text-white hover:bg-white/10"
                }`}
              >
                <ChevronsRight className="w-5 h-5" />
              </button>
            </Tooltip>
          </div>

          {/* Kibitzer & Batch Analysis Buttons */}
          <div className="flex items-center gap-1.5">
            <Tooltip content={isKibitzerOpen ? "Hide Kibitzer Multi-PV Analysis" : "Launch Kibitzer Multi-PV Analysis"}>
              <button
                onClick={() => {
                  const next = !isKibitzerOpen;
                  setIsKibitzerOpen(next);
                  if (next) {
                    setActiveSideTab("kibitzer");
                    handleRequestKibitzerAdvice(currentPosition);
                  }
                  logActionRef.current("CLICK", next ? "Launched Kibitzer in Analysis" : "Closed Kibitzer");
                }}
                className={`px-3 py-1.5 rounded-xl font-mono text-xs font-bold transition-all flex items-center gap-1.5 shadow-md cursor-pointer ${
                  isKibitzerOpen
                    ? "bg-gradient-to-r from-cyan-600 to-blue-600 text-white border border-cyan-400 ring-2 ring-cyan-500/20"
                    : isLightUX
                    ? "bg-slate-200 text-slate-700 hover:bg-slate-300"
                    : "bg-slate-800 text-slate-300 hover:bg-slate-700 border border-white/10"
                }`}
              >
                <Bot className={`w-3.5 h-3.5 ${isKibitzerThinking ? "animate-spin text-cyan-300" : "text-cyan-400"}`} />
                <span>Kibitzer</span>
                {isKibitzerThinking && <span className="w-1.5 h-1.5 rounded-full bg-cyan-400 animate-ping" />}
              </button>
            </Tooltip>

            {isKibitzerOpen && (
              <Tooltip content="Kibitzer Engine & Search Settings">
                <button
                  onClick={() => setIsKibitzerSettingsOpen(true)}
                  className="p-1.5 rounded-xl bg-slate-800/80 hover:bg-slate-700 text-slate-300 hover:text-white border border-white/10 text-xs transition-colors cursor-pointer"
                >
                  <Settings2 className="w-3.5 h-3.5 text-cyan-400" />
                </button>
              </Tooltip>
            )}

            <div
              className={`font-mono text-xs px-3 py-1.5 rounded-xl border ${
                isLightUX
                  ? "bg-white text-slate-700 border-slate-200"
                  : "bg-black/30 text-slate-300 border-white/10"
              }`}
            >
              Ply {historyIndex + 1} / {history.length}
            </div>
          </div>

          <div className="flex items-center gap-1.5">
            <Tooltip content="Flip Board Orientation" description="Switch view between White and Black" shortcut="F">
              <button
                onClick={handleFlip}
                className={`p-2 rounded-xl transition-colors cursor-pointer ${
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
                className={`p-2 rounded-xl transition-colors cursor-pointer ${
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
                className={`p-2 rounded-xl transition-colors cursor-pointer ${
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

      {/* Side Column: Move Notation & Kibitzer Analysis */}
      <div
        className={`w-full lg:w-80 flex-shrink-0 rounded-3xl shadow-2xl border flex flex-col overflow-hidden ${uxTheme.panel} ${uxTheme.border}`}
      >
        {/* Header Tabs */}
        <div
          className={`px-3 py-2.5 border-b flex items-center justify-between ${
            isLightUX ? "bg-slate-100 border-slate-300" : "bg-black/40 border-white/10"
          }`}
        >
          <div className="flex items-center gap-1">
            <button
              onClick={() => setActiveSideTab("moves")}
              className={`px-3 py-1 rounded-lg text-xs font-extrabold transition-colors cursor-pointer ${
                activeSideTab === "moves"
                  ? isLightUX
                    ? "bg-emerald-600 text-white shadow-sm"
                    : "bg-emerald-500/20 text-emerald-300 border border-emerald-500/40"
                  : isLightUX
                  ? "text-slate-800 hover:text-black font-extrabold"
                  : "text-slate-300 hover:text-white"
              }`}
            >
              Move Notation
            </button>
            <button
              onClick={() => {
                setActiveSideTab("kibitzer");
                if (!isKibitzerOpen) {
                  setIsKibitzerOpen(true);
                  handleRequestKibitzerAdvice(currentPosition);
                }
              }}
              className={`px-3 py-1 rounded-lg text-xs font-extrabold transition-colors flex items-center gap-1.5 cursor-pointer ${
                activeSideTab === "kibitzer"
                  ? isLightUX
                    ? "bg-cyan-600 text-white shadow-sm"
                    : "bg-cyan-500/20 text-cyan-300 border border-cyan-500/40"
                  : isLightUX
                  ? "text-slate-800 hover:text-black font-extrabold"
                  : "text-slate-300 hover:text-white"
              }`}
            >
              <Bot className={"w-3.5 h-3.5 " + (activeSideTab === "kibitzer" && isLightUX ? "text-white" : "text-cyan-500")} />
              <span>Kibitzer</span>
              {isKibitzerThinking && <span className="w-1.5 h-1.5 rounded-full bg-cyan-400 animate-ping" />}
            </button>
          </div>

          <div className="flex items-center gap-1.5">
            {activeSideTab === "moves" ? (
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setShowBadges(!showBadges)}
                  className={`text-[10px] font-mono px-1.5 py-0.5 rounded font-bold transition-all cursor-pointer ${
                    showBadges
                      ? "bg-emerald-500/20 text-emerald-700 dark:text-emerald-300 border border-emerald-500/40"
                      : "bg-slate-500/10 text-slate-400 border border-slate-500/20"
                  }`}
                  title="Toggle Move Quality Badges"
                >
                  Badges
                </button>
                <button
                  onClick={() => setShowEvals(!showEvals)}
                  className={`text-[10px] font-mono px-1.5 py-0.5 rounded font-bold transition-all cursor-pointer ${
                    showEvals
                      ? "bg-cyan-500/20 text-cyan-700 dark:text-cyan-300 border border-cyan-500/40"
                      : "bg-slate-500/10 text-slate-400 border border-slate-500/20"
                  }`}
                  title="Toggle Evaluation Scores"
                >
                  Eval
                </button>

                <Tooltip content="Copy entire PGN notation">
                  <button
                    onClick={handleCopyPgn}
                    className={`text-xs font-mono flex items-center gap-1 transition-colors font-extrabold cursor-pointer ml-1 ${
                      isLightUX ? "text-emerald-700 hover:text-emerald-900" : "text-emerald-400 hover:text-emerald-300"
                    }`}
                  >
                    {copiedType === "pgn" ? <Check className="w-3.5 h-3.5 text-emerald-500" /> : <Copy className="w-3.5 h-3.5" />}
                  </button>
                </Tooltip>
              </div>
            ) : (
              <Tooltip content="Evaluate current position">
                <button
                  onClick={() => handleRequestKibitzerAdvice(currentPosition)}
                  disabled={isKibitzerThinking}
                  className={`text-xs font-mono flex items-center gap-1 transition-colors disabled:opacity-50 cursor-pointer font-extrabold ${
                    isLightUX ? "text-cyan-700 hover:text-cyan-900" : "text-cyan-400 hover:text-cyan-300"
                  }`}
                >
                  <RefreshCw className={`w-3.5 h-3.5 ${isKibitzerThinking ? "animate-spin" : ""}`} />
                  Eval
                </button>
              </Tooltip>
            )}
          </div>
        </div>

        {/* Tab Content */}
        {activeSideTab === "moves" ? (
          /* Interactive Move List with Badges & Indicators */
          <div className="flex-grow overflow-y-auto p-2 space-y-0.5 font-mono text-xs flex flex-col justify-between">
            <div className="space-y-0.5">
              <button
                onClick={() => updateToMove(-1)}
                className={`w-full text-left px-2.5 py-1.5 rounded-lg transition-colors flex items-center justify-between text-xs mb-1.5 cursor-pointer font-bold ${
                  historyIndex === -1
                    ? "bg-emerald-500/25 text-emerald-600 dark:text-emerald-300 font-extrabold border border-emerald-500/50 shadow-sm"
                    : isLightUX
                    ? "text-slate-800 hover:bg-slate-200"
                    : "text-slate-200 hover:bg-white/10"
                }`}
              >
                <span>🏁 Start Position</span>
                <span className="text-[10px] opacity-80 font-mono">Ply 0</span>
              </button>

              {movePairs.map((pair) => {
                const whiteMeta = moveAnnotations[pair.whiteIdx];
                const blackMeta = pair.blackIdx !== undefined ? moveAnnotations[pair.blackIdx] : undefined;

                return (
                  <div
                    key={pair.moveNum}
                    className={`flex items-center rounded-lg px-1.5 py-1 transition-colors ${
                      isLightUX ? "hover:bg-slate-200/70" : "hover:bg-white/5"
                    }`}
                  >
                    <span className={`w-7 font-extrabold text-xs font-mono flex-shrink-0 ${isLightUX ? "text-slate-700" : "text-slate-400"}`}>
                      {pair.moveNum}.
                    </span>

                    {/* White Move Button */}
                    <button
                      onClick={() => updateToMove(pair.whiteIdx)}
                      className={`flex-1 text-left px-2 py-1 rounded-md transition-all cursor-pointer font-mono flex items-center justify-between gap-1 min-w-0 ${
                        historyIndex === pair.whiteIdx
                          ? "bg-emerald-500/25 text-emerald-800 dark:text-emerald-300 font-extrabold border border-emerald-500/50 shadow-sm"
                          : isLightUX
                          ? "text-slate-900 hover:bg-slate-200"
                          : "text-white hover:bg-white/15"
                      }`}
                    >
                      <span className="font-bold text-xs truncate">{pair.white}</span>
                      <div className="flex items-center gap-1 flex-shrink-0">
                        {showBadges && whiteMeta?.badge && (
                          <span
                            className={`text-[10px] px-1 py-0.2 rounded font-bold ${getMoveBadgeStyle(whiteMeta.tag)}`}
                            title={whiteMeta.badgeLabel || whiteMeta.tag}
                          >
                            {whiteMeta.badge}
                          </span>
                        )}
                        {showEvals && whiteMeta?.eval && (
                          <span className="text-[9px] px-1 py-0.2 rounded font-mono font-semibold bg-slate-500/15 text-slate-600 dark:text-slate-400">
                            {whiteMeta.eval}
                          </span>
                        )}
                      </div>
                    </button>

                    {/* Black Move Button */}
                    {pair.black ? (
                      <button
                        onClick={() => updateToMove(pair.blackIdx!)}
                        className={`flex-1 text-left px-2 py-1 rounded-md transition-all cursor-pointer font-mono flex items-center justify-between gap-1 min-w-0 ml-1 ${
                          historyIndex === pair.blackIdx
                            ? "bg-emerald-500/25 text-emerald-800 dark:text-emerald-300 font-extrabold border border-emerald-500/50 shadow-sm"
                            : isLightUX
                            ? "text-slate-900 hover:bg-slate-200"
                            : "text-white hover:bg-white/15"
                        }`}
                      >
                        <span className="font-bold text-xs truncate">{pair.black}</span>
                        <div className="flex items-center gap-1 flex-shrink-0">
                          {showBadges && blackMeta?.badge && (
                            <span
                              className={`text-[10px] px-1 py-0.2 rounded font-bold ${getMoveBadgeStyle(blackMeta.tag)}`}
                              title={blackMeta.badgeLabel || blackMeta.tag}
                            >
                              {blackMeta.badge}
                            </span>
                          )}
                          {showEvals && blackMeta?.eval && (
                            <span className="text-[9px] px-1 py-0.2 rounded font-mono font-semibold bg-slate-500/15 text-slate-600 dark:text-slate-400">
                              {blackMeta.eval}
                            </span>
                          )}
                        </div>
                      </button>
                    ) : (
                      <div className="flex-1 ml-1" />
                    )}
                  </div>
                );
              })}
            </div>

            {/* Quick In-Table Batch Analysis CTA */}
            {moveAnnotations.every((m) => !m.eval) && positions.length > 0 && (
              <div className="pt-3 pb-1 border-t border-white/10 mt-2">
                <button
                  onClick={handleRunFullGameAnalysis}
                  disabled={isAnalyzingFullGame}
                  className="w-full py-2 bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white font-extrabold text-xs rounded-xl shadow-md transition-all flex items-center justify-center gap-1.5 cursor-pointer disabled:opacity-50"
                >
                  {isAnalyzingFullGame ? (
                    <>
                      <RefreshCw className="w-3 h-3 animate-spin" />
                      <span>
                        Analyzing Ply {analysisProgress?.current ?? 0}/{analysisProgress?.total ?? positions.length}...
                      </span>
                    </>
                  ) : (
                    <>
                      <Zap className="w-3 h-3 text-amber-300" />
                      <span>⚡ Run Full Game Analysis</span>
                    </>
                  )}
                </button>
              </div>
            )}
          </div>
        ) : (
          /* Kibitzer Multi-PV Analysis Tab */
          <div className="flex-grow overflow-y-auto p-3 space-y-3 font-mono text-xs">
            <div className="p-2.5 rounded-xl bg-cyan-950/40 border border-cyan-800/40 flex items-center justify-between text-[11px]">
              <div className="flex items-center gap-1.5 text-cyan-300 font-semibold">
                <Bot className="w-3.5 h-3.5 text-cyan-400" />
                <span>{kibitzerEngine === "stockfish" ? "Stockfish 18" : "Patricia v4"} (Depth {kibitzerDepth})</span>
              </div>
              <label className="flex items-center gap-1 text-[10px] text-slate-300 cursor-pointer">
                <input
                  type="checkbox"
                  checked={kibitzerContinuous}
                  onChange={(e) => setKibitzerContinuous(e.target.checked)}
                  className="accent-cyan-500 cursor-pointer"
                />
                <span>Auto-Step</span>
              </label>
            </div>

            {isKibitzerThinking ? (
              <div className="py-8 text-center space-y-2">
                <RefreshCw className="w-5 h-5 text-cyan-400 animate-spin mx-auto" />
                <p className="text-xs text-slate-400 font-mono">Computing Multi-PV variations to Depth {kibitzerDepth}...</p>
              </div>
            ) : kibitzerVariations.length === 0 ? (
              <div className="py-8 text-center space-y-3">
                <p className="text-slate-500 text-xs italic">No variations calculated for this position yet.</p>
                <button
                  onClick={() => handleRequestKibitzerAdvice(currentPosition)}
                  className="px-3 py-1.5 bg-cyan-600 hover:bg-cyan-500 text-white rounded-xl text-xs font-bold transition-all shadow cursor-pointer"
                >
                  Analyze Position
                </button>
              </div>
            ) : (
              <div className="space-y-3">
                {kibitzerVariations.map((v, idx) => {
                  const score = v.score_cp ?? 0;
                  const isPositive = score >= 0;
                  const scoreStr =
                    v.score_cp !== undefined && v.score_cp !== null
                      ? `${isPositive ? "+" : ""}${(score / 100).toFixed(2)}`
                      : v.is_mate && v.mate_in !== undefined && v.mate_in !== null
                      ? `#${v.mate_in}`
                      : "0.00";

                  const winProb =
                    v.win_prob !== undefined
                      ? `${(v.win_prob * 100).toFixed(1)}%`
                      : `${Math.max(1, Math.min(99, Math.round(50 + 50 * (2 / (1 + Math.exp(-0.004 * score)) - 1))))}%`;

                  const movesText = v.pv_san || v.pv_uci || "";
                  const key = `${currentPosition}_${idx}`;
                  const isSaved = savedVariationKeys[key];

                  return (
                    <div
                      key={idx}
                      className="p-3 rounded-2xl bg-black/40 border border-white/10 hover:border-cyan-500/40 transition-colors space-y-2"
                    >
                      <div className="flex items-center justify-between text-[11px]">
                        <div className="flex items-center gap-1.5">
                          <span className="w-5 h-5 rounded-md bg-cyan-500/20 text-cyan-300 font-bold flex items-center justify-center text-[10px]">
                            {idx + 1}
                          </span>
                          <span
                            className={`font-black px-2 py-0.5 rounded ${
                              isPositive
                                ? "bg-emerald-500/20 text-emerald-300 border border-emerald-500/30"
                                : "bg-rose-500/20 text-rose-300 border border-rose-500/30"
                            }`}
                          >
                            {scoreStr}
                          </span>
                          <span className="text-slate-400 font-bold text-[10px]">
                            Win: <strong className="text-cyan-300">{winProb}</strong>
                          </span>
                        </div>

                        <div className="flex items-center gap-1.5">
                          <span className="text-[10px] text-slate-400">d:{v.depth || kibitzerDepth}</span>
                          <button
                            onClick={() => handleSaveVariationToDb(v, idx)}
                            disabled={isSaved}
                            className={`px-2 py-0.5 rounded text-[10px] font-bold transition-all flex items-center gap-1 cursor-pointer ${
                              isSaved
                                ? "bg-emerald-500/20 text-emerald-300 border border-emerald-500/40"
                                : "bg-white/10 hover:bg-cyan-500/20 text-slate-300 hover:text-cyan-300 border border-white/15"
                            }`}
                          >
                            {isSaved ? (
                              <>
                                <Check className="w-3 h-3 text-emerald-400" />
                                <span>Saved</span>
                              </>
                            ) : (
                              <>
                                <Bookmark className="w-3 h-3" />
                                <span>Save</span>
                              </>
                            )}
                          </button>
                        </div>
                      </div>

                      <div className="text-xs text-slate-200 font-mono leading-relaxed bg-black/30 p-2 rounded-xl border border-white/5 select-text">
                        {movesText || <span className="text-slate-500 italic">No line returned</span>}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Kibitzer Settings Modal */}
      {isKibitzerSettingsOpen && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div
            className={`w-full max-w-md rounded-3xl border p-6 shadow-2xl space-y-4 ${uxTheme.panel} ${uxTheme.border}`}
          >
            <div className="flex items-center justify-between border-b pb-3 border-white/10">
              <div className="flex items-center gap-2 text-cyan-400 font-extrabold text-sm">
                <Settings2 className="w-4 h-4" />
                <span>Kibitzer Engine & Search Settings</span>
              </div>
              <button
                onClick={() => setIsKibitzerSettingsOpen(false)}
                className="p-1 rounded-lg hover:bg-white/10 text-slate-400 hover:text-white transition-colors cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="space-y-3 text-xs font-mono">
              <div className="space-y-1">
                <label className="text-slate-300 font-bold block">Engine Selection</label>
                <select
                  value={kibitzerEngine}
                  onChange={(e) => setKibitzerEngine(e.target.value)}
                  className="w-full p-2.5 rounded-xl bg-black/40 border border-white/15 text-white outline-none cursor-pointer"
                >
                  <option value="patricia">Patricia v4 (Fast NNUE)</option>
                  <option value="stockfish">Stockfish 18 (Grandmaster UCI)</option>
                </select>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="text-slate-300 font-bold block">Search Depth (Plies)</label>
                  <input
                    type="number"
                    min={10}
                    max={50}
                    value={kibitzerDepth}
                    onChange={(e) => setKibitzerDepth(Math.max(10, parseInt(e.target.value) || 20))}
                    className="w-full p-2.5 rounded-xl bg-black/40 border border-white/15 text-white outline-none"
                  />
                </div>

                <div className="space-y-1">
                  <label className="text-slate-300 font-bold block">Multi-PV Lines</label>
                  <select
                    value={kibitzerMultipv}
                    onChange={(e) => setKibitzerMultipv(parseInt(e.target.value) || 3)}
                    className="w-full p-2.5 rounded-xl bg-black/40 border border-white/15 text-white outline-none cursor-pointer"
                  >
                    <option value={1}>1 Line (Best Move Only)</option>
                    <option value={2}>2 Lines</option>
                    <option value={3}>3 Lines (Default)</option>
                    <option value={4}>4 Lines</option>
                    <option value={5}>5 Lines</option>
                  </select>
                </div>
              </div>

              <div className="space-y-1">
                <label className="text-slate-300 font-bold block">Search Mode Limit</label>
                <div className="grid grid-cols-3 gap-2">
                  {(["depth", "time", "both"] as const).map((m) => (
                    <button
                      key={m}
                      onClick={() => setKibitzerSearchMode(m)}
                      className={`p-2 rounded-xl text-center font-bold capitalize transition-colors cursor-pointer border ${
                        kibitzerSearchMode === m
                          ? "bg-cyan-500/20 text-cyan-300 border-cyan-500"
                          : "bg-white/5 text-slate-400 border-white/10 hover:bg-white/10"
                      }`}
                    >
                      {m === "depth" ? "Depth Only" : m === "time" ? "Time Limit" : "Both"}
                    </button>
                  ))}
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="text-slate-300 font-bold block">Threads</label>
                  <input
                    type="number"
                    min={1}
                    max={16}
                    value={kibitzerThreads}
                    onChange={(e) => setKibitzerThreads(Math.max(1, parseInt(e.target.value) || 1))}
                    className="w-full p-2.5 rounded-xl bg-black/40 border border-white/15 text-white outline-none"
                  />
                </div>

                <div className="space-y-1">
                  <label className="text-slate-300 font-bold block">Hash (MB)</label>
                  <input
                    type="number"
                    min={16}
                    max={2048}
                    step={16}
                    value={kibitzerHashMb}
                    onChange={(e) => setKibitzerHashMb(Math.max(16, parseInt(e.target.value) || 64))}
                    className="w-full p-2.5 rounded-xl bg-black/40 border border-white/15 text-white outline-none"
                  />
                </div>
              </div>
            </div>

            <div className="pt-2">
              <button
                onClick={() => {
                  setIsKibitzerSettingsOpen(false);
                  handleRequestKibitzerAdvice(currentPosition);
                }}
                className="w-full py-2.5 bg-gradient-to-r from-cyan-600 to-blue-600 hover:from-cyan-500 hover:to-blue-500 text-white font-extrabold rounded-xl transition-all shadow-lg cursor-pointer text-xs"
              >
                Apply &amp; Re-Analyze
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
