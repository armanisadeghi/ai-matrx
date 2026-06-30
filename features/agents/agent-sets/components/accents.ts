// features/agents/agent-sets/components/accents.ts
//
// Resolves a set's `accent` key into Tailwind class fragments for its identity
// surfaces (orchestrator glyph, card header gradient, member ring, chips). These
// are decorative IDENTITY colors (intentionally vivid — sets are meant to feel
// distinct), kept dark-mode-aware. Semantic surface tokens (bg-card etc.) still
// own structure; accents only tint identity.

import { DEFAULT_SET_ACCENT, type SetAccent } from "../constants";

export interface AccentClasses {
  /** Filled glyph square (orchestrator node + set card icon). */
  glyph: string;
  /** Soft tinted surface (member node header, chips). */
  soft: string;
  /** Ring/border tint for selected/active state. */
  ring: string;
  /** Foreground text tint. */
  text: string;
  /** Edge stroke color (React Flow connector) as a CSS color value. */
  stroke: string;
  /** Small solid dot (legend / avatars). */
  dot: string;
  /** Header gradient for the set card. */
  gradient: string;
}

const MAP: Record<SetAccent, AccentClasses> = {
  violet: {
    glyph: "bg-violet-500 text-white",
    soft: "bg-violet-500/10 dark:bg-violet-400/10",
    ring: "ring-violet-500/40",
    text: "text-violet-600 dark:text-violet-300",
    stroke: "var(--color-violet-500, #8b5cf6)",
    dot: "bg-violet-500",
    gradient: "from-violet-500/20 to-fuchsia-500/5",
  },
  blue: {
    glyph: "bg-blue-500 text-white",
    soft: "bg-blue-500/10 dark:bg-blue-400/10",
    ring: "ring-blue-500/40",
    text: "text-blue-600 dark:text-blue-300",
    stroke: "var(--color-blue-500, #3b82f6)",
    dot: "bg-blue-500",
    gradient: "from-blue-500/20 to-cyan-500/5",
  },
  emerald: {
    glyph: "bg-emerald-500 text-white",
    soft: "bg-emerald-500/10 dark:bg-emerald-400/10",
    ring: "ring-emerald-500/40",
    text: "text-emerald-600 dark:text-emerald-300",
    stroke: "var(--color-emerald-500, #10b981)",
    dot: "bg-emerald-500",
    gradient: "from-emerald-500/20 to-teal-500/5",
  },
  amber: {
    glyph: "bg-amber-500 text-white",
    soft: "bg-amber-500/10 dark:bg-amber-400/10",
    ring: "ring-amber-500/40",
    text: "text-amber-600 dark:text-amber-300",
    stroke: "var(--color-amber-500, #f59e0b)",
    dot: "bg-amber-500",
    gradient: "from-amber-500/20 to-orange-500/5",
  },
  rose: {
    glyph: "bg-rose-500 text-white",
    soft: "bg-rose-500/10 dark:bg-rose-400/10",
    ring: "ring-rose-500/40",
    text: "text-rose-600 dark:text-rose-300",
    stroke: "var(--color-rose-500, #f43f5e)",
    dot: "bg-rose-500",
    gradient: "from-rose-500/20 to-pink-500/5",
  },
  cyan: {
    glyph: "bg-cyan-500 text-white",
    soft: "bg-cyan-500/10 dark:bg-cyan-400/10",
    ring: "ring-cyan-500/40",
    text: "text-cyan-600 dark:text-cyan-300",
    stroke: "var(--color-cyan-500, #06b6d4)",
    dot: "bg-cyan-500",
    gradient: "from-cyan-500/20 to-sky-500/5",
  },
  fuchsia: {
    glyph: "bg-fuchsia-500 text-white",
    soft: "bg-fuchsia-500/10 dark:bg-fuchsia-400/10",
    ring: "ring-fuchsia-500/40",
    text: "text-fuchsia-600 dark:text-fuchsia-300",
    stroke: "var(--color-fuchsia-500, #d946ef)",
    dot: "bg-fuchsia-500",
    gradient: "from-fuchsia-500/20 to-purple-500/5",
  },
  indigo: {
    glyph: "bg-indigo-500 text-white",
    soft: "bg-indigo-500/10 dark:bg-indigo-400/10",
    ring: "ring-indigo-500/40",
    text: "text-indigo-600 dark:text-indigo-300",
    stroke: "var(--color-indigo-500, #6366f1)",
    dot: "bg-indigo-500",
    gradient: "from-indigo-500/20 to-blue-500/5",
  },
};

export function accentClasses(accent: SetAccent | undefined | null): AccentClasses {
  return MAP[(accent as SetAccent) ?? DEFAULT_SET_ACCENT] ?? MAP[DEFAULT_SET_ACCENT];
}
