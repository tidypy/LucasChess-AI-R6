import { useQuery } from "@tanstack/react-query";
import { fetchHealth } from "../../lib/api";
import { Activity, RefreshCw, Sun, Grid } from "lucide-react";
import { useClickLogger } from "../../lib/clickLogger";
import { Tooltip } from "../common/Tooltip";
import { UXTheme, BoardTheme } from "../../lib/theme";

interface DesktopMenuProps {
  activeView: string;
  onSelectView: (view: string) => void;
  currentUXTheme: UXTheme;
  currentBoardTheme: BoardTheme;
  onOpenThemeCustomizer: (tab: "ux" | "board" | "custom") => void;
}

const MENU_ITEMS = [
  { id: "Analysis", label: "Analysis", desc: "Interactive game analysis & move tree" },
  { id: "Spar", label: "Sparring", desc: "Spar against engines, neural bots & practice openings" },
  { id: "Database", label: "Database Hub", desc: "Database shelf, fashion index reports, player dossier & data fitness" },
  { id: "BookBuilder", label: "Book Builder", desc: "Polyglot opening book generator & repertoire factory" },
  { id: "AI Grandmaster", label: "AI Grandmaster", desc: "Persona modeling & neural simulation" },
];

export function DesktopMenu({
  activeView,
  onSelectView,
  currentUXTheme,
  currentBoardTheme,
  onOpenThemeCustomizer,
}: DesktopMenuProps) {
  const { logAction } = useClickLogger();
  const isLight = currentUXTheme.mode === "light";

  const { data, isError, refetch, isFetching } = useQuery({
    queryKey: ["health"],
    queryFn: fetchHealth,
    refetchInterval: 5000,
  });

  const handleSelect = (item: (typeof MENU_ITEMS)[0]) => {
    logAction("NAV", `Menu Navigation: ${item.label}`, item.desc);
    onSelectView(item.id);
  };

  return (
    <div
      className={`h-12 border-b flex items-center justify-between px-6 text-sm shadow-sm z-10 relative select-none transition-colors duration-200 ${
        isLight
          ? "bg-white border-slate-200 text-slate-700"
          : "bg-[#0b101d] border-slate-800 text-slate-300"
      }`}
    >
      {/* Workspace Navigation Tabs */}
      <div className="flex items-center space-x-1 overflow-x-auto py-1">
        {MENU_ITEMS.map((item) => {
          const isActive = activeView === item.id;
          return (
            <Tooltip key={item.id} content={item.label} description={item.desc}>
              <button
                onClick={() => handleSelect(item)}
                className={`px-3 py-1.5 rounded-xl text-xs font-semibold transition-all ${
                  isActive
                    ? isLight
                      ? "bg-emerald-500 text-white shadow-sm font-bold"
                      : "bg-slate-800 text-emerald-400 font-bold shadow-sm border border-slate-700"
                    : isLight
                    ? "text-slate-600 hover:text-slate-900 hover:bg-slate-100"
                    : "text-slate-400 hover:text-slate-100 hover:bg-slate-800/40"
                }`}
              >
                {item.label}
              </button>
            </Tooltip>
          );
        })}
      </div>

      {/* Utilities & Status */}
      <div className="flex items-center space-x-3 flex-shrink-0">
        {/* Change UX Theme Button */}
        <Tooltip content="Change UX Theme" description={`Current: ${currentUXTheme.name} (${currentUXTheme.mode.toUpperCase()})`}>
          <button
            onClick={() => {
              logAction("CLICK", "Clicked 'Change UX Theme' in Top Menu");
              onOpenThemeCustomizer("ux");
            }}
            className={`flex items-center gap-1.5 px-3 py-1 rounded-xl border text-xs font-semibold transition-all ${
              isLight
                ? "bg-slate-100 hover:bg-slate-200 border-slate-200 text-slate-800"
                : "bg-slate-800/80 hover:bg-slate-800 border-slate-700/60 text-slate-200"
            }`}
          >
            <Sun className="w-3.5 h-3.5 text-amber-500" />
            <span className="text-[11px] font-mono">{currentUXTheme.name}</span>
          </button>
        </Tooltip>

        {/* Change Board Theme Button */}
        <Tooltip content="Change Board Theme" description={`Current: ${currentBoardTheme.name}`}>
          <button
            onClick={() => {
              logAction("CLICK", "Clicked 'Change Board Theme' in Top Menu");
              onOpenThemeCustomizer("board");
            }}
            className={`flex items-center gap-1.5 px-3 py-1 rounded-xl border text-xs font-semibold transition-all ${
              isLight
                ? "bg-slate-100 hover:bg-slate-200 border-slate-200 text-slate-800"
                : "bg-slate-800/80 hover:bg-slate-800 border-slate-700/60 text-slate-200"
            }`}
          >
            <Grid className="w-3.5 h-3.5 text-blue-500" />
            <span className="text-[11px] font-mono">{currentBoardTheme.name.split(" ")[0]}</span>
          </button>
        </Tooltip>

        {/* Backend Health Status */}
        <Tooltip
          content={data ? "Backend Core Online" : "Backend Core Disconnected"}
          description={
            data
              ? "FastAPI sidecar running at 127.0.0.1:8000. Click to refresh."
              : "Sidecar offline or initializing. Click to retry connection."
          }
        >
          <button
            onClick={() => {
              logAction("API", "Manual Health Check Refetch");
              refetch();
            }}
            className={`flex items-center space-x-2 px-2.5 py-1 rounded-xl border transition-colors ${
              isLight
                ? "bg-slate-100 hover:bg-slate-200 border-slate-200"
                : "bg-slate-800/50 hover:bg-slate-800 border-slate-700/40"
            }`}
          >
            <Activity
              className={`w-3.5 h-3.5 ${
                data ? "text-emerald-500" : isError ? "text-rose-500 animate-pulse" : "text-amber-500"
              }`}
            />
            <span className={`text-[11px] font-mono ${isLight ? "text-slate-700" : "text-slate-400"}`}>
              {data ? "Core Online" : isError ? "Core Offline" : "Connecting..."}
            </span>
            {isFetching && <RefreshCw className="w-3 h-3 text-slate-500 animate-spin" />}
          </button>
        </Tooltip>
      </div>
    </div>
  );
}
