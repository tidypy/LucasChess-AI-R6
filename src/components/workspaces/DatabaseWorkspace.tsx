import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  fetchDatabases,
  fetchDatabaseStats,
  fetchGamesList,
  setActiveDatabase,
  importPgn,
  GameSummary,
} from "../../lib/api";
import { useClickLogger } from "../../lib/clickLogger";
import { Tooltip } from "../common/Tooltip";
import { UXTheme } from "../../lib/theme";
import {
  Database,
  Search,
  Upload,
  RefreshCw,
  ChevronLeft,
  ChevronRight,
  Filter,
  Play,
  Check,
  X,
  FileText,
} from "lucide-react";

interface DatabaseWorkspaceProps {
  onLoadGame: (gameId: number) => void;
  uxTheme: UXTheme;
}

export function DatabaseWorkspace({ onLoadGame, uxTheme }: DatabaseWorkspaceProps) {
  const { logAction } = useClickLogger();
  const queryClient = useQueryClient();
  const isLight = uxTheme.mode === "light";

  // Filter and pagination state
  const [page, setPage] = useState(1);
  const [pageSize] = useState(25);
  const [search, setSearch] = useState("");
  const [resultFilter, setResultFilter] = useState("");
  const [ecoFilter, setEcoFilter] = useState("");
  const [sortBy, setSortBy] = useState("ROWID");
  const [sortOrder, setSortOrder] = useState<"ASC" | "DESC">("ASC");

  // PGN Import Modal
  const [isImportOpen, setIsImportOpen] = useState(false);
  const [pgnInput, setPgnInput] = useState("");
  const [importStatus, setImportStatus] = useState<string | null>(null);

  // Queries
  const { data: databases } = useQuery({
    queryKey: ["databases"],
    queryFn: fetchDatabases,
  });

  const { data: stats, refetch: refetchStats } = useQuery({
    queryKey: ["dbStats"],
    queryFn: () => fetchDatabaseStats(),
  });

  const {
    data: gamesData,
    isLoading: isLoadingGames,
    refetch: refetchGames,
  } = useQuery({
    queryKey: ["gamesList", page, pageSize, search, resultFilter, ecoFilter, sortBy, sortOrder],
    queryFn: () =>
      fetchGamesList({
        page,
        page_size: pageSize,
        search,
        result: resultFilter || undefined,
        eco: ecoFilter || undefined,
        sort_by: sortBy,
        sort_order: sortOrder,
      }),
  });

  // Switch Active Database Mutation
  const switchDbMutation = useMutation({
    mutationFn: setActiveDatabase,
    onSuccess: (data) => {
      logAction("API", `Switched Active Database: ${data.active}`);
      queryClient.invalidateQueries({ queryKey: ["databases"] });
      queryClient.invalidateQueries({ queryKey: ["dbStats"] });
      queryClient.invalidateQueries({ queryKey: ["gamesList"] });
      setPage(1);
    },
  });

  // Import PGN Mutation
  const importMutation = useMutation({
    mutationFn: (text: string) => importPgn(text),
    onSuccess: (data) => {
      logAction("API", `Successfully imported ${data.imported_count} games`);
      setImportStatus(`Imported ${data.imported_count} game(s) successfully!`);
      setPgnInput("");
      refetchStats();
      refetchGames();
      setTimeout(() => {
        setIsImportOpen(false);
        setImportStatus(null);
      }, 1800);
    },
    onError: (err: any) => {
      setImportStatus(`Import error: ${err.message}`);
    },
  });

  const handleSort = (col: string) => {
    if (sortBy === col) {
      setSortOrder(sortOrder === "ASC" ? "DESC" : "ASC");
    } else {
      setSortBy(col);
      setSortOrder("ASC");
    }
    logAction("CLICK", `Sorted by ${col} (${sortOrder === "ASC" ? "DESC" : "ASC"})`);
  };

  const handleSelectGame = (game: GameSummary) => {
    logAction("CLICK", `Loaded Game #${game.id}: ${game.WHITE} vs ${game.BLACK}`);
    onLoadGame(game.id);
  };

  return (
    <div className="flex flex-col h-full gap-5 overflow-hidden select-none">
      {/* Top Header & DB Switcher */}
      <div
        className={`p-5 rounded-3xl border flex flex-col md:flex-row md:items-center justify-between gap-4 shadow-xl ${uxTheme.panel} ${uxTheme.border}`}
      >
        <div className="flex items-center gap-3">
          <div className="p-3 bg-emerald-500/10 text-emerald-500 rounded-2xl border border-emerald-500/20">
            <Database className="w-6 h-6" />
          </div>
          <div>
            <h2 className="text-base font-bold text-slate-100 flex items-center gap-2">
              SQLite Database Explorer
              {stats && (
                <span className="text-xs font-mono px-2.5 py-0.5 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/30">
                  {stats.total_games.toLocaleString()} Games
                </span>
              )}
            </h2>
            <p className="text-xs opacity-70">
              Active Database: <span className="font-mono font-bold text-emerald-400">{stats?.path || "patriciaTourny.lcdb"}</span>
            </p>
          </div>
        </div>

        {/* Database Switcher & Import Action */}
        <div className="flex items-center gap-2.5 flex-wrap">
          {databases?.map((db) => (
            <Tooltip key={db.name} content={`Switch to ${db.name} (${db.size_mb} MB)`}>
              <button
                onClick={() => switchDbMutation.mutate(db.name)}
                className={`px-3 py-1.5 rounded-xl text-xs font-semibold font-mono transition-all border ${
                  stats?.path === db.name
                    ? "bg-emerald-500 text-slate-950 border-emerald-400 font-bold shadow-md"
                    : isLight
                    ? "bg-slate-100 hover:bg-slate-200 border-slate-200 text-slate-700"
                    : "bg-black/30 hover:bg-white/10 border-white/10 text-slate-300"
                }`}
              >
                {db.name}
              </button>
            </Tooltip>
          ))}

          <Tooltip content="Import PGN text or multi-game file">
            <button
              onClick={() => {
                logAction("CLICK", "Opened PGN Importer Modal");
                setIsImportOpen(true);
              }}
              className="px-3.5 py-1.5 bg-emerald-500 text-slate-950 text-xs font-bold rounded-xl flex items-center gap-1.5 shadow-md hover:bg-emerald-400 transition-colors ml-2"
            >
              <Upload className="w-3.5 h-3.5" />
              Import PGN
            </button>
          </Tooltip>
        </div>
      </div>

      {/* Main Database Table Container */}
      <div
        className={`flex-grow rounded-3xl border flex flex-col overflow-hidden shadow-2xl min-h-0 ${uxTheme.panel} ${uxTheme.border}`}
      >
        {/* Search and Filters Bar */}
        <div
          className={`p-4 border-b flex flex-col md:flex-row items-center justify-between gap-3 ${
            isLight ? "bg-slate-50 border-slate-200" : "bg-black/40 border-white/10"
          }`}
        >
          <div className="flex items-center gap-2.5 w-full md:w-auto flex-grow max-w-md">
            <div
              className={`flex items-center gap-2 px-3 py-1.5 rounded-xl border flex-grow ${
                isLight ? "bg-white border-slate-200" : "bg-black/30 border-white/10"
              }`}
            >
              <Search className="w-4 h-4 opacity-50 flex-shrink-0" />
              <input
                type="text"
                placeholder="Search player, event, opening..."
                value={search}
                onChange={(e) => {
                  setSearch(e.target.value);
                  setPage(1);
                }}
                className="bg-transparent border-0 text-xs focus:outline-none w-full"
              />
              {search && (
                <button
                  onClick={() => setSearch("")}
                  className="opacity-50 hover:opacity-100"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
            </div>
          </div>

          <div className="flex items-center gap-2 w-full md:w-auto justify-end flex-wrap">
            {/* Result Filter */}
            <select
              value={resultFilter}
              onChange={(e) => {
                setResultFilter(e.target.value);
                setPage(1);
                logAction("CLICK", `Filtered by Result: ${e.target.value || "All"}`);
              }}
              className={`px-3 py-1.5 rounded-xl text-xs font-semibold border ${
                isLight
                  ? "bg-white border-slate-200 text-slate-700"
                  : "bg-black/40 border-white/10 text-slate-300"
              }`}
            >
              <option value="">All Results</option>
              <option value="1-0">1-0 (White Win)</option>
              <option value="0-1">0-1 (Black Win)</option>
              <option value="1/2-1/2">1/2-1/2 (Draw)</option>
            </select>

            {/* ECO Filter */}
            <div
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl border ${
                isLight ? "bg-white border-slate-200" : "bg-black/30 border-white/10"
              }`}
            >
              <Filter className="w-3.5 h-3.5 opacity-50" />
              <input
                type="text"
                placeholder="ECO (e.g. B01)"
                value={ecoFilter}
                onChange={(e) => {
                  setEcoFilter(e.target.value);
                  setPage(1);
                }}
                className="bg-transparent border-0 text-xs focus:outline-none w-20 font-mono"
              />
            </div>

            <Tooltip content="Refresh Games List">
              <button
                onClick={() => {
                  logAction("CLICK", "Refreshed games grid");
                  refetchGames();
                }}
                className={`p-2 rounded-xl border transition-colors ${
                  isLight
                    ? "bg-white hover:bg-slate-100 border-slate-200 text-slate-700"
                    : "bg-black/30 hover:bg-white/10 border-white/10 text-slate-300"
                }`}
              >
                <RefreshCw className="w-3.5 h-3.5" />
              </button>
            </Tooltip>
          </div>
        </div>

        {/* Table Body */}
        <div className="flex-grow overflow-y-auto min-h-0">
          {isLoadingGames ? (
            <div className="h-64 flex items-center justify-center gap-2 opacity-60">
              <RefreshCw className="w-5 h-5 animate-spin text-emerald-500" />
              <span className="text-xs font-mono">Loading records from SQLite WAL...</span>
            </div>
          ) : !gamesData || gamesData.games.length === 0 ? (
            <div className="h-64 flex flex-col items-center justify-center gap-2 opacity-60">
              <FileText className="w-8 h-8 opacity-30" />
              <span className="text-xs">No games found matching the selected filters.</span>
            </div>
          ) : (
            <table className="w-full text-left text-xs border-collapse font-sans">
              <thead>
                <tr
                  className={`border-b text-[11px] font-bold uppercase tracking-wider sticky top-0 z-10 select-none ${
                    isLight
                      ? "bg-slate-100 border-slate-200 text-slate-600"
                      : "bg-[#0c121e] border-white/10 text-slate-400"
                  }`}
                >
                  <th
                    onClick={() => handleSort("ROWID")}
                    className="py-3 px-4 cursor-pointer hover:text-emerald-500 w-16"
                  >
                    # {sortBy === "ROWID" && (sortOrder === "ASC" ? "↑" : "↓")}
                  </th>
                  <th
                    onClick={() => handleSort("WHITE")}
                    className="py-3 px-4 cursor-pointer hover:text-emerald-500"
                  >
                    White Player {sortBy === "WHITE" && (sortOrder === "ASC" ? "↑" : "↓")}
                  </th>
                  <th
                    onClick={() => handleSort("BLACK")}
                    className="py-3 px-4 cursor-pointer hover:text-emerald-500"
                  >
                    Black Player {sortBy === "BLACK" && (sortOrder === "ASC" ? "↑" : "↓")}
                  </th>
                  <th
                    onClick={() => handleSort("RESULT")}
                    className="py-3 px-3 cursor-pointer hover:text-emerald-500 w-20 text-center"
                  >
                    Result {sortBy === "RESULT" && (sortOrder === "ASC" ? "↑" : "↓")}
                  </th>
                  <th
                    onClick={() => handleSort("ECO")}
                    className="py-3 px-3 cursor-pointer hover:text-emerald-500 w-16 font-mono"
                  >
                    ECO {sortBy === "ECO" && (sortOrder === "ASC" ? "↑" : "↓")}
                  </th>
                  <th
                    onClick={() => handleSort("OPENING")}
                    className="py-3 px-4 cursor-pointer hover:text-emerald-500 hidden md:table-cell"
                  >
                    Opening {sortBy === "OPENING" && (sortOrder === "ASC" ? "↑" : "↓")}
                  </th>
                  <th
                    onClick={() => handleSort("DATE")}
                    className="py-3 px-3 cursor-pointer hover:text-emerald-500 w-24 hidden sm:table-cell"
                  >
                    Date {sortBy === "DATE" && (sortOrder === "ASC" ? "↑" : "↓")}
                  </th>
                  <th
                    onClick={() => handleSort("PLYCOUNT")}
                    className="py-3 px-3 cursor-pointer hover:text-emerald-500 w-16 text-center"
                  >
                    Plies {sortBy === "PLYCOUNT" && (sortOrder === "ASC" ? "↑" : "↓")}
                  </th>
                  <th className="py-3 px-3 w-16 text-center">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5">
                {gamesData.games.map((g) => (
                  <tr
                    key={g.id}
                    onClick={() => handleSelectGame(g)}
                    className={`cursor-pointer transition-colors duration-100 group ${
                      isLight
                        ? "hover:bg-emerald-50 text-slate-800"
                        : "hover:bg-white/5 text-slate-200"
                    }`}
                  >
                    <td className="py-2.5 px-4 font-mono opacity-50">{g.id}</td>
                    <td className="py-2.5 px-4 font-semibold group-hover:text-emerald-500 transition-colors">
                      {g.WHITE}
                      {g.WHITEELO && (
                        <span className="text-[10px] opacity-60 font-mono ml-1.5 font-normal">
                          ({g.WHITEELO})
                        </span>
                      )}
                    </td>
                    <td className="py-2.5 px-4 font-semibold group-hover:text-emerald-500 transition-colors">
                      {g.BLACK}
                      {g.BLACKELO && (
                        <span className="text-[10px] opacity-60 font-mono ml-1.5 font-normal">
                          ({g.BLACKELO})
                        </span>
                      )}
                    </td>
                    <td className="py-2.5 px-3 font-mono font-bold text-center">
                      <span
                        className={`px-2 py-0.5 rounded text-[10px] ${
                          g.RESULT === "1-0"
                            ? "bg-emerald-500/20 text-emerald-500 border border-emerald-500/30"
                            : g.RESULT === "0-1"
                            ? "bg-rose-500/20 text-rose-500 border border-rose-500/30"
                            : "bg-slate-500/20 text-slate-400 border border-slate-500/30"
                        }`}
                      >
                        {g.RESULT}
                      </span>
                    </td>
                    <td className="py-2.5 px-3 font-mono font-bold text-emerald-400 opacity-90">
                      {g.ECO || "—"}
                    </td>
                    <td className="py-2.5 px-4 opacity-80 truncate max-w-xs hidden md:table-cell">
                      {g.OPENING || "—"}
                    </td>
                    <td className="py-2.5 px-3 opacity-60 font-mono hidden sm:table-cell">
                      {g.DATE || "—"}
                    </td>
                    <td className="py-2.5 px-3 font-mono text-center opacity-70">
                      {g.PLYCOUNT || "—"}
                    </td>
                    <td className="py-2.5 px-3 text-center">
                      <Tooltip content="Open Game in Analysis Board">
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            handleSelectGame(g);
                          }}
                          className="p-1 rounded-lg bg-emerald-500/10 text-emerald-500 hover:bg-emerald-500 hover:text-slate-950 transition-colors"
                        >
                          <Play className="w-3.5 h-3.5" />
                        </button>
                      </Tooltip>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        {/* Pagination Footer */}
        {gamesData && (
          <div
            className={`p-3 border-t flex items-center justify-between text-xs px-6 select-none ${
              isLight ? "bg-slate-50 border-slate-200" : "bg-black/40 border-white/10"
            }`}
          >
            <span className="opacity-70 font-mono">
              Showing {(page - 1) * pageSize + 1} –{" "}
              {Math.min(page * pageSize, gamesData.total)} of{" "}
              {gamesData.total.toLocaleString()} games
            </span>

            <div className="flex items-center gap-2">
              <button
                onClick={() => {
                  setPage(Math.max(1, page - 1));
                  logAction("NAV", `Database Pagination: Page ${page - 1}`);
                }}
                disabled={page <= 1}
                className={`p-1.5 rounded-lg border disabled:opacity-30 ${
                  isLight ? "bg-white border-slate-200" : "bg-black/30 border-white/10"
                }`}
              >
                <ChevronLeft className="w-4 h-4" />
              </button>

              <span className="font-mono px-3 py-1 rounded-lg bg-emerald-500/10 text-emerald-500 font-bold border border-emerald-500/20">
                Page {page} of {gamesData.total_pages}
              </span>

              <button
                onClick={() => {
                  setPage(Math.min(gamesData.total_pages, page + 1));
                  logAction("NAV", `Database Pagination: Page ${page + 1}`);
                }}
                disabled={page >= gamesData.total_pages}
                className={`p-1.5 rounded-lg border disabled:opacity-30 ${
                  isLight ? "bg-white border-slate-200" : "bg-black/30 border-white/10"
                }`}
              >
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        )}
      </div>

      {/* PGN Importer Modal */}
      {isImportOpen && (
        <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-md flex items-center justify-center p-4 select-none">
          <div className="bg-slate-900 border border-slate-700 rounded-3xl shadow-2xl w-full max-w-xl flex flex-col overflow-hidden text-slate-100">
            <div className="px-6 py-4 border-b border-slate-800 flex items-center justify-between bg-slate-950/70">
              <div className="flex items-center gap-3">
                <div className="p-2.5 rounded-2xl bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                  <Upload className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="font-bold text-sm">Import PGN to Database</h3>
                  <p className="text-xs text-slate-400">
                    Paste single or multi-game PGN with automatic tag sanitization
                  </p>
                </div>
              </div>

              <button
                onClick={() => setIsImportOpen(false)}
                className="p-1.5 text-slate-400 hover:text-white rounded-lg"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-6 space-y-4">
              <textarea
                rows={10}
                placeholder="[Event &quot;FIDE World Cup&quot;]&#10;[White &quot;Carlsen, M&quot;]&#10;[Black &quot;Bu Xiangzhi&quot;]&#10;1. e4 e5 2. Nf3 Nc6..."
                value={pgnInput}
                onChange={(e) => setPgnInput(e.target.value)}
                className="w-full bg-slate-950 border border-slate-800 rounded-2xl p-4 font-mono text-xs text-slate-200 focus:outline-none focus:border-emerald-500"
              />

              {importStatus && (
                <div className="p-3 rounded-xl bg-emerald-500/20 border border-emerald-500/30 text-emerald-400 text-xs font-mono flex items-center gap-2">
                  <Check className="w-4 h-4" />
                  {importStatus}
                </div>
              )}
            </div>

            <div className="px-6 py-4 border-t border-slate-800 flex items-center justify-between bg-slate-950/70">
              <button
                onClick={() => setIsImportOpen(false)}
                className="px-4 py-2 text-xs font-semibold text-slate-400 hover:text-white"
              >
                Cancel
              </button>

              <button
                onClick={() => importMutation.mutate(pgnInput)}
                disabled={!pgnInput.trim() || importMutation.isPending}
                className="px-5 py-2 bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold text-xs rounded-xl shadow-lg disabled:opacity-40 transition-all flex items-center gap-2"
              >
                {importMutation.isPending && <RefreshCw className="w-3.5 h-3.5 animate-spin" />}
                Import to {stats?.path || "Database"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
