import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { fetchAIConfig, fetchAIPersonas, generateAICommentary, importPgn } from "../../lib/api";
import { useClickLogger } from "../../lib/clickLogger";
import { Send, RefreshCw, Sparkles, X, Copy, Check, Save, CheckCircle2 } from "lucide-react";
import { Tooltip } from "../../components/common/Tooltip";

export interface AskGrandmasterActionProps {
  fen: string;
  evalStr?: string;
  mainLine?: string;
  contextNotes?: string;
  variant?: "button" | "compact" | "banner";
  className?: string;
}

const KIBITZER_DB_NAME = "Kibitzer_Analysis.sqlite";

export function AskGrandmasterAction({
  fen,
  evalStr = "Even position (+0.00)",
  mainLine = "",
  contextNotes = "",
  variant = "button",
  className = "",
}: AskGrandmasterActionProps) {
  const { logAction } = useClickLogger();
  const queryClient = useQueryClient();
  const [isOpen, setIsOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const [commentary, setCommentary] = useState<string | null>(null);
  const [saveStatus, setSaveStatus] = useState<string | null>(null);
  const [autoSaveKibitzer, setAutoSaveKibitzer] = useState(() => {
    return localStorage.getItem("autosave_kibitzer") === "true";
  });

  const handleToggleAutosave = (checked: boolean) => {
    setAutoSaveKibitzer(checked);
    localStorage.setItem("autosave_kibitzer", String(checked));
    logAction("CLICK", `Toggled Kibitzer Analysis Autosave: ${checked}`);
  };

  const { data: config } = useQuery({
    queryKey: ["ai_config"],
    queryFn: fetchAIConfig,
  });

  const { data: personas } = useQuery({
    queryKey: ["ai_personas"],
    queryFn: fetchAIPersonas,
  });

  const activePersona =
    personas?.find((p) => p.id === (config?.active_persona || "tal")) ||
    personas?.[0] || {
      id: "tal",
      name: "Mikhail Tal",
      title: "The Magician from Riga",
      avatar: "🔥",
    };

  const generateKibitzerPgn = (commentaryText: string) => {
    const dateStr = new Date().toISOString().split("T")[0].replace(/-/g, ".");
    const cleanCommentary = commentaryText.replace(/\n+/g, " ").replace(/"/g, "'");
    return `[Event "DeepScout Kibitzer Analysis"]
[Site "Local Analysis Studio"]
[Date "${dateStr}"]
[Round "1"]
[White "Kibitzer Position"]
[Black "${activePersona.name} (AI Coach)"]
[Result "*"]
[FEN "${fen}"]
[SetUp "1"]
[Annotator "${activePersona.name}"]
[Eval "${evalStr}"]

1. ${mainLine || "..."} {[%eval ${evalStr}] [${activePersona.name}: ${cleanCommentary}]} *`;
  };

  const saveToKibitzerDb = async (commentaryText: string, isAuto = false) => {
    try {
      const pgn = generateKibitzerPgn(commentaryText);
      await importPgn(pgn, KIBITZER_DB_NAME);
      setSaveStatus(isAuto ? `Autosaved to ${KIBITZER_DB_NAME}` : `Saved to ${KIBITZER_DB_NAME}!`);
      logAction("API", `${isAuto ? "Autosaved" : "Saved"} Kibitzer Analysis to ${KIBITZER_DB_NAME}`);
      queryClient.invalidateQueries({ queryKey: ["databases"] });
      queryClient.invalidateQueries({ queryKey: ["browserGames"] });
      setTimeout(() => setSaveStatus(null), 3500);
    } catch (err: any) {
      logAction("ERROR", `Failed to save kibitzer analysis: ${err.message}`);
    }
  };

  const commentaryMutation = useMutation({
    mutationFn: generateAICommentary,
    onSuccess: (data) => {
      setCommentary(data.commentary);
      setIsOpen(true);
      logAction("API", `Ask ${activePersona.name} Generated Insight`, `FEN: ${fen.slice(0, 25)}...`);

      if (autoSaveKibitzer && data.commentary) {
        saveToKibitzerDb(data.commentary, true);
      }
    },
  });

  const handleAsk = () => {
    logAction("CLICK", `Triggered 'Ask ${activePersona.name}' action`);
    commentaryMutation.mutate({
      fen,
      eval_str: evalStr,
      main_line: mainLine,
      persona_id: activePersona.id,
      context_notes: contextNotes,
    });
  };

  const handleCopy = async () => {
    if (commentary) {
      await navigator.clipboard.writeText(`[${activePersona.name}]: ${commentary}`);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
      logAction("CLICK", "Copied GM commentary to clipboard");
    }
  };

  return (
    <>
      {variant === "compact" ? (
        <Tooltip content={`Ask ${activePersona.name}`} description="Get natural language GM insight on current position">
          <button
            onClick={handleAsk}
            disabled={commentaryMutation.isPending}
            className={`px-3 py-1.5 bg-fuchsia-600/90 hover:bg-fuchsia-500 text-white font-bold text-xs rounded-xl shadow-md transition-all flex items-center gap-1.5 disabled:opacity-50 cursor-pointer ${className}`}
          >
            {commentaryMutation.isPending ? (
              <RefreshCw className="w-3.5 h-3.5 animate-spin" />
            ) : (
              <Sparkles className="w-3.5 h-3.5 text-fuchsia-200" />
            )}
            <span>{activePersona.name.split(" ")[0]}</span>
          </button>
        </Tooltip>
      ) : variant === "banner" ? (
        <div className={`p-3 rounded-2xl bg-fuchsia-950/20 border border-fuchsia-500/30 flex items-center justify-between gap-3 ${className}`}>
          <div className="flex items-center gap-2.5">
            <span className="text-xl">{activePersona.avatar}</span>
            <div>
              <span className="text-xs font-bold text-white block">Ask {activePersona.name}</span>
              <span className="text-[10px] text-fuchsia-300/70 font-mono">Stockfish-to-GM natural language commentary</span>
            </div>
          </div>
          <button
            onClick={handleAsk}
            disabled={commentaryMutation.isPending}
            className="px-4 py-1.5 bg-fuchsia-600 hover:bg-fuchsia-500 text-white font-bold text-xs rounded-xl shadow-md transition-all flex items-center gap-1.5 disabled:opacity-50 cursor-pointer"
          >
            {commentaryMutation.isPending ? (
              <>
                <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                Thinking...
              </>
            ) : (
              <>
                <Send className="w-3.5 h-3.5" />
                Ask Coach
              </>
            )}
          </button>
        </div>
      ) : (
        /* Standard Universal Button */
        <button
          onClick={handleAsk}
          disabled={commentaryMutation.isPending}
          className={`px-6 py-2.5 bg-fuchsia-600 hover:bg-fuchsia-500 text-white font-bold text-xs rounded-2xl shadow-lg transition-all flex items-center gap-2 disabled:opacity-50 cursor-pointer select-none ${className}`}
        >
          {commentaryMutation.isPending ? (
            <>
              <RefreshCw className="w-4 h-4 animate-spin" />
              <span>{activePersona.name} is thinking...</span>
            </>
          ) : (
            <>
              <Send className="w-4 h-4" />
              <span>Ask {activePersona.name}</span>
            </>
          )}
        </button>
      )}

      {/* Non-Blocking Floating Window for GM Commentary */}
      {isOpen && commentary && (
        <div className="fixed bottom-6 right-6 z-50 w-full max-w-md pointer-events-auto animate-in slide-in-from-bottom-5 duration-200 select-none shadow-[0_20px_50px_rgba(0,0,0,0.8)]">
          <div className="bg-slate-900/95 backdrop-blur-md border border-fuchsia-500/40 rounded-3xl shadow-2xl overflow-hidden text-slate-100 flex flex-col">
            {/* Header */}
            <div className="px-5 py-3.5 bg-slate-950/80 border-b border-slate-800 flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <span className="text-2xl">{activePersona.avatar}</span>
                <div>
                  <h3 className="font-bold text-sm text-white flex items-center gap-2">
                    {activePersona.name}
                    <span className="text-[10px] font-mono px-2 py-0.2 rounded bg-fuchsia-500/20 text-fuchsia-300 font-normal">
                      {activePersona.title}
                    </span>
                  </h3>
                </div>
              </div>

              <div className="flex items-center gap-1.5">
                {/* Manual Save to Kibitzer Database */}
                <Tooltip content={`Save Analysis to ${KIBITZER_DB_NAME}`}>
                  <button
                    onClick={() => commentary && saveToKibitzerDb(commentary, false)}
                    className="p-1.5 text-emerald-400 hover:text-white rounded-lg hover:bg-slate-800 transition-colors flex items-center gap-1 text-xs"
                  >
                    <Save className="w-4 h-4" />
                  </button>
                </Tooltip>

                <Tooltip content="Copy GM Commentary">
                  <button
                    onClick={handleCopy}
                    className="p-1.5 text-slate-400 hover:text-white rounded-lg hover:bg-slate-800 transition-colors"
                  >
                    {copied ? <Check className="w-4 h-4 text-emerald-400" /> : <Copy className="w-4 h-4" />}
                  </button>
                </Tooltip>

                <button
                  onClick={() => setIsOpen(false)}
                  className="p-1.5 text-slate-400 hover:text-white rounded-lg hover:bg-slate-800 transition-colors"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            </div>

            {/* Position Context Tag & Save Status */}
            <div className="px-5 py-2 bg-black/30 border-b border-white/5 flex items-center justify-between text-[10px] font-mono text-slate-400">
              <span>Eval: <strong className="text-emerald-400">{evalStr}</strong></span>
              {saveStatus ? (
                <span className="text-emerald-400 font-bold flex items-center gap-1 animate-pulse">
                  <CheckCircle2 className="w-3 h-3" />
                  {saveStatus}
                </span>
              ) : (
                mainLine && <span className="truncate max-w-[200px]">Line: {mainLine}</span>
              )}
            </div>

            {/* Commentary Body */}
            <div className="p-6 overflow-y-auto max-h-80 font-sans text-xs text-slate-200 leading-relaxed space-y-3">
              <div className="p-4 rounded-2xl bg-black/40 border border-white/5 italic">
                "{commentary}"
              </div>
            </div>

            {/* Footer with Autosave Toggle */}
            <div className="px-5 py-3 border-t border-slate-800 bg-slate-950/60 flex items-center justify-between">
              {/* Autosave Checkbox */}
              <label className="flex items-center gap-2 cursor-pointer text-[11px] font-mono text-slate-300">
                <input
                  type="checkbox"
                  checked={autoSaveKibitzer}
                  onChange={(e) => handleToggleAutosave(e.target.checked)}
                  className="w-3.5 h-3.5 rounded bg-slate-800 border-slate-700 text-fuchsia-600 focus:ring-0 cursor-pointer"
                />
                <span>Autosave to {KIBITZER_DB_NAME}</span>
              </label>

              <button
                onClick={() => setIsOpen(false)}
                className="px-4 py-1.5 bg-slate-800 hover:bg-slate-700 text-white font-bold text-xs rounded-xl transition-all cursor-pointer"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
