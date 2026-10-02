/**
 * Canvas-item agent-context builder.
 *
 * Publishes a pinned `canvas_items` row into `instanceContext` as a rich
 * mutable value so the agent can `ctx_get` / `ctx_patch` it. The context KEY
 * is the canvas UUID itself — the one and only canonical identity (same id
 * as the R1 `<artifact id>` tag, the version chain, and R8's index).
 *
 * Mirrors `workingDocumentContext.ts`: `mutable: true` + `persist: "auto"` +
 * `source.kind = "canvas_item"` routes agent edits through the aidream
 * `@register_writeback("canvas_item")` handler → `cx_canvas_save_user_version`.
 */

import { isMaterializedArtifactId } from "@/features/canvas/artifact-types/artifactId";

export const CANVAS_ITEM_SOURCE_KIND = "canvas_item";

export interface CanvasItemContextSource {
  kind: typeof CANVAS_ITEM_SOURCE_KIND;
  id: string;
  field: "content";
  /** Optimistic-concurrency token — the version the client last published. */
  base_version: number;
}

export interface CanvasItemContextValue {
  content: string;
  mutable: true;
  persist: "auto";
  type: "text";
  label: string;
  description: string;
  source: CanvasItemContextSource;
  /**
   * Large code/json bodies stay behind ctx_get so they don't bloat the
   * inline manifest. The agent always has the id from the key + R8 index.
   */
  max_inline_chars: number;
}

const DESCRIPTION =
  "A pinned conversation artifact (code or JSON). Read with ctx_get on this " +
  "key (the artifact UUID). Apply every change with ctx_patch — edits save as " +
  "a new version of the same artifact. Do NOT recreate it; extend or edit it.";

export function isCanvasItemContextKey(
  key: string | null | undefined,
): boolean {
  return isMaterializedArtifactId(key);
}

export function isCanvasItemContextValue(
  value: unknown,
): value is CanvasItemContextValue {
  if (!value || typeof value !== "object") return false;
  const v = value as Record<string, unknown>;
  const source = v.source as Record<string, unknown> | undefined;
  return (
    source?.kind === CANVAS_ITEM_SOURCE_KIND &&
    typeof source.id === "string" &&
    isMaterializedArtifactId(source.id) &&
    typeof v.content === "string"
  );
}

export function buildCanvasItemContextValue(args: {
  artifactId: string;
  content: string;
  label: string;
  version: number;
}): CanvasItemContextValue {
  const { artifactId, content, label, version } = args;
  if (!isMaterializedArtifactId(artifactId)) {
    throw new Error(
      `buildCanvasItemContextValue: artifactId must be a canvas UUID, got ${artifactId}`,
    );
  }
  return {
    content,
    mutable: true,
    persist: "auto",
    type: "text",
    label: label.trim() || "Code artifact",
    description: DESCRIPTION,
    source: {
      kind: CANVAS_ITEM_SOURCE_KIND,
      id: artifactId,
      field: "content",
      base_version: version,
    },
    max_inline_chars: 0,
  };
}
