// features/kg-graph/constants.ts
//
// Visual language for the cytoscape KG canvas. Borrowed from the color approach
// in `features/administration/schema-visualizer/SchemaNode.tsx` (semantic-ish
// per-kind hues), but expressed as raw hex because cytoscape's stylesheet runs
// outside the Tailwind/React tree and can't consume `bg-*` classes or CSS vars.
//
// Two families:
//  - NER entity kinds (person / organization / … ) — the product-facing graph.
//  - code-graph kinds (module / symbol_* / unresolved_symbol / code_file) —
//    the 677 existing rows, so the org-wide view renders meaningfully today
//    before NER backfill fills the semantic kinds.
//
// Because the stylesheet can't read CSS vars, every theme-dependent chrome color
// (labels, halos, edges, selection rings) is resolved here per `ThemeMode` and
// applied live on theme toggle via `cy.style().fromJson(...).update()`.

import type { ThemeMode } from "@/styles/themes/types";

export const KG_NODE_COLORS: Record<string, string> = {
  // NER entity kinds (Phase C schema)
  person: "#6366f1", // indigo
  organization: "#0ea5e9", // sky
  address: "#14b8a6", // teal
  phone: "#f59e0b", // amber
  email: "#ec4899", // pink
  url: "#8b5cf6", // violet
  date: "#84cc16", // lime
  concept: "#10b981", // emerald

  // code-graph kinds (existing corpus)
  module: "#3b82f6", // blue
  code_file: "#2563eb", // blue-600
  symbol_function_definition: "#22c55e", // green
  symbol_class_definition: "#a855f7", // purple
  symbol_decorated_definition: "#7c3aed", // violet-600
  unresolved_symbol: "#94a3b8", // slate-400
};

/** Fallback hue for any kind not in the map. */
export const KG_NODE_FALLBACK_COLOR = "#64748b"; // slate-500

export function colorForKind(kind: string): string {
  return KG_NODE_COLORS[kind] ?? KG_NODE_FALLBACK_COLOR;
}

// ── Theme-aware chrome ──────────────────────────────────────────────────────
// The per-kind node hues above read fine on either background, but the *chrome*
// (label text, the halo behind it, edges, selection rings) must flip with the
// theme or it's illegible — light-gray labels vanish on a white canvas, and a
// near-white selection ring vanishes too. Labels get a contrasting `text-outline`
// halo so they stay readable even when they overlap a node or a dense edge mat.

export interface KgChromeTheme {
  /** Label text color. */
  label: string;
  /** Halo drawn around label text (text-outline) — contrasts the label. */
  labelHalo: string;
  /** Label color for a selected/highlighted node. */
  labelSelected: string;
  /** Subtle ring that lifts a node off the canvas. */
  nodeBorder: string;
  /** Selection ring color. */
  selectedRing: string;
  /** Resting edge color. */
  edge: string;
  /** Edge color when incident to the selection. */
  edgeSelected: string;
  /** Opacity for faded (out-of-focus) elements during neighbor highlight. */
  fadedOpacity: number;
}

export const KG_CHROME: Record<ThemeMode, KgChromeTheme> = {
  dark: {
    label: "#e2e8f0", // slate-200 — readable on the dark textured canvas
    labelHalo: "#0b0f17", // near-black halo cuts the text out of busy areas
    labelSelected: "#ffffff",
    nodeBorder: "#0b0f17",
    selectedRing: "#f8fafc", // slate-50
    edge: "#475569", // slate-600
    edgeSelected: "#cbd5e1", // slate-300
    fadedOpacity: 0.12,
  },
  light: {
    label: "#1e293b", // slate-800 — readable on the light canvas
    labelHalo: "#ffffff", // white halo lifts dark text off pale nodes/edges
    labelSelected: "#0f172a", // slate-900
    nodeBorder: "#ffffff",
    selectedRing: "#0f172a",
    edge: "#94a3b8", // slate-400 — softer than slate-600 on white
    edgeSelected: "#475569", // slate-600
    fadedOpacity: 0.1,
  },
};

export function kgChrome(mode: ThemeMode): KgChromeTheme {
  return KG_CHROME[mode];
}

// Node sizing: scale by degree/mention so the densest hubs read as bigger.
export const KG_NODE_MIN_SIZE = 18;
export const KG_NODE_MAX_SIZE = 64;

// Default request shaping.
export const KG_DEFAULT_LIMIT = 500;
export const KG_DEFAULT_DEPTH = 2;
export const KG_MAX_DEPTH = 3;
