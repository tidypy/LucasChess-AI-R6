import { useState, useRef } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { UXTheme, BoardTheme } from "../../../lib/theme";
import { useClickLogger } from "../../../lib/clickLogger";
import { Tooltip } from "../../../components/common/Tooltip";
import {
  fetchDatabases,
  fetchGamesList,
  fetchGame,
  deleteDatabase,
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
  const [pendingImportFile, setPendingImportFile] = useState<{ name: string; size: number } | null>(null);
  const [selectedDb, setSelectedDb] = useState<string | null>(null);
  const [selectedFolder, setSelectedFolder] = useState<string>("My Databases");
  const [selectedGame, setSelectedGame] = useState<GameSummary | null>(null);
  const [viewMode, setViewMode] = useState<"grid" | "list">("grid");
  const [searchDbText, setSearchDbText] = useState("");
  const [searchGameText, setSearchGameText] = useState("");
  const [isPreviewOpen, setIsPreviewOpen] = useState(true);

  // Delete and Export Modals State
  const [dbToDelete, setDbToDelete] = useState<string | null>(null);
  const [isExportModalOpen, setIsExportModalOpen] = useState(false);
  const [exportTargetName, setExportTargetName] = useState("");
  const [exportStatus, setExportStatus] = useState<string | null>(null);

  const deleteMutation = useMutation({
    mutationFn: deleteDatabase,
    onSuccess: (data) => {
      logAction("API", `Successfully deleted database: ${data.deleted}`);
      setDbToDelete(null);
      setSelectedDb(null);
      queryClient.invalidateQueries({ queryKey: ["databases"] });
    },
  });

  const exportMutation = useMutation({
    mutationFn: exportFilteredDatabase,
    onSuccess: (data) => {
      logAction("API", `Exported sub-database: ${data.target_db}`, `${data.exported_games} games`);
      setExportStatus(`Exported ${data.exported_games} games into ${data.target_db}`);
      queryClient.invalidateQueries({ queryKey: ["databases"] });
      setTimeout(() => {
        setIsExportModalOpen(false);
        setExportStatus(null);
      }, 1500);
    },
  });

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setPendingImportFile({ name: file.name, size: file.size });
      setActiveSubTab("fitness");
      logAction("CLICK", `Browsed and Selected DB File for Import: ${file.name}`, `${file.size} bytes`);
      // Reset input value so re-selecting same file triggers onChange
      e.target.value = "";
    }
  };

  // Queries
  const { data: databases } = useQuery({
    queryKey: ["databases"],
    queryFn: fetchDatabases,
  });

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

  const SUB_TABS = [
    { id: "shelf", label: "Shelf & Games", icon: Database },
    { id: "fashion", label: "Fashion Index (Report)", icon: TrendingUp },
    { id: "dossier", label: "Player Dossier & Compare", icon: Users },
    { id: "fitness", label: "Data Fitness Studio", icon: ShieldCheck },
    { id: "consolidator", label: "Consolidator", icon: Layers },
  ];

  return (
    <div className="flex flex-col h-full bg-[#080a0c] text-[#e2e8f0] select-none overflow-hidden font-sans">
      {/* 1. Top Sub-Command Bar */}
      <header className="h-12 bg-[#0d1014] border-b border-[#1e232b] flex items-center justify-between px-4 flex-shrink-0 shadow-lg z-10">
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
          <div className="flex items-center bg-[#080a0c] border border-[#262c36] rounded px-2 h-7 w-48 focus-within:border-[#3b82f6] transition-colors">
            <Search className="w-3 h-3 text-[#64748b] mr-1.5" />
            <input
              type="text"
              placeholder="Find database..."
              value={searchDbText}
              onChange={(e) => setSearchDbText(e.target.value)}
              className="bg-transparent border-none text-xs text-[#e2e8f0] outline-none w-full placeholder-[#64748b]"
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
        <aside className="w-56 bg-[#111418] border-r border-[#1e232b] flex flex-col flex-shrink-0 overflow-y-auto">
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
                  ? "bg-[#3b82f6]/10 text-[#3b82f6] font-semibold border-r-2 border-[#3b82f6]"
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
                  ? "bg-[#3b82f6]/10 text-[#3b82f6] font-semibold border-r-2 border-[#3b82f6]"
                  : "text-[#8b949e] hover:bg-[#181d24] hover:text-[#e2e8f0]"
              }`}
            >
              <History className="w-3.5 h-3.5 opacity-80" />
              Recent Files
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
              Tactics & Studies
            </div>
          </div>

          <div className="pt-3 pb-2">
            <div className="text-[10px] font-bold text-[#64748b] uppercase tracking-wider px-4 pb-2">
              Cloud & Sync
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
        <main className="flex-1 flex flex-col min-w-0 bg-[#080a0c] overflow-hidden">
          {/* Database Grid Container */}
          <div className="flex-1 overflow-y-auto p-6 flex flex-col">
            <div className="flex justify-between items-end mb-4">
              <div>
                <h1 className="text-lg font-bold tracking-tight text-white m-0">
                  {selectedFolder}
                </h1>
                <span className="text-xs text-[#64748b]">
                  {filteredDbs.length} Standard SQLite databases available
                </span>
              </div>

              {/* View toggle (Grid / List) */}
              <div className="flex gap-1 bg-[#111418] border border-[#262c36] p-0.5 rounded">
                <button
                  onClick={() => setViewMode("grid")}
                  className={`p-1 rounded ${
                    viewMode === "grid"
                      ? "bg-[#080a0c] text-white shadow"
                      : "text-[#64748b] hover:text-white"
                  }`}
                >
                  <Grid className="w-3.5 h-3.5" />
                </button>
                <button
                  onClick={() => setViewMode("list")}
                  className={`p-1 rounded ${
                    viewMode === "list"
                      ? "bg-[#080a0c] text-white shadow"
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
                      className={`bg-[#15181e] border rounded-lg p-4 cursor-pointer transition-all duration-150 flex flex-col gap-3 relative overflow-hidden ${
                        isSelected
                          ? "border-[#3b82f6] bg-[#3b82f6]/5 shadow-[0_0_0_1px_#3b82f6]"
                          : "border-[#262c36] hover:border-[#64748b] hover:-translate-y-0.5 hover:shadow-lg"
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
                            <div className="font-semibold text-sm text-[#e2e8f0] truncate">
                              {db.name.replace(/\.(lcdb|sqlite|db)$/, "")}
                            </div>
                            <div className="text-[10px] font-bold text-[#64748b] uppercase tracking-wider">
                              {isTournament ? "Tournament Master" : isRepertoire ? "Repertoire DB" : "Archive DB"}
                            </div>
                          </div>
                        </div>

                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            setDbToDelete(db.name);
                            logAction("CLICK", `Prompted Delete Database: ${db.name}`);
                          }}
                          className="p-1 text-slate-500 hover:text-rose-400 hover:bg-rose-500/10 rounded transition-colors"
                          title="Delete Database"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>

                      <div className="grid grid-cols-2 gap-2 mt-auto pt-3 border-t border-[#262c36] text-xs">
                        <div>
                          <span className="text-[10px] text-[#64748b] block">File Size</span>
                          <span className="font-mono text-xs font-medium text-[#e2e8f0]">
                            {db.size_mb} MB
                          </span>
                        </div>
                        <div>
                          <span className="text-[10px] text-[#64748b] block">Status</span>
                          <span className="font-mono text-[11px] text-emerald-400 flex items-center gap-1 font-semibold">
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
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                setDbToDelete(db.name);
                                logAction("CLICK", `Prompted Delete Database: ${db.name}`);
                              }}
                              className="p-1 text-slate-500 hover:text-rose-400 hover:bg-rose-500/10 rounded transition-colors"
                              title="Delete Database"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>

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

                <div className="flex items-center gap-3">
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

      {/* 6. Delete Database Confirmation Modal */}
      {dbToDelete && (
        <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4 animate-in fade-in duration-150">
          <div className="bg-slate-900 border border-rose-500/40 rounded-3xl p-6 shadow-2xl max-w-md w-full text-slate-100 space-y-4">
            <div className="flex items-center gap-3 text-rose-400">
              <div className="p-2.5 rounded-2xl bg-rose-500/20 border border-rose-500/30">
                <Trash2 className="w-5 h-5" />
              </div>
              <div>
                <h3 className="font-bold text-sm text-white">Delete Database</h3>
                <span className="text-[11px] text-slate-400 font-mono">Permanent database removal</span>
              </div>
            </div>

            <p className="text-xs text-slate-300 leading-relaxed font-sans">
              Are you sure you want to delete <strong className="text-white font-mono">{dbToDelete}</strong>? This will detach the database and remove its local SQLite file.
            </p>

            <div className="flex justify-end gap-2 pt-2">
              <button
                onClick={() => setDbToDelete(null)}
                className="px-4 py-1.5 text-xs text-slate-300 hover:text-white bg-slate-800 rounded-xl hover:bg-slate-700 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={() => deleteMutation.mutate(dbToDelete)}
                disabled={deleteMutation.isPending}
                className="px-4 py-1.5 text-xs font-bold text-white bg-rose-600 rounded-xl hover:bg-rose-500 transition-all flex items-center gap-1.5 disabled:opacity-50"
              >
                {deleteMutation.isPending ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Trash2 className="w-3.5 h-3.5" />}
                Delete Database
              </button>
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
