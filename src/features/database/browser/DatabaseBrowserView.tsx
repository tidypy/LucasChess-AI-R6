import { useState, useRef } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { UXTheme, BoardTheme } from "../../../lib/theme";
import { useClickLogger } from "../../../lib/clickLogger";
import { Tooltip } from "../../../components/common/Tooltip";
import {
  fetchDatabases,
  fetchGamesList,
  fetchGame,
  fetchStorageTelemetry,
  fetchTrash,
  trashDatabase,
  restoreDatabase,
  purgeTrash,
  exportFilteredDatabase,
  GameSummary,
} from "../../../lib/api";
import { Chessboard } from "react-chessboard";
import { Chess } from "chess.js";
import { FashionIndexView } from "../../analytics/opening_fashion/FashionIndexView";
import { DossierView } from "../../analytics/dossier/DossierView";
import { CompareView } from "../../analytics/compare/CompareView";
import { DataFitnessView } from "../data_fitness/DataFitnessView";
import { ConsolidatorView } from "../consolidator/ConsolidatorView";
import {
  Database,
  Search,
  BookOpen,
  Swords,
  Plus,
  Grid,
  List,
  X,
  Play,
  Folder,
  Cloud,
  History,
  CheckCircle2,
  ShieldCheck,
  TrendingUp,
  Users,
  Layers,
  Trash2,
  Download,
  RefreshCw,
  HardDrive,
  RotateCcw,
} from "lucide-react";

interface DatabaseBrowserViewProps {
  uxTheme: UXTheme;
  boardTheme: BoardTheme;
  onLoadGame: (gameId: number) => void;
  onOpenBookBuilder?: () => void;
  onOpenSparring?: (fen?: string) => void;
  onOpenDataFitness?: (dbName?: string) => void;
}

export function DatabaseBrowserView({
  uxTheme,
  boardTheme,
  onLoadGame,
  onOpenBookBuilder,
  onOpenSparring,
  onOpenDataFitness,
}: DatabaseBrowserViewProps) {
  const { logAction } = useClickLogger();
  const queryClient = useQueryClient();
  const fileInputRef = useRef<HTMLInputElement>(null);

  // State
  const [activeSubTab, setActiveSubTab] = useState<"shelf" | "fashion" | "dossier" | "compare" | "fitness" | "consolidator">("shelf");
  const [comparePlayer, setComparePlayer] = useState<string>("Carlsen,M");
  const [pendingImportFile, setPendingImportFile] = useState<File | null>(null);
  const [selectedDb, setSelectedDb] = useState<string | null>(null);
  const [selectedFolder, setSelectedFolder] = useState<string>("My Databases");
  const [selectedGame, setSelectedGame] = useState<GameSummary | null>(null);
  const [viewMode, setViewMode] = useState<"grid" | "list">("grid");
  const [searchDbText, setSearchDbText] = useState("");
  const [searchGameText, setSearchGameText] = useState("");
  const [isPreviewOpen, setIsPreviewOpen] = useState(true);

  // Modals State
  const [isPurgeModalOpen, setIsPurgeModalOpen] = useState(false);
  const [isExportModalOpen, setIsExportModalOpen] = useState(false);
  const [exportTargetName, setExportTargetName] = useState("");
  const [exportStatus, setExportStatus] = useState<string | null>(null);

  // Queries
  const { data: databases } = useQuery({
    queryKey: ["databases"],
    queryFn: fetchDatabases,
  });

  const { data: storageTelemetry } = useQuery({
    queryKey: ["storageTelemetry"],
    queryFn: fetchStorageTelemetry,
  });

  const { data: trashDbs } = useQuery({
    queryKey: ["trashDbs"],
    queryFn: fetchTrash,
  });

  // Mutations
  const trashMutation = useMutation({
    mutationFn: trashDatabase,
    onSuccess: (data) => {
      logAction("API", `Moved database to trash: ${data.trashed}`);
      if (selectedDb === data.trashed) setSelectedDb(null);
      queryClient.invalidateQueries({ queryKey: ["databases"] });
      queryClient.invalidateQueries({ queryKey: ["storageTelemetry"] });
      queryClient.invalidateQueries({ queryKey: ["trashDbs"] });
    },
  });

  const restoreMutation = useMutation({
    mutationFn: restoreDatabase,
    onSuccess: (data) => {
      logAction("API", `Restored database from trash: ${data.restored}`);
      queryClient.invalidateQueries({ queryKey: ["databases"] });
      queryClient.invalidateQueries({ queryKey: ["storageTelemetry"] });
      queryClient.invalidateQueries({ queryKey: ["trashDbs"] });
    },
  });

  const purgeMutation = useMutation({
    mutationFn: purgeTrash,
    onSuccess: (data) => {
      logAction("API", `Purged trash: freed ${data.freed_mb} MB across ${data.purged_count} databases`);
      setIsPurgeModalOpen(false);
      queryClient.invalidateQueries({ queryKey: ["databases"] });
      queryClient.invalidateQueries({ queryKey: ["storageTelemetry"] });
      queryClient.invalidateQueries({ queryKey: ["trashDbs"] });
    },
  });

  const exportMutation = useMutation({
    mutationFn: exportFilteredDatabase,
    onSuccess: (data) => {
      logAction("API", `Exported sub-database: ${data.target_db}`, `${data.exported_games} games`);
      setExportStatus(`Exported ${data.exported_games} games into ${data.target_db}`);
      queryClient.invalidateQueries({ queryKey: ["databases"] });
      queryClient.invalidateQueries({ queryKey: ["storageTelemetry"] });
      setTimeout(() => {
        setIsExportModalOpen(false);
        setExportStatus(null);
      }, 1500);
    },
  });

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setPendingImportFile(file);
      setActiveSubTab("fitness");
      logAction("CLICK", `Browsed and Selected DB File for Import: ${file.name}`, `${file.size} bytes`);
      // Reset input value so re-selecting same file triggers onChange
      e.target.value = "";
    }
  };

  // Automatically select first database when loaded if none selected
  const activeDbName = selectedDb || (databases && databases.length > 0 ? databases[0].name : null);

  const { data: gamesData, isLoading: isLoadingGames } = useQuery({
    queryKey: ["browserGames", activeDbName, searchGameText],
    queryFn: () =>
      fetchGamesList({
        page: 1,
        page_size: 50,
        search: searchGameText || undefined,
        db_name: activeDbName || undefined,
      }),
    enabled: !!activeDbName && isPreviewOpen,
  });

  const { data: selectedGameDetails } = useQuery({
    queryKey: ["browserGameDetails", selectedGame?.id, activeDbName],
    queryFn: () => (selectedGame ? fetchGame(selectedGame.id, activeDbName || undefined) : null),
    enabled: !!selectedGame && isPreviewOpen,
  });

  const previewFen = (() => {
    if (!selectedGameDetails?.pgn) {
      return "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1";
    }
    try {
      const g = new Chess();
      g.loadPgn(selectedGameDetails.pgn);
      return g.fen();
    } catch {
      return "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1";
    }
  })();

  const filteredDbs = databases?.filter((db) =>
    db.name.toLowerCase().includes(searchDbText.toLowerCase())
  ) || [];

  const handleSelectDb = (name: string) => {
    setSelectedDb(name);
    setIsPreviewOpen(true);
    setSelectedGame(null);
    logAction("CLICK", `Opened Database in Browser: ${name}`);
  };

  const handleSelectGame = (game: GameSummary) => {
    setSelectedGame(game);
    logAction("CLICK", `Selected game #${game.id}: ${game.WHITE} vs ${game.BLACK}`);
  };

  const isLight = uxTheme?.mode === "light" || uxTheme?.id === "clean-light";

  const SUB_TABS = [
    { id: "shelf", label: "Shelf & Games", icon: Database },
    { id: "fashion", label: "Fashion Index (Report)", icon: TrendingUp },
    { id: "dossier", label: "Player Dossier & Compare", icon: Users },
    { id: "fitness", label: "Data Fitness Studio", icon: ShieldCheck },
    { id: "consolidator", label: "Consolidator", icon: Layers },
  ];

  return (
    <div className={`flex flex-col h-full ${isLight ? "bg-slate-100 text-slate-900" : "bg-[#080a0c] text-[#e2e8f0]"} select-none overflow-hidden font-sans`}>
      {/* 1. Top Sub-Command Bar */}
      <header className={`h-12 ${isLight ? "bg-white border-slate-300 text-slate-900 shadow-sm" : "bg-[#0d1014] border-[#1e232b] text-white shadow-lg"} border-b flex items-center justify-between px-4 flex-shrink-0 z-10`}>
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2 font-bold text-sm text-[#3b82f6] mr-1">
            <Database className="w-4 h-4 text-[#3b82f6]" />
            Database Hub
          </div>

          <div className="flex items-center gap-1">
            {SUB_TABS.map((tab) => {
              const Icon = tab.icon;
              const isActive = activeSubTab === tab.id || (activeSubTab === "compare" && tab.id === "dossier");
              return (
                <button
                  key={tab.id}
                  onClick={() => {
                    setActiveSubTab(tab.id as any);
                    logAction("NAV", `Switched Database Sub-Tab: ${tab.label}`);
                  }}
                  className={`px-3 py-1.5 text-xs font-semibold rounded-xl transition-all flex items-center gap-1.5 ${
                    isActive
                      ? "bg-[#3b82f6]/15 text-[#3b82f6] font-bold border border-[#3b82f6]/30 shadow-sm"
                      : isLight
                      ? "text-slate-600 hover:bg-slate-200 hover:text-slate-900"
                      : "text-[#8b949e] hover:bg-[#181d24] hover:text-[#e2e8f0]"
                  }`}
                >
                  <Icon className="w-3.5 h-3.5" />
                  <span>{tab.label}</span>
                </button>
              );
            })}
          </div>
        </div>

        {/* Feature Action Buttons */}
        <div className="flex items-center gap-2">
          {/* Database Filter Search */}
          <div className={`flex items-center ${isLight ? "bg-white border-slate-300" : "bg-[#080a0c] border-[#262c36]"} border rounded px-2 h-7 w-48 focus-within:border-[#3b82f6] transition-colors`}>
            <Search className="w-3 h-3 text-[#64748b] mr-1.5" />
            <input
              type="text"
              placeholder="Find database..."
              value={searchDbText}
              onChange={(e) => setSearchDbText(e.target.value)}
              className={`bg-transparent border-none text-xs ${isLight ? "text-slate-900 placeholder-slate-400" : "text-[#e2e8f0] placeholder-[#64748b]"} outline-none w-full`}
            />
          </div>

          {/* Book Builder Button */}
          <Tooltip content="Opening Book Builder" description="Extract opening tree and polyglot repertoire">
            <button
              onClick={() => {
                logAction("CLICK", "Opened Book Builder feature");
                if (onOpenBookBuilder) onOpenBookBuilder();
              }}
              className="px-2.5 py-1 text-xs font-medium text-[#8b949e] hover:text-[#e2e8f0] hover:bg-[#181d24] rounded border border-transparent hover:border-[#262c36] transition-all flex items-center gap-1.5"
            >
              <BookOpen className="w-3.5 h-3.5 text-purple-400" />
              Book Builder
            </button>
          </Tooltip>

          {/* Spar Button */}
          <Tooltip content="Spar against Engine" description="Play a practice game against Stockfish">
            <button
              onClick={() => {
                logAction("CLICK", "Triggered Engine Sparring");
                if (onOpenSparring) onOpenSparring();
              }}
              className="px-2.5 py-1 text-xs font-medium text-[#8b949e] hover:text-[#e2e8f0] hover:bg-[#181d24] rounded border border-transparent hover:border-[#262c36] transition-all flex items-center gap-1.5"
            >
              <Swords className="w-3.5 h-3.5 text-rose-400" />
              Spar
            </button>
          </Tooltip>

          {/* Data Fitness Pipeline Button */}
          <Tooltip content="Data Fitness & Quality Studio" description="Run health audits, sanitization, and Mass Analysis">
            <button
              onClick={() => {
                logAction("CLICK", "Opened Data Fitness Studio from Browser");
                if (onOpenDataFitness) onOpenDataFitness(activeDbName || undefined);
              }}
              className="px-2.5 py-1 text-xs font-medium text-emerald-400 hover:text-white hover:bg-emerald-500/20 rounded border border-emerald-500/30 transition-all flex items-center gap-1.5"
            >
              <ShieldCheck className="w-3.5 h-3.5" />
              Data Fitness
            </button>
          </Tooltip>

          {/* Vault Storage Footprint Badge */}
          {storageTelemetry && (
            <div className="hidden xl:flex items-center gap-2 px-2.5 py-1 bg-[#14171c] border border-slate-800 rounded text-[11px] font-mono text-slate-300">
              <HardDrive className="w-3.5 h-3.5 text-emerald-400" />
              <span>
                Vault: <strong className="text-white">{storageTelemetry.total_size_mb >= 1024 ? `${storageTelemetry.total_size_gb} GB` : `${storageTelemetry.total_size_mb} MB`}</strong>
              </span>
              <span className="text-[10px] text-slate-500">
                ({storageTelemetry.active_count} active{storageTelemetry.trash_count > 0 ? ` · ${storageTelemetry.trash_count} trash` : ""})
              </span>
            </div>
          )}

          {/* Purge Button (Active when trash contains databases) */}
          {trashDbs && trashDbs.length > 0 && (
            <Tooltip content="Purge Marked Databases" description={`Permanently delete and free up ${storageTelemetry?.trash_size_mb || 0} MB from disk`}>
              <button
                onClick={() => {
                  logAction("CLICK", "Opened Purge Trash Modal");
                  setIsPurgeModalOpen(true);
                }}
                className="px-2.5 py-1 bg-gradient-to-r from-rose-600 to-amber-600 hover:from-rose-500 hover:to-amber-500 text-white text-xs font-bold rounded shadow-md transition-all flex items-center gap-1.5 cursor-pointer animate-pulse"
              >
                <Trash2 className="w-3.5 h-3.5" />
                Purge ({storageTelemetry?.trash_size_mb || 0} MB)
              </button>
            </Tooltip>
          )}

          {/* Hidden File Input for Native OS Browser Dialog */}
          <input
            type="file"
            ref={fileInputRef}
            accept=".pgn,.sqlite,.lcdb,.cbh,.bin"
            className="hidden"
            onChange={handleFileSelect}
          />

          {/* New Database / Ingest Button */}
          <Tooltip content="Add / Ingest Database" description="Browse and import a PGN or SQLite database into Data Fitness">
            <button
              onClick={() => {
                logAction("CLICK", "Triggered Add Database / Open File Dialog");
                fileInputRef.current?.click();
              }}
              className="px-3 py-1 bg-[#3b82f6] hover:bg-[#2563eb] text-white text-xs font-bold rounded shadow-md transition-all flex items-center gap-1 cursor-pointer"
            >
              <Plus className="w-3.5 h-3.5" />
              Add Database
            </button>
          </Tooltip>
        </div>
      </header>

      {/* 2. Main Workspace Layout / Sub-Feature Routing */}
      {activeSubTab === "fashion" ? (
        <div className="flex-1 overflow-y-auto p-4 md:p-6 min-h-0">
          <FashionIndexView uxTheme={uxTheme} />
        </div>
      ) : activeSubTab === "dossier" ? (
        <div className="flex-1 overflow-y-auto p-4 md:p-6 min-h-0">
          <DossierView
            uxTheme={uxTheme}
            onOpenCompare={(p) => {
              if (p) setComparePlayer(p);
              setActiveSubTab("compare");
              logAction("NAV", `Switched to Compare View for ${p}`);
            }}
          />
        </div>
      ) : activeSubTab === "compare" ? (
        <div className="flex-1 overflow-y-auto p-4 md:p-6 min-h-0">
          <CompareView
            uxTheme={uxTheme}
            initialPlayerA={comparePlayer}
            onBackToDossier={() => setActiveSubTab("dossier")}
          />
        </div>
      ) : activeSubTab === "fitness" ? (
        <div className="flex-1 overflow-y-auto p-4 md:p-6 min-h-0">
          <DataFitnessView
            uxTheme={uxTheme}
            pendingImportFile={pendingImportFile}
            onClearImportFile={() => setPendingImportFile(null)}
            onNavigateToBrowser={() => {
              setPendingImportFile(null);
              setActiveSubTab("shelf");
            }}
            onNavigateToDossier={() => setActiveSubTab("dossier")}
          />
        </div>
      ) : activeSubTab === "consolidator" ? (
        <div className="flex-1 overflow-y-auto p-4 md:p-6 min-h-0">
          <ConsolidatorView uxTheme={uxTheme} />
        </div>
      ) : (
        <div className="flex-1 flex min-h-0 overflow-hidden">
        {/* Left Folder Hierarchy Tree */}
        <aside className={`w-56 ${isLight ? "bg-slate-50 border-slate-200" : "bg-[#111418] border-[#1e232b]"} border-r flex flex-col flex-shrink-0 overflow-y-auto`}>
          <div className="pt-4 pb-2">
            <div className="text-[10px] font-bold text-[#64748b] uppercase tracking-wider px-4 pb-2">
              Shortcuts
            </div>
            <div
              onClick={() => {
                setSelectedFolder("My Databases");
                logAction("NAV", "Selected folder: My Databases");
              }}
              className={`flex items-center gap-2 px-4 py-1.5 text-xs cursor-pointer transition-all ${
                selectedFolder === "My Databases"
                  ? isLight
                    ? "bg-blue-100 text-blue-700 font-semibold border-r-2 border-blue-600"
                    : "bg-[#3b82f6]/10 text-[#3b82f6] font-semibold border-r-2 border-[#3b82f6]"
                  : isLight
                  ? "text-slate-600 hover:bg-slate-200 hover:text-slate-900"
                  : "text-[#8b949e] hover:bg-[#181d24] hover:text-[#e2e8f0]"
              }`}
            >
              <Database className="w-3.5 h-3.5 opacity-80" />
              My Databases
            </div>
            <div
              onClick={() => {
                setSelectedFolder("Recent Files");
                logAction("NAV", "Selected folder: Recent Files");
              }}
              className={`flex items-center gap-2 px-4 py-1.5 text-xs cursor-pointer transition-all ${
                selectedFolder === "Recent Files"
                  ? isLight
                    ? "bg-blue-100 text-blue-700 font-semibold border-r-2 border-blue-600"
                    : "bg-[#3b82f6]/10 text-[#3b82f6] font-semibold border-r-2 border-[#3b82f6]"
                  : isLight
                  ? "text-slate-600 hover:bg-slate-200 hover:text-slate-900"
                  : "text-[#8b949e] hover:bg-[#181d24] hover:text-[#e2e8f0]"
              }`}
            >
              <History className="w-3.5 h-3.5 opacity-80" />
              Recent Files
            </div>
            <div
              onClick={() => {
                setSelectedFolder("Trash");
                logAction("NAV", "Selected folder: Trash / Pending Purge");
              }}
              className={`flex items-center gap-2 px-4 py-1.5 text-xs cursor-pointer transition-all ${
                selectedFolder === "Trash"
                  ? "bg-rose-500/15 text-rose-500 font-semibold border-r-2 border-rose-500"
                  : isLight
                  ? "text-slate-600 hover:bg-slate-200 hover:text-slate-900"
                  : "text-[#8b949e] hover:bg-[#181d24] hover:text-[#e2e8f0]"
              }`}
            >
              <Trash2 className="w-3.5 h-3.5 opacity-80 text-rose-400" />
              Trash
              {trashDbs && trashDbs.length > 0 && (
                <span className="ml-auto text-[10px] bg-rose-500/20 text-rose-500 font-bold px-1.5 py-0.5 rounded-full border border-rose-500/30">
                  {trashDbs.length}
                </span>
              )}
            </div>
          </div>

          <div className="pt-3 pb-2">
            <div className="text-[10px] font-bold text-[#64748b] uppercase tracking-wider px-4 pb-2">
              Local Storage
            </div>
            <div
              onClick={() => {
                setSelectedFolder("Repertoires");
                logAction("NAV", "Selected folder: Repertoires");
              }}
              className={`flex items-center gap-2 px-4 py-1.5 text-xs cursor-pointer transition-all ${
                selectedFolder === "Repertoires"
                  ? "bg-[#3b82f6]/10 text-[#3b82f6] font-semibold border-r-2 border-[#3b82f6]"
                  : "text-[#8b949e] hover:bg-[#181d24] hover:text-[#e2e8f0]"
              }`}
            >
              <Folder className="w-3.5 h-3.5 opacity-80" />
              Repertoires
              <span className="ml-auto text-[10px] bg-[#080a0c] px-1.5 py-0.5 rounded-full text-[#64748b]">
                4
              </span>
            </div>
            <div
              onClick={() => {
                setSelectedFolder("Tournaments");
                logAction("NAV", "Selected folder: Tournaments");
              }}
              className={`flex items-center gap-2 px-4 py-1.5 text-xs cursor-pointer transition-all ${
                selectedFolder === "Tournaments"
                  ? "bg-[#3b82f6]/10 text-[#3b82f6] font-semibold border-r-2 border-[#3b82f6]"
                  : "text-[#8b949e] hover:bg-[#181d24] hover:text-[#e2e8f0]"
              }`}
            >
              <Folder className="w-3.5 h-3.5 opacity-80" />
              Tournaments
              <span className="ml-auto text-[10px] bg-[#080a0c] px-1.5 py-0.5 rounded-full text-[#64748b]">
                12
              </span>
            </div>
            <div
              onClick={() => {
                setSelectedFolder("Tactics");
                logAction("NAV", "Selected folder: Tactics");
              }}
              className={`flex items-center gap-2 px-4 py-1.5 text-xs cursor-pointer transition-all ${
                selectedFolder === "Tactics"
                  ? "bg-[#3b82f6]/10 text-[#3b82f6] font-semibold border-r-2 border-[#3b82f6]"
                  : "text-[#8b949e] hover:bg-[#181d24] hover:text-[#e2e8f0]"
              }`}
            >
              <Folder className="w-3.5 h-3.5 opacity-80" />
              Tactics &amp; Studies
            </div>
          </div>

          <div className="pt-3 pb-2">
            <div className="text-[10px] font-bold text-[#64748b] uppercase tracking-wider px-4 pb-2">
              Cloud &amp; Sync
            </div>
            <div
              onClick={() => {
                setSelectedFolder("Cloud Vault");
                logAction("NAV", "Selected folder: Cloud Vault");
              }}
              className="flex items-center gap-2 px-4 py-1.5 text-xs text-[#8b949e] hover:bg-[#181d24] hover:text-[#e2e8f0] cursor-pointer"
            >
              <Cloud className="w-3.5 h-3.5 opacity-80" />
              Cloud Vault
              <span className="ml-auto text-[9px] bg-emerald-500/10 text-emerald-400 px-1.5 py-0.5 rounded-full font-mono font-semibold">
                Synced
              </span>
            </div>
          </div>
        </aside>

        {/* 3. Main Center Content */}
        <main className={`flex-1 flex flex-col min-w-0 ${isLight ? "bg-slate-100" : "bg-[#080a0c]"} overflow-hidden`}>
          {/* Trash Vault Dedicated View */}
          {selectedFolder === "Trash" ? (
            <div className="flex-1 overflow-y-auto p-6 flex flex-col gap-6">
              <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-white/5 pb-4">
                <div>
                  <h1 className={`text-xl font-bold tracking-tight ${isLight ? "text-slate-900" : "text-white"} flex items-center gap-2`}>
                    <Trash2 className="w-5 h-5 text-rose-500" />
                    Trash &amp; Pending Purge
                  </h1>
                  <span className={`text-xs ${isLight ? "text-slate-500" : "text-slate-400"} font-mono`}>
                    Databases moved here are hidden from your shelf. You can restore them or purge to permanently reclaim disk space.
                  </span>
                </div>

                {trashDbs && trashDbs.length > 0 && (
                  <button
                    onClick={() => setIsPurgeModalOpen(true)}
                    className="px-4 py-2 bg-gradient-to-r from-rose-600 to-amber-600 hover:from-rose-500 hover:to-amber-500 text-white font-bold text-xs rounded-xl shadow-lg transition-all flex items-center gap-2 cursor-pointer"
                  >
                    <Trash2 className="w-4 h-4" />
                    Purge All ({storageTelemetry?.trash_size_mb || 0} MB)
                  </button>
                )}
              </div>

              {!trashDbs || trashDbs.length === 0 ? (
                <div className={`p-12 text-center rounded-3xl ${isLight ? "bg-white border-slate-200 text-slate-500" : "bg-[#111418] border-slate-800 text-slate-400"} border space-y-2`}>
                  <CheckCircle2 className="w-8 h-8 text-emerald-500 mx-auto" />
                  <h3 className={`text-sm font-bold ${isLight ? "text-slate-900" : "text-white"}`}>Trash is Empty</h3>
                  <p className={`text-xs ${isLight ? "text-slate-500" : "text-slate-400"} max-w-sm mx-auto`}>
                    When you delete a database from the shelf, it will be safely placed here before being permanently purged.
                  </p>
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                  {trashDbs.map((item) => (
                    <div
                      key={item.name}
                      className={`${isLight ? "bg-white border-rose-200" : "bg-[#15181e] border-rose-500/20"} border rounded-2xl p-4 flex flex-col justify-between gap-3 shadow-md`}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <div className={`font-semibold text-sm ${isLight ? "text-slate-900" : "text-white"} font-mono truncate`}>{item.name}</div>
                          <span className={`text-[11px] ${isLight ? "text-slate-500" : "text-slate-400"} font-mono`}>Size: {item.size_mb} MB</span>
                        </div>
                        <span className="text-[10px] bg-rose-500/10 text-rose-500 font-bold px-2 py-0.5 rounded-full border border-rose-500/20">
                          Trashed
                        </span>
                      </div>

                      <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-200 dark:border-white/5">
                        <button
                          onClick={() => restoreMutation.mutate(item.name)}
                          disabled={restoreMutation.isPending}
                          className="px-3 py-1 bg-slate-800 hover:bg-slate-700 text-slate-200 hover:text-white text-xs font-semibold rounded-lg border border-white/10 transition-all flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
                        >
                          <RotateCcw className="w-3.5 h-3.5 text-emerald-400" />
                          Restore
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          ) : (
            /* Standard Shelf Container */
            <div className="flex-1 overflow-y-auto p-6 flex flex-col">
              <div className="flex justify-between items-end mb-4">
                <div>
                  <h1 className={`text-lg font-bold tracking-tight ${isLight ? "text-slate-900" : "text-white"} m-0`}>
                    {selectedFolder}
                  </h1>
                  <span className={`text-xs ${isLight ? "text-slate-500" : "text-[#64748b]"}`}>
                    {filteredDbs.length} Standard SQLite databases available
                  </span>
                </div>

                {/* View toggle (Grid / List) */}
                <div className={`flex gap-1 ${isLight ? "bg-slate-200 border-slate-300" : "bg-[#111418] border-[#262c36]"} border p-0.5 rounded`}>
                  <button
                    onClick={() => setViewMode("grid")}
                    className={`p-1 rounded ${
                      viewMode === "grid"
                        ? isLight ? "bg-white text-blue-600 shadow" : "bg-[#080a0c] text-white shadow"
                        : "text-[#64748b] hover:text-white"
                    }`}
                  >
                    <Grid className="w-3.5 h-3.5" />
                  </button>
                  <button
                    onClick={() => setViewMode("list")}
                    className={`p-1 rounded ${
                      viewMode === "list"
                        ? isLight ? "bg-white text-blue-600 shadow" : "bg-[#080a0c] text-white shadow"
                        : "text-[#64748b] hover:text-white"
                    }`}
                  >
                    <List className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>

              {/* Grid vs List of Database Cards */}
              {viewMode === "grid" ? (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                  {filteredDbs.map((db) => {
                    const isSelected = activeDbName === db.name;
                    const isTournament = db.name.toLowerCase().includes("tourny") || db.name.toLowerCase().includes("master");
                    const isRepertoire = db.name.toLowerCase().includes("repertoire");

                    return (
                      <div
                        key={db.name}
                        onClick={() => handleSelectDb(db.name)}
                        className={`rounded-xl p-4 cursor-pointer transition-all duration-150 flex flex-col gap-3 relative overflow-hidden ${
                          isSelected
                            ? isLight
                              ? "border-2 border-blue-500 bg-blue-50/70 shadow-md ring-1 ring-blue-500/20"
                              : "border-[#3b82f6] bg-[#3b82f6]/5 shadow-[0_0_0_1px_#3b82f6]"
                            : isLight
                            ? "bg-white border border-slate-200 hover:border-slate-300 hover:-translate-y-0.5 hover:shadow-md"
                            : "bg-[#15181e] border border-[#262c36] hover:border-[#64748b] hover:-translate-y-0.5 hover:shadow-lg"
                        }`}
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div className="flex items-start gap-3 min-w-0">
                            <div
                              className={`w-9 h-9 rounded-lg flex items-center justify-center font-bold text-sm shadow-md flex-shrink-0 ${
                                isTournament
                                  ? "bg-gradient-to-br from-blue-900 to-slate-900 text-blue-400 border border-blue-800"
                                  : isRepertoire
                                  ? "bg-gradient-to-br from-emerald-900 to-slate-900 text-emerald-400 border border-emerald-800"
                                  : "bg-gradient-to-br from-purple-900 to-slate-900 text-purple-400 border border-purple-800"
                              }`}
                            >
                              ♞
                            </div>
                            <div className="flex-1 min-w-0">
                              <div className={`font-semibold text-sm ${isLight ? "text-slate-900" : "text-[#e2e8f0]"} truncate`}>
                                {db.name.replace(/\.(lcdb|sqlite|db)$/, "")}
                              </div>
                              <div className="text-[10px] font-bold text-[#64748b] uppercase tracking-wider">
                                {isTournament ? "Tournament Master" : isRepertoire ? "Repertoire DB" : "Archive DB"}
                              </div>
                            </div>
                          </div>

                          <Tooltip content="Move to Trash" description="Soft-delete without immediate data loss">
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                trashMutation.mutate(db.name);
                                logAction("CLICK", `Moved Database to Trash: ${db.name}`);
                              }}
                              className="p-1 text-slate-400 hover:text-rose-500 hover:bg-rose-500/10 rounded transition-colors"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </Tooltip>
                        </div>

                        <div className={`grid grid-cols-2 gap-2 mt-auto pt-3 border-t ${isLight ? "border-slate-200" : "border-[#262c36]"} text-xs`}>
                          <div>
                            <span className="text-[10px] text-[#64748b] block">File Size</span>
                            <span className={`font-mono text-xs font-medium ${isLight ? "text-slate-800" : "text-[#e2e8f0]"}`}>
                              {db.size_mb} MB
                            </span>
                          </div>
                          <div>
                            <span className="text-[10px] text-[#64748b] block">Status</span>
                            <span className="font-mono text-[11px] text-emerald-500 flex items-center gap-1 font-semibold">
                              <CheckCircle2 className="w-3 h-3" /> Ready
                            </span>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              ) : (
                /* List Table View */
                <div className="bg-[#15181e] border border-[#262c36] rounded-xl overflow-hidden shadow-lg">
                  <table className="w-full text-left text-xs border-collapse">
                    <thead className="bg-[#0d1014] text-[#8b949e] text-[10px] font-semibold uppercase tracking-wider border-b border-[#262c36]">
                      <tr>
                        <th className="py-2.5 px-4">Database Name</th>
                        <th className="py-2.5 px-4">Type</th>
                        <th className="py-2.5 px-4 text-right">Size</th>
                        <th className="py-2.5 px-4 text-center">Status</th>
                        <th className="py-2.5 px-3 text-center">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-white/[0.03]">
                      {filteredDbs.map((db) => {
                        const isSelected = activeDbName === db.name;
                        return (
                          <tr
                            key={db.name}
                            onClick={() => handleSelectDb(db.name)}
                            className={`cursor-pointer transition-colors ${
                              isSelected
                                ? "bg-[#3b82f6]/15 text-white font-semibold"
                                : "hover:bg-white/5 text-[#8b949e] hover:text-white"
                            }`}
                          >
                            <td className="py-2 px-4 font-mono font-medium text-white flex items-center gap-2">
                              <Database className="w-3.5 h-3.5 text-[#3b82f6]" />
                              {db.name}
                            </td>
                            <td className="py-2 px-4 text-[11px] text-[#64748b]">
                              Standard SQLite (.sqlite)
                            </td>
                            <td className="py-2 px-4 text-right font-mono text-[11px]">
                              {db.size_mb} MB
                            </td>
                            <td className="py-2 px-4 text-center font-mono text-[11px] text-emerald-400 font-bold">
                              Active
                            </td>
                            <td className="py-2 px-3 text-center">
                              <Tooltip content="Move to Trash">
                                <button
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    trashMutation.mutate(db.name);
                                    logAction("CLICK", `Moved Database to Trash: ${db.name}`);
                                  }}
                                  className="p-1 text-slate-500 hover:text-rose-400 hover:bg-rose-500/10 rounded transition-colors"
                                >
                                  <Trash2 className="w-3.5 h-3.5" />
                                </button>
                              </Tooltip>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}

          {/* 4. Preview Split Pane (Bottom) */}
          {isPreviewOpen && activeDbName && (
            <div className="h-72 border-t border-[#1e232b] bg-[#111418] flex flex-col flex-shrink-0 animate-in slide-in-from-bottom-2 duration-150">
              {/* Preview Toolbar */}
              <div className="h-8 bg-[#0d1014] border-b border-[#1e232b] flex items-center justify-between px-4">
                <div className="text-xs font-semibold text-[#3b82f6] flex items-center gap-2">
                  <Database className="w-3.5 h-3.5" />
                  Database Preview: <span className="text-white font-mono">{activeDbName}</span>
                  <span className="text-[#64748b] font-normal">
                    ({gamesData?.total ? gamesData.total.toLocaleString() : 0} games indexed)
                  </span>
                </div>

                <div className="flex items-center gap-2">
                  {/* Export Filtered Sub-DB Button */}
                  <button
                    onClick={() => {
                      setExportTargetName(activeDbName ? activeDbName.replace(/\.(lcdb|sqlite|db)$/, "") + "_Filtered.lcdb" : "Sub_Database.lcdb");
                      setIsExportModalOpen(true);
                      logAction("CLICK", "Opened Export Sub-Database Modal", `Source: ${activeDbName}`);
                    }}
                    className="px-2.5 py-0.5 bg-blue-600/90 hover:bg-blue-500 text-white rounded text-[11px] font-bold flex items-center gap-1 shadow-sm cursor-pointer transition-all"
                  >
                    <Download className="w-3 h-3" />
                    Export Filtered
                  </button>

                  {/* Move Active DB to Trash Button */}
                  <Tooltip content="Move Selected Database to Trash" description="Soft-delete database to reclaim space later">
                    <button
                      onClick={() => {
                        if (activeDbName) {
                          trashMutation.mutate(activeDbName);
                          logAction("CLICK", `Moved Active Database to Trash: ${activeDbName}`);
                        }
                      }}
                      className="px-2 py-0.5 bg-rose-600/20 hover:bg-rose-600/30 text-rose-300 border border-rose-500/30 rounded text-[11px] font-bold flex items-center gap-1 shadow-sm cursor-pointer transition-all"
                    >
                      <Trash2 className="w-3 h-3 text-rose-400" />
                      Move to Trash
                    </button>
                  </Tooltip>

                  {/* Game filter in preview */}
                  <input
                    type="text"
                    placeholder="Search games..."
                    value={searchGameText}
                    onChange={(e) => setSearchGameText(e.target.value)}
                    className="bg-[#080a0c] border border-[#262c36] rounded px-2 py-0.5 text-[11px] text-white outline-none w-36"
                  />
                  <button
                    onClick={() => setIsPreviewOpen(false)}
                    className="text-[#8b949e] hover:text-white transition-colors"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>
              </div>

              {/* Preview Content: Table + Mini Board */}
              <div className="flex-1 flex min-h-0">
                {/* Games Table Area */}
                <div className="flex-1 overflow-y-auto bg-[#080a0c] border-r border-[#1e232b]">
                  {isLoadingGames ? (
                    <div className="h-full flex items-center justify-center text-xs text-[#64748b] font-mono">
                      Loading games from SQLite...
                    </div>
                  ) : (
                    <table className="w-full text-left text-xs border-collapse whitespace-nowrap">
                      <thead className="sticky top-0 bg-[#0d1014] text-[#8b949e] text-[10px] font-semibold uppercase tracking-wider border-b border-[#262c36]">
                        <tr>
                          <th className="py-1.5 px-3 w-10">#</th>
                          <th className="py-1.5 px-3">White</th>
                          <th className="py-1.5 px-2 text-right">Elo W</th>
                          <th className="py-1.5 px-3">Black</th>
                          <th className="py-1.5 px-2 text-right">Elo B</th>
                          <th className="py-1.5 px-2 text-center">Result</th>
                          <th className="py-1.5 px-2 text-center">Moves</th>
                          <th className="py-1.5 px-2">ECO</th>
                          <th className="py-1.5 px-3">Tournament</th>
                          <th className="py-1.5 px-3">Date</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-white/[0.02] font-sans text-xs">
                        {(gamesData?.games ?? []).map((g) => {
                          const isSelected = selectedGame?.id === g.id;
                          return (
                            <tr
                              key={g.id}
                              onClick={() => handleSelectGame(g)}
                              onDoubleClick={() => onLoadGame(g.id)}
                              className={`cursor-pointer transition-colors ${
                                isSelected
                                  ? "bg-[#3b82f6]/15 text-white font-medium"
                                  : "hover:bg-[#181d24] text-[#8b949e] hover:text-[#e2e8f0]"
                              }`}
                            >
                              <td className="py-1.5 px-3 font-mono text-[11px] text-[#64748b]">
                                {g.id}
                              </td>
                              <td className="py-1.5 px-3 font-medium text-white truncate max-w-[120px]">
                                {g.WHITE}
                              </td>
                              <td className="py-1.5 px-2 text-right font-mono text-[11px] text-[#8b949e]">
                                {g.WHITEELO || "—"}
                              </td>
                              <td className="py-1.5 px-3 font-medium text-white truncate max-w-[120px]">
                                {g.BLACK}
                              </td>
                              <td className="py-1.5 px-2 text-right font-mono text-[11px] text-[#8b949e]">
                                {g.BLACKELO || "—"}
                              </td>
                              <td
                                className={`py-1.5 px-2 text-center font-mono font-bold text-[11px] ${
                                  g.RESULT === "1-0"
                                    ? "text-[#10b981]"
                                    : g.RESULT === "0-1"
                                    ? "text-[#ef4444]"
                                    : "text-[#8b949e]"
                                }`}
                              >
                                {g.RESULT}
                              </td>
                              <td className="py-1.5 px-2 text-center font-mono text-[11px]">
                                {Math.floor((g.PLYCOUNT || 0) / 2) || "—"}
                              </td>
                              <td className="py-1.5 px-2 font-mono text-[#3b82f6] text-[11px]">
                                {g.ECO || "—"}
                              </td>
                              <td className="py-1.5 px-3 truncate max-w-[140px] text-[#8b949e]">
                                {g.EVENT || "—"}
                              </td>
                              <td className="py-1.5 px-3 font-mono text-[11px] text-[#8b949e]">
                                {g.DATE || "—"}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  )}
                </div>

                {/* Mini Board Area */}
                <div className="w-72 bg-[#111418] flex flex-col items-center justify-between p-3 flex-shrink-0">
                  <div className="w-full flex flex-col items-center">
                    <div className="w-40 aspect-square rounded overflow-hidden shadow-lg border border-[#1e232b]">
                      <Chessboard
                        options={{
                          position: previewFen,
                          darkSquareStyle: { backgroundColor: boardTheme?.boardDark || "#627286" },
                          lightSquareStyle: { backgroundColor: boardTheme?.boardLight || "#b0b9c6" },
                        }}
                      />
                    </div>

                    {/* Game Meta Summary */}
                    {selectedGame ? (
                      <div className="w-full text-center mt-2.5 space-y-0.5 text-xs">
                        <div className="font-bold text-white truncate">
                          {selectedGame.WHITE} vs {selectedGame.BLACK}
                        </div>
                        <div className="text-[10px] font-mono text-[#8b949e]">
                          {selectedGame.RESULT} · {selectedGame.ECO || "ECO"} · {selectedGame.EVENT || "Match"}
                        </div>
                      </div>
                    ) : (
                      <div className="text-[11px] text-[#64748b] italic mt-3">
                        Select a game to preview
                      </div>
                    )}
                  </div>

                  {/* Actions */}
                  {selectedGame && (
                    <button
                      onClick={() => {
                        logAction("NAV", `Opened Game #${selectedGame.id} into Analysis Workspace`);
                        onLoadGame(selectedGame.id);
                      }}
                      className="w-full py-1.5 bg-[#3b82f6] hover:bg-[#2563eb] text-white font-bold text-xs rounded transition-all flex items-center justify-center gap-1.5 shadow"
                    >
                      <Play className="w-3 h-3" />
                      Open Game in Analysis
                    </button>
                  )}
                </div>
              </div>
            </div>
          )}
        </main>
      </div>
    )}

      {/* 5. Footer Status Bar */}
      <footer className="h-6 bg-[#3b82f6] flex items-center justify-between px-4 text-white text-[10px] font-semibold flex-shrink-0">
        <div>Ready · DeepScout Chess Studio v1.0</div>
        <div className="opacity-80 font-mono">SQLite WAL · DuckDB Vector Ready</div>
      </footer>

      {/* 6. Purge Databases Disk Reclaim Modal */}
      {isPurgeModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4 animate-in fade-in duration-150">
          <div className="bg-slate-900 border border-rose-500/40 rounded-3xl p-6 shadow-2xl max-w-lg w-full text-slate-100 space-y-4">
            <div className="flex items-center justify-between border-b border-white/5 pb-3">
              <div className="flex items-center gap-3 text-rose-400">
                <div className="p-2.5 rounded-2xl bg-rose-500/20 border border-rose-500/30">
                  <Trash2 className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="font-bold text-sm text-white">Purge Trashed Databases</h3>
                  <span className="text-[11px] text-slate-400 font-mono">
                    Permanently delete and reclaim storage space
                  </span>
                </div>
              </div>
              <button
                onClick={() => setIsPurgeModalOpen(false)}
                className="p-1 text-slate-400 hover:text-white rounded-lg hover:bg-slate-800 transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="space-y-3">
              <div className="p-4 bg-rose-500/10 border border-rose-500/20 rounded-2xl text-xs space-y-1">
                <div className="font-bold text-rose-300 flex items-center gap-1.5">
                  <HardDrive className="w-4 h-4" />
                  Disk Space to be Reclaimed: <span className="text-white font-mono text-sm">{storageTelemetry?.trash_size_mb || 0} MB</span>
                </div>
                <p className="text-[11px] text-slate-400">
                  Purging will permanently delete {trashDbs?.length || 0} database(s) from your disk.
                </p>
              </div>

              {/* List of Trashed Databases */}
              <div className="max-h-48 overflow-y-auto space-y-2 pr-1">
                {trashDbs?.map((db) => (
                  <div
                    key={db.name}
                    className="p-2.5 bg-black/40 border border-white/5 rounded-xl flex items-center justify-between text-xs"
                  >
                    <div>
                      <div className="font-mono text-white font-semibold truncate max-w-[240px]">{db.name}</div>
                      <div className="text-[10px] text-slate-500 font-mono">{db.size_mb} MB</div>
                    </div>
                    <button
                      onClick={() => restoreMutation.mutate(db.name)}
                      disabled={restoreMutation.isPending}
                      className="px-2.5 py-1 text-[11px] font-semibold text-slate-300 hover:text-white bg-slate-800 hover:bg-slate-700 rounded-lg transition-all flex items-center gap-1 cursor-pointer disabled:opacity-50"
                    >
                      <RotateCcw className="w-3 h-3 text-emerald-400" />
                      Restore
                    </button>
                  </div>
                ))}
              </div>
            </div>

            <div className="flex items-center justify-between gap-2 pt-3 border-t border-white/5">
              <button
                onClick={() => setIsPurgeModalOpen(false)}
                className="px-4 py-1.5 text-xs text-slate-300 hover:text-white bg-slate-800 rounded-xl hover:bg-slate-700 transition-colors"
              >
                Cancel
              </button>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => purgeMutation.mutate(undefined)}
                  disabled={purgeMutation.isPending || !trashDbs || trashDbs.length === 0}
                  className="px-5 py-1.5 text-xs font-bold text-white bg-gradient-to-r from-rose-600 to-amber-600 hover:from-rose-500 hover:to-amber-500 rounded-xl shadow-lg transition-all flex items-center gap-1.5 disabled:opacity-50 cursor-pointer"
                >
                  {purgeMutation.isPending ? (
                    <>
                      <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                      Purging Files...
                    </>
                  ) : (
                    <>
                      <Trash2 className="w-3.5 h-3.5" />
                      Purge All ({storageTelemetry?.trash_size_mb || 0} MB)
                    </>
                  )}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* 7. Export Filtered Sub-Database Modal */}
      {isExportModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4 animate-in fade-in duration-150">
          <div className="bg-slate-900 border border-blue-500/40 rounded-3xl p-6 shadow-2xl max-w-lg w-full text-slate-100 space-y-4">
            <div className="flex items-center justify-between border-b border-white/5 pb-3">
              <div className="flex items-center gap-3 text-blue-400">
                <div className="p-2.5 rounded-2xl bg-blue-500/20 border border-blue-500/30">
                  <Download className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="font-bold text-sm text-white">Export Filtered Sub-Database</h3>
                  <span className="text-[11px] text-slate-400 font-mono">
                    Source: {activeDbName} · {searchGameText ? `Filter: "${searchGameText}"` : "All Indexed Games"}
                  </span>
                </div>
              </div>
              <button
                onClick={() => setIsExportModalOpen(false)}
                className="p-1 text-slate-400 hover:text-white rounded-lg hover:bg-slate-800 transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="space-y-3 text-xs">
              <div className="space-y-1.5">
                <label className="text-slate-300 font-semibold block">Target Database Filename:</label>
                <input
                  type="text"
                  value={exportTargetName}
                  onChange={(e) => setExportTargetName(e.target.value)}
                  className="w-full bg-black/50 border border-white/10 rounded-xl px-3 py-2 text-xs font-mono text-blue-400 outline-none focus:border-blue-500"
                  placeholder="Sub_Database.lcdb"
                />
              </div>

              <div className="p-3 bg-black/30 rounded-xl border border-white/5 space-y-1 text-[11px] font-mono text-slate-400">
                <div>Format: <strong className="text-white">Standard SQLite (.lcdb)</strong></div>
                <div>Games Included: <strong className="text-emerald-400">{gamesData?.total || 0} games</strong></div>
                <div>Deduplication &amp; Integrity: <strong className="text-blue-400">Auto-Indexed</strong></div>
              </div>

              {exportStatus && (
                <div className="p-2.5 bg-emerald-500/20 border border-emerald-500/30 rounded-xl text-emerald-300 font-bold text-xs flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4" />
                  {exportStatus}
                </div>
              )}
            </div>

            <div className="flex justify-end gap-2 pt-2 border-t border-white/5">
              <button
                onClick={() => setIsExportModalOpen(false)}
                className="px-4 py-1.5 text-xs text-slate-300 hover:text-white bg-slate-800 rounded-xl hover:bg-slate-700 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={() => {
                  if (!activeDbName || !exportTargetName) return;
                  exportMutation.mutate({
                    source_db: activeDbName,
                    target_name: exportTargetName,
                    search: searchGameText || undefined,
                  });
                }}
                disabled={exportMutation.isPending || !exportTargetName.trim()}
                className="px-5 py-1.5 text-xs font-bold text-white bg-blue-600 rounded-xl hover:bg-blue-500 transition-all flex items-center gap-1.5 disabled:opacity-50 cursor-pointer"
              >
                {exportMutation.isPending ? (
                  <>
                    <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                    Exporting...
                  </>
                ) : (
                  <>
                    <Download className="w-3.5 h-3.5" />
                    Export Sub-Database
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
