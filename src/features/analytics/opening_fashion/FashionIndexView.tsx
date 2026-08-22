import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { UXTheme } from "../../../lib/theme";
import { useClickLogger } from "../../../lib/clickLogger";
import {
  Compass,
  RefreshCw,
  BookOpen,
} from "lucide-react";

interface FashionIndexViewProps {
  uxTheme?: UXTheme;
}

export function FashionIndexView({ uxTheme: _uxTheme }: FashionIndexViewProps) {
  const { logAction } = useClickLogger();

  const [selectedEco, setSelectedEco] = useState("B20");
  const [timeRange, setTimeRange] = useState<"full" | "20yr">("full");

  const { data: fashionData, isLoading } = useQuery({
    queryKey: ["fashionIndex", selectedEco, timeRange],
    queryFn: async () => {
      const res = await fetch(
        `http://127.0.0.1:8000/api/v1/openings/fashion?eco=${encodeURIComponent(
          selectedEco
        )}&time_range=${encodeURIComponent(timeRange)}`
      );
      if (!res.ok) throw new Error("Failed to load fashion index");
      return res.json();
    },
  });

  const { data: pioneerMoves } = useQuery({
    queryKey: ["openingPioneer"],
    queryFn: async () => {
      const res = await fetch("http://127.0.0.1:8000/api/v1/openings/pioneer");
      if (!res.ok) throw new Error("Failed to load pioneer moves");
      return res.json();
    },
  });

  if (isLoading || !fashionData) {
    return (
      <div className="h-96 flex flex-col items-center justify-center gap-3 opacity-60">
        <RefreshCw className="w-8 h-8 animate-spin text-purple-500" />
        <span className="font-mono text-xs">Computing Historical Fashion Index...</span>
      </div>
    );
  }

  const timeline = fashionData.timeline;
  const erasCount = timeline?.eras?.length || 1;
  const fashionPoints: number[] = timeline?.fashion_index_pct || [];
  const volumeBars: number[] = timeline?.total_volume_bars || [];

  const maxVolume = Math.max(...volumeBars, 1000);
  const maxFashion = Math.max(...fashionPoints, 100);

  return (
    <div className="flex flex-col gap-6 max-w-7xl mx-auto pb-10 select-none animate-in fade-in duration-200">
      {/* Top Header */}
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
        <div>
          <div className="text-[10px] font-mono uppercase tracking-widest text-purple-400 font-bold mb-1">
            Opening Pioneer & Longitudinal BI
          </div>
          <h1 className="text-3xl font-extrabold tracking-tight text-white flex items-center gap-3">
            Fashion Index
            <span className="text-xs font-mono font-normal text-slate-400">
              — Distribution of games relative to database [%]
            </span>
          </h1>
        </div>

        {/* Time Horizon Filter Buttons */}
        <div className="flex items-center p-1 rounded-2xl bg-black/40 border border-slate-800">
          <button
            onClick={() => {
              setTimeRange("full");
              logAction("CLICK", "Switched Fashion Index to Full History");
            }}
            className={`px-4 py-1.5 rounded-xl text-xs font-bold font-mono transition-all ${
              timeRange === "full"
                ? "bg-purple-600 text-white shadow-md"
                : "text-slate-400 hover:text-white"
            }`}
          >
            Full History
          </button>
          <button
            onClick={() => {
              setTimeRange("20yr");
              logAction("CLICK", "Switched Fashion Index to Last 20 Years");
            }}
            className={`px-4 py-1.5 rounded-xl text-xs font-bold font-mono transition-all ${
              timeRange === "20yr"
                ? "bg-purple-600 text-white shadow-md"
                : "text-slate-400 hover:text-white"
            }`}
          >
            Last 20 Years
          </button>
        </div>
      </div>

      {/* Opening System Selector & Metadata Banner */}
      <div className="p-4 rounded-3xl bg-[#14171c] border border-slate-800 shadow-xl flex flex-col md:flex-row items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="p-3 rounded-2xl bg-purple-500/10 text-purple-400 border border-purple-500/20">
            <BookOpen className="w-5 h-5" />
          </div>
          <div>
            <h2 className="text-sm font-bold text-white">{fashionData.system_name}</h2>
            <div className="text-xs font-mono text-slate-400">
              ECO {fashionData.eco} · Peak: {fashionData.peak_era}
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {["B20", "C50", "C60", "D30", "E60"].map((eco) => (
            <button
              key={eco}
              onClick={() => {
                setSelectedEco(eco);
                logAction("CLICK", `Selected ECO ${eco} for Fashion Index`);
              }}
              className={`px-3 py-1 rounded-xl text-xs font-mono font-bold transition-all border ${
                selectedEco === eco
                  ? "bg-purple-600 text-white border-purple-400 shadow-md"
                  : "bg-black/30 text-slate-400 border-white/10 hover:text-white"
              }`}
            >
              {eco}
            </button>
          ))}
        </div>
      </div>

      {/* Fashion Index Chart (SVG) */}
      <div className="p-6 rounded-3xl bg-[#14171c] border border-slate-800 shadow-2xl space-y-4">
        <div className="flex justify-between items-center text-xs font-mono text-slate-400 border-b border-white/5 pb-3">
          <span className="font-bold text-purple-400">Fashion Index % (Purple Curve)</span>
          <span className="font-bold text-slate-500">Number of Games (Gray Volume Bars)</span>
        </div>

        {/* SVG Chart with Dual Axes */}
        <div className="h-72 w-full relative">
          <svg viewBox="0 0 1000 240" preserveAspectRatio="none" className="w-full h-full">
            {/* Horizontal Gridlines */}
            <line x1="40" y1="20" x2="960" y2="20" stroke="rgba(255,255,255,0.05)" />
            <line x1="40" y1="60" x2="960" y2="60" stroke="rgba(255,255,255,0.05)" />
            <line x1="40" y1="100" x2="960" y2="100" stroke="rgba(255,255,255,0.05)" />
            <line x1="40" y1="140" x2="960" y2="140" stroke="rgba(255,255,255,0.05)" />
            <line x1="40" y1="180" x2="960" y2="180" stroke="rgba(255,255,255,0.05)" />

            {/* Baseline Threshold */}
            <line
              x1="40"
              y1="140"
              x2="960"
              y2="140"
              stroke="#ef4444"
              strokeDasharray="4 4"
              strokeWidth="1.5"
              opacity="0.6"
            />

            {/* Volume Bars */}
            {volumeBars.map((vol: number, idx: number) => {
              const x = 50 + (idx / Math.max(1, erasCount - 1)) * 900;
              const barHeight = Math.min(180, (vol / maxVolume) * 180);
              const y = 200 - barHeight;
              const barWidth = Math.max(8, Math.min(24, Math.round(750 / erasCount)));
              return (
                <rect
                  key={idx}
                  x={x - barWidth / 2}
                  y={y}
                  width={barWidth}
                  height={barHeight}
                  fill="rgba(255,255,255,0.08)"
                  rx="2"
                />
              );
            })}

            {/* Purple Curve Line */}
            {fashionPoints.length > 1 && (
              <polyline
                fill="none"
                stroke="#8b5cf6"
                strokeWidth="3.5"
                strokeLinecap="round"
                strokeLinejoin="round"
                points={fashionPoints
                  .map((val: number, idx: number) => {
                    const x = 50 + (idx / Math.max(1, erasCount - 1)) * 900;
                    const y = 200 - Math.min(180, (val / maxFashion) * 170);
                    return `${Math.round(x)},${Math.round(y)}`;
                  })
                  .join(" ")}
              />
            )}

            {/* Point Dots */}
            {fashionPoints.map((val: number, idx: number) => {
              const x = 50 + (idx / Math.max(1, erasCount - 1)) * 900;
              const y = 200 - Math.min(180, (val / maxFashion) * 170);
              return (
                <circle
                  key={idx}
                  cx={Math.round(x)}
                  cy={Math.round(y)}
                  r="4"
                  fill="#7c3aed"
                  stroke="#ffffff"
                  strokeWidth="1.5"
                />
              );
            })}
          </svg>
        </div>

        {/* X-Axis Eras with dynamic CSS grid */}
        <div
          className="gap-1 text-[9px] font-mono text-slate-500 pt-2 border-t border-white/5 text-center overflow-x-auto"
          style={{
            display: "grid",
            gridTemplateColumns: `repeat(${erasCount}, minmax(0, 1fr))`,
          }}
        >
          {(timeline?.eras || []).map((era: string) => (
            <span key={era} className="truncate">
              {era}
            </span>
          ))}
        </div>
      </div>

      {/* Opening Pioneer Next Candidate Move Tree */}
      <div className="p-6 rounded-3xl bg-[#14171c] border border-slate-800 shadow-xl space-y-4">
        <div className="flex items-center justify-between border-b border-white/5 pb-3">
          <h2 className="text-xs font-bold uppercase tracking-wider text-slate-200 flex items-center gap-2">
            <Compass className="w-4 h-4 text-purple-400" />
            Opening Pioneer Candidate Moves (Starting Position)
          </h2>
          <span className="text-[10px] font-mono text-slate-500">2.3M+ Master Games</span>
        </div>

        <div className="overflow-x-auto text-xs font-sans">
          <table className="w-full text-left">
            <thead>
              <tr className="text-[10px] font-mono uppercase text-slate-500 border-b border-white/5">
                <th className="pb-2">Move</th>
                <th className="pb-2 text-right">Games</th>
                <th className="pb-2 text-center">Result Distribution</th>
                <th className="pb-2 text-right">Avg Elo</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/5 font-mono text-xs">
              {(pioneerMoves ?? []).map((pm: any) => (
                <tr key={pm.move} className="hover:bg-white/5 transition-colors">
                  <td className="py-2.5 font-bold text-white text-sm">{pm.move}</td>
                  <td className="py-2.5 text-right text-slate-400">{pm.games.toLocaleString()}</td>
                  <td className="py-2.5 px-6">
                    <div className="h-2.5 w-full bg-black/40 rounded-full flex overflow-hidden">
                      <div style={{ width: `${pm.white_win_pct}%` }} className="bg-emerald-500" />
                      <div style={{ width: `${pm.draw_pct}%` }} className="bg-slate-500" />
                      <div style={{ width: `${pm.black_win_pct}%` }} className="bg-rose-500" />
                    </div>
                  </td>
                  <td className="py-2.5 text-right font-bold text-purple-400">{pm.avg_rating}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
