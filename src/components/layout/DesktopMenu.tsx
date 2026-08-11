import React from "react";
import { useQuery } from "@tanstack/react-query";
import { fetchHealth } from "../../lib/api";
import { Activity } from "lucide-react";

export function DesktopMenu() {
  const { data, isError } = useQuery({ queryKey: ["health"], queryFn: fetchHealth, refetchInterval: 5000 });

  return (
    <div className="h-12 bg-slate-900 border-b border-slate-800 flex items-center justify-between px-4 text-sm text-slate-300 shadow-sm z-10 relative">
      <div className="flex space-x-6 font-medium">
        <span className="cursor-pointer hover:text-white">Analysis</span>
        <span className="cursor-pointer hover:text-white">Repertoire</span>
        <span className="cursor-pointer hover:text-white">Data Fitness</span>
        <span className="cursor-pointer text-emerald-400">Generative Stats</span>
        <span className="cursor-pointer hover:text-white">AI Grandmaster</span>
        <span className="cursor-pointer hover:text-white">Engine Lab</span>
      </div>
      
      <div className="flex items-center space-x-2">
        <Activity className={`w-4 h-4 ${data ? 'text-emerald-500' : 'text-rose-500'}`} />
        <span className="text-xs font-mono text-slate-400">
          {data ? "Core Online" : (isError ? "Core Offline" : "Connecting...")}
        </span>
      </div>
    </div>
  );
}
