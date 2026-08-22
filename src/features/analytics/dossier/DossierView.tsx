import { useState, type FormEvent } from "react";
import { useQuery } from "@tanstack/react-query";
import { UXTheme } from "../../../lib/theme";
import { useClickLogger } from "../../../lib/clickLogger";
import { Tooltip } from "../../../components/common/Tooltip";
import {
  Search,
  Users,
  TrendingUp,
  Sparkles,
  Shield,
  RefreshCw,
} from "lucide-react";

interface DossierViewProps {
  uxTheme: UXTheme;
  onOpenCompare: (playerName?: string) => void;
}

export function DossierView({ uxTheme, onOpenCompare }: DossierViewProps) {
  const { logAction } = useClickLogger();
  const isLight = uxTheme.mode === "light";

  const [playerName, setPlayerName] = useState("Carlsen,M");
  const [searchInput, setSearchInput] = useState("Carlsen,M");
  const [timeControl, setTimeControl] = useState("All");
  const [dateRange, setDateRange] = useState("2019 — 2026");

  const { data: dossier, isLoading } = useQuery({
    queryKey: ["dossier", playerName, timeControl, dateRange],
    queryFn: async () => {
      const res = await fetch(
        `http://127.0.0.1:8000/api/v1/dossier/player/${encodeURIComponent(
          playerName
        )}?time_control=${encodeURIComponent(timeControl)}&date_range=${encodeURIComponent(dateRange)}`
      );
      if (!res.ok) throw new Error("Failed to load player dossier");
      return res.json();
    },
  });

  const handleSearchSubmit = (e: FormEvent) => {
    e.preventDefault();
    if (searchInput.trim()) {
      setPlayerName(searchInput.trim());
      logAction("CLICK", `Dossier searched for player: "${searchInput.trim()}"`);
    }
  };

  if (isLoading || !dossier) {
    return (
      <div className="h-96 flex flex-col items-center justify-center gap-3 opacity-60">
        <RefreshCw className="w-8 h-8 animate-spin text-emerald-500" />
        <span className="font-mono text-xs">Computing Player Dossier via DuckDB...</span>
      </div>
    );
  }

  const kpis = dossier.kpis;
  const perf = dossier.performance_panel;
  const dist = dossier.result_distribution;
  const traj = dossier.trajectory;

  return (
    <div className="flex flex-col gap-6 max-w-7xl mx-auto pb-10 select-none animate-in fade-in duration-200">
      {/* Page Header */}
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
        <div>
          <div className="text-[10px] font-mono uppercase tracking-widest text-emerald-500 font-bold mb-1">
            Player Dossier & Scouting Report
          </div>
          <h1 className="text-3xl font-extrabold tracking-tight text-white flex items-center gap-3">
            {dossier.player}
            <span className="text-xs font-mono px-2.5 py-0.5 rounded-md bg-white/10 text-slate-300 font-medium border border-white/10">
              {dossier.federation}
            </span>
          </h1>
        </div>

        <div className="flex items-center gap-3 flex-wrap">
          <span className="text-xs font-semibold px-3 py-1 rounded-xl bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 font-mono">
            {dossier.title} · Classical: {dossier.classical_rating}
          </span>

          <Tooltip content="Open Head-to-Head Player Comparison">
            <button
              onClick={() => {
                logAction("CLICK", `Opened Compare view from Dossier for ${dossier.player}`);
                onOpenCompare(dossier.player);
              }}
              className="px-4 py-1.5 bg-blue-600 hover:bg-blue-500 text-white text-xs font-bold rounded-xl shadow-lg transition-all flex items-center gap-1.5"
            >
              <Users className="w-3.5 h-3.5" />
              Compare Player
            </button>
          </Tooltip>
        </div>
      </div>

      {/* Toolbar */}
      <div
        className={`p-3 rounded-2xl border flex flex-col md:flex-row items-center justify-between gap-3 shadow-md ${
          isLight ? "bg-white border-slate-200" : "bg-[#111418] border-slate-800"
        }`}
      >
        <form onSubmit={handleSearchSubmit} className="flex items-center gap-2 w-full md:w-auto">
          <div className="relative w-full md:w-64">
            <Search className="w-3.5 h-3.5 absolute left-3 top-2.5 text-slate-400" />
            <input
              type="text"
              placeholder="Search player name..."
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              className="w-full pl-8 pr-3 py-1.5 text-xs rounded-xl bg-black/30 border border-white/10 text-slate-200 focus:outline-none focus:border-blue-500 font-sans"
            />
          </div>

          <select
            value={timeControl}
            onChange={(e) => {
              setTimeControl(e.target.value);
              logAction("CLICK", `Changed time control filter: ${e.target.value}`);
            }}
            className="px-3 py-1.5 text-xs rounded-xl bg-black/30 border border-white/10 text-slate-200 focus:outline-none"
          >
            <option value="All">All Games</option>
            <option value="Classical">Classical</option>
            <option value="Rapid">Rapid & Blitz</option>
          </select>

          <select
            value={dateRange}
            onChange={(e) => {
              setDateRange(e.target.value);
              logAction("CLICK", `Changed date range: ${e.target.value}`);
            }}
            className="px-3 py-1.5 text-xs rounded-xl bg-black/30 border border-white/10 text-slate-200 focus:outline-none"
          >
            <option value="2019 — 2026">2019 — 2026</option>
            <option value="2024 — 2026">2024 — 2026</option>
            <option value="2020 — 2023">2020 — 2023</option>
          </select>
        </form>

        <div className="text-xs font-mono text-slate-400 flex items-center gap-2">
          <span>Sample Size:</span>
          <span className="font-bold text-slate-200">{dossier.sample_size.toLocaleString()} games</span>
        </div>
      </div>

      {/* Top 6 KPI Strip */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
        <div className="p-3.5 rounded-2xl bg-[#14171c] border border-slate-800 shadow-md flex flex-col justify-between">
          <span className="text-[10px] uppercase font-bold text-slate-400 tracking-wider">Glicko</span>
          <div className="text-2xl font-black font-mono text-blue-400 my-1">{kpis.glicko}</div>
          <span className="text-[10px] text-slate-500 font-mono">RD {kpis.glicko_rd} · σ {kpis.glicko_volatility}</span>
        </div>

        <div className="p-3.5 rounded-2xl bg-[#14171c] border border-slate-800 shadow-md flex flex-col justify-between">
          <span className="text-[10px] uppercase font-bold text-slate-400 tracking-wider">Performance Elo</span>
          <div className="text-2xl font-black font-mono text-slate-100 my-1">{kpis.perf_elo}</div>
          <span className="text-[10px] text-slate-500 font-mono">± 18 over sample</span>
        </div>

        <div className="p-3.5 rounded-2xl bg-[#14171c] border border-slate-800 shadow-md flex flex-col justify-between">
          <span className="text-[10px] uppercase font-bold text-slate-400 tracking-wider">CAPS Accuracy</span>
          <div className="text-2xl font-black font-mono text-emerald-400 my-1">{kpis.caps_accuracy}%</div>
          <span className="text-[10px] text-emerald-500/80 font-mono font-semibold">97th Percentile</span>
        </div>

        <div className="p-3.5 rounded-2xl bg-[#14171c] border border-slate-800 shadow-md flex flex-col justify-between">
          <span className="text-[10px] uppercase font-bold text-slate-400 tracking-wider">Global ACPL</span>
          <div className="text-2xl font-black font-mono text-slate-100 my-1">{kpis.global_acpl}</div>
          <span className="text-[10px] text-slate-500 font-mono">Non-book moves</span>
        </div>

        <div className="p-3.5 rounded-2xl bg-[#14171c] border border-slate-800 shadow-md flex flex-col justify-between">
          <span className="text-[10px] uppercase font-bold text-slate-400 tracking-wider">Conversion Rate</span>
          <div className="text-2xl font-black font-mono text-emerald-400 my-1">{kpis.conversion_rate}%</div>
          <span className="text-[10px] text-slate-500 font-mono">When eval ≥ +1.5</span>
        </div>

        <div className="p-3.5 rounded-2xl bg-[#14171c] border border-slate-800 shadow-md flex flex-col justify-between">
          <span className="text-[10px] uppercase font-bold text-slate-400 tracking-wider">Aggression Index</span>
          <div className="text-2xl font-black font-mono text-amber-400 my-1">{kpis.aggression_index}</div>
          <span className="text-[10px] text-slate-500 font-mono">Tactical complexity</span>
        </div>
      </div>

      {/* Main 2-Column Dashboard Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Left Column (7 cols) */}
        <div className="lg:col-span-7 flex flex-col gap-6">
          {/* Performance & Precision Panel */}
          <div className="p-5 rounded-3xl bg-[#14171c] border border-slate-800 shadow-xl space-y-4">
            <div className="flex items-center justify-between border-b border-white/5 pb-3">
              <h2 className="text-xs font-bold uppercase tracking-wider text-slate-200 flex items-center gap-2">
                <TrendingUp className="w-4 h-4 text-blue-400" />
                Performance & Precision
              </h2>
              <span className="text-[10px] font-mono text-slate-500">Rolling 250-game window</span>
            </div>

            <div className="space-y-3 font-sans text-xs">
              <div className="flex items-center justify-between">
                <div>
                  <div className="font-semibold text-slate-200">Glicko Trajectory</div>
                  <div className="text-[10px] text-slate-500">Rating change / stability</div>
                </div>
                <div className="w-48 h-2 bg-black/40 rounded-full overflow-hidden mx-4">
                  <div className="h-full bg-blue-500 rounded-full" style={{ width: "88%" }} />
                </div>
                <div className="font-mono font-bold text-emerald-400 w-12 text-right">{perf.glicko_trajectory}</div>
              </div>

              <div className="flex items-center justify-between">
                <div>
                  <div className="font-semibold text-slate-200">Opening ACPL</div>
                  <div className="text-[10px] text-slate-500">Book theory excluded</div>
                </div>
                <div className="w-48 h-2 bg-black/40 rounded-full overflow-hidden mx-4">
                  <div className="h-full bg-emerald-500 rounded-full" style={{ width: "79%" }} />
                </div>
                <div className="font-mono font-bold text-slate-200 w-12 text-right">{perf.opening_acpl}</div>
              </div>

              <div className="flex items-center justify-between">
                <div>
                  <div className="font-semibold text-slate-200">Middlegame ACPL</div>
                  <div className="text-[10px] text-slate-500">Tactical & strategic phase</div>
                </div>
                <div className="w-48 h-2 bg-black/40 rounded-full overflow-hidden mx-4">
                  <div className="h-full bg-blue-500 rounded-full" style={{ width: "61%" }} />
                </div>
                <div className="font-mono font-bold text-slate-200 w-12 text-right">{perf.middlegame_acpl}</div>
              </div>

              <div className="flex items-center justify-between">
                <div>
                  <div className="font-semibold text-slate-200">Endgame ACPL</div>
                  <div className="text-[10px] text-slate-500">≤ 6 pieces / queenless</div>
                </div>
                <div className="w-48 h-2 bg-black/40 rounded-full overflow-hidden mx-4">
                  <div className="h-full bg-amber-500 rounded-full" style={{ width: "68%" }} />
                </div>
                <div className="font-mono font-bold text-slate-200 w-12 text-right">{perf.endgame_acpl}</div>
              </div>

              <div className="flex items-center justify-between">
                <div>
                  <div className="font-semibold text-slate-200">Severe Blunder Rate</div>
                  <div className="text-[10px] text-slate-500">&gt; 200 centipawn loss</div>
                </div>
                <div className="w-48 h-2 bg-black/40 rounded-full overflow-hidden mx-4">
                  <div className="h-full bg-emerald-500 rounded-full" style={{ width: "15%" }} />
                </div>
                <div className="font-mono font-bold text-emerald-400 w-12 text-right">{perf.severe_blunder_rate}</div>
              </div>
            </div>
          </div>

          {/* Rating Trajectory Chart (SVG) */}
          <div className="p-5 rounded-3xl bg-[#14171c] border border-slate-800 shadow-xl space-y-3">
            <div className="flex items-center justify-between border-b border-white/5 pb-2">
              <h2 className="text-xs font-bold uppercase tracking-wider text-slate-200">
                Rating Trajectory (Elo vs Glicko)
              </h2>
              <span className="text-[10px] font-mono text-slate-500">
                {traj?.years?.[0] || "2019"} — {traj?.years?.[traj.years.length - 1] || "2026"}
              </span>
            </div>

            {(() => {
              const rawPoints: number[] = traj?.points?.length ? traj.points : [2500, 2550, 2600, 2650, 2700];
              const minR = Math.min(...rawPoints) - 30;
              const maxR = Math.max(...rawPoints) + 30;
              const rRange = Math.max(1, maxR - minR);

              const pts = rawPoints.map((val, idx) => {
                const x = rawPoints.length > 1 ? (idx / (rawPoints.length - 1)) * 900 : 450;
                const y = 110 - ((val - minR) / rRange) * 90;
                return `${Math.round(x)},${Math.round(y)}`;
              });

              const polylinePoints = pts.join(" ");
              const firstY = Math.round(110 - (((rawPoints[0] || 2500) - minR) / rRange) * 90);
              const lastY = Math.round(110 - (((rawPoints[rawPoints.length - 1] || 2500) - minR) / rRange) * 90);
              const pathD = `M0,120 L0,${firstY} ${rawPoints.map((val, idx) => {
                const x = rawPoints.length > 1 ? (idx / (rawPoints.length - 1)) * 900 : 450;
                const y = 110 - ((val - minR) / rRange) * 90;
                return `L${Math.round(x)},${Math.round(y)}`;
              }).join(" ")} L900,${lastY} L900,120 Z`;

              return (
                <div className="h-32 w-full relative">
                  <svg viewBox="0 0 900 120" preserveAspectRatio="none" className="w-full h-full">
                    <defs>
                      <linearGradient id="areaGlow" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="rgba(59, 130, 246, 0.4)" />
                        <stop offset="100%" stopColor="rgba(59, 130, 246, 0)" />
                      </linearGradient>
                    </defs>
                    <line x1="0" y1="90" x2="900" y2="90" stroke="rgba(255,255,255,0.05)" />
                    <line x1="0" y1="60" x2="900" y2="60" stroke="rgba(255,255,255,0.05)" />
                    <line x1="0" y1="30" x2="900" y2="30" stroke="rgba(255,255,255,0.05)" />

                    <path d={pathD} fill="url(#areaGlow)" />
                    <polyline
                      fill="none"
                      stroke="#60a5fa"
                      strokeWidth="3"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      points={polylinePoints}
                    />
                  </svg>
                </div>
              );
            })()}

            <div className="flex justify-between text-[10px] font-mono text-slate-500 pt-1 border-t border-white/5">
              {(traj?.years || []).map((y: string) => (
                <span key={y}>{y}</span>
              ))}
            </div>
          </div>

          {/* Error Spectrum & Result Distribution */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Error Spectrum */}
            <div className="p-4 rounded-3xl bg-[#14171c] border border-slate-800 space-y-2.5">
              <span className="text-xs font-bold text-slate-200 block">Error Spectrum (Per 100 Moves)</span>
              <div className="space-y-1.5 text-xs">
                <div className="flex items-center justify-between font-mono text-[11px]">
                  <span className="text-cyan-400">Brilliant (!!)</span>
                  <span className="font-bold">{dossier.error_spectrum.brilliant}</span>
                </div>
                <div className="flex items-center justify-between font-mono text-[11px]">
                  <span className="text-emerald-400">Best Move (!)</span>
                  <span className="font-bold">{dossier.error_spectrum.best_move}</span>
                </div>
                <div className="flex items-center justify-between font-mono text-[11px]">
                  <span className="text-blue-400">Interesting (!?)</span>
                  <span className="font-bold">{dossier.error_spectrum.interesting}</span>
                </div>
                <div className="flex items-center justify-between font-mono text-[11px]">
                  <span className="text-amber-400">Inaccuracy (?!)</span>
                  <span className="font-bold">{dossier.error_spectrum.inaccuracy}</span>
                </div>
                <div className="flex items-center justify-between font-mono text-[11px]">
                  <span className="text-rose-400">Blunder (??)</span>
                  <span className="font-bold">{dossier.error_spectrum.blunder}</span>
                </div>
              </div>
            </div>

            {/* Result Distribution */}
            <div className="p-4 rounded-3xl bg-[#14171c] border border-slate-800 space-y-3">
              <span className="text-xs font-bold text-slate-200 block">Result Distribution</span>
              <div>
                <div className="text-[11px] font-semibold text-slate-300 mb-1">Playing White</div>
                <div className="h-2 w-full bg-black/40 rounded-full flex overflow-hidden">
                  <div style={{ width: `${dist.white.win}%` }} className="bg-emerald-500" />
                  <div style={{ width: `${dist.white.draw}%` }} className="bg-slate-500" />
                  <div style={{ width: `${dist.white.loss}%` }} className="bg-rose-500" />
                </div>
                <div className="flex justify-between text-[10px] font-mono mt-1 text-slate-400">
                  <span className="text-emerald-400">{dist.white.win}% Win</span>
                  <span>{dist.white.draw}% Draw</span>
                  <span className="text-rose-400">{dist.white.loss}% Loss</span>
                </div>
              </div>

              <div>
                <div className="text-[11px] font-semibold text-slate-300 mb-1">Playing Black</div>
                <div className="h-2 w-full bg-black/40 rounded-full flex overflow-hidden">
                  <div style={{ width: `${dist.black.win}%` }} className="bg-emerald-500" />
                  <div style={{ width: `${dist.black.draw}%` }} className="bg-slate-500" />
                  <div style={{ width: `${dist.black.loss}%` }} className="bg-rose-500" />
                </div>
                <div className="flex justify-between text-[10px] font-mono mt-1 text-slate-400">
                  <span className="text-emerald-400">{dist.black.win}% Win</span>
                  <span>{dist.black.draw}% Draw</span>
                  <span className="text-rose-400">{dist.black.loss}% Loss</span>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Right Column (5 cols) */}
        <div className="lg:col-span-5 flex flex-col gap-6">
          {/* Style Profile 8-Trait Grid */}
          <div className="p-5 rounded-3xl bg-[#14171c] border border-slate-800 shadow-xl space-y-4">
            <div className="flex items-center justify-between border-b border-white/5 pb-2">
              <h2 className="text-xs font-bold uppercase tracking-wider text-slate-200 flex items-center gap-2">
                <Sparkles className="w-4 h-4 text-emerald-400" />
                Style Profile Signature
              </h2>
              <span className="text-[10px] font-mono text-slate-500">Algorithmically derived</span>
            </div>

            <div className="grid grid-cols-2 gap-2.5">
              {dossier.style_traits.map((trait: any) => (
                <div
                  key={trait.name}
                  className="p-3 rounded-2xl bg-black/30 border border-white/5 flex flex-col justify-between"
                >
                  <div>
                    <div className="font-bold text-xs text-slate-200">{trait.name}</div>
                    <div className="text-[10px] text-slate-500 leading-snug mt-0.5">{trait.desc}</div>
                  </div>
                  <div className="h-1.5 w-full bg-black/50 rounded-full mt-2.5 overflow-hidden">
                    <div
                      className="h-full bg-cyan-400 rounded-full shadow-sm"
                      style={{ width: `${trait.meter}%` }}
                    />
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Opening Repertoire Table */}
          <div className="p-5 rounded-3xl bg-[#14171c] border border-slate-800 shadow-xl space-y-3">
            <div className="flex items-center justify-between border-b border-white/5 pb-2">
              <h2 className="text-xs font-bold uppercase tracking-wider text-slate-200">
                Opening Repertoire Performance
              </h2>
              <span className="text-[10px] font-mono text-slate-500">Highest volume setups</span>
            </div>

            <div className="overflow-x-auto text-xs">
              <table className="w-full text-left">
                <thead>
                  <tr className="text-[10px] font-mono uppercase text-slate-500 border-b border-white/5">
                    <th className="pb-2">Opening System</th>
                    <th className="pb-2 text-right">Games</th>
                    <th className="pb-2 text-right">Perf. Elo</th>
                    <th className="pb-2 text-right">CAPS</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/5 font-mono text-[11px]">
                  {dossier.repertoire.map((rep: any) => (
                    <tr key={rep.system} className="hover:bg-white/5 transition-colors">
                      <td className="py-2 text-slate-200 font-sans font-medium truncate max-w-[140px]">
                        {rep.system}
                      </td>
                      <td className="py-2 text-right text-slate-400">{rep.games}</td>
                      <td className="py-2 text-right text-emerald-400 font-bold">{rep.perf_elo}</td>
                      <td className="py-2 text-right text-slate-200">{rep.caps}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* AI Analyst Readout */}
          <div className="p-5 rounded-3xl bg-blue-950/20 border border-blue-500/30 shadow-xl space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-blue-400 uppercase tracking-wider flex items-center gap-1.5">
                <Shield className="w-4 h-4" />
                AI Analyst Readout
              </span>
              <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-blue-500/20 text-blue-300 font-bold border border-blue-500/40">
                {dossier.ai_analyst_readout.percentile}
              </span>
            </div>

            <div className="p-3 rounded-xl bg-blue-900/30 border border-blue-500/30 text-xs text-white font-semibold">
              Primary signature: <span className="text-blue-300">{dossier.ai_analyst_readout.signature}</span>
            </div>

            <p className="text-xs text-slate-300 leading-relaxed opacity-90">
              {dossier.ai_analyst_readout.narrative}
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
