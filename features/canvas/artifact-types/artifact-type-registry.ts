/**
 * Artifact type registry — THE single source of truth for "what types exist and
 * how they map / persist / render."
 *
 * Replaces the historically-duplicated type→canvasType maps that lived in
 * `materializable-types.ts` (ARTIFACT_TYPE_TO_CANVAS_TYPE + RENDER_TYPE_TO_CANVAS_TYPE)
 * and inline in `ArtifactBlock.tsx` (ARTIFACT_TO_CANVAS_TYPE, byte-identical to
 * the first). Every consumer — planMaterialization, ArtifactBlock, CanvasBody,
 * BlockRenderer — resolves through here.
 *
 * Wave A populates DATA + resolution. Later waves extend each def with the
 * single `Renderer`, `parse`, persistence `adapter`, and library mapping fields
 * (the optional fields below) without restructuring callers.
 */

import type { CanvasContentType } from "@/features/canvas/redux/canvasSlice";

export type ArtifactPersistenceStrategy = "custom" | "generic" | "none";

export interface ArtifactTypeDef {
  /** Canonical type — equals `canvas_items.type`. */
  canvasType: CanvasContentType;
  /**
   * Every spelling accepted in `<artifact type="…">` mode — the canonical name
   * plus synonyms (e.g. `progress`/`progress_tracker`, `comparison`/`comparison_table`).
   * Mirrors the old ARTIFACT_TYPE_TO_CANVAS_TYPE key set.
   */
  aliases: string[];
  /**
   * The exact splitter `block.type` spellings that materialize as a STANDALONE
   * block (NOT wrapped in `<artifact>`). Mirrors the old RENDER_TYPE_TO_CANVAS_TYPE
   * key set — note it uses the splitter forms (`progress_tracker`, not `progress`).
   * Empty = artifact-wrapper-only (bare `code`/`html`/`iframe`/`image` never
   * auto-materialize standalone).
   */
  standaloneAliases: string[];
  /** Whether this type is ever converted into a persisted artifact. */
  materializable: boolean;

  // ── Filled by later waves (optional now; no caller restructure needed) ──
  /** 'custom' → has its own domain table; 'generic' → state on the artifact. */
  persistenceStrategy?: ArtifactPersistenceStrategy;
  /** Adapter key into the persistence-adapter registry (Wave C/D). */
  adapter?: string;
}

export const ARTIFACT_TYPE_DEFS: ArtifactTypeDef[] = [
  { canvasType: "flashcards", aliases: ["flashcards"], standaloneAliases: ["flashcards"], materializable: true, persistenceStrategy: "custom", adapter: "flashcards" },
  { canvasType: "quiz", aliases: ["quiz"], standaloneAliases: ["quiz"], materializable: true, persistenceStrategy: "custom", adapter: "quiz" },
  { canvasType: "presentation", aliases: ["presentation"], standaloneAliases: ["presentation"], materializable: true },
  { canvasType: "timeline", aliases: ["timeline"], standaloneAliases: ["timeline"], materializable: true },
  { canvasType: "research", aliases: ["research"], standaloneAliases: ["research"], materializable: true },
  { canvasType: "resources", aliases: ["resources"], standaloneAliases: ["resources"], materializable: true },
  { canvasType: "progress", aliases: ["progress", "progress_tracker"], standaloneAliases: ["progress_tracker"], materializable: true },
  { canvasType: "troubleshooting", aliases: ["troubleshooting"], standaloneAliases: ["troubleshooting"], materializable: true },
  { canvasType: "decision-tree", aliases: ["decision-tree", "decision_tree"], standaloneAliases: ["decision_tree"], materializable: true },
  // NB: `comparison_table` is standalone-only — the old ARTIFACT_TYPE map never
  // listed it (only `comparison`), so artifact-mode keeps that exact behavior.
  { canvasType: "comparison", aliases: ["comparison"], standaloneAliases: ["comparison_table"], materializable: true },
  { canvasType: "diagram", aliases: ["diagram"], standaloneAliases: ["diagram"], materializable: true },
  { canvasType: "recipe", aliases: ["recipe", "cooking_recipe"], standaloneAliases: ["cooking_recipe"], materializable: true },
  { canvasType: "math_problem", aliases: ["math_problem"], standaloneAliases: ["math_problem"], materializable: true },
  { canvasType: "mermaid", aliases: ["mermaid"], standaloneAliases: ["mermaid"], materializable: true },
  // Self-contained visuals — durable, referenceable (like a diagram). A bare
  // ```svg / ```chart fence materializes; SvgBlock/ChartBlock parse the payload.
  { canvasType: "svg", aliases: ["svg"], standaloneAliases: ["svg"], materializable: true },
  { canvasType: "chart", aliases: ["chart"], standaloneAliases: ["chart"], materializable: true },
  // Interactive form — answers persist per-viewer to canvas_item_state (generic
  // adapter), so it materializes safely (no message-bound _matrxState).
  { canvasType: "questionnaire", aliases: ["questionnaire"], standaloneAliases: ["questionnaire"], materializable: true, persistenceStrategy: "generic" },
  // Data-touching (vision R7): NEVER auto-create. Materializes as a tracked
  // proposal; `TasksArtifact` converts to real `ctx_tasks` on explicit user
  // action, linked via the `platform.associations` bridge (source=`artifact` → target=`task`). No
  // artifact `adapter` → materialize never creates domain rows for tasks.
  { canvasType: "tasks", aliases: ["tasks", "task"], standaloneAliases: ["tasks"], materializable: true, persistenceStrategy: "custom" },
  // Deliverables — a webpage / a live component IS the artifact, so a bare
  // ```html / ```react (or ```jsx/```tsx → react) fence materializes.
  { canvasType: "html", aliases: ["html"], standaloneAliases: ["html"], materializable: true, persistenceStrategy: "custom", adapter: "html" },
  { canvasType: "react", aliases: ["react", "jsx", "tsx"], standaloneAliases: ["react"], materializable: true },
  // Structured data / durable content — persist as artifacts (nothing dies as
  // text). table is tabular data (your UDT-tables insight); transcript syncs to
  // the transcription system; tree is a hierarchy; structured_info = transcript
  // + tasks. Two-way domain sync is the adapter layer on top — see FEATURE.md.
  { canvasType: "table", aliases: ["table"], standaloneAliases: ["table"], materializable: true },
  { canvasType: "transcript", aliases: ["transcript"], standaloneAliases: ["transcript"], materializable: true },
  { canvasType: "structured_info", aliases: ["structured_info"], standaloneAliases: ["structured_info"], materializable: true },
  { canvasType: "tree", aliases: ["tree"], standaloneAliases: ["tree"], materializable: true },
  // Artifact-wrapper-only (a bare ```code fence / image must NOT auto-materialize
  // — they'd flood the library with throwaway snippets):
  { canvasType: "iframe", aliases: ["iframe"], standaloneAliases: [], materializable: true },
  { canvasType: "code", aliases: ["code"], standaloneAliases: [], materializable: true },
  { canvasType: "image", aliases: ["image"], standaloneAliases: [], materializable: true },
];

// ── Indexes ────────────────────────────────────────────────────────────────
const BY_CANVAS_TYPE = new Map<string, ArtifactTypeDef>();
const BY_ALIAS = new Map<string, ArtifactTypeDef>(); // artifact-mode (any alias)
const BY_STANDALONE_ALIAS = new Map<string, ArtifactTypeDef>(); // standalone only
for (const def of ARTIFACT_TYPE_DEFS) {
  BY_CANVAS_TYPE.set(def.canvasType, def);
  for (const alias of def.aliases) BY_ALIAS.set(alias, def);
  for (const alias of def.standaloneAliases) BY_STANDALONE_ALIAS.set(alias, def);
}

/** Look up a def by its canonical canvas type. */
export function getArtifactDef(canvasType: string): ArtifactTypeDef | undefined {
  return BY_CANVAS_TYPE.get(canvasType);
}

/**
 * Resolve the def a render block materializes as, or null if not materializable.
 * Byte-identical to the historical resolveCanvasType:
 *  - `<artifact type="X">` → alias table; bare `<artifact>` and unknown subtype → html.
 *  - standalone block → standalone alias table only.
 */
export function resolveArtifactDef(
  blockType: string,
  artifactType?: string,
): ArtifactTypeDef | null {
  if (blockType === "artifact") {
    if (!artifactType) return BY_CANVAS_TYPE.get("html") ?? null;
    return BY_ALIAS.get(artifactType) ?? BY_CANVAS_TYPE.get("html") ?? null;
  }
  return BY_STANDALONE_ALIAS.get(blockType) ?? null;
}

/** Canonical canvas type a block materializes as, or null. */
export function resolveCanvasType(
  blockType: string,
  artifactType?: string,
): CanvasContentType | null {
  return resolveArtifactDef(blockType, artifactType)?.canvasType ?? null;
}

export function isMaterializableRenderType(
  blockType: string,
  artifactType?: string,
): boolean {
  return resolveArtifactDef(blockType, artifactType) !== null;
}
