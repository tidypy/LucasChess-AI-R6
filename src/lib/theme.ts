export interface UXTheme {
  id: string;
  name: string;
  mode: "dark" | "light";
  bg: string;
  panel: string;
  card: string;
  subCard: string;
  border: string;
  text: string;
  subText: string;
  accent: string;
  accentHex: string;
  tag: string;
}

export interface BoardTheme {
  id: string;
  name: string;
  boardDark: string;
  boardLight: string;
  accentSquare?: string;
  tag: string;
}

export const PRESET_UX_THEMES: UXTheme[] = [
  {
    id: "midnight-slate",
    name: "Midnight Slate",
    mode: "dark",
    bg: "bg-[#0b0f19]",
    panel: "bg-[#111827]",
    card: "bg-[#161f32]",
    subCard: "bg-[#0e1424]",
    border: "border-slate-800",
    text: "text-slate-100",
    subText: "text-slate-400",
    accent: "text-emerald-400",
    accentHex: "#10b981",
    tag: "Dark Blue-Gray",
  },
  {
    id: "obsidian-gold",
    name: "Obsidian & Gold",
    mode: "dark",
    bg: "bg-[#09090b]",
    panel: "bg-[#121215]",
    card: "bg-[#18181c]",
    subCard: "bg-[#0f0f12]",
    border: "border-amber-900/30",
    text: "text-amber-50",
    subText: "text-amber-200/60",
    accent: "text-amber-400",
    accentHex: "#f59e0b",
    tag: "Luxury Dark",
  },
  {
    id: "royal-sapphire",
    name: "Royal Sapphire",
    mode: "dark",
    bg: "bg-[#040914]",
    panel: "bg-[#0a1529]",
    card: "bg-[#0f203d]",
    subCard: "bg-[#07101f]",
    border: "border-blue-900/40",
    text: "text-blue-50",
    subText: "text-blue-300/60",
    accent: "text-cyan-400",
    accentHex: "#06b6d4",
    tag: "Deep Navy",
  },
  {
    id: "forest-emerald",
    name: "Emerald Forest",
    mode: "dark",
    bg: "bg-[#041208]",
    panel: "bg-[#0a2012]",
    card: "bg-[#0f2e1b]",
    subCard: "bg-[#06170d]",
    border: "border-emerald-900/40",
    text: "text-emerald-50",
    subText: "text-emerald-300/60",
    accent: "text-emerald-400",
    accentHex: "#10b981",
    tag: "Forest Green",
  },
  {
    id: "cyber-synthwave",
    name: "Cyber Synthwave",
    mode: "dark",
    bg: "bg-[#0e071c]",
    panel: "bg-[#170c2e]",
    card: "bg-[#231245]",
    subCard: "bg-[#110822]",
    border: "border-fuchsia-900/40",
    text: "text-fuchsia-50",
    subText: "text-fuchsia-300/60",
    accent: "text-pink-400",
    accentHex: "#ec4899",
    tag: "Neon Synth",
  },
  {
    id: "nord-frost",
    name: "Nord Frost",
    mode: "dark",
    bg: "bg-[#242933]",
    panel: "bg-[#2e3440]",
    card: "bg-[#3b4252]",
    subCard: "bg-[#272c37]",
    border: "border-[#4c566a]",
    text: "text-[#eceff4]",
    subText: "text-[#d8dee9]/70",
    accent: "text-[#88c0d0]",
    accentHex: "#88c0d0",
    tag: "Arctic Muted",
  },
  {
    id: "clean-light",
    name: "Clean Light Titanium",
    mode: "light",
    bg: "bg-slate-100",
    panel: "bg-white",
    card: "bg-slate-50",
    subCard: "bg-slate-100",
    border: "border-slate-200 shadow-sm",
    text: "text-slate-900",
    subText: "text-slate-600",
    accent: "text-emerald-600",
    accentHex: "#059669",
    tag: "Crisp Modern Light",
  },
  {
    id: "warm-parchment",
    name: "Warm Parchment & Wood",
    mode: "light",
    bg: "bg-[#fbf7ee]",
    panel: "bg-[#f4ebe1]",
    card: "bg-[#fcf9f2]",
    subCard: "bg-[#ede3d4]",
    border: "border-[#e0d3c1] shadow-sm",
    text: "text-amber-950",
    subText: "text-amber-800/80",
    accent: "text-amber-800",
    accentHex: "#92400e",
    tag: "Classic Tournament Light",
  },
  {
    id: "pure-slate-light",
    name: "Pure Slate & Ice Light",
    mode: "light",
    bg: "bg-[#f1f5f9]",
    panel: "bg-white",
    card: "bg-[#f8fafc]",
    subCard: "bg-[#e2e8f0]",
    border: "border-slate-300/80 shadow-sm",
    text: "text-slate-950",
    subText: "text-slate-600",
    accent: "text-blue-600",
    accentHex: "#2563eb",
    tag: "Executive Slate Light",
  },
];

export const PRESET_BOARD_THEMES: BoardTheme[] = [
  {
    id: "classic-green",
    name: "Green & Bluff",
    boardDark: "#4a7c59",
    boardLight: "#eae5c9",
    tag: "Official FIDE",
  },
  {
    id: "wood-walnut",
    name: "Warm Walnut & Maple Wood",
    boardDark: "#b58863",
    boardLight: "#f0d9b5",
    tag: "Classic Wood",
  },
  {
    id: "slate-ice",
    name: "Modern Slate & Pale Ice",
    boardDark: "#334155",
    boardLight: "#94a3b8",
    tag: "Slate Contrast",
  },
  {
    id: "ocean-blue",
    name: "Ocean Sapphire & Blue",
    boardDark: "#2c5282",
    boardLight: "#bee3f8",
    tag: "Deep Sea",
  },
  {
    id: "emerald-mint",
    name: "Forest Emerald & Mint",
    boardDark: "#22543d",
    boardLight: "#c6f6d5",
    tag: "Nature Green",
  },
  {
    id: "obsidian-cream",
    name: "Obsidian Charcoal & Cream",
    boardDark: "#3e2723",
    boardLight: "#d7ccc8",
    tag: "Espresso Cream",
  },
  {
    id: "cyber-neon",
    name: "Synthwave Magenta & Cyan",
    boardDark: "#581c87",
    boardLight: "#f472b6",
    tag: "Neon Cyber",
  },
  {
    id: "nordic-frost",
    name: "Nordic Frost & Pale Gray",
    boardDark: "#4c566a",
    boardLight: "#d8dee9",
    tag: "Muted Frost",
  },
];

export interface CustomThemeSettings {
  uxMode: "preset" | "custom";
  uxBg: string;
  uxPanel: string;
  uxCard: string;
  uxBorder: string;
  uxText: string;
  uxAccent: string;
  boardDark: string;
  boardLight: string;
}

const STORAGE_KEY_UX = "luckai_ux_theme_id";
const STORAGE_KEY_BOARD = "luckai_board_theme_id";
const STORAGE_KEY_CUSTOM = "luckai_custom_theme_settings";

export function loadSavedUXTheme(): UXTheme {
  const savedId = localStorage.getItem(STORAGE_KEY_UX) || localStorage.getItem("luckai_theme_id");
  const found = PRESET_UX_THEMES.find((t) => t.id === savedId);
  return found || PRESET_UX_THEMES[0];
}

export function saveUXTheme(theme: UXTheme) {
  localStorage.setItem(STORAGE_KEY_UX, theme.id);
}

export function loadSavedBoardTheme(): BoardTheme {
  const savedId = localStorage.getItem(STORAGE_KEY_BOARD);
  const found = PRESET_BOARD_THEMES.find((t) => t.id === savedId);
  return found || PRESET_BOARD_THEMES[0];
}

export function saveBoardTheme(theme: BoardTheme) {
  localStorage.setItem(STORAGE_KEY_BOARD, theme.id);
}

export function loadCustomSettings(): CustomThemeSettings {
  try {
    const raw = localStorage.getItem(STORAGE_KEY_CUSTOM);
    if (raw) return JSON.parse(raw);
  } catch (e) {
    console.error("Failed to parse custom theme settings", e);
  }
  return {
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
}

export function saveCustomSettings(settings: CustomThemeSettings) {
  localStorage.setItem(STORAGE_KEY_CUSTOM, JSON.stringify(settings));
}
