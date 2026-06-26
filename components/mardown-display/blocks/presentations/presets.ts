/**
 * Deck presets — named "templates" the agent (via `theme.preset`) or the viewer
 * (via the picker) can choose for a complete, on-brand look. A preset bundles a
 * visual tier (variant), an accent palette, and a font family. This is the
 * structured-template approach: distinct, curated looks without losing the
 * editable/exportable structure (vs. free-form HTML).
 *
 * Precedence:
 *   - `resolveDeckTheme(theme)` — preset is the BASE; explicit theme fields win
 *     (so an agent can pick "editorial" and still override one color).
 *   - `presetTheme(key)` — the PURE preset (used by the live picker so the
 *     viewer sees the unmodified look).
 */

import type { SlideTheme, SlideVariant } from "./SlideView";

export type DeckFont = "sans" | "serif" | "display";

export interface SlidePreset {
  key: string;
  name: string;
  description: string;
  variant: SlideVariant;
  primaryColor: string;
  secondaryColor: string;
  accentColor: string;
  textColor: string;
  font: DeckFont;
}

export const SLIDE_PRESETS: Record<string, SlidePreset> = {
  classic: {
    key: "classic",
    name: "Classic",
    description: "Clean indigo–violet. Professional default.",
    variant: "fancy",
    primaryColor: "#4F46E5",
    secondaryColor: "#7C3AED",
    accentColor: "#06B6D4",
    textColor: "#0F172A",
    font: "sans",
  },
  corporate: {
    key: "corporate",
    name: "Corporate",
    description: "Conservative slate & blue — trustworthy, restrained.",
    variant: "fancy",
    primaryColor: "#1D4ED8",
    secondaryColor: "#0F766E",
    accentColor: "#0EA5E9",
    textColor: "#0F172A",
    font: "sans",
  },
  editorial: {
    key: "editorial",
    name: "Editorial",
    description: "Magazine feel — ink & amber, serif headings.",
    variant: "fancy",
    primaryColor: "#7C2D12",
    secondaryColor: "#B45309",
    accentColor: "#D97706",
    textColor: "#1C1917",
    font: "serif",
  },
  bold: {
    key: "bold",
    name: "Bold",
    description: "High-energy rose–violet, big type + imagery.",
    variant: "deluxe",
    primaryColor: "#E11D48",
    secondaryColor: "#9333EA",
    accentColor: "#F59E0B",
    textColor: "#0F172A",
    font: "display",
  },
  minimal: {
    key: "minimal",
    name: "Minimal",
    description: "Lots of whitespace, one quiet accent. Understated.",
    variant: "generic",
    primaryColor: "#111827",
    secondaryColor: "#374151",
    accentColor: "#6366F1",
    textColor: "#111827",
    font: "sans",
  },
  midnight: {
    key: "midnight",
    name: "Midnight",
    description: "Neon cyan–violet — vivid, modern, image-forward.",
    variant: "deluxe",
    primaryColor: "#6366F1",
    secondaryColor: "#8B5CF6",
    accentColor: "#22D3EE",
    textColor: "#0B1020",
    font: "display",
  },
  ocean: {
    key: "ocean",
    name: "Ocean",
    description: "Fresh teal & sky — calm and clear.",
    variant: "fancy",
    primaryColor: "#0E7490",
    secondaryColor: "#0284C7",
    accentColor: "#14B8A6",
    textColor: "#0F172A",
    font: "sans",
  },
  sunset: {
    key: "sunset",
    name: "Sunset",
    description: "Warm amber–rose, image-rich.",
    variant: "deluxe",
    primaryColor: "#EA580C",
    secondaryColor: "#DB2777",
    accentColor: "#F59E0B",
    textColor: "#1C1917",
    font: "display",
  },
  forest: {
    key: "forest",
    name: "Forest",
    description: "Grounded emerald — natural, steady.",
    variant: "fancy",
    primaryColor: "#047857",
    secondaryColor: "#65A30D",
    accentColor: "#10B981",
    textColor: "#0F172A",
    font: "sans",
  },
  mono: {
    key: "mono",
    name: "Mono",
    description: "Grayscale with a single bold accent. Restrained.",
    variant: "generic",
    primaryColor: "#0F172A",
    secondaryColor: "#475569",
    accentColor: "#2563EB",
    textColor: "#0F172A",
    font: "sans",
  },
};

/** Ordered list for pickers / menus. */
export const PRESET_LIST: SlidePreset[] = [
  "classic",
  "corporate",
  "editorial",
  "bold",
  "minimal",
  "midnight",
  "ocean",
  "sunset",
  "forest",
  "mono",
].map((k) => SLIDE_PRESETS[k]);

function presetToTheme(p: SlidePreset): SlideTheme {
  return {
    variant: p.variant,
    primaryColor: p.primaryColor,
    secondaryColor: p.secondaryColor,
    accentColor: p.accentColor,
    textColor: p.textColor,
    font: p.font,
  };
}

/** CSS font-family for a deck font hint (serif decks read editorial). */
export function deckFontFamily(font: string | undefined): string | undefined {
  if (font === "serif") return "ui-serif, Georgia, Cambria, 'Times New Roman', serif";
  return undefined; // sans / display inherit the UI sans stack
}

/** The pure preset look (live picker). Unknown key → classic. */
export function presetTheme(key: string | null | undefined): SlideTheme {
  const p = (key && SLIDE_PRESETS[String(key).toLowerCase()]) || SLIDE_PRESETS.classic;
  return presetToTheme(p);
}

/**
 * Merge a deck's theme with its named preset. The preset is the base; any
 * explicit field on the deck's theme overrides it. No preset → theme as-is.
 */
export function resolveDeckTheme(theme: (SlideTheme & { preset?: string }) | undefined | null): SlideTheme {
  const t = theme ?? {};
  const preset = t.preset ? SLIDE_PRESETS[String(t.preset).toLowerCase()] : undefined;
  if (!preset) return t;
  const base = presetToTheme(preset);
  return {
    variant: (t.variant as SlideVariant) ?? base.variant,
    primaryColor: t.primaryColor ?? base.primaryColor,
    secondaryColor: t.secondaryColor ?? base.secondaryColor,
    accentColor: t.accentColor ?? base.accentColor,
    backgroundColor: t.backgroundColor ?? base.backgroundColor,
    textColor: t.textColor ?? base.textColor,
    font: t.font ?? base.font,
  };
}
