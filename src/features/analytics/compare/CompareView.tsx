import { useState, type FormEvent } from "react";
import { useQuery } from "@tanstack/react-query";
import { UXTheme } from "../../../lib/theme";
import { useClickLogger } from "../../../lib/clickLogger";
import { Tooltip } from "../../../components/common/Tooltip";
import { ArrowLeft, ArrowRightLeft, Search, RefreshCw } from "lucide-react";

interface CompareViewProps {
  uxTheme: UXTheme;
  initialPlayerA?: string;
  initialPlayerB?: string;
  onBackToDossier: () => void;
}

export function CompareView({
  initialPlayerA = "Carlsen,M",
  initialPlayerB = "Bu Xiangzhi",
  onBackToDossier,
}: CompareViewProps) {
  const { logAction } = useClickLogger();

  const [playerA, setPlayerA] = useState(initialPlayerA);
  const [playerB, setPlayerB] = useState(initialPlayerB);
  const [inputA, setInputA] = useState(initialPlayerA);
  const [inputB, setInputB] = useState(initialPlayerB);

  const { data: compareData, isLoading } = useQuery({
    queryKey: ["compare", playerA, playerB],
    queryFn: async () => {
      const res = await fetch(
        `http://127.0.0.1:8000/api/v1/dossier/compare?player_a=${encodeURIComponent(
          playerA
        )}&player_b=${encodeURIComponent(playerB)}`
      );
      if (!res.ok) throw new Error("Failed to load comparison data");
      return res.json();
    },
  });

  const handleSearchA = (e: FormEvent) => {
    e.preventDefault();
    if (inputA.trim() && inputA.trim() !== playerA) {
      setPlayerA(inputA.trim());
      logAction("CLICK", `Compare changed Player A to: ${inputA.trim()}`);
    }
  };

  const handleSearchB = (e: FormEvent) => {
    e.preventDefault();
    if (inputB.trim() && inputB.trim() !== playerB) {
      setPlayerB(inputB.trim());
      logAction("CLICK", `Compare changed Player B to: ${inputB.trim()}`);
    }
  };

  const handleSwap = () => {
    const temp = playerA;
    setPlayerA(playerB);
    setPlayerB(temp);
    setInputA(playerB);
    setInputB(temp);
    logAction("CLICK", `Swapped Player A (${playerA}) and Player B (${playerB})`);
  };

  if (isLoading || !compareData) {
    return (
      <div className="h-96 flex flex-col items-center justify-center gap-3 opacity-60">
        <RefreshCw className="w-8 h-8 animate-spin text-blue-500" />
        <span className="font-mono text-xs">Computing Head-to-Head Comparison...</span>
      </div>
    );
  }

  const h2h = compareData.head_to_head;
  const pA = compareData.player_a;
  const pB = compareData.player_b;
  const gap = compareData.gap_analysis;

  const getMeterPct = (val: number, type: "rating" | "pct" | "acpl") => {
    if (type === "rating") return Math.min(100, Math.max(15, Math.round(((val - 2200) / 700) * 100)));
    if (type === "pct") return Math.min(100, Math.max(10, Math.round(val)));
    if (type === "acpl") return Math.min(100, Math.max(10, Math.round(100 - (val * 2.5))));
    return 50;
  };

  return (
    <div className="flex flex-col gap-6 max-w-7xl mx-auto pb-10 select-none animate-in fade-in duration-200">
      {/* Top Header */}
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
        <div>
          <div className="text-[10px] font-mono uppercase tracking-widest text-blue-400 font-bold mb-1">
            Head-to-Head Comparison
          </div>
          <h1 className="text-3xl font-extrabold tracking-tight text-white flex items-center gap-3">
            {pA.player}
            <span className="text-slate-500 font-normal italic text-xl">vs</span>
            {pB.player}
          </h1>
        </div>

        <div className="flex items-center gap-3">
          <span className="text-xs font-mono px-3 py-1 rounded-xl bg-blue-500/10 text-blue-400 border border-blue-500/20">
            {h2h.total_common} games in common context
          </span>

          <Tooltip content="Return to Player Dossier">
            <button
              onClick={() => {
                logAction("CLICK", "Back to Dossier from Compare");
                onBackToDossier();
              }}
              className="px-4 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-bold rounded-xl border border-slate-700 shadow-md transition-all flex items-center gap-1.5"
            >
              <ArrowLeft className="w-3.5 h-3.5" />
              Back to Dossier
            </button>
          </Tooltip>
        </div>
      </div>

      {/* Player Selection Toolbar */}
      <div className="p-3 rounded-2xl bg-[#14171c] border border-slate-800 shadow-md flex flex-col md:flex-row items-center justify-between gap-3">
        <form onSubmit={handleSearchA} className="flex items-center gap-2 w-full md:w-auto">
          <span className="text-[10px] font-mono uppercase font-bold text-blue-400">Player A:</span>
          <div className="relative">
            <Search className="w-3 h-3 absolute left-2.5 top-2.5 text-slate-400" />
            <input
              type="text"
              value={inputA}
              onChange={(e) => setInputA(e.target.value)}
              className="pl-7 pr-2 py-1 text-xs rounded-xl bg-black/40 border border-white/10 text-white outline-none w-44 font-sans focus:border-blue-500"
            />
          </div>
          <button type="submit" className="px-2.5 py-1 text-[11px] font-bold bg-blue-600 hover:bg-blue-500 text-white rounded-lg">
            Apply
          </button>
        </form>

        <button
          onClick={handleSwap}
          className="p-1.5 rounded-xl bg-black/40 hover:bg-white/10 border border-white/10 text-slate-300 transition-all flex items-center gap-1.5 text-xs font-bold px-3"
        >
          <ArrowRightLeft className="w-3.5 h-3.5 text-amber-400" />
          Swap Players
        </button>

        <form onSubmit={handleSearchB} className="flex items-center gap-2 w-full md:w-auto">
          <span className="text-[10px] font-mono uppercase font-bold text-amber-400">Player B:</span>
          <div className="relative">
            <Search className="w-3 h-3 absolute left-2.5 top-2.5 text-slate-400" />
            <input
              type="text"
              value={inputB}
              onChange={(e) => setInputB(e.target.value)}
              className="pl-7 pr-2 py-1 text-xs rounded-xl bg-black/40 border border-white/10 text-white outline-none w-44 font-sans focus:border-amber-500"
            />
          </div>
          <button type="submit" className="px-2.5 py-1 text-[11px] font-bold bg-amber-600 hover:bg-amber-500 text-white rounded-lg">
            Apply
          </button>
        </form>
      </div>

      {/* Main Comparison Container */}
      <div className="rounded-3xl bg-[#14171c] border border-slate-800 shadow-2xl overflow-hidden">
        {/* Player Header Banner */}
        <div className="grid grid-cols-1 md:grid-cols-3 border-b border-slate-800 bg-black/30 p-6 items-center">
          {/* Player A */}
          <div className="flex items-center gap-4">
            <div className="w-14 h-14 rounded-2xl bg-gradient-to-tr from-blue-600 to-cyan-500 text-white font-black text-lg flex items-center justify-center shadow-lg">
              {pA.player.slice(0, 2).toUpperCase()}
            </div>
            <div>
              <h2 className="text-lg font-bold text-white">{pA.player}</h2>
              <div className="text-xs font-mono text-slate-400">
                Glicko {pA.kpis.glicko} · Perf {pA.kpis.perf_elo}
              </div>
            </div>
          </div>

          {/* Center VS Badge */}
          <div className="text-center my-4 md:my-0">
            <span className="text-sm font-black font-mono italic px-4 py-1 rounded-full bg-slate-800 text-slate-400 border border-slate-700">
              VS
            </span>
          </div>

          {/* Player B */}
          <div className="flex items-center justify-end gap-4 text-right">
            <div>
              <h2 className="text-lg font-bold text-white">{pB.player}</h2>
              <div className="text-xs font-mono text-slate-400">
                Glicko {pB.kpis.glicko} · Perf {pB.kpis.perf_elo}
              </div>
            </div>
            <div className="w-14 h-14 rounded-2xl bg-gradient-to-tr from-amber-600 to-rose-500 text-white font-black text-lg flex items-center justify-center shadow-lg">
              {pB.player.slice(0, 2).toUpperCase()}
            </div>
          </div>
        </div>

        {/* Side-by-Side KPI Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 border-b border-slate-800 divide-y md:divide-y-0 md:divide-x divide-slate-800 p-6 gap-8">
          {/* Player A KPIs */}
          <div className="space-y-4">
            <div className="text-[10px] font-mono uppercase font-bold text-blue-400 pb-1 border-b border-white/5">
              Player A · Core KPIs ({pA.player})
            </div>

            <div className="space-y-2.5 text-xs font-sans">
              <div className="flex items-center justify-between">
                <span className="text-slate-400 w-24">Glicko</span>
                <div className="flex-grow mx-4 h-2 bg-black/40 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-blue-500 rounded-full"
                    style={{ width: `${getMeterPct(pA.kpis.glicko, "rating")}%` }}
                  />
                </div>
                <span className="font-mono font-bold text-blue-400 w-12 text-right">{pA.kpis.glicko}</span>
              </div>

              <div className="flex items-center justify-between">
                <span className="text-slate-400 w-24">Performance Elo</span>
                <div className="flex-grow mx-4 h-2 bg-black/40 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-blue-500 rounded-full"
                    style={{ width: `${getMeterPct(pA.kpis.perf_elo, "rating")}%` }}
                  />
                </div>
                <span className="font-mono font-bold text-slate-200 w-12 text-right">{pA.kpis.perf_elo}</span>
              </div>

              <div className="flex items-center justify-between">
                <span className="text-slate-400 w-24">CAPS Accuracy</span>
                <div className="flex-grow mx-4 h-2 bg-black/40 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-emerald-500 rounded-full"
                    style={{ width: `${getMeterPct(pA.kpis.caps_accuracy, "pct")}%` }}
                  />
                </div>
                <span className="font-mono font-bold text-emerald-400 w-12 text-right">{pA.kpis.caps_accuracy}%</span>
              </div>

              <div className="flex items-center justify-between">
                <span className="text-slate-400 w-24">Aggression</span>
                <div className="flex-grow mx-4 h-2 bg-black/40 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-amber-500 rounded-full"
                    style={{ width: `${getMeterPct(pA.kpis.aggression_index, "pct")}%` }}
                  />
                </div>
                <span className="font-mono font-bold text-amber-400 w-12 text-right">{pA.kpis.aggression_index}</span>
              </div>

              <div className="flex items-center justify-between">
                <span className="text-slate-400 w-24">Conversion Rate</span>
                <div className="flex-grow mx-4 h-2 bg-black/40 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-emerald-500 rounded-full"
                    style={{ width: `${getMeterPct(pA.kpis.conversion_rate, "pct")}%` }}
                  />
                </div>
                <span className="font-mono font-bold text-emerald-400 w-12 text-right">{pA.kpis.conversion_rate}%</span>
              </div>

              <div className="flex items-center justify-between">
                <span className="text-slate-400 w-24">Endgame ACPL</span>
                <div className="flex-grow mx-4 h-2 bg-black/40 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-emerald-500 rounded-full"
                    style={{ width: `${getMeterPct(pA.performance_panel.endgame_acpl, "acpl")}%` }}
                  />
                </div>
                <span className="font-mono font-bold text-slate-200 w-12 text-right">{pA.performance_panel.endgame_acpl}</span>
              </div>
            </div>
          </div>

          {/* Player B KPIs */}
          <div className="space-y-4">
            <div className="text-[10px] font-mono uppercase font-bold text-amber-400 pb-1 border-b border-white/5">
              Player B · Core KPIs ({pB.player})
            </div>

            <div className="space-y-2.5 text-xs font-sans">
              <div className="flex items-center justify-between">
                <span className="text-slate-400 w-24">Glicko</span>
                <div className="flex-grow mx-4 h-2 bg-black/40 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-amber-500 rounded-full"
                    style={{ width: `${getMeterPct(pB.kpis.glicko, "rating")}%` }}
                  />
                </div>
                <span className="font-mono font-bold text-amber-400 w-12 text-right">{pB.kpis.glicko}</span>
              </div>

              <div className="flex items-center justify-between">
                <span className="text-slate-400 w-24">Performance Elo</span>
                <div className="flex-grow mx-4 h-2 bg-black/40 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-amber-500 rounded-full"
                    style={{ width: `${getMeterPct(pB.kpis.perf_elo, "rating")}%` }}
                  />
                </div>
                <span className="font-mono font-bold text-slate-200 w-12 text-right">{pB.kpis.perf_elo}</span>
              </div>

              <div className="flex items-center justify-between">
                <span className="text-slate-400 w-24">CAPS Accuracy</span>
                <div className="flex-grow mx-4 h-2 bg-black/40 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-emerald-500 rounded-full"
                    style={{ width: `${getMeterPct(pB.kpis.caps_accuracy, "pct")}%` }}
                  />
                </div>
                <span className="font-mono font-bold text-emerald-400 w-12 text-right">{pB.kpis.caps_accuracy}%</span>
              </div>

              <div className="flex items-center justify-between">
                <span className="text-slate-400 w-24">Aggression</span>
                <div className="flex-grow mx-4 h-2 bg-black/40 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-amber-500 rounded-full"
                    style={{ width: `${getMeterPct(pB.kpis.aggression_index, "pct")}%` }}
                  />
                </div>
                <span className="font-mono font-bold text-amber-400 w-12 text-right">{pB.kpis.aggression_index}</span>
              </div>

              <div className="flex items-center justify-between">
                <span className="text-slate-400 w-24">Conversion Rate</span>
                <div className="flex-grow mx-4 h-2 bg-black/40 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-emerald-500 rounded-full"
                    style={{ width: `${getMeterPct(pB.kpis.conversion_rate, "pct")}%` }}
                  />
                </div>
                <span className="font-mono font-bold text-emerald-400 w-12 text-right">{pB.kpis.conversion_rate}%</span>
              </div>

              <div className="flex items-center justify-between">
                <span className="text-slate-400 w-24">Endgame ACPL</span>
                <div className="flex-grow mx-4 h-2 bg-black/40 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-emerald-500 rounded-full"
                    style={{ width: `${getMeterPct(pB.performance_panel.endgame_acpl, "acpl")}%` }}
                  />
                </div>
                <span className="font-mono font-bold text-slate-200 w-12 text-right">{pB.performance_panel.endgame_acpl}</span>
              </div>
            </div>
          </div>
        </div>

        {/* Head-to-Head Scoreboard */}
        <div className="grid grid-cols-1 md:grid-cols-3 border-b border-slate-800 bg-black/50 p-6 items-center">
          <div className="text-left">
            <span className="text-xs font-bold text-slate-400">{pA.player}</span>
            <div className="text-4xl font-black font-mono text-emerald-400 my-1">{h2h.net_edge}</div>
            <span className="text-[10px] font-mono text-slate-500 uppercase tracking-wider font-bold">
              Net H2H Edge
            </span>
          </div>

          <div className="text-center border-y md:border-y-0 md:border-x border-slate-800 py-4 md:py-0 px-6">
            <div className="text-[10px] font-mono uppercase text-slate-500 font-bold mb-2">
              Direct Matchup Results
            </div>
            <div className="grid grid-cols-3 gap-2">
              <div className="p-2 rounded-xl bg-slate-900 border border-slate-800">
                <div className="text-xl font-black font-mono text-white">{h2h.wins_a}</div>
                <div className="text-[9px] text-slate-500 font-medium">Wins (A)</div>
              </div>
              <div className="p-2 rounded-xl bg-slate-900 border border-slate-800">
                <div className="text-xl font-black font-mono text-slate-400">{h2h.draws}</div>
                <div className="text-[9px] text-slate-500 font-medium">Draws</div>
              </div>
              <div className="p-2 rounded-xl bg-slate-900 border border-slate-800">
                <div className="text-xl font-black font-mono text-white">{h2h.wins_b}</div>
                <div className="text-[9px] text-slate-500 font-medium">Wins (B)</div>
              </div>
            </div>
          </div>

          <div className="text-right">
            <span className="text-xs font-bold text-slate-400">{pB.player}</span>
            <div className="text-4xl font-black font-mono text-white my-1">{h2h.wins_b}</div>
            <span className="text-[10px] font-mono text-slate-500 uppercase tracking-wider font-bold">
              Direct Wins
            </span>
          </div>
        </div>

        {/* Style Divergence & Gap Analysis */}
        <div className="grid grid-cols-1 md:grid-cols-2 p-6 gap-6">
          {/* Style Divergence */}
          <div className="p-5 rounded-3xl bg-black/30 border border-white/5 space-y-3">
            <h3 className="text-xs font-bold uppercase tracking-wider text-slate-200">
              Style Divergence (Indexed 0–100)
            </h3>
            <div className="space-y-2.5 text-xs font-sans">
              {compareData.style_divergence.map((row: any) => (
                <div key={row.trait} className="flex items-center justify-between">
                  <span className="text-slate-400 w-28">{row.trait}</span>
                  <div className="flex-grow mx-4 h-2 bg-black/40 rounded-full overflow-hidden">
                    <div className="h-full bg-cyan-400 rounded-full" style={{ width: `${row.meter}%` }} />
                  </div>
                  <span className="font-mono font-bold text-slate-200 text-right w-16">
                    {row.val_a} / {row.val_b}
                  </span>
                </div>
              ))}
            </div>
          </div>

          {/* Where the Gap Appears */}
          <div className="p-5 rounded-3xl bg-black/30 border border-white/5 space-y-3 flex flex-col justify-between">
            <div>
              <h3 className="text-xs font-bold uppercase tracking-wider text-slate-200 mb-3">
                Where the Gap Appears (ACPL Delta)
              </h3>
              <div className="space-y-2 text-xs">
                <div className="flex justify-between items-center">
                  <span className="text-slate-400">Opening Phase</span>
                  <span className="font-mono font-bold text-emerald-400">{gap.opening_delta} cp</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-slate-400">Middlegame Phase</span>
                  <span className="font-mono font-bold text-amber-400">{gap.middlegame_delta} cp</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-slate-400">Endgame Phase</span>
                  <span className="font-mono font-bold text-emerald-400">{gap.endgame_delta} cp</span>
                </div>
              </div>
            </div>

            <p className="text-xs text-slate-400 leading-relaxed border-t border-white/5 pt-3">
              {gap.summary}
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
