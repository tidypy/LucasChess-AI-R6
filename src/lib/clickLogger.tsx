import { createContext, useContext, useState, useEffect, ReactNode } from "react";

export interface LogEntry {
  id: string;
  timestamp: string;
  category: "CLICK" | "BOARD" | "NAV" | "THEME" | "API" | "SSE" | "SYSTEM" | "ERROR";
  action: string;
  details?: string;
  target?: string;
  isUserAction?: boolean;
}

interface ClickLoggerContextType {
  logs: LogEntry[];
  logAction: (
    category: LogEntry["category"],
    action: string,
    details?: string,
    target?: string,
    isUserAction?: boolean
  ) => void;
  clearLogs: () => void;
  copyLogs: () => Promise<void>;
  filter: string;
  setFilter: (f: string) => void;
  isLogConsoleOpen: boolean;
  setIsLogConsoleOpen: (open: boolean) => void;
}

const ClickLoggerContext = createContext<ClickLoggerContextType | undefined>(undefined);

export function ClickLoggerProvider({ children }: { children: ReactNode }) {
  const [logs, setLogs] = useState<LogEntry[]>(() => [
    {
      id: "init-1",
      timestamp: new Date().toLocaleTimeString(),
      category: "SYSTEM",
      action: "Click Logger Initialized",
      details: "Recording all user clicks, board moves, theme changes, API events, and runtime errors",
      isUserAction: false,
    },
  ]);
  const [filter, setFilter] = useState<string>("ALL");
  const [isLogConsoleOpen, setIsLogConsoleOpen] = useState<boolean>(false);

  const logAction = (
    category: LogEntry["category"],
    action: string,
    details?: string,
    target?: string,
    isUserAction: boolean = true
  ) => {
    const entry: LogEntry = {
      id: `${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
      timestamp: new Date().toLocaleTimeString(),
      category,
      action,
      details,
      target,
      isUserAction,
    };
    console.log(`[LCL-DEBUG][${category}] ${action}`, details || "");
    setLogs((prev) => [entry, ...prev.slice(0, 299)]);
  };

  const clearLogs = () => {
    setLogs([]);
    logAction("SYSTEM", "Logs cleared by user", undefined, undefined, false);
  };

  const copyLogs = async () => {
    const text = logs
      .map(
        (l) =>
          `[${l.timestamp}] [${l.category}] ${l.action}${
            l.details ? " | Details: " + l.details : ""
          }${l.target ? " | Target: " + l.target : ""}`
      )
      .join("\n");
    await navigator.clipboard.writeText(text);
    logAction("SYSTEM", "Copied debug logs to clipboard", `${logs.length} entries`, undefined, false);
  };

  // Automatic Global Error & Unhandled Rejection Capture
  useEffect(() => {
    const handleError = (e: ErrorEvent) => {
      const errorMsg = e.error?.message || e.message || "Unknown runtime exception";
      const stack = e.error?.stack || `${e.filename}:${e.lineno}:${e.colno}`;
      logAction("ERROR", `Runtime Error: ${errorMsg}`, stack, `${e.filename}:${e.lineno}`, false);
    };

    const handleRejection = (e: PromiseRejectionEvent) => {
      const reason = e.reason instanceof Error ? e.reason.message : String(e.reason);
      const stack = e.reason instanceof Error ? e.reason.stack : undefined;
      logAction("ERROR", `Unhandled Promise Rejection: ${reason}`, stack, undefined, false);
    };

    window.addEventListener("error", handleError);
    window.addEventListener("unhandledrejection", handleRejection);

    return () => {
      window.removeEventListener("error", handleError);
      window.removeEventListener("unhandledrejection", handleRejection);
    };
  }, []);

  // Global listener to capture all pointer/button/item clicks
  useEffect(() => {
    const handleGlobalClick = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      if (!target) return;

      const clickable =
        target.closest("button") ||
        target.closest("a") ||
        target.closest("[role='button']") ||
        target.closest("input") ||
        target.closest(".cursor-pointer");

      if (clickable) {
        const text = (
          clickable.getAttribute("aria-label") ||
          clickable.getAttribute("title") ||
          clickable.innerText ||
          clickable.tagName
        )
          .trim()
          .slice(0, 50);

        const elementInfo = `${clickable.tagName.toLowerCase()}${
          clickable.id ? `#${clickable.id}` : ""
        }`;

        logAction(
          "CLICK",
          `User Clicked: ${text ? `"${text}"` : elementInfo}`,
          `Coords: (${e.clientX}, ${e.clientY})`,
          elementInfo,
          true
        );
      }
    };

    window.addEventListener("click", handleGlobalClick, { capture: true });
    return () => window.removeEventListener("click", handleGlobalClick, { capture: true });
  }, []);

  return (
    <ClickLoggerContext.Provider
      value={{
        logs,
        logAction,
        clearLogs,
        copyLogs,
        filter,
        setFilter,
        isLogConsoleOpen,
        setIsLogConsoleOpen,
      }}
    >
      {children}
    </ClickLoggerContext.Provider>
  );
}

export function useClickLogger() {
  const context = useContext(ClickLoggerContext);
  if (!context) {
    throw new Error("useClickLogger must be used within a ClickLoggerProvider");
  }
  return context;
}
