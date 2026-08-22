import { useState } from "react";
import {
  PRESET_UX_THEMES,
  PRESET_BOARD_THEMES,
  UXTheme,
  BoardTheme,
  CustomThemeSettings,
  saveUXTheme,
  saveBoardTheme,
  saveCustomSettings,
} from "../../lib/theme";
import { useClickLogger } from "../../lib/clickLogger";
import {
  Palette,
  Check,
  RotateCcw,
  X,
  Sliders,
  Sun,
  Moon,
  Grid,
} from "lucide-react";
import { Tooltip } from "../common/Tooltip";

interface ThemeCustomizerProps {
  currentUXTheme: UXTheme;
  currentBoardTheme: BoardTheme;
  customSettings: CustomThemeSettings;
  onSelectUXTheme: (theme: UXTheme) => void;
  onSelectBoardTheme: (theme: BoardTheme) => void;
  onUpdateCustomSettings: (settings: CustomThemeSettings) => void;
  isOpen: boolean;
  onClose: () => void;
  initialTab?: "ux" | "board" | "custom";
}

export function ThemeCustomizer({
  currentUXTheme,
  currentBoardTheme,
  customSettings,
  onSelectUXTheme,
  onSelectBoardTheme,
  onUpdateCustomSettings,
  isOpen,
  onClose,
  initialTab = "ux",
}: ThemeCustomizerProps) {
  const { logAction } = useClickLogger();
  const [activeTab, setActiveTab] = useState<"ux" | "board" | "custom">(initialTab);
  const [tempCustom, setTempCustom] = useState<CustomThemeSettings>(customSettings);

  if (!isOpen) return null;

  const handleSelectUX = (theme: UXTheme) => {
    logAction("THEME", `Changed UX Theme to "${theme.name}"`, `Mode: ${theme.mode}`);
    const updated = { ...customSettings, uxMode: "preset" as const };
    onUpdateCustomSettings(updated);
    saveCustomSettings(updated);
    onSelectUXTheme(theme);
    saveUXTheme(theme);
  };

  const handleSelectBoard = (theme: BoardTheme) => {
    logAction(
      "THEME",
      `Changed Board Theme to "${theme.name}"`,
      `Dark: ${theme.boardDark}, Light: ${theme.boardLight}`
    );
    onSelectBoardTheme(theme);
    saveBoardTheme(theme);
  };

  const handleCustomChange = (key: keyof CustomThemeSettings, value: string) => {
    const updated = { ...tempCustom, [key]: value, uxMode: "custom" as const };
    setTempCustom(updated);
    onUpdateCustomSettings(updated);
    logAction("THEME", `Customized ${key}`, value);
  };

  const handleSaveCustom = () => {
    saveCustomSettings(tempCustom);
    logAction("THEME", "Saved custom theme settings");
  };

  const handleResetCustom = () => {
    const defaultSettings: CustomThemeSettings = {
      uxMode: "preset",
      uxBg: "#0b0f19",
      uxPanel: "#111827",
      uxCard: "#161f32",
      uxBorder: "#1e293b",
      uxText: "#f8fafc",
      uxAccent: "#10b981",
      boardDark: "#4a7c59",
      boardLight: "#eae5c9",
    };
    setTempCustom(defaultSettings);
    onUpdateCustomSettings(defaultSettings);
    saveCustomSettings(defaultSettings);
    logAction("THEME", "Reset custom theme to defaults");
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-md flex items-center justify-center p-4 animate-in fade-in duration-150 select-none">
      <div className="bg-slate-900 border border-slate-700 rounded-3xl shadow-2xl w-full max-w-3xl max-h-[90vh] flex flex-col overflow-hidden text-slate-100">
        {/* Header */}
        <div className="px-6 py-4 border-b border-slate-800 flex items-center justify-between bg-slate-950/70">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-2xl bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
              <Palette className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-bold text-slate-100">Theme & Style Customizer</h2>
              <p className="text-xs text-slate-400">
                Change full application UX themes, chessboard square palettes, or use the color wheel
              </p>
            </div>
          </div>

          <Tooltip content="Close Theme Customizer" shortcut="ESC">
            <button
              onClick={() => {
                logAction("CLICK", "Closed Theme Customizer");
                onClose();
              }}
              className="p-2 text-slate-400 hover:text-white rounded-xl hover:bg-slate-800 transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
          </Tooltip>
        </div>

        {/* Tab Navigation */}
        <div className="px-6 pt-3 pb-2 border-b border-slate-800 flex items-center gap-3 bg-slate-900/90">
          <button
            onClick={() => {
              setActiveTab("ux");
              logAction("NAV", "Switched to UX Themes Tab");
            }}
            className={`px-4 py-2 text-xs font-semibold rounded-xl transition-all flex items-center gap-2 ${
              activeTab === "ux"
                ? "bg-slate-800 text-emerald-400 shadow-md border border-slate-700"
                : "text-slate-400 hover:text-slate-200 hover:bg-slate-800/50"
            }`}
          >
            <Sun className="w-4 h-4" />
            Change UX Theme (App Shell)
          </button>

          <button
            onClick={() => {
              setActiveTab("board");
              logAction("NAV", "Switched to Board Themes Tab");
            }}
            className={`px-4 py-2 text-xs font-semibold rounded-xl transition-all flex items-center gap-2 ${
              activeTab === "board"
                ? "bg-slate-800 text-emerald-400 shadow-md border border-slate-700"
                : "text-slate-400 hover:text-slate-200 hover:bg-slate-800/50"
            }`}
          >
            <Grid className="w-4 h-4" />
            Change Board Theme (Squares)
          </button>

          <button
            onClick={() => {
              setActiveTab("custom");
              logAction("NAV", "Switched to Custom Color Wheel Tab");
            }}
            className={`px-4 py-2 text-xs font-semibold rounded-xl transition-all flex items-center gap-2 ${
              activeTab === "custom"
                ? "bg-slate-800 text-emerald-400 shadow-md border border-slate-700"
                : "text-slate-400 hover:text-slate-200 hover:bg-slate-800/50"
            }`}
          >
            <Sliders className="w-4 h-4" />
            Color Wheel & Custom
          </button>
        </div>

        {/* Body Content */}
        <div className="p-6 overflow-y-auto flex-grow space-y-6">
          {activeTab === "ux" ? (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-slate-300">
                  Select Application UX Theme (Controls entire window, cards, and panels)
                </span>
                <span className="text-[11px] text-slate-500 font-mono">
                  {PRESET_UX_THEMES.length} Presets
                </span>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
                {PRESET_UX_THEMES.map((theme) => {
                  const isSelected = currentUXTheme.id === theme.id;
                  return (
                    <div
                      key={theme.id}
                      onClick={() => handleSelectUX(theme)}
                      className={`p-3.5 rounded-2xl border cursor-pointer transition-all duration-150 relative group ${
                        isSelected
                          ? "border-emerald-500 bg-slate-800/90 ring-2 ring-emerald-500/30 shadow-lg"
                          : "border-slate-800 bg-slate-950/40 hover:border-slate-700 hover:bg-slate-800/50"
                      }`}
                    >
                      <div className="flex items-center justify-between mb-2">
                        <div className="flex items-center gap-2">
                          {theme.mode === "dark" ? (
                            <Moon className="w-3.5 h-3.5 text-blue-400" />
                          ) : (
                            <Sun className="w-3.5 h-3.5 text-amber-400" />
                          )}
                          <h3 className="font-bold text-xs text-slate-100 group-hover:text-emerald-400 transition-colors">
                            {theme.name}
                          </h3>
                        </div>

                        {isSelected && (
                          <div className="w-5 h-5 rounded-full bg-emerald-500 text-slate-950 flex items-center justify-center font-bold">
                            <Check className="w-3 h-3 stroke-[3]" />
                          </div>
                        )}
                      </div>

                      <div className="flex items-center justify-between text-[11px] text-slate-400">
                        <span>{theme.tag}</span>
                        <span
                          className="px-2 py-0.5 rounded font-mono text-[10px] font-bold"
                          style={{
                            backgroundColor: `${theme.accentHex}20`,
                            color: theme.accentHex,
                          }}
                        >
                          {theme.mode.toUpperCase()}
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          ) : activeTab === "board" ? (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-slate-300">
                  Select Chessboard Square Theme
                </span>
                <span className="text-[11px] text-slate-500 font-mono">
                  {PRESET_BOARD_THEMES.length} Board Palettes
                </span>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
                {PRESET_BOARD_THEMES.map((theme) => {
                  const isSelected = currentBoardTheme.id === theme.id;
                  return (
                    <div
                      key={theme.id}
                      onClick={() => handleSelectBoard(theme)}
                      className={`p-3.5 rounded-2xl border cursor-pointer transition-all duration-150 relative group ${
                        isSelected
                          ? "border-emerald-500 bg-slate-800/90 ring-2 ring-emerald-500/30 shadow-lg"
                          : "border-slate-800 bg-slate-950/40 hover:border-slate-700 hover:bg-slate-800/50"
                      }`}
                    >
                      <div className="flex items-center justify-between mb-2">
                        <h3 className="font-bold text-xs text-slate-100 group-hover:text-emerald-400 transition-colors">
                          {theme.name}
                        </h3>

                        {isSelected && (
                          <div className="w-5 h-5 rounded-full bg-emerald-500 text-slate-950 flex items-center justify-center font-bold">
                            <Check className="w-3 h-3 stroke-[3]" />
                          </div>
                        )}
                      </div>

                      {/* Mini Board Swatch */}
                      <div className="flex items-center justify-between mt-2">
                        <div className="grid grid-cols-4 grid-rows-2 w-24 h-12 rounded-lg overflow-hidden border border-slate-700 shadow-inner">
                          {[...Array(8)].map((_, i) => {
                            const isLight = (Math.floor(i / 4) + (i % 4)) % 2 === 0;
                            return (
                              <div
                                key={i}
                                style={{
                                  backgroundColor: isLight
                                    ? theme.boardLight
                                    : theme.boardDark,
                                }}
                              />
                            );
                          })}
                        </div>
                        <span className="text-[11px] text-slate-400">{theme.tag}</span>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          ) : (
            <div className="space-y-6">
              <div className="bg-slate-950/60 p-4 rounded-2xl border border-slate-800 space-y-4">
                <h4 className="text-xs font-bold text-slate-200 uppercase tracking-wider">
                  Board Square Color Wheel
                </h4>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="bg-slate-900 p-3 rounded-xl border border-slate-800 flex items-center justify-between">
                    <div>
                      <span className="text-xs font-medium block">Light Square Color</span>
                      <span className="text-[11px] font-mono text-slate-400">
                        {tempCustom.boardLight}
                      </span>
                    </div>
                    <input
                      type="color"
                      value={tempCustom.boardLight}
                      onChange={(e) => handleCustomChange("boardLight", e.target.value)}
                      className="w-10 h-10 rounded-lg cursor-pointer bg-transparent border-0"
                    />
                  </div>

                  <div className="bg-slate-900 p-3 rounded-xl border border-slate-800 flex items-center justify-between">
                    <div>
                      <span className="text-xs font-medium block">Dark Square Color</span>
                      <span className="text-[11px] font-mono text-slate-400">
                        {tempCustom.boardDark}
                      </span>
                    </div>
                    <input
                      type="color"
                      value={tempCustom.boardDark}
                      onChange={(e) => handleCustomChange("boardDark", e.target.value)}
                      className="w-10 h-10 rounded-lg cursor-pointer bg-transparent border-0"
                    />
                  </div>
                </div>

                <h4 className="text-xs font-bold text-slate-200 uppercase tracking-wider pt-2">
                  UX App Shell Color Wheel
                </h4>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="bg-slate-900 p-3 rounded-xl border border-slate-800 flex items-center justify-between">
                    <div>
                      <span className="text-xs font-medium block">Background Color</span>
                      <span className="text-[11px] font-mono text-slate-400">
                        {tempCustom.uxBg}
                      </span>
                    </div>
                    <input
                      type="color"
                      value={tempCustom.uxBg}
                      onChange={(e) => handleCustomChange("uxBg", e.target.value)}
                      className="w-10 h-10 rounded-lg cursor-pointer bg-transparent border-0"
                    />
                  </div>

                  <div className="bg-slate-900 p-3 rounded-xl border border-slate-800 flex items-center justify-between">
                    <div>
                      <span className="text-xs font-medium block">Panel Card Color</span>
                      <span className="text-[11px] font-mono text-slate-400">
                        {tempCustom.uxPanel}
                      </span>
                    </div>
                    <input
                      type="color"
                      value={tempCustom.uxPanel}
                      onChange={(e) => handleCustomChange("uxPanel", e.target.value)}
                      className="w-10 h-10 rounded-lg cursor-pointer bg-transparent border-0"
                    />
                  </div>
                </div>

                {/* Preview Mini Board */}
                <div className="flex items-center justify-center pt-2">
                  <div className="p-3 bg-slate-900 rounded-xl border border-slate-800 flex flex-col items-center">
                    <span className="text-[11px] font-medium text-slate-400 mb-2">
                      Live Custom Board Preview
                    </span>
                    <div className="grid grid-cols-4 grid-rows-4 w-32 h-32 rounded-lg overflow-hidden shadow-md border border-slate-700">
                      {[...Array(16)].map((_, i) => {
                        const row = Math.floor(i / 4);
                        const col = i % 4;
                        const isLight = (row + col) % 2 === 0;
                        return (
                          <div
                            key={i}
                            style={{
                              backgroundColor: isLight
                                ? tempCustom.boardLight
                                : tempCustom.boardDark,
                            }}
                          />
                        );
                      })}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-slate-800 flex items-center justify-between bg-slate-950/70">
          {activeTab === "custom" ? (
            <div className="flex items-center gap-3 w-full justify-between">
              <Tooltip content="Reset custom colors to default">
                <button
                  onClick={handleResetCustom}
                  className="px-3 py-2 text-xs text-slate-400 hover:text-white rounded-xl hover:bg-slate-800 flex items-center gap-1.5 transition-colors border border-slate-800"
                >
                  <RotateCcw className="w-3.5 h-3.5" />
                  Reset Defaults
                </button>
              </Tooltip>

              <button
                onClick={() => {
                  handleSaveCustom();
                  onClose();
                }}
                className="px-5 py-2 text-xs font-bold bg-emerald-500 hover:bg-emerald-400 text-slate-950 rounded-xl shadow-lg transition-all"
              >
                Save & Apply Custom Colors
              </button>
            </div>
          ) : (
            <button
              onClick={onClose}
              className="px-5 py-2 text-xs font-bold bg-slate-800 hover:bg-slate-700 text-white rounded-xl ml-auto transition-all"
            >
              Done
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
