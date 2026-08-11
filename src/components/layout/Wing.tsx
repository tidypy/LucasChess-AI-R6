import React from "react";
import { Menu, Play, Activity, Database, Settings } from "lucide-react";

export function Wing() {
  return (
    <div className="w-16 h-screen bg-slate-950 flex flex-col items-center py-4 space-y-8 border-r border-slate-800 text-slate-400">
      <div className="text-emerald-500 font-bold text-xl cursor-pointer hover:text-emerald-400">LCL</div>
      <Menu className="w-6 h-6 cursor-pointer hover:text-slate-100" />
      <Play className="w-6 h-6 cursor-pointer hover:text-slate-100" />
      <Activity className="w-6 h-6 cursor-pointer hover:text-slate-100 text-emerald-500" />
      <Database className="w-6 h-6 cursor-pointer hover:text-slate-100" />
      <div className="flex-grow"></div>
      <Settings className="w-6 h-6 cursor-pointer hover:text-slate-100" />
    </div>
  );
}
