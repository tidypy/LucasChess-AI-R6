import { useState } from "react";
import { UciOptionInfo } from "../../lib/api";
import { Search, RotateCcw, Sliders } from "lucide-react";

interface UciOptionsInspectorProps {
  optionsMap: Record<string, UciOptionInfo>;
  currentValues: Record<string, any>;
  onChange: (key: string, value: any) => void;
  isLight?: boolean;
}

export function UciOptionsInspector({
  optionsMap,
  currentValues,
  onChange,
  isLight = false,
}: UciOptionsInspectorProps) {
  const [search, setSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState<string>("all");

  const optionEntries = Object.entries(optionsMap || {});

  const filteredEntries = optionEntries.filter(([key, opt]) => {
    const matchesSearch =
      key.toLowerCase().includes(search.toLowerCase()) ||
      opt.name.toLowerCase().includes(search.toLowerCase());
    if (!matchesSearch) return false;

    if (typeFilter === "spin") return opt.type === "spin";
    if (typeFilter === "check") return opt.type === "check";
    if (typeFilter === "combo") return opt.type === "combo";
    if (typeFilter === "string") return opt.type === "string";
    return true;
  });

  if (optionEntries.length === 0) {
    return (
      <div className={`p-4 rounded-2xl border text-center text-xs font-mono ${isLight ? "bg-slate-50 border-slate-200 text-slate-500" : "bg-black/20 border-white/5 text-slate-400"}`}>
        No UCI options detected. Test the engine executable above to inspect all supported options.
      </div>
    );
  }

  return (
    <div className="space-y-3 font-sans">
      {/* Search & Filter Header */}
      <div className="flex flex-col sm:flex-row items-center justify-between gap-2">
        <div className={`flex items-center gap-2 px-3 py-1.5 rounded-xl border w-full sm:w-64 ${isLight ? "bg-slate-100 border-slate-200" : "bg-black/40 border-white/10"}`}>
          <Search className="w-3.5 h-3.5 text-slate-400" />
          <input
            type="text"
            placeholder={`Filter ${optionEntries.length} options...`}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className={`text-xs font-mono outline-none w-full bg-transparent ${isLight ? "text-slate-900 placeholder:text-slate-400" : "text-white placeholder:text-slate-500"}`}
          />
        </div>

        <div className="flex items-center gap-1 overflow-x-auto w-full sm:w-auto text-[11px] font-mono font-bold">
          {[
            { id: "all", label: `All (${optionEntries.length})` },
            { id: "spin", label: "Sliders" },
            { id: "check", label: "Switches" },
            { id: "combo", label: "Dropdowns" },
            { id: "string", label: "Paths/Text" },
          ].map((tab) => (
            <button
              key={tab.id}
              type="button"
              onClick={() => setTypeFilter(tab.id)}
              className={`px-2.5 py-1 rounded-lg transition-all cursor-pointer ${
                typeFilter === tab.id
                  ? isLight
                    ? "bg-slate-900 text-white shadow-sm font-extrabold"
                    : "bg-cyan-500/20 text-cyan-300 border border-cyan-500/40 font-extrabold"
                  : isLight
                  ? "bg-slate-100 hover:bg-slate-200 text-slate-600"
                  : "bg-black/30 hover:bg-white/5 text-slate-400"
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      {/* Options List Container */}
      <div className={`max-h-[380px] overflow-y-auto rounded-2xl border p-3 space-y-2.5 ${isLight ? "bg-slate-50 border-slate-200" : "bg-black/40 border-white/10"}`}>
        {filteredEntries.length === 0 ? (
          <div className="text-center py-6 text-xs text-slate-400 font-mono">
            No options match filter "{search}"
          </div>
        ) : (
          filteredEntries.map(([key, opt]) => {
            const currentVal = currentValues[key] !== undefined ? currentValues[key] : opt.default;
            const isModified = currentVal !== opt.default;

            return (
              <div
                key={key}
                className={`p-3 rounded-xl border transition-all ${
                  isModified
                    ? isLight
                      ? "bg-cyan-50/70 border-cyan-300 text-slate-900 shadow-sm"
                      : "bg-cyan-950/20 border-cyan-500/40 text-white shadow-sm"
                    : isLight
                    ? "bg-white border-slate-200 text-slate-900"
                    : "bg-[#14171c]/90 border-white/5 text-white"
                }`}
              >
                {/* 1. SPIN TYPE (Numeric Slider & Input) */}
                {opt.type === "spin" && (
                  <div className="space-y-2">
                    <div className="flex items-center justify-between gap-2 text-xs">
                      <div className="flex items-center gap-1.5 font-bold">
                        <Sliders className="w-3.5 h-3.5 text-cyan-400" />
                        <span className="font-extrabold">{opt.name}</span>
                        {isModified && (
                          <span className="text-[10px] font-mono px-1.5 py-0.2 rounded bg-cyan-500/20 text-cyan-400 font-bold">
                            Modified
                          </span>
                        )}
                      </div>

                      <div className="flex items-center gap-2">
                        <span className="text-[11px] font-mono text-slate-400">
                          (min: {opt.min ?? 0}, max: {opt.max ?? 100}, default: {String(opt.default)})
                        </span>
                        <input
                          type="number"
                          min={opt.min ?? undefined}
                          max={opt.max ?? undefined}
                          value={currentVal ?? opt.default ?? 0}
                          onChange={(e) => onChange(key, Number(e.target.value))}
                          className={`w-20 px-2 py-0.5 text-xs font-mono font-bold rounded-lg border text-right outline-none ${
                            isLight
                              ? "bg-slate-100 border-slate-300 text-slate-900 focus:border-cyan-500"
                              : "bg-black/60 border-white/20 text-cyan-300 focus:border-cyan-400"
                          }`}
                        />
                        {isModified && (
                          <button
                            type="button"
                            onClick={() => onChange(key, opt.default)}
                            className="p-1 text-slate-400 hover:text-cyan-400"
                            title="Reset to engine default"
                          >
                            <RotateCcw className="w-3 h-3" />
                          </button>
                        )}
                      </div>
                    </div>

                    <input
                      type="range"
                      min={opt.min ?? 0}
                      max={opt.max ?? (opt.default ? Math.max(100, opt.default * 2) : 100)}
                      step={opt.max && opt.max > 1000 ? 16 : 1}
                      value={currentVal ?? opt.default ?? 0}
                      onChange={(e) => onChange(key, Number(e.target.value))}
                      className="w-full accent-cyan-500 cursor-pointer h-1.5 bg-slate-700 rounded-lg"
                    />
                  </div>
                )}

                {/* 2. CHECK TYPE (Boolean Toggle Switch) */}
                {opt.type === "check" && (
                  <div className="flex items-center justify-between gap-3 text-xs">
                    <div>
                      <span className="font-extrabold block">{opt.name}</span>
                      <span className="text-[11px] font-mono text-slate-400">
                        Default: {opt.default ? "True" : "False"}
                      </span>
                    </div>

                    <div className="flex items-center gap-2">
                      <label className="relative inline-flex items-center cursor-pointer">
                        <input
                          type="checkbox"
                          checked={Boolean(currentVal)}
                          onChange={(e) => onChange(key, e.target.checked)}
                          className="sr-only peer"
                        />
                        <div className="w-10 h-5 bg-slate-700 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-cyan-500" />
                      </label>
                      {isModified && (
                        <button
                          type="button"
                          onClick={() => onChange(key, opt.default)}
                          className="p-1 text-slate-400 hover:text-cyan-400"
                          title="Reset to engine default"
                        >
                          <RotateCcw className="w-3 h-3" />
                        </button>
                      )}
                    </div>
                  </div>
                )}

                {/* 3. COMBO TYPE (Dropdown Selector) */}
                {opt.type === "combo" && (
                  <div className="flex items-center justify-between gap-3 text-xs">
                    <div>
                      <span className="font-extrabold block">{opt.name}</span>
                      <span className="text-[11px] font-mono text-slate-400">
                        Default: {String(opt.default)}
                      </span>
                    </div>

                    <div className="flex items-center gap-2">
                      <select
                        value={currentVal || opt.default || ""}
                        onChange={(e) => onChange(key, e.target.value)}
                        className={`px-3 py-1.5 rounded-xl border text-xs font-mono font-bold outline-none cursor-pointer ${
                          isLight
                            ? "bg-white border-slate-300 text-slate-900"
                            : "bg-black/60 border-white/20 text-cyan-300"
                        }`}
                      >
                        {opt.var && opt.var.length > 0 ? (
                          opt.var.map((v) => (
                            <option key={v} value={v}>
                              {v}
                            </option>
                          ))
                        ) : (
                          <option value={String(opt.default)}>{String(opt.default)}</option>
                        )}
                      </select>
                      {isModified && (
                        <button
                          type="button"
                          onClick={() => onChange(key, opt.default)}
                          className="p-1 text-slate-400 hover:text-cyan-400"
                          title="Reset to engine default"
                        >
                          <RotateCcw className="w-3 h-3" />
                        </button>
                      )}
                    </div>
                  </div>
                )}

                {/* 4. STRING TYPE (Text Input) */}
                {opt.type === "string" && (
                  <div className="space-y-1.5 text-xs">
                    <div className="flex items-center justify-between">
                      <span className="font-extrabold">{opt.name}</span>
                      <span className="text-[11px] font-mono text-slate-400">
                        Default: {opt.default || "<empty>"}
                      </span>
                    </div>
                    <div className="flex items-center gap-2">
                      <input
                        type="text"
                        placeholder={opt.default || "Enter text / path value..."}
                        value={currentVal || ""}
                        onChange={(e) => onChange(key, e.target.value)}
                        className={`w-full px-3 py-1.5 text-xs font-mono rounded-xl border outline-none ${
                          isLight
                            ? "bg-slate-100 border-slate-300 text-slate-900 focus:border-cyan-500"
                            : "bg-black/60 border-white/15 text-white focus:border-cyan-400"
                        }`}
                      />
                      {isModified && (
                        <button
                          type="button"
                          onClick={() => onChange(key, opt.default || "")}
                          className="p-1 text-slate-400 hover:text-cyan-400"
                          title="Reset to engine default"
                        >
                          <RotateCcw className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </div>
                  </div>
                )}

                {/* 5. BUTTON TYPE */}
                {opt.type === "button" && (
                  <div className="flex items-center justify-between text-xs">
                    <span className="font-extrabold">{opt.name}</span>
                    <span className="px-2 py-0.5 rounded-lg bg-slate-800 text-slate-400 border border-white/10 text-[10px] font-mono font-bold uppercase">
                      Action Trigger (Button)
                    </span>
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
