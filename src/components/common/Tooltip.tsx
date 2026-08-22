import { useState, ReactNode } from "react";

interface TooltipProps {
  content: string;
  description?: string;
  shortcut?: string;
  position?: "top" | "bottom" | "left" | "right";
  children: ReactNode;
  delayMs?: number;
}

export function Tooltip({
  content,
  description,
  shortcut,
  position = "top",
  children,
  delayMs = 150,
}: TooltipProps) {
  const [isVisible, setIsVisible] = useState(false);
  const [timer, setTimer] = useState<number | null>(null);

  const handleMouseEnter = () => {
    const id = window.setTimeout(() => setIsVisible(true), delayMs);
    setTimer(id);
  };

  const handleMouseLeave = () => {
    if (timer) clearTimeout(timer);
    setIsVisible(false);
  };

  const positionClasses = {
    top: "bottom-full left-1/2 -translate-x-1/2 mb-2",
    bottom: "top-full left-1/2 -translate-x-1/2 mt-2",
    left: "right-full top-1/2 -translate-y-1/2 mr-2",
    right: "left-full top-1/2 -translate-y-1/2 ml-2",
  };

  const arrowClasses = {
    top: "top-full left-1/2 -translate-x-1/2 border-t-slate-800 border-x-transparent border-b-transparent",
    bottom: "bottom-full left-1/2 -translate-x-1/2 border-b-slate-800 border-x-transparent border-t-transparent",
    left: "left-full top-1/2 -translate-y-1/2 border-l-slate-800 border-y-transparent border-r-transparent",
    right: "right-full top-1/2 -translate-y-1/2 border-r-slate-800 border-y-transparent border-l-transparent",
  };

  return (
    <div
      className="relative inline-flex items-center justify-center"
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
    >
      {children}

      {isVisible && (
        <div
          className={`absolute ${positionClasses[position]} z-50 pointer-events-none flex flex-col items-center animate-in fade-in zoom-in-95 duration-100 min-w-max max-w-xs`}
        >
          <div className="bg-slate-900/95 text-slate-100 backdrop-blur-md text-xs rounded-lg px-2.5 py-1.5 shadow-2xl border border-slate-700/80">
            <div className="flex items-center gap-1.5 font-medium">
              <span>{content}</span>
              {shortcut && (
                <kbd className="px-1.5 py-0.5 text-[10px] font-mono bg-slate-800 text-slate-300 rounded border border-slate-600">
                  {shortcut}
                </kbd>
              )}
            </div>
            {description && (
              <p className="text-[11px] text-slate-400 mt-0.5 font-normal leading-tight">
                {description}
              </p>
            )}
          </div>
          <div
            className={`w-0 h-0 border-4 border-solid ${arrowClasses[position]}`}
          />
        </div>
      )}
    </div>
  );
}
