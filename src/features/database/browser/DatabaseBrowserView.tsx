import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { UXTheme, BoardTheme } from "../../../lib/theme";
import { useClickLogger } from "../../../lib/clickLogger";
import { Tooltip } from "../../../components/common/Tooltip";
import { fetchDatabases, fetchGamesList, fetchGame, GameSummary } from "../../../lib/api";
import { Chessboard } from "react-chessboard";
import { Chess } from "chess.js";
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
  boardTheme,
  onLoadGame,
  onOpenBookBuilder,
  onOpenSparring,
  onOpenDataFitness,
}: DatabaseBrowserViewProps) {
  const { logAction } = useClickLogger();

  // State
  const [selectedDb, setSelectedDb] = useState<string | null>(null);
  const [selectedFolder, setSelectedFolder] = useState<string>("My Databases");
  const [selectedGame, setSelectedGame] = useState<GameSummary | null>(null);
  const [viewMode, setViewMode] = useState<"grid" | "list">("grid");
  const [searchDbText, setSearchDbText] = useState("");
  const [searchGameText, setSearchGameText] = useState("");
  const [isPreviewOpen, setIsPreviewOpen] = useState(true);

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
    if (!selectedGameDetails?.pgn) return "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1";
    try {
      const chess = new Chess();
      chess.loadPgn(selectedGameDetails.pgn);
      return chess.fen();
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

  return (
    <div className="flex flex-col h-full bg-[#080a0c] text-[#e2e8f0] select-none overflow-hidden font-sans">
      {/* 1. Top Sub-Command Bar */}
      <header className="h-12 bg-[#0d1014] border-b border-[#1e232b] flex items-center justify-between px-4 flex-shrink-0 shadow-lg z-10">
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2 font-bold text-sm text-[#3b82f6]">
            <Database className="w-4 h-4 text-[#3b82f6]" />
            DeepScout Vault
          </div>

          <div className="flex gap-1">
            {["Home", "Maintenance", "Cloud Vault", "Reports"].map((tab, idx) => (
              <button
                key={tab}
                onClick={() => logAction("NAV", `Clicked tab: ${tab}`)}
                className={`px-3 py-1.5 text-xs font-medium rounded transition-colors ${
                  idx === 0
                    ? "bg-[#3b82f6]/10 text-[#3b82f6] font-semibold"
                    : "text-[#8b949e] hover:bg-[#181d24] hover:text-[#e2e8f0]"
                }`}
              >
                {tab}
              </button>
            ))}
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

          {/* New Database / Ingest Button */}
          <Tooltip content="Add / Ingest Database" description="Import PGN or SQLite into Data Fitness Pipeline">
            <button
              onClick={() => {
                logAction("CLICK", "Triggered Add Database / Ingestion");
                if (onOpenDataFitness) onOpenDataFitness(activeDbName || undefined);
              }}
              className="px-3 py-1 bg-[#3b82f6] hover:bg-[#2563eb] text-white text-xs font-bold rounded shadow-md transition-all flex items-center gap-1 cursor-pointer"
            >
              <Plus className="w-3.5 h-3.5" />
              Add Database
            </button>
          </Tooltip>
        </div>
      </header>

      {/* 2. Main Workspace Layout */}
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
                      <div className="flex items-start gap-3">
                        <div
                          className={`w-9 h-9 rounded-lg flex items-center justify-center font-bold text-sm shadow-md ${
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

      {/* 5. Footer Status Bar */}
      <footer className="h-6 bg-[#3b82f6] flex items-center justify-between px-4 text-white text-[10px] font-semibold flex-shrink-0">
        <div>Ready · DeepScout Chess Studio v1.0</div>
        <div className="opacity-80 font-mono">SQLite WAL · DuckDB Vector Ready</div>
      </footer>
    </div>
  );
}
