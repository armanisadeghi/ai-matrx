// features/kits/constants.ts — the product word, in ONE place.
//
// "Kits" is the working name (owner, 2026-09-25): the name is being put to Arman,
// so every visible use of the word reads from here and a rename is one edit.

export const KIT_WORD = {
  one: "Kit",
  many: "Kits",
  oneLower: "kit",
  manyLower: "kits",
} as const;

/** The one sentence a non-technical expert reads first. */
export const KITS_HERO =
  "A kit sets up a working example in one click: tables holding your information, an agent that reads them, and a workflow — so you can see how it fits together and make it yours.";

/** Where a kit lives in the catalog (`public.catalog_entries`). */
export const KIT_CATALOG = { app: "matrx", kind: "kit" } as const;

/** The table in each organization's record store where installs are recorded. */
export const KIT_INSTALLS_TABLE = {
  name: "Kit installs",
  slug: "kit_installs",
} as const;

export const KIT_ROUTES = {
  gallery: "/kits",
  detail: (key: string) => `/kits/${encodeURIComponent(key)}`,
  installed: (key: string) => `/kits/${encodeURIComponent(key)}/installed`,
  table: (tableId: string) => `/data-v2/${encodeURIComponent(tableId)}`,
  agent: (agentId: string) => `/agents/${encodeURIComponent(agentId)}`,
  // The workflow's own page (set it up, run it) — the registry's `hrefFor`. There is no
  // separate step/canvas editor route in this app; `/design` is the run-page designer.
  workflow: (workflowId: string) => `/workflows/${encodeURIComponent(workflowId)}`,
} as const;

/** The server door that renders a binding exactly as the agent will see it (PLAN.md § P1). */
export const BINDING_PREVIEW_PATH = "/agents/variable-bindings/preview";

/**
 * "Save as kit" limits. A knob-ready constant until the feature-knob row exists:
 * the most example rows a saved kit carries per table (the rest are left out and
 * the flow says so).
 */
export const KIT_SAVE = {
  seedRowCap: 200,
} as const;
