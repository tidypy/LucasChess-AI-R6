import { useEffect, useState, useRef } from "react";
import { Wing } from "./components/layout/Wing";
import { DesktopMenu } from "./components/layout/DesktopMenu";
import { ResponsiveChessboard, AnalysisGameStats } from "./components/chessboard/ResponsiveChessboard";
import { OpeningBookPanel } from "./features/analysis/OpeningBookPanel";
import { GameStatsPanel } from "./features/analysis/GameStatsPanel";
import { DatabaseBrowserView } from "./features/database/browser/DatabaseBrowserView";
import { AIGrandmasterView } from "./features/ai_grandmaster/AIGrandmasterView";
import { EnginesView } from "./features/engines/EnginesView";
import { AskGrandmasterAction } from "./features/ai_grandmaster/AskGrandmasterAction";
import { SparView } from "./features/sparring/SparView";
import { BookBuilderView } from "./features/book_builder/BookBuilderView";
import { ThemeCustomizer } from "./components/theme/ThemeCustomizer";
import { ClickLogConsole } from "./components/debug/ClickLogConsole";
import { Tooltip } from "./components/common/Tooltip";
import { ErrorBoundary } from "./components/common/ErrorBoundary";
import { useQuery } from "@tanstack/react-query";
import { fetchGame, fetchDatabases } from "./lib/api";
import {
  UXTheme,
  BoardTheme,
  CustomThemeSettings,
  loadSavedUXTheme,
  loadSavedBoardTheme,
  loadCustomSettings,
} from "./lib/theme";
import { useClickLogger } from "./lib/clickLogger";
import {
  Sparkles,
  RefreshCw,
  Terminal,
  Copy,
  Check,
  Trash2,
  ChevronLeft,
  ChevronRight,
} from "lucide-react";

function MainApp() {
  const { logAction, isLogConsoleOpen, setIsLogConsoleOpen } = useClickLogger();

  // Active Workspace / Tab
  const [activeView, setActiveView] = useState<string>("Analysis");

  // Game Selection
  const [gameId, setGameId] = useState<number>(1);
  const [activeGameDb, setActiveGameDb] = useState<string>("patriciaTourny.sqlite");
  const [currentBoardFen, setCurrentBoardFen] = useState<string>("rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1");
  const [analysisStats, setAnalysisStats] = useState<AnalysisGameStats | undefined>(undefined);

  // Theme Management
  const [currentUXTheme, setCurrentUXTheme] = useState<UXTheme>(loadSavedUXTheme);
  const [currentBoardTheme, setCurrentBoardTheme] = useState<BoardTheme>(loadSavedBoardTheme);
  const [customSettings, setCustomSettings] = useState<CustomThemeSettings>(loadCustomSettings);
  const [isThemeModalOpen, setIsThemeModalOpen] = useState<boolean>(false);
  const [themeModalTab, setThemeModalTab] = useState<"ux" | "board" | "custom">("ux");

  // Engine UCI Log & Options State (Replaces raw SSE stream)
  const [engineUciLogs, setEngineUciLogs] = useState<string[]>([
    ">> uci",
    "<< id name Patricia 4.0",
    "<< id author Adam Kulju",
    ">> setoption name Threads value 1",
    ">> setoption name Hash value 64",
    ">> isready",
    "<< readyok",
    "[STATUS] Engine initialized & ready for position analysis",
  ]);
  const [engineUciOptions, setEngineUciOptions] = useState<Record<string, any>>({
    "Engine": "Patricia 4.0",
    "Author": "Adam Kulju",
    "Threads": 1,
    "Hash (MB)": 64,
    "Multi-PV": 3,
    "Status": "Ready",
  });
  const [uciViewTab, setUciViewTab] = useState<"stream" | "options">("stream");
  const [uciCopied, setUciCopied] = useState(false);

  // Query Available Databases
  const { data: dbList } = useQuery({
    queryKey: ["databases"],
    queryFn: fetchDatabases,
  });

  // Fetch Game Query
  const { data: gameData, isLoading, isError, refetch } = useQuery({
    queryKey: ["game", gameId, activeGameDb],
    queryFn: () => fetchGame(gameId, activeGameDb),
    retry: 1,
  });

  // Keep fresh ref to logAction to prevent stale closures
  const logActionRef = useRef(logAction);
  useEffect(() => {
    logActionRef.current = logAction;
  });

  const handleOpenTheme = (tab: "ux" | "board" | "custom") => {
    setThemeModalTab(tab);
    setIsThemeModalOpen(true);
  };

  const isLight = currentUXTheme.mode === "light";

  return (
    <div
      className={`flex h-screen w-full font-sans overflow-hidden transition-colors duration-200 ${
        customSettings.uxMode === "custom"
          ? "text-slate-100"
          : `${currentUXTheme.bg} ${currentUXTheme.text}`
      }`}
      style={
        customSettings.uxMode === "custom"
          ? { backgroundColor: customSettings.uxBg, color: customSettings.uxText }
          : undefined
      }
    >
      {/* Left Wing Navigation */}
      <Wing
        activeView={activeView}
        onSelectView={(view) => {
          setActiveView(view);
          logAction("NAV", `Selected view: ${view}`);
        }}
        onOpenThemeCustomizer={handleOpenTheme}
        onToggleDebugConsole={() => setIsLogConsoleOpen(!isLogConsoleOpen)}
        isConsoleOpen={isLogConsoleOpen}
        uxTheme={currentUXTheme}
      />

      {/* Main Content Area */}
      <div className="flex-grow flex flex-col min-w-0 h-full overflow-hidden">
        {/* Top Desktop Menu */}
        <DesktopMenu
          activeView={activeView}
          onSelectView={setActiveView}
          currentUXTheme={currentUXTheme}
          currentBoardTheme={currentBoardTheme}
          onOpenThemeCustomizer={handleOpenTheme}
        />

        {/* Workspace Content */}
        <div className="flex-grow p-4 md:p-6 overflow-hidden flex flex-col gap-4 min-h-0">
          {activeView === "Analysis" || activeView === "Play" ? (
            <div className="flex-grow flex flex-col lg:flex-row gap-6 overflow-hidden min-h-0">
              {/* Main Board View */}
              <div className="flex-grow h-full min-h-0">
                {isLoading ? (
                  <div
                    className={`h-full flex items-center justify-center rounded-3xl border animate-pulse ${
                      isLight
                        ? "bg-white border-slate-200 text-slate-500"
                        : "bg-slate-900/60 border-slate-800 text-slate-400"
                    }`}
                  >
                    <div className="flex flex-col items-center gap-3">
                      <RefreshCw className="w-8 h-8 animate-spin text-emerald-500" />
                      <span className="font-mono text-sm font-semibold">
                        Loading Game from Python Core...
                      </span>
                    </div>
                  </div>
                ) : isError ? (
                  <div
                    className={`h-full flex items-center justify-center rounded-3xl border p-6 ${
                      isLight
                        ? "bg-rose-50 border-rose-200 text-rose-950"
                        : "bg-slate-900/80 border-rose-900/40 text-rose-300"
                    }`}
                  >
                    <div className="text-center space-y-3">
                      <div className="font-bold text-base">Backend Sidecar Disconnected</div>
                      <p className="text-xs opacity-80 max-w-sm">
                        Could not reach http://127.0.0.1:8000. Ensure the Python sidecar is running.
                      </p>
                      <Tooltip content="Retry fetching game data">
                        <button
                          onClick={() => refetch()}
                          className="px-4 py-2 text-xs font-bold bg-slate-900 text-white dark:bg-slate-100 dark:text-slate-900 rounded-xl transition-colors shadow-sm"
                        >
                          Retry Connection
                        </button>
                      </Tooltip>
                    </div>
                  </div>
                ) : (
                    <ResponsiveChessboard
                      pgn={gameData?.pgn}
                      boardTheme={currentBoardTheme}
                      uxTheme={currentUXTheme}
                      onPositionChange={setCurrentBoardFen}
                      onStatsChange={setAnalysisStats}
                      onUciLog={(logs, options) => {
                        setEngineUciLogs(logs);
                        if (options) setEngineUciOptions(options);
                      }}
                    />
                  )}
                </div>

                {/* Right Panel: AI Dossier & Engine UCI Output */}
                <div className="w-full lg:w-80 flex-shrink-0 flex flex-col gap-4 min-h-0 overflow-y-auto">
                  {/* AI Dossier Panel */}
                  <div
                    className={`rounded-3xl border p-5 shadow-2xl flex flex-col transition-colors duration-200 ${currentUXTheme.panel} ${currentUXTheme.border}`}
                  >
                    <div className="flex items-center justify-between mb-3">
                      <h2
                        className={`text-xs font-extrabold uppercase tracking-wider flex items-center gap-2 ${
                          isLight ? "text-emerald-800" : "text-emerald-300"
                        }`}
                      >
                        <Sparkles className="w-4 h-4 text-emerald-500 animate-pulse" />
                        Game Info &amp; Analysis
                      </h2>
                      {/* Database Switcher */}
                      <select
                        value={activeGameDb}
                        onChange={(e) => {
                          setActiveGameDb(e.target.value);
                          setGameId(1);
                          logAction("CLICK", `Switched Analysis Database to ${e.target.value}`);
                        }}
                        className={`text-[11px] font-mono font-extrabold rounded-lg px-2 py-0.5 border outline-none cursor-pointer ${
                          isLight ? "bg-emerald-500/10 border-emerald-500/30 text-emerald-950" : "bg-emerald-950/40 border-emerald-500/40 text-emerald-300"
                        }`}
                      >
                        {dbList && dbList.length > 0 ? (
                          dbList.map((d) => (
                            <option key={d.name} value={d.name}>
                              {d.name}
                            </option>
                          ))
                        ) : (
                          <option value={activeGameDb}>{activeGameDb}</option>
                        )}
                      </select>
                    </div>

                    <div className="space-y-3 text-xs">
                      <div
                        className={`p-3.5 rounded-2xl border space-y-1.5 ${
                          isLight
                            ? "bg-slate-100/90 border-slate-300 text-slate-900"
                            : "bg-black/40 border-white/10 text-white"
                        }`}
                      >
                        <div className="text-xs font-extrabold flex items-center justify-between">
                          <span className={isLight ? "text-slate-800" : "text-slate-200"}>Game Details</span>
                          <div className="flex items-center gap-1.5 font-mono">
                            <button
                              onClick={() => {
                                const nextId = Math.max(1, gameId - 1);
                                setGameId(nextId);
                                logAction("NAV", `Analysis Navigated to Game #${nextId}`);
                              }}
                              disabled={gameId <= 1}
                              className="p-1 rounded-md hover:bg-slate-200 dark:hover:bg-white/10 disabled:opacity-30 cursor-pointer"
                              title="Previous Game in DB"
                            >
                              <ChevronLeft className="w-3.5 h-3.5" />
                            </button>
                            <span className="font-extrabold text-emerald-600 dark:text-emerald-400">
                              ID #{gameId}
                            </span>
                            <button
                              onClick={() => {
                                const nextId = gameId + 1;
                                setGameId(nextId);
                                logAction("NAV", `Analysis Navigated to Game #${nextId}`);
                              }}
                              className="p-1 rounded-md hover:bg-slate-200 dark:hover:bg-white/10 cursor-pointer"
                              title="Next Game in DB"
                            >
                              <ChevronRight className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </div>
                        <div className={`font-extrabold text-sm truncate ${isLight ? "text-slate-900" : "text-white"}`}>
                          {gameData?.white || "White"} vs {gameData?.black || "Black"}
                        </div>
                        <p className={`text-xs leading-relaxed font-mono font-semibold ${isLight ? "text-slate-800" : "text-slate-200"}`}>
                          {gameData?.event || "Match"} · {gameData?.eco || "ECO"} {gameData?.opening ? `(${gameData.opening})` : ""} · Result: <span className="font-extrabold text-emerald-600 dark:text-emerald-400">{gameData?.result || "*"}</span>
                        </p>
                        {gameData?.date && gameData.date !== "????.??.??" && (
                          <div className={`text-[11px] font-mono font-bold ${isLight ? "text-slate-700" : "text-slate-300"}`}>
                            Date: {gameData.date}
                          </div>
                        )}
                      </div>

                      <div className="grid grid-cols-2 gap-2.5">
                        <div
                          className={`p-3 rounded-xl border text-center ${
                            isLight
                              ? "bg-slate-100/90 border-slate-300 text-slate-900"
                              : "bg-black/40 border-white/10 text-white"
                          }`}
                        >
                          <span className={`text-[11px] block font-bold ${isLight ? "text-slate-700" : "text-slate-300"}`}>White Elo</span>
                          <span className="text-sm font-black text-emerald-600 dark:text-emerald-400 font-mono">{gameData?.white_elo || "—"}</span>
                        </div>
                        <div
                          className={`p-3 rounded-xl border text-center ${
                            isLight
                              ? "bg-slate-100/90 border-slate-300 text-slate-900"
                              : "bg-black/40 border-white/10 text-white"
                          }`}
                        >
                          <span className={`text-[11px] block font-bold ${isLight ? "text-slate-700" : "text-slate-300"}`}>Black Elo</span>
                          <span className="text-sm font-black text-cyan-600 dark:text-cyan-400 font-mono">{gameData?.black_elo || "—"}</span>
                        </div>
                      </div>

                      <div className="pt-2">
                        <AskGrandmasterAction
                          fen={currentBoardFen}
                          evalStr="+0.10 pawns"
                          mainLine=""
                          contextNotes={`Game #${gameId} (${gameData?.white || "White"} vs ${gameData?.black || "Black"})`}
                          variant="banner"
                        />
                      </div>
                    </div>
                  </div>

                  {/* Engine Output & UCI Options Debugger */}
                  <div
                    className={`rounded-3xl border p-4 shadow-2xl flex flex-col flex-grow min-h-[220px] transition-colors duration-200 ${currentUXTheme.panel} ${currentUXTheme.border}`}
                  >
                    <div className="flex items-center justify-between mb-2.5">
                      <div className="flex items-center gap-1.5">
                        <Terminal className="w-4 h-4 text-cyan-400" />
                        <h2
                          className={`font-extrabold text-xs uppercase tracking-wider ${
                            isLight ? "text-slate-900" : "text-white"
                          }`}
                        >
                          Engine UCI Output
                        </h2>
                      </div>

                      <div className="flex items-center gap-1">
                        {/* Stream vs Options toggle */}
                        <div className="flex bg-black/40 border border-white/10 rounded-lg p-0.5 text-[10px] font-bold">
                          <button
                            onClick={() => setUciViewTab("stream")}
                            className={`px-2 py-0.5 rounded cursor-pointer transition-colors ${
                              uciViewTab === "stream"
                                ? "bg-cyan-500 text-slate-950 font-extrabold shadow"
                                : "text-slate-300 hover:text-white"
                            }`}
                          >
                            Stream
                          </button>
                          <button
                            onClick={() => setUciViewTab("options")}
                            className={`px-2 py-0.5 rounded cursor-pointer transition-colors ${
                              uciViewTab === "options"
                                ? "bg-cyan-500 text-slate-950 font-extrabold shadow"
                                : "text-slate-300 hover:text-white"
                            }`}
                          >
                            Options
                          </button>
                        </div>

                        {/* Copy logs */}
                        <button
                          onClick={() => {
                            navigator.clipboard.writeText(engineUciLogs.join("\n"));
                            setUciCopied(true);
                            setTimeout(() => setUciCopied(false), 2000);
                          }}
                          className="p-1 rounded-lg text-slate-300 hover:text-white hover:bg-white/10 transition-colors cursor-pointer"
                          title="Copy raw UCI logs"
                        >
                          {uciCopied ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                        </button>

                        {/* Clear logs */}
                        <button
                          onClick={() => setEngineUciLogs([])}
                          className="p-1 rounded-lg text-slate-300 hover:text-rose-400 hover:bg-white/10 transition-colors cursor-pointer"
                          title="Clear console"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>

                    {uciViewTab === "stream" ? (
                      <div
                        className={`font-mono text-[11px] space-y-1 flex-grow overflow-y-auto max-h-56 p-3 rounded-2xl border shadow-inner ${
                          isLight
                            ? "bg-slate-950 text-slate-100 border-slate-800"
                            : "bg-black/60 text-slate-100 border-white/10"
                        }`}
                      >
                        {engineUciLogs.length === 0 ? (
                          <span className="text-slate-400 italic font-semibold">Engine idle. Calculate or step moves to see live UCI protocol output.</span>
                        ) : (
                          engineUciLogs.map((line, i) => {
                            let lineStyle = "text-slate-200";
                            if (line.startsWith(">> setoption")) lineStyle = "text-purple-300 font-semibold";
                            else if (line.startsWith(">>")) lineStyle = "text-cyan-300 font-bold";
                            else if (line.startsWith("<< id")) lineStyle = "text-blue-300 font-bold";
                            else if (line.startsWith("<< bestmove")) lineStyle = "text-amber-300 font-extrabold";
                            else if (line.startsWith("<< info")) lineStyle = "text-emerald-300 font-medium";
                            else if (line.startsWith("[ERROR]")) lineStyle = "text-rose-400 font-bold";
                            else if (line.startsWith("[STATUS]")) lineStyle = "text-cyan-400 font-semibold";

                            return (
                              <div key={i} className={`leading-relaxed font-mono ${lineStyle}`}>
                                {line}
                              </div>
                            );
                          })
                        )}
                      </div>
                    ) : (
                      <div
                        className={`font-mono text-xs space-y-1.5 flex-grow overflow-y-auto max-h-56 p-3 rounded-2xl border shadow-inner ${
                          isLight
                            ? "bg-slate-950 text-slate-100 border-slate-800"
                            : "bg-black/60 text-slate-100 border-white/10"
                        }`}
                      >
                        <div className="grid grid-cols-2 gap-2 text-[11px]">
                          {Object.entries(engineUciOptions).map(([key, val]) => (
                            <div key={key} className="p-2 rounded-xl bg-white/5 border border-white/10 flex flex-col">
                              <span className="text-[10px] text-cyan-300 font-bold uppercase tracking-wider">{key}</span>
                              <span className="font-extrabold text-white truncate">{String(val)}</span>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Opening Book Explorer Panel */}
                  <OpeningBookPanel
                    fen={currentBoardFen}
                    eco={gameData?.eco}
                    openingName={gameData?.opening}
                    uxTheme={currentUXTheme}
                  />

                  {/* Game Performance & Stats Panel */}
                  <GameStatsPanel
                    stats={analysisStats}
                    gameDetails={
                      gameData
                        ? {
                            white: gameData.white,
                            black: gameData.black,
                            white_elo: gameData.white_elo,
                            black_elo: gameData.black_elo,
                            result: gameData.result,
                            event: gameData.event,
                            date: gameData.date,
                            eco: gameData.eco,
                            opening: gameData.opening,
                          }
                        : null
                    }
                    uxTheme={currentUXTheme}
                  />
                </div>
              </div>
          ) : activeView === "Database" ||
            activeView === "Fitness" ||
            activeView === "Dossier" ||
            activeView === "Compare" ||
            activeView === "Fashion" ||
            activeView === "Consolidator" ? (
            /* Database Hub (Shelf, Data Fitness, Dossier, Compare, Fashion Index, Consolidator) */
            <ErrorBoundary
              fallbackTitle="Database Hub Error"
              onError={(err) => logAction("ERROR", "Database Hub Error", err.message)}
            >
              <div className="flex-grow h-full min-h-0 overflow-hidden">
                <DatabaseBrowserView
                  uxTheme={currentUXTheme}
                  boardTheme={currentBoardTheme}
                  initialSubTab={
                    activeView === "Fitness"
                      ? "fitness"
                      : activeView === "Dossier"
                      ? "dossier"
                      : activeView === "Compare"
                      ? "compare"
                      : activeView === "Fashion"
                      ? "fashion"
                      : activeView === "Consolidator"
                      ? "consolidator"
                      : "shelf"
                  }
                  onLoadGame={(id, dbName) => {
                    setGameId(id);
                    if (dbName) setActiveGameDb(dbName);
                    setActiveView("Analysis");
                    logAction("NAV", `Loaded Game #${id} from ${dbName || activeGameDb} into Analysis Workspace`);
                  }}
                  onOpenBookBuilder={() => {
                    setActiveView("BookBuilder");
                    logAction("NAV", "Navigated to Book Builder / Opening Repertoire Factory");
                  }}
                  onOpenSparring={() => {
                    setActiveView("Spar");
                    logAction("NAV", "Navigated to Sparring Arena");
                  }}
                />
              </div>
            </ErrorBoundary>
          ) : activeView === "Spar" ? (
            /* Engine Sparring Arena & Elo Practice */
            <ErrorBoundary
              fallbackTitle="Sparring Arena Error"
              onError={(err) => logAction("ERROR", "Sparring View Error", err.message)}
            >
              <div className="flex-grow overflow-y-auto min-h-0">
                <SparView uxTheme={currentUXTheme} boardTheme={currentBoardTheme} />
              </div>
            </ErrorBoundary>
          ) : activeView === "BookBuilder" ? (
            /* Polyglot Opening Book Builder & Repertoire Factory */
            <ErrorBoundary
              fallbackTitle="Book Builder Error"
              onError={(err) => logAction("ERROR", "Book Builder View Error", err.message)}
            >
              <div className="flex-grow overflow-y-auto min-h-0">
                <BookBuilderView uxTheme={currentUXTheme} />
              </div>
            </ErrorBoundary>
          ) : activeView === "AI Grandmaster" || activeView === "Generative Stats" ? (
            /* AI Grandmaster & Neural Persona Coaching (BYOK) */
            <ErrorBoundary
              fallbackTitle="AI Grandmaster Error"
              onError={(err) => logAction("ERROR", "AI Grandmaster Error", err.message)}
            >
              <div className="flex-grow overflow-y-auto min-h-0">
                <AIGrandmasterView uxTheme={currentUXTheme} />
              </div>
            </ErrorBoundary>
          ) : activeView === "Engines" || activeView === "Settings" ? (
            /* UCI Engine Management & Customization Studio */
            <ErrorBoundary
              fallbackTitle="Engine Lab Error"
              onError={(err) => logAction("ERROR", "Engine Lab View Error", err.message)}
            >
              <div className="flex-grow overflow-y-auto min-h-0">
                <EnginesView
                  uxTheme={currentUXTheme}
                  onLaunchSparring={(engineId) => {
                    setActiveView("Spar");
                    logAction("NAV", `Launched Sparring with Engine: ${engineId}`);
                  }}
                />
              </div>
            </ErrorBoundary>
          ) : (
            <div className="flex-grow overflow-y-auto min-h-0">
              <EnginesView uxTheme={currentUXTheme} />
            </div>
          )}

          {/* Bottom Click & Debug Logger Console */}
          <ClickLogConsole />
        </div>
      </div>

      {/* Theme Customizer Modal */}
      <ThemeCustomizer
        isOpen={isThemeModalOpen}
        onClose={() => setIsThemeModalOpen(false)}
        currentUXTheme={currentUXTheme}
        currentBoardTheme={currentBoardTheme}
        customSettings={customSettings}
        onSelectUXTheme={setCurrentUXTheme}
        onSelectBoardTheme={setCurrentBoardTheme}
        onUpdateCustomSettings={setCustomSettings}
        initialTab={themeModalTab}
      />
    </div>
  );
}

export default function App() {
  return <MainApp />;
}
