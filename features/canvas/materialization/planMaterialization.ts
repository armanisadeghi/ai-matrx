/**
 * planMaterialization — pure transform from a committed `cx_message.content`
 * array into (a) the artifacts to persist and (b) the rewritten content with
 * each NEW materializable render-block replaced by its canonical id-bearing form
 * (vision R1): `<artifact type="X" id="<uuid>" version="N">body</artifact>` —
 * plain text the model reads natively and the UI renders by id.
 *
 * Because the id is only known after the canvas upsert, NEW artifacts are emitted
 * here as `ArtifactPendingMarker` placeholders carrying their `artifactIndex`;
 * the orchestrator fills the real UUID and serializes them to text.
 *
 * PURE (no I/O) so it runs identically at stream-end and during reconcile.
 *
 * Idempotency (R3): a `<artifact>` whose id is already a real canvas UUID is
 * recognized as MATERIALIZED and passed through untouched — it is not counted as
 * a new artifact, so a fully-materialized message yields `hasChanges: false` and
 * the orchestrator skips the rewrite entirely. Indices are assigned by stable
 * left-to-right position over ALL materializable artifacts (materialized + new),
 * matching the `(source_system, source_id, artifact_index)` natural key.
 *
 * STRUCTURED (kind-IR) blocks (Track 2B): a JSON region whose resolved
 * `__kind` maps to a registered `ArtifactTypeDef.kinds` entry plans with a
 * `structured` value object (persisted as `content.data`, zero reprocessing
 * on reload) — detected via the block's `metadata.__ir` envelope when present,
 * else by parsing the JSON root. String-payload planning is unchanged.
 */

import type {
  CxContentBlock,
  CxTextContent,
} from "@/features/public-chat/types/cx-tables";
import { splitContentIntoBlocksV2 } from "@/components/mardown-display/markdown-classification/processors/utils/content-splitter-v2";
import { reconstructBlockMarkdown } from "@/features/agents/redux/execution-system/utils/assemble-cx-content-blocks";
import { getCatalogEntry } from "@/components/mermaid/catalog";
import {
  detectDiagramType,
  extractMermaidTitle,
} from "@/components/mermaid/diagram-type";
import {
  resolveCanvasType,
  resolveArtifactDefByKind,
  type ArtifactTypeDef,
} from "@/features/canvas/artifact-types/artifact-type-registry";
import { isMaterializedArtifactId } from "@/features/canvas/artifact-types/artifactId";
import {
  readEnvelope,
  reconstructRegionValue,
} from "@/features/content-ir/redux/render-block-envelope";
import { readObjectKind } from "@/features/content-ir/core/kind-schema.types";
import { wrapArtifactText } from "./artifactWire";

export interface PlannedArtifact {
  /** Stable 1-based order within the message (= canvas_items.artifact_index). */
  artifactIndex: number;
  /** canvas_items.type. */
  canvasType: string;
  title: string;
  /** Raw payload string the type's renderer consumes (markdown or JSON). */
  content: string;
  /**
   * Structured (kind-IR) value for kind-detected JSON blocks — persisted AS
   * `canvas_items.content.data` (an object carrying `__kind`, zero
   * reprocessing on reload) instead of the string. `content` still carries
   * the compact canonical JSON for the message wire form. Absent for
   * string-payload types.
   */
  structured?: Record<string, unknown>;
  /** Type-specific metadata persisted into canvas_items.content.metadata. */
  metadata?: Record<string, unknown>;
}

/**
 * Internal placeholder for a NEW artifact in the rewritten content. Replaced by
 * the orchestrator with a `{type:"text"}` block carrying the canonical R1 tag
 * once the canvas upsert returns the real id/version. Never persisted.
 */
export interface ArtifactPendingMarker {
  __artifactPending: true;
  artifactIndex: number;
}

export function isArtifactPending(
  b: CxContentBlock | ArtifactPendingMarker,
): b is ArtifactPendingMarker {
  return (b as ArtifactPendingMarker).__artifactPending === true;
}

export interface MaterializationPlan {
  /** Artifacts to upsert, in message order. Empty when nothing materializes. */
  artifacts: PlannedArtifact[];
  /**
   * Rewritten content. NEW artifacts are `ArtifactPendingMarker`s (id filled by
   * the orchestrator); everything else is preserved as text runs + passthrough
   * non-text blocks. Only consumed when `hasChanges` is true.
   */
  rewrittenBlocks: (CxContentBlock | ArtifactPendingMarker)[];
  /** True when at least one NEW artifact was found to materialize. */
  hasChanges: boolean;
}

function isTextBlock(b: CxContentBlock): b is CxTextContent {
  return (b as { type?: string }).type === "text";
}

function titleFor(
  blockType: string,
  metadata: Record<string, unknown> | undefined,
  index: number,
): string {
  const t = metadata?.artifactTitle;
  if (typeof t === "string" && t.trim()) return t.trim();
  const label = blockType
    .replace(/_/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase());
  return `${label} ${index}`;
}

function firstNonEmptyString(...values: unknown[]): string | null {
  for (const v of values) {
    if (typeof v === "string" && v.trim()) return v.trim();
  }
  return null;
}

interface StructuredDetection {
  def: ArtifactTypeDef;
  kind: string;
  /** Zero-loss value object (carries `__kind` — self-describing). */
  structured: Record<string, unknown>;
}

/**
 * Detect a STRUCTURED (kind-IR) artifact in a splitter block (Track 2B).
 *
 * Two routes, both PURE:
 *  1. Envelope: the splitter attached `metadata.__ir` and the kind parser
 *     RESOLVED a registered kind → reconstruct the zero-loss value (residue
 *     extras merged back in).
 *  2. Parsed root: no envelope (flag off / legacy payload), but the block is
 *     a JSON object whose root carries `__kind` matching a registered kind.
 *
 * Returns null for anything else — string-payload planning is unchanged.
 */
function detectStructuredArtifact(sb: {
  type: string;
  content?: string;
  language?: string;
  metadata?: Record<string, unknown>;
}): StructuredDetection | null {
  const envelope = readEnvelope(sb.metadata);
  if (
    envelope &&
    envelope.root.kind &&
    envelope.root.kindState === "resolved" &&
    envelope.root.status === "complete"
  ) {
    const def = resolveArtifactDefByKind(envelope.root.kind);
    if (def?.materializable) {
      return {
        def,
        kind: envelope.root.kind,
        structured: reconstructRegionValue(envelope),
      };
    }
  }

  // Parse fallback — only for JSON blocks (fenced ```json or bare-object
  // regions; the splitter stamps language "json" on both).
  if (sb.type !== "code" || sb.language !== "json") return null;
  const raw = (sb.content ?? "").trim();
  if (!raw.startsWith("{") || !raw.endsWith("}")) return null;
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return null;
  }
  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
    return null;
  }
  const kind = readObjectKind(parsed as Record<string, unknown>);
  if (!kind) return null;
  const def = resolveArtifactDefByKind(kind);
  if (!def?.materializable) return null;
  return { def, kind, structured: parsed as Record<string, unknown> };
}

export function planMaterialization(
  content: CxContentBlock[],
): MaterializationPlan {
  const rewritten: (CxContentBlock | ArtifactPendingMarker)[] = [];
  const artifacts: PlannedArtifact[] = [];

  // Left-to-right position over EVERY materializable artifact (already-
  // materialized + new). New artifacts take their position as artifact_index.
  let position = 0;

  // Accumulates faithful markdown for consecutive non-pending content so it
  // collapses back into a single text block between pending markers.
  let textRun = "";
  const appendText = (s: string) => {
    if (!s) return;
    if (textRun.length > 0) textRun += "\n\n";
    textRun += s;
  };
  const flushTextRun = () => {
    if (textRun.length > 0) {
      rewritten.push({ type: "text", text: textRun } as CxTextContent);
      textRun = "";
    }
  };

  for (const block of content) {
    // Non-text blocks (thinking, tool_call, media, …) pass through verbatim —
    // they are never raw artifact markup.
    if (!isTextBlock(block)) {
      flushTextRun();
      rewritten.push(block);
      continue;
    }

    const text = block.text ?? "";
    if (!text) continue;

    const splitterBlocks = splitContentIntoBlocksV2(text);
    for (const sb of splitterBlocks) {
      const artifactType =
        typeof sb.metadata?.artifactType === "string"
          ? (sb.metadata.artifactType as string)
          : undefined;
      const canvasType = resolveCanvasType(sb.type, artifactType);

      // Already materialized (R3): a `<artifact>` carrying a real canvas UUID.
      // Pass it through verbatim and DON'T re-materialize. Still counts toward
      // position so later new artifacts get a non-colliding index. Checked
      // FIRST so a materialized structured body is never re-detected.
      const existingId =
        typeof sb.metadata?.artifactId === "string"
          ? (sb.metadata.artifactId as string)
          : undefined;
      if (
        sb.type === "artifact" &&
        canvasType &&
        isMaterializedArtifactId(existingId)
      ) {
        position += 1;
        const rawXml =
          typeof sb.metadata?.rawXml === "string"
            ? (sb.metadata.rawXml as string)
            : undefined;
        appendText(
          rawXml ??
            wrapArtifactText({
              canvasType,
              id: existingId as string,
              version:
                typeof sb.metadata?.version === "number"
                  ? (sb.metadata.version as number)
                  : 1,
              title:
                typeof sb.metadata?.artifactTitle === "string"
                  ? (sb.metadata.artifactTitle as string)
                  : undefined,
              body: sb.content ?? "",
            }),
        );
        continue;
      }

      // Structured (kind-IR) detection — catches JSON regions the fence/tag
      // heuristics can't type (the splitter calls them "code") plus
      // `<artifact>`-tagged bodies carrying a kind. When the tag's type and
      // the kind's type disagree, the tag wins (falls to the string path).
      const structuredHit = detectStructuredArtifact(sb);
      if (
        structuredHit &&
        (!canvasType || canvasType === structuredHit.def.canvasType)
      ) {
        flushTextRun();
        position += 1;
        const title =
          firstNonEmptyString(
            structuredHit.structured.title,
            structuredHit.structured.set_title,
            structuredHit.structured.name,
            sb.metadata?.artifactTitle,
          ) ?? titleFor(structuredHit.def.canvasType, sb.metadata, position);
        artifacts.push({
          artifactIndex: position,
          canvasType: structuredHit.def.canvasType,
          title,
          // Wire form: the `<artifact>` tag body is compact canonical JSON —
          // model-readable and durable; the UI routes by UUID.
          content: JSON.stringify(structuredHit.structured),
          structured: structuredHit.structured,
          metadata: { kind: structuredHit.kind },
        });
        rewritten.push({
          __artifactPending: true,
          artifactIndex: position,
        } as ArtifactPendingMarker);
        continue;
      }

      if (!canvasType) {
        // Not an artifact — re-serialize to markdown and keep inline.
        appendText(
          reconstructBlockMarkdown({
            type: sb.type,
            content: sb.content ?? "",
            data: sb.language ? { language: sb.language } : null,
          }),
        );
        continue;
      }

      // NEW materializable artifact → flush preceding text, emit a pending
      // marker + plan. The orchestrator fills the UUID and serializes to R1 text.
      flushTextRun();
      position += 1;
      let title = titleFor(sb.type, sb.metadata, position);
      let artifactMetadata: Record<string, unknown> | undefined;
      if (canvasType === "mermaid") {
        // Mermaid identity travels in metadata: the user-facing label is the
        // diagram type's feature name (Flowchart, Mind Map, …), never "mermaid".
        const source = sb.content ?? "";
        const diagramType = detectDiagramType(source);
        title = extractMermaidTitle(source) ?? getCatalogEntry(diagramType).label;
        artifactMetadata = { diagramType, title };
      }
      artifacts.push({
        artifactIndex: position,
        canvasType,
        title,
        content: sb.content ?? "",
        metadata: artifactMetadata,
      });
      rewritten.push({
        __artifactPending: true,
        artifactIndex: position,
      } as ArtifactPendingMarker);
    }
  }

  flushTextRun();

  return {
    artifacts,
    rewrittenBlocks: rewritten,
    hasChanges: artifacts.length > 0,
  };
}
