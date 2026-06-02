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

// Node sizing: scale by degree/mention so the densest hubs read as bigger.
export const KG_NODE_MIN_SIZE = 18;
export const KG_NODE_MAX_SIZE = 64;

// Default request shaping.
export const KG_DEFAULT_LIMIT = 500;
export const KG_DEFAULT_DEPTH = 2;
export const KG_MAX_DEPTH = 3;
