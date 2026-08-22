import { useEffect, useState } from "react";
import { Wing } from "./components/layout/Wing";
import { DesktopMenu } from "./components/layout/DesktopMenu";
import { ResponsiveChessboard } from "./components/chessboard/ResponsiveChessboard";
import { DossierView } from "./features/analytics/dossier/DossierView";
import { CompareView } from "./features/analytics/compare/CompareView";
import { FashionIndexView } from "./features/analytics/opening_fashion/FashionIndexView";
import { ConsolidatorView } from "./features/database/consolidator/ConsolidatorView";
import { DatabaseBrowserView } from "./features/database/browser/DatabaseBrowserView";
import { DataFitnessView } from "./features/database/data_fitness/DataFitnessView";
import { AIGrandmasterView } from "./features/ai_grandmaster/AIGrandmasterView";
import { ThemeCustomizer } from "./components/theme/ThemeCustomizer";
import { ClickLogConsole } from "./components/debug/ClickLogConsole";
import { Tooltip } from "./components/common/Tooltip";
import { ErrorBoundary } from "./components/common/ErrorBoundary";
import { useQuery } from "@tanstack/react-query";
import { fetchGame } from "./lib/api";
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
  Cpu,
  RefreshCw,
  Sun,
  Grid,
} from "lucide-react";

function MainApp() {
  const { logAction, isLogConsoleOpen, setIsLogConsoleOpen } = useClickLogger();

  // Active Workspace / Tab
  const [activeView, setActiveView] = useState<string>("Analysis");
  const [comparePlayerA, setComparePlayerA] = useState<string>("Carlsen,M");

  // Game Selection
  const [gameId, setGameId] = useState<number>(42);

  // Theme Management
  const [currentUXTheme, setCurrentUXTheme] = useState<UXTheme>(loadSavedUXTheme);
  const [currentBoardTheme, setCurrentBoardTheme] = useState<BoardTheme>(loadSavedBoardTheme);
  const [customSettings, setCustomSettings] = useState<CustomThemeSettings>(loadCustomSettings);
  const [isThemeModalOpen, setIsThemeModalOpen] = useState<boolean>(false);
  const [themeModalTab, setThemeModalTab] = useState<"ux" | "board" | "custom">("ux");

  // SSE telemetry events
  const [events, setEvents] = useState<string[]>([]);

  // Fetch Game Query
  const { data: gameData, isLoading, isError, refetch } = useQuery({
    queryKey: ["game", gameId],
    queryFn: () => fetchGame(gameId),
    retry: 1,
  });

  // Connect to SSE Endpoint
  useEffect(() => {
    const eventSource = new EventSource("http://127.0.0.1:8000/api/v1/events");

    eventSource.onmessage = (event) => {
      logAction("SSE", "Incoming Stream Message", event.data);
    };

    eventSource.addEventListener("connect", (e) => {
      const msg = `[Connect] ${e.data}`;
      setEvents((prev) => [...prev, msg]);
      logAction("SSE", "Connected to SSE Telemetry Stream", e.data);
    });

    eventSource.addEventListener("ping", (e) => {
      const msg = `[Ping] ${e.data}`;
      setEvents((prev) => [...prev.slice(-6), msg]);
      logAction("SSE", "Heartbeat Ping", e.data);
    });

    eventSource.onerror = (err) => {
      console.warn("SSE Connection error", err);
    };

    return () => {
      eventSource.close();
      logAction("SSE", "Closed SSE Connection");
    };
  }, [logAction]);

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
                  />
                )}
              </div>

              {/* Right Panel: AI Dossier & Telemetry */}
              <div className="w-full lg:w-80 flex-shrink-0 flex flex-col gap-4 min-h-0 overflow-y-auto">
                {/* AI Dossier Panel */}
                <div
                  className={`rounded-3xl border p-5 shadow-2xl flex flex-col transition-colors duration-200 ${currentUXTheme.panel} ${currentUXTheme.border}`}
                >
                  <div className="flex items-center justify-between mb-3">
                    <h2
                      className={`text-xs font-bold uppercase tracking-wider flex items-center gap-2 ${
                        isLight ? "text-emerald-700" : "text-emerald-400"
                      }`}
                    >
                      <Sparkles className="w-4 h-4 text-emerald-500 animate-pulse" />
                      AI Dossier & Style
                    </h2>
                    <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-500 border border-emerald-500/30 font-bold">
                      Live
                    </span>
                  </div>

                  <div className="space-y-3 text-xs">
                    <div
                      className={`p-3.5 rounded-2xl border space-y-1.5 ${
                        isLight
                          ? "bg-slate-50 border-slate-200 text-slate-800"
                          : "bg-black/30 border-white/10 text-slate-300"
                      }`}
                    >
                      <div className="text-[11px] font-bold flex items-center justify-between">
                        <span>Current Game</span>
                        <span className="font-mono text-emerald-500 font-bold">ID #{gameId}</span>
                      </div>
                      <p className="text-[11px] opacity-80 leading-relaxed">
                        FIDE World Cup 2017 (Carlsen, M vs Bu Xiangzhi). Tactical sharp Italian game with piece sacrifices.
                      </p>
                    </div>

                    <div className="grid grid-cols-2 gap-2.5">
                      <div
                        className={`p-3 rounded-xl border text-center ${
                          isLight
                            ? "bg-slate-50 border-slate-200"
                            : "bg-black/30 border-white/10"
                        }`}
                      >
                        <span className="text-[10px] opacity-70 block font-medium">Opening Accuracy</span>
                        <span className="text-sm font-black text-emerald-500 font-mono">98.4%</span>
                      </div>
                      <div
                        className={`p-3 rounded-xl border text-center ${
                          isLight
                            ? "bg-slate-50 border-slate-200"
                            : "bg-black/30 border-white/10"
                        }`}
                      >
                        <span className="text-[10px] opacity-70 block font-medium">Avg ACPL</span>
                        <span className="text-sm font-black text-cyan-500 font-mono">14.2</span>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Telemetry Stream Box */}
                <div
                  className={`rounded-3xl border p-5 shadow-2xl flex flex-col flex-grow min-h-[160px] transition-colors duration-200 ${currentUXTheme.panel} ${currentUXTheme.border}`}
                >
                  <div className="flex items-center justify-between mb-2">
                    <h2
                      className={`font-bold text-xs uppercase tracking-wider ${
                        isLight ? "text-slate-700" : "text-slate-400"
                      }`}
                    >
                      SSE Telemetry Stream
                    </h2>
                    <span className="w-2 h-2 rounded-full bg-emerald-500 animate-ping" />
                  </div>

                  <div
                    className={`font-mono text-[11px] space-y-1 flex-grow overflow-y-auto p-3 rounded-2xl border ${
                      isLight
                        ? "bg-slate-900 text-emerald-400 border-slate-800"
                        : "bg-black/40 text-emerald-400 border-white/10"
                    }`}
                  >
                    {events.length === 0 ? (
                      <span className="text-slate-500 italic">Listening for telemetry events...</span>
                    ) : (
                      events.map((e, i) => (
                        <div key={i} className="text-emerald-400/90 font-medium">
                          {e}
                        </div>
                      ))
                    )}
                  </div>
                </div>
              </div>
            </div>
          ) : activeView === "Dossier" ? (
            /* Player Dossier View (BI Dashboard Prototype) */
            <ErrorBoundary
              fallbackTitle="Player Dossier Error"
              onError={(err) => logAction("ERROR", "Dossier View Error", err.message)}
            >
              <div className="flex-grow overflow-y-auto min-h-0">
                <DossierView
                  uxTheme={currentUXTheme}
                  onOpenCompare={(p) => {
                    if (p) setComparePlayerA(p);
                    setActiveView("Compare");
                    logAction("NAV", `Switched to Compare View for ${p}`);
                  }}
                />
              </div>
            </ErrorBoundary>
          ) : activeView === "Compare" ? (
            /* Head-to-Head Compare View (Prototype) */
            <ErrorBoundary
              fallbackTitle="Head-to-Head Compare Error"
              onError={(err) => logAction("ERROR", "Compare View Error", err.message)}
            >
              <div className="flex-grow overflow-y-auto min-h-0">
                <CompareView
                  uxTheme={currentUXTheme}
                  initialPlayerA={comparePlayerA}
                  onBackToDossier={() => {
                    setActiveView("Dossier");
                    logAction("NAV", "Returned to Dossier View");
                  }}
                />
              </div>
            </ErrorBoundary>
          ) : activeView === "Fashion" ? (
            /* Opening Fashion Index (Image 2) */
            <ErrorBoundary
              fallbackTitle="Fashion Index Error"
              onError={(err) => logAction("ERROR", "Fashion Index View Error", err.message)}
            >
              <div className="flex-grow overflow-y-auto min-h-0">
                <FashionIndexView uxTheme={currentUXTheme} />
              </div>
            </ErrorBoundary>
          ) : activeView === "Consolidator" ? (
            /* Database Consolidator & Multi-DB Merger */
            <ErrorBoundary
              fallbackTitle="Consolidator Error"
              onError={(err) => logAction("ERROR", "Consolidator View Error", err.message)}
            >
              <div className="flex-grow overflow-y-auto min-h-0">
                <ConsolidatorView uxTheme={currentUXTheme} />
              </div>
            </ErrorBoundary>
          ) : activeView === "Database" ? (
            /* Database Browser (ChessBase 16 Shelf - Image 1) */
            <ErrorBoundary
              fallbackTitle="Database Browser Error"
              onError={(err) => logAction("ERROR", "Database Browser View Error", err.message)}
            >
              <div className="flex-grow h-full min-h-0 overflow-hidden">
                <DatabaseBrowserView
                  uxTheme={currentUXTheme}
                  boardTheme={currentBoardTheme}
                  onLoadGame={(id) => {
                    setGameId(id);
                    setActiveView("Analysis");
                    logAction("NAV", `Loaded Game #${id} into Analysis Workspace`);
                  }}
                  onOpenBookBuilder={() => {
                    setActiveView("Fashion");
                    logAction("NAV", "Navigated to Book Builder / Opening Pioneer");
                  }}
                  onOpenSparring={() => {
                    setActiveView("Analysis");
                    logAction("NAV", "Navigated to Sparring & Analysis");
                  }}
                  onOpenDataFitness={() => {
                    setActiveView("Fitness");
                    logAction("NAV", "Navigated to Data Fitness Pipeline");
                  }}
                />
              </div>
            </ErrorBoundary>
          ) : activeView === "Fitness" ? (
            /* Data Fitness & Mass Analysis Pipeline */
            <ErrorBoundary
              fallbackTitle="Data Fitness Error"
              onError={(err) => logAction("ERROR", "Data Fitness View Error", err.message)}
            >
              <div className="flex-grow overflow-y-auto min-h-0">
                <DataFitnessView
                  uxTheme={currentUXTheme}
                  onNavigateToBrowser={() => {
                    setActiveView("Database");
                    logAction("NAV", "Navigated to Database Browser from Fitness");
                  }}
                  onNavigateToDossier={() => {
                    setActiveView("Dossier");
                    logAction("NAV", "Navigated to Player Dossier from Fitness");
                  }}
                />
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
          ) : (
            /* Settings & Engine Lab Tab */
            <div
              className={`flex-grow rounded-3xl border p-6 flex flex-col overflow-y-auto space-y-6 shadow-2xl ${currentUXTheme.panel} ${currentUXTheme.border}`}
            >
              <div className="flex items-center gap-3">
                <div className="p-3 bg-cyan-500/10 text-cyan-500 rounded-2xl border border-cyan-500/20">
                  <Cpu className="w-6 h-6" />
                </div>
                <div>
                  <h2 className="text-base font-bold">Engine Lab & Customization Settings</h2>
                  <p className="text-xs opacity-70">
                    Configure UX themes, chessboard colors, and engine instances
                  </p>
                </div>
              </div>

              <div className="space-y-4 max-w-xl">
                <div
                  className={`p-4 rounded-2xl border flex items-center justify-between ${
                    isLight ? "bg-slate-50 border-slate-200" : "bg-black/30 border-white/10"
                  }`}
                >
                  <div>
                    <span className="text-xs font-bold block">Change Application UX Theme</span>
                    <span className="text-[11px] opacity-70">Dark & Light modern interface palettes</span>
                  </div>
                  <button
                    onClick={() => handleOpenTheme("ux")}
                    className="px-3.5 py-2 bg-emerald-500 text-slate-950 text-xs font-bold rounded-xl flex items-center gap-1.5 shadow-md hover:bg-emerald-400 transition-colors"
                  >
                    <Sun className="w-3.5 h-3.5" />
                    Change UX Theme
                  </button>
                </div>

                <div
                  className={`p-4 rounded-2xl border flex items-center justify-between ${
                    isLight ? "bg-slate-50 border-slate-200" : "bg-black/30 border-white/10"
                  }`}
                >
                  <div>
                    <span className="text-xs font-bold block">Change Chessboard Theme</span>
                    <span className="text-[11px] opacity-70">Wood, tournament green, and custom square colors</span>
                  </div>
                  <button
                    onClick={() => handleOpenTheme("board")}
                    className="px-3.5 py-2 bg-blue-500 text-white text-xs font-bold rounded-xl flex items-center gap-1.5 shadow-md hover:bg-blue-400 transition-colors"
                  >
                    <Grid className="w-3.5 h-3.5" />
                    Change Board Theme
                  </button>
                </div>
              </div>
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
