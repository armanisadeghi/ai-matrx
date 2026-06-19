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
 * matching the `(source_message_id, artifact_index)` natural key.
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
import { resolveCanvasType } from "@/features/canvas/artifact-types/artifact-type-registry";
import { isMaterializedArtifactId } from "@/features/canvas/artifact-types/artifactId";
import { wrapArtifactText } from "./artifactWire";

export interface PlannedArtifact {
  /** Stable 1-based order within the message (= canvas_items.artifact_index). */
  artifactIndex: number;
  /** canvas_items.type. */
  canvasType: string;
  title: string;
  /** Raw payload string the type's renderer consumes (markdown or JSON). */
  content: string;
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

      // Already materialized (R3): a `<artifact>` carrying a real canvas UUID.
      // Pass it through verbatim and DON'T re-materialize. Still counts toward
      // position so later new artifacts get a non-colliding index.
      const existingId =
        typeof sb.metadata?.artifactId === "string"
          ? (sb.metadata.artifactId as string)
          : undefined;
      if (sb.type === "artifact" && isMaterializedArtifactId(existingId)) {
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
