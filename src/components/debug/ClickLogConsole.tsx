import { useState } from "react";
import { useClickLogger, LogEntry } from "../../lib/clickLogger";
import { Bug, Trash2, Copy, Check, ChevronDown, ChevronUp, Filter } from "lucide-react";
import { Tooltip } from "../common/Tooltip";

const CATEGORY_COLORS: Record<LogEntry["category"], string> = {
  CLICK: "bg-amber-500/10 text-amber-400 border-amber-500/30",
  BOARD: "bg-emerald-500/10 text-emerald-400 border-emerald-500/30",
  NAV: "bg-blue-500/10 text-blue-400 border-blue-500/30",
  THEME: "bg-purple-500/10 text-purple-400 border-purple-500/30",
  API: "bg-cyan-500/10 text-cyan-400 border-cyan-500/30",
  SSE: "bg-fuchsia-500/10 text-fuchsia-400 border-fuchsia-500/30",
  SYSTEM: "bg-slate-500/10 text-slate-400 border-slate-500/30",
  ERROR: "bg-rose-500/20 text-rose-400 border-rose-500/40 font-bold",
};

export function ClickLogConsole() {
  const {
    logs,
    clearLogs,
    copyLogs,
    filter,
    setFilter,
    isLogConsoleOpen,
    setIsLogConsoleOpen,
  } = useClickLogger();
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    await copyLogs();
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const filteredLogs =
    filter === "ALL"
      ? logs
      : filter === "CLICK"
      ? logs.filter((l) => l.category === "CLICK" || l.isUserAction)
      : logs.filter((l) => l.category === filter);

  const categories: Array<"ALL" | LogEntry["category"]> = [
    "ALL",
    "ERROR",
    "CLICK",
    "BOARD",
    "NAV",
    "THEME",
    "API",
    "SSE",
  ];

  return (
    <div className="bg-slate-900/95 border border-slate-800 rounded-2xl shadow-2xl flex flex-col overflow-hidden text-slate-100 transition-all duration-200 backdrop-blur-md">
      {/* Console Header */}
      <div className="px-4 py-2.5 bg-slate-950/80 border-b border-slate-800 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Bug className="w-4 h-4 text-amber-400 animate-pulse" />
          <span className="text-xs font-bold tracking-wider uppercase text-slate-200">
            Click & Debug Logger
          </span>
          <span className="px-2 py-0.5 text-[10px] font-mono bg-slate-800 text-amber-400 rounded-full border border-slate-700 font-bold">
            {logs.length} events
          </span>
        </div>

        <div className="flex items-center gap-2">
          <Tooltip content="Copy All Logs" description="Copy full debug session to clipboard">
            <button
              onClick={handleCopy}
              className="p-1.5 text-slate-400 hover:text-white rounded-lg hover:bg-slate-800 transition-colors flex items-center gap-1 text-xs"
            >
              {copied ? (
                <>
                  <Check className="w-3.5 h-3.5 text-emerald-400" />
                  <span className="text-[10px] text-emerald-400 font-bold">Copied</span>
                </>
              ) : (
                <>
                  <Copy className="w-3.5 h-3.5" />
                  <span className="text-[10px]">Copy</span>
                </>
              )}
            </button>
          </Tooltip>

          <Tooltip content="Clear Logs" description="Clear console history">
            <button
              onClick={clearLogs}
              className="p-1.5 text-slate-400 hover:text-rose-400 rounded-lg hover:bg-slate-800 transition-colors"
            >
              <Trash2 className="w-3.5 h-3.5" />
            </button>
          </Tooltip>

          <Tooltip content={isLogConsoleOpen ? "Minimize Console" : "Expand Console"}>
            <button
              onClick={() => setIsLogConsoleOpen(!isLogConsoleOpen)}
              className="p-1.5 text-slate-400 hover:text-white rounded-lg hover:bg-slate-800 transition-colors"
            >
              {isLogConsoleOpen ? (
                <ChevronDown className="w-4 h-4" />
              ) : (
                <ChevronUp className="w-4 h-4" />
              )}
            </button>
          </Tooltip>
        </div>
      </div>

      {isLogConsoleOpen && (
        <>
          {/* Category Filter Bar */}
          <div className="px-4 py-2 bg-slate-900 border-b border-slate-800 flex items-center gap-2 overflow-x-auto text-[11px]">
            <Filter className="w-3.5 h-3.5 text-slate-500 flex-shrink-0 mr-1" />
            {categories.map((cat) => {
              const count =
                cat === "ALL"
                  ? logs.length
                  : cat === "CLICK"
                  ? logs.filter((l) => l.category === "CLICK" || l.isUserAction).length
                  : logs.filter((l) => l.category === cat).length;

              return (
                <button
                  key={cat}
                  onClick={() => setFilter(cat)}
                  className={`px-2.5 py-1 rounded-md font-mono transition-all flex items-center gap-1.5 flex-shrink-0 ${
                    filter === cat
                      ? "bg-amber-500/20 text-amber-300 font-bold border border-amber-500/40 shadow-sm"
                      : "text-slate-400 hover:text-slate-200 hover:bg-slate-800/60"
                  }`}
                >
                  <span>{cat}</span>
                  <span className="text-[9px] opacity-70 bg-slate-800 px-1 rounded">
                    {count}
                  </span>
                </button>
              );
            })}
          </div>

          {/* Log Stream Area */}
          <div className="h-44 overflow-y-auto p-3 font-mono text-[11px] space-y-1 bg-slate-950/95 select-text">
            {filteredLogs.length === 0 ? (
              <div className="text-slate-500 text-center py-6 italic text-xs">
                No logs recorded for filter "{filter}". Click buttons, board moves, or tabs to see real-time debug tracking.
              </div>
            ) : (
              filteredLogs.map((entry) => (
                <div
                  key={entry.id}
                  className="flex items-start gap-2 py-1 px-2 rounded hover:bg-slate-900 transition-colors border border-transparent hover:border-slate-800/80"
                >
                  <span className="text-slate-500 text-[10px] flex-shrink-0 select-none">
                    {entry.timestamp}
                  </span>

                  <span
                    className={`px-1.5 py-0.2 rounded text-[9px] font-bold border flex-shrink-0 select-none ${
                      CATEGORY_COLORS[entry.category] || CATEGORY_COLORS.SYSTEM
                    }`}
                  >
                    {entry.category}
                  </span>

                  <span className="text-slate-200 font-semibold break-all">
                    {entry.action}
                  </span>

                  {entry.details && (
                    <span className="text-slate-400 text-[10px] ml-auto flex-shrink-0 pl-2">
                      {entry.details}
                    </span>
                  )}
                </div>
              ))
            )}
          </div>
        </>
      )}
    </div>
  );
}
