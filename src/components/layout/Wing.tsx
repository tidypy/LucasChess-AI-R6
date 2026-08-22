import {
  Compass,
  Database,
  Sun,
  Grid,
  Bug,
  Settings,
  Sparkles,
  Swords,
  BookOpen,
} from "lucide-react";
import { useClickLogger } from "../../lib/clickLogger";
import { Tooltip } from "../common/Tooltip";
import { UXTheme } from "../../lib/theme";

interface WingProps {
  activeView: string;
  onSelectView: (view: string) => void;
  onOpenThemeCustomizer: (tab: "ux" | "board" | "custom") => void;
  onToggleDebugConsole: () => void;
  isConsoleOpen: boolean;
  uxTheme: UXTheme;
}

export function Wing({
  activeView,
  onSelectView,
  onOpenThemeCustomizer,
  onToggleDebugConsole,
  isConsoleOpen,
  uxTheme,
}: WingProps) {
  const { logAction } = useClickLogger();
  const isLight = uxTheme.mode === "light";

  const handleNav = (viewName: string) => {
    logAction("NAV", `Switched Workspace: ${viewName}`, `Active View: ${viewName}`);
    onSelectView(viewName);
  };

  return (
    <div
      className={`w-16 h-screen flex flex-col items-center py-4 space-y-4 border-r select-none z-20 transition-colors duration-200 ${
        isLight
          ? "bg-white border-slate-200 text-slate-500 shadow-sm"
          : "bg-[#090d16] border-slate-800 text-slate-400"
      }`}
    >
      {/* Brand Icon */}
      <Tooltip content="DeepScout Chess" description="Return to Main Workspace" position="right">
        <button
          onClick={() => handleNav("Analysis")}
          className="w-10 h-10 rounded-2xl bg-gradient-to-tr from-emerald-600 to-teal-400 text-slate-950 font-black text-sm flex items-center justify-center shadow-lg hover:scale-105 transition-transform"
        >
          DSC
        </button>
      </Tooltip>

      <div className={`w-8 h-[1px] ${isLight ? "bg-slate-200" : "bg-slate-800"}`} />

      {/* Main Workspace Navigation Icons */}
      <Tooltip content="Analysis & Board" description="Explore positions and analyze games" position="right">
        <button
          onClick={() => handleNav("Analysis")}
          className={`p-2.5 rounded-2xl transition-all ${
            activeView === "Analysis"
              ? "bg-emerald-500/20 text-emerald-500 shadow-md border border-emerald-500/30"
              : isLight
              ? "hover:text-slate-900 hover:bg-slate-100"
              : "hover:text-slate-100 hover:bg-slate-800/60"
          }`}
        >
          <Compass className="w-5 h-5" />
        </button>
      </Tooltip>

      <Tooltip content="Spar Against Engine" description="Spar with neural bots & Elo-rated opponents" position="right">
        <button
          onClick={() => handleNav("Spar")}
          className={`p-2.5 rounded-2xl transition-all ${
            activeView === "Spar"
              ? "bg-rose-500/20 text-rose-400 shadow-md border border-rose-500/30"
              : isLight
              ? "hover:text-slate-900 hover:bg-slate-100"
              : "hover:text-slate-100 hover:bg-slate-800/60"
          }`}
        >
          <Swords className="w-5 h-5" />
        </button>
      </Tooltip>

      <Tooltip content="Database Hub & Shelf" description="Explore databases, fashion index, dossiers & data fitness" position="right">
        <button
          onClick={() => handleNav("Database")}
          className={`p-2.5 rounded-2xl transition-all ${
            activeView === "Database" ||
            ["Dossier", "Compare", "Fashion", "Consolidator", "Fitness"].includes(activeView)
              ? "bg-[#3b82f6]/20 text-[#3b82f6] shadow-md border border-[#3b82f6]/30"
              : isLight
              ? "hover:text-slate-900 hover:bg-slate-100"
              : "hover:text-slate-100 hover:bg-slate-800/60"
          }`}
        >
          <Database className="w-5 h-5" />
        </button>
      </Tooltip>

      <Tooltip content="Opening Book Builder" description="Polyglot repertoire generator & tree explorer" position="right">
        <button
          onClick={() => handleNav("BookBuilder")}
          className={`p-2.5 rounded-2xl transition-all ${
            activeView === "BookBuilder"
              ? "bg-purple-500/20 text-purple-400 shadow-md border border-purple-500/30"
              : isLight
              ? "hover:text-slate-900 hover:bg-slate-100"
              : "hover:text-slate-100 hover:bg-slate-800/60"
          }`}
        >
          <BookOpen className="w-5 h-5" />
        </button>
      </Tooltip>

      <Tooltip content="AI Grandmaster" description="Persona modeling & neural simulation" position="right">
        <button
          onClick={() => handleNav("AI Grandmaster")}
          className={`p-2.5 rounded-2xl transition-all ${
            activeView === "AI Grandmaster"
              ? "bg-fuchsia-500/20 text-fuchsia-400 shadow-md border border-fuchsia-500/30"
              : isLight
              ? "hover:text-slate-900 hover:bg-slate-100"
              : "hover:text-slate-100 hover:bg-slate-800/60"
          }`}
        >
          <Sparkles className="w-5 h-5" />
        </button>
      </Tooltip>

      <div className="flex-grow" />

      {/* Utilities & Themes */}
      <Tooltip content="Change UX Theme" description="Switch application window & card colors (Dark/Light)" position="right">
        <button
          onClick={() => {
            logAction("CLICK", "Clicked 'Change UX Theme' in Wing");
            onOpenThemeCustomizer("ux");
          }}
          className={`p-2.5 rounded-2xl transition-colors ${
            isLight
              ? "text-amber-600 hover:bg-amber-100/60"
              : "text-amber-400 hover:bg-amber-500/10"
          }`}
        >
          <Sun className="w-5 h-5" />
        </button>
      </Tooltip>

      <Tooltip content="Change Board Theme" description="Change chessboard square colors & palette" position="right">
        <button
          onClick={() => {
            logAction("CLICK", "Clicked 'Change Board Theme' in Wing");
            onOpenThemeCustomizer("board");
          }}
          className={`p-2.5 rounded-2xl transition-colors ${
            isLight
              ? "text-blue-600 hover:bg-blue-100/60"
              : "text-blue-400 hover:bg-blue-500/10"
          }`}
        >
          <Grid className="w-5 h-5" />
        </button>
      </Tooltip>

      <Tooltip
        content="Click & Debug Logger"
        description={isConsoleOpen ? "Hide live interaction debug console" : "Show live interaction debug console"}
        position="right"
      >
        <button
          onClick={() => {
            logAction("CLICK", `${isConsoleOpen ? "Closed" : "Opened"} Debug Console`);
            onToggleDebugConsole();
          }}
          className={`p-2.5 rounded-2xl transition-all ${
            isConsoleOpen
              ? "bg-amber-500/20 text-amber-500 border border-amber-500/40"
              : isLight
              ? "text-slate-500 hover:text-slate-900 hover:bg-slate-100"
              : "text-slate-400 hover:text-white hover:bg-slate-800/60"
          }`}
        >
          <Bug className="w-5 h-5" />
        </button>
      </Tooltip>

      <Tooltip content="Settings" description="Configure engine paths, UCI options, and core" position="right">
        <button
          onClick={() => {
            logAction("CLICK", "Opened Settings Modal");
            handleNav("Settings");
          }}
          className={`p-2.5 rounded-2xl transition-all ${
            activeView === "Settings"
              ? "bg-emerald-500/20 text-emerald-500 shadow-md border border-emerald-500/30"
              : isLight
              ? "hover:text-slate-900 hover:bg-slate-100"
              : "hover:text-slate-100 hover:bg-slate-800/60"
          }`}
        >
          <Settings className="w-5 h-5" />
        </button>
      </Tooltip>
    </div>
  );
}
