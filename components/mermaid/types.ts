/**
 * Shared types for the Mermaid system.
 *
 * The mermaid library itself is ONLY imported (dynamically) by runtime.ts.
 * Everything else in components/mermaid/ stays mermaid-free so it can load
 * in the initial bundle without dragging the ~2MB engine along.
 */

console.log(
  "%c[MERMAID IMPORT TEST] components/mermaid/types.ts",
  "color: #fff; background: #7c3aed; font-weight: bold; padding: 2px 6px; border-radius: 3px;",
);

export type MermaidTheme = "default" | "dark" | "forest" | "neutral" | "base";
export type MermaidThemePreference = "auto" | MermaidTheme;
export type MermaidLook = "classic" | "handDrawn";
export type MermaidLayout = "dagre" | "elk";

/** Resolved options handed to the render engine (no "auto" — already resolved). */
export interface MermaidRenderOptions {
  theme: MermaidTheme;
  look: MermaidLook;
  layout: MermaidLayout;
}

/** User-facing option set; theme may be "auto" (follows app dark/light mode). */
export interface MermaidOptionPreferences {
  theme: MermaidThemePreference;
  look: MermaidLook;
  layout: MermaidLayout;
}

export const DEFAULT_MERMAID_PREFERENCES: MermaidOptionPreferences = {
  theme: "auto",
  look: "classic",
  layout: "dagre",
};

/** Per-artifact metadata persisted in canvas_items.content.metadata. */
export interface MermaidArtifactMetadata {
  diagramType?: string;
  title?: string;
  theme?: MermaidThemePreference;
  look?: MermaidLook;
  layout?: MermaidLayout;
  [key: string]: unknown;
}

export function resolveMermaidTheme(
  pref: MermaidThemePreference,
  appMode: "light" | "dark",
): MermaidTheme {
  if (pref !== "auto") return pref;
  return appMode === "dark" ? "dark" : "default";
}

/** Stable string key for a render-options combination (config re-init gate). */
export function renderOptionsKey(opts: MermaidRenderOptions): string {
  return `${opts.theme}|${opts.look}|${opts.layout}`;
}
