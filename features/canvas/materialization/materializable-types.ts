/**
 * Materializable artifact types — single source of truth.
 *
 * Maps the render-block / splitter type (and `<artifact type="…">` subtype) onto
 * the `canvas_items.type` it persists as. ONLY types listed here are
 * materialized into `canvas_items`; everything else (plain text, thinking,
 * tool calls, tables, dividers, trees, bare code) stays inline in the message.
 *
 * This is the seed of the broader type-registry unification (audit P2-1): the
 * artifact-type→canvas-type map historically lived inline in ArtifactBlock; it
 * now lives here so streaming, reload, canvas, and materialization agree.
 */

import type { CanvasContentType } from "@/features/canvas/redux/canvasSlice";

/**
 * `<artifact type="X">` subtype → canvas content type.
 * Mirrors (and supersedes) the old inline map in ArtifactBlock.tsx.
 */
export const ARTIFACT_TYPE_TO_CANVAS_TYPE: Record<string, CanvasContentType> = {
  iframe: "iframe",
  html: "html",
  code: "code",
  diagram: "diagram",
  flashcards: "flashcards",
  quiz: "quiz",
  presentation: "presentation",
  timeline: "timeline",
  research: "research",
  comparison: "comparison",
  image: "image",
  troubleshooting: "troubleshooting",
  "decision-tree": "decision-tree",
  decision_tree: "decision-tree",
  recipe: "recipe",
  cooking_recipe: "recipe",
  resources: "resources",
  progress: "progress",
  progress_tracker: "progress",
  math_problem: "math_problem",
};

/**
 * Standalone render-block / splitter type (NOT `<artifact>`-wrapped) → canvas
 * content type. These are the structured app-like blocks a model emits directly
 * (e.g. `<flashcards>`, a quiz JSON object). Plain `code`/`table`/`image`/etc.
 * are intentionally absent — they are not materialized unless wrapped in an
 * explicit `<artifact>`.
 */
export const RENDER_TYPE_TO_CANVAS_TYPE: Record<string, CanvasContentType> = {
  flashcards: "flashcards",
  quiz: "quiz",
  presentation: "presentation",
  timeline: "timeline",
  research: "research",
  resources: "resources",
  progress_tracker: "progress",
  troubleshooting: "troubleshooting",
  decision_tree: "decision-tree",
  comparison_table: "comparison",
  diagram: "diagram",
  cooking_recipe: "recipe",
  math_problem: "math_problem",
};

/**
 * Resolve the canvas type a render block would materialize as, or null if the
 * block is not materializable. `artifactType` is the `<artifact type="…">`
 * attribute (only present on `artifact` blocks).
 */
export function resolveCanvasType(
  blockType: string,
  artifactType?: string,
): CanvasContentType | null {
  if (blockType === "artifact") {
    if (!artifactType) return "html"; // bare <artifact> → html default (matches ArtifactBlock)
    return ARTIFACT_TYPE_TO_CANVAS_TYPE[artifactType] ?? "html";
  }
  return RENDER_TYPE_TO_CANVAS_TYPE[blockType] ?? null;
}

export function isMaterializableRenderType(
  blockType: string,
  artifactType?: string,
): boolean {
  return resolveCanvasType(blockType, artifactType) !== null;
}
