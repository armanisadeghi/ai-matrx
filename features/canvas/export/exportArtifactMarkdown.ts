/**
 * exportArtifactMarkdown — the FORWARD leg of the artifact ⇄ markdown
 * two-way layer (see ../docs/TWO_WAY_BINDING.md).
 *
 * Any persisted `canvas_items` row → clean human-readable markdown: the
 * user's "give me my content back" escape hatch AND the "share this with
 * an AI / a person" export, one primitive.
 *
 * - STRUCTURED content (Track 2B: `content.data` is the zero-loss value
 *   object self-describing via `__kind`) routes to the kind registry's
 *   `toMarkdown` facet; kinds without one (and unregistered kinds) fall
 *   back to `genericKindMarkdown` (heading + fenced json — honest, zero
 *   loss).
 * - STRING content returns as-is: it already IS markdown / wire text (the
 *   model authored it; html/code/mermaid strings are their own content).
 *
 * PURE — no IO, no Redux, no React. Callers own clipboard / download / UI.
 */

import { readObjectKind } from "@/features/content-ir/core/kind-schema.types";
import { genericKindMarkdown } from "@/features/content-ir/kinds/kind-markdown-utils";
import { kindRegistry } from "@/features/content-ir/registry/kind-registry";
import type { CanvasArtifactRow } from "@/features/canvas/services/canvasArtifactService";

export interface ArtifactMarkdownExport {
  markdown: string;
  title: string;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/**
 * A self-describing kind value object → markdown via the registry facet.
 * `fallbackKind` names the generic dump's heading when the value carries no
 * `__kind` (off-contract but must never break an export).
 */
export function kindValueToMarkdown(
  value: Record<string, unknown>,
  fallbackKind = "artifact",
): string {
  const kind = readObjectKind(value);
  if (!kind) return genericKindMarkdown(fallbackKind, value);
  const def = kindRegistry.getDefinition(kind);
  try {
    return def?.toMarkdown?.(value) ?? genericKindMarkdown(kind, value);
  } catch {
    // A facet must never make content unexportable — degrade to the dump.
    return genericKindMarkdown(kind, value);
  }
}

/**
 * An artifact's raw payload STRING → markdown. Structured payloads travel
 * as compact JSON strings on the wire (and `ArtifactRefBlock` re-stringifies
 * `content.data` the same way), so a string that parses to a self-describing
 * kind object routes through the kind facet; everything else IS the
 * markdown / wire text and passes through untouched.
 */
export function artifactContentToMarkdown(
  content: string,
  fallbackKind = "artifact",
): string {
  const trimmed = content.trim();
  if (trimmed.startsWith("{")) {
    try {
      const parsed: unknown = JSON.parse(trimmed);
      if (isRecord(parsed) && readObjectKind(parsed)) {
        return kindValueToMarkdown(parsed, fallbackKind);
      }
    } catch {
      // Not JSON — it's text content; fall through.
    }
  }
  return content;
}

/**
 * The export primitive: a `canvas_items` row → `{ markdown, title }`.
 *
 * `row.content` is stored as `{ data, type?, metadata? }` (or, defensively,
 * a bare string / object from pre-normalization writes — same unwrapping as
 * `ArtifactRefBlock`).
 */
export function exportArtifactMarkdown(
  row: CanvasArtifactRow,
): ArtifactMarkdownExport {
  const stored: unknown = row.content;
  const data =
    isRecord(stored) && "data" in stored ? stored.data : stored;

  const metadata =
    isRecord(stored) && isRecord(stored.metadata) ? stored.metadata : null;
  const title =
    (typeof row.title === "string" && row.title.trim() !== ""
      ? row.title
      : null) ??
    (metadata && typeof metadata.title === "string" && metadata.title !== ""
      ? metadata.title
      : null) ??
    "Artifact";

  const fallbackKind = row.type || "artifact";

  if (isRecord(data)) {
    return { markdown: kindValueToMarkdown(data, fallbackKind), title };
  }
  if (typeof data === "string") {
    return { markdown: artifactContentToMarkdown(data, fallbackKind), title };
  }
  // null / array / scalar — off-contract, but the export never dead-ends.
  return {
    markdown: genericKindMarkdown(fallbackKind, { value: data ?? null }),
    title,
  };
}
