/**
 * planMaterialization — pure transform from a committed `cx_message.content`
 * array into (a) the artifacts to persist and (b) the rewritten content array
 * with each materializable render-block replaced by a `CxArtifactRefContent`
 * placeholder.
 *
 * This is the deterministic heart of the rewrite step. It is PURE (no I/O) so
 * it can be unit-reasoned and run identically at stream-end commit and during
 * the reconciliation pass on conversation load.
 *
 * Idempotency: once a message has been materialized, its text blocks no longer
 * contain raw artifact markup (it was replaced by `artifact_ref` blocks, which
 * pass through untouched). Re-running therefore finds nothing new and returns
 * `hasChanges: false`. Indices are assigned by stable left-to-right order over
 * materializable blocks, so the same logical artifact always gets the same
 * `artifact_index` (the natural key with `source_message_id`).
 */

import type {
  CxContentBlock,
  CxTextContent,
  CxArtifactRefContent,
} from "@/features/public-chat/types/cx-tables";
import { splitContentIntoBlocksV2 } from "@/components/mardown-display/markdown-classification/processors/utils/content-splitter-v2";
import { reconstructBlockMarkdown } from "@/features/agents/redux/execution-system/utils/assemble-cx-content-blocks";
import { resolveCanvasType } from "./materializable-types";

export interface PlannedArtifact {
  /** Stable 1-based order within the message (= canvas_items.artifact_index). */
  artifactIndex: number;
  /** canvas_items.type. */
  canvasType: string;
  title: string;
  /** Raw payload string the type's renderer consumes (markdown or JSON). */
  content: string;
}

export interface MaterializationPlan {
  /** Artifacts to upsert, in message order. Empty when nothing materializes. */
  artifacts: PlannedArtifact[];
  /**
   * Rewritten content. Each materializable block is a `CxArtifactRefContent`
   * with `artifact_id: ""` to be filled in after the upsert returns its UUID;
   * the `artifact_index` is already final. Non-materializable content is
   * preserved as merged text runs (and passthrough non-text blocks).
   */
  rewrittenBlocks: CxContentBlock[];
  /** True when at least one artifact was found to materialize. */
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
  const rewritten: CxContentBlock[] = [];
  const artifacts: PlannedArtifact[] = [];
  // Running materializable counter → artifact_index (1-based). Start ABOVE any
  // artifact_index already present so a message that somehow mixes existing
  // artifact_ref blocks with new raw artifacts never reissues a colliding index
  // — the (source_message_id, artifact_index) upsert would otherwise overwrite
  // the earlier artifact's row.
  let index = content.reduce<number>((max, b) => {
    if ((b as { type?: string }).type === "artifact_ref") {
      const ai = (b as { artifact_index?: number }).artifact_index ?? 0;
      return Math.max(max, ai);
    }
    return max;
  }, 0);

  // Accumulates faithful markdown for consecutive non-materializable splitter
  // blocks so they collapse back into a single text block between refs.
  let textRun = "";
  const flushTextRun = () => {
    if (textRun.length > 0) {
      rewritten.push({ type: "text", text: textRun } as CxTextContent);
      textRun = "";
    }
  };

  for (const block of content) {
    // Non-text blocks (thinking, tool_call, media, existing artifact_ref, …)
    // pass through verbatim — they are never raw artifact markup.
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
        if (textRun.length > 0) textRun += "\n\n";
        textRun += reconstructBlockMarkdown({
          type: sb.type,
          content: sb.content ?? "",
          data: sb.language ? { language: sb.language } : null,
        });
        continue;
      }

      // Materializable: flush preceding text, emit a ref placeholder + plan.
      flushTextRun();
      index += 1;
      artifacts.push({
        artifactIndex: index,
        canvasType,
        title: titleFor(sb.type, sb.metadata, index),
        content: sb.content ?? "",
      });
      rewritten.push({
        type: "artifact_ref",
        artifact_id: "",
        artifact_type: canvasType,
        version: 1,
        artifact_index: index,
        title: titleFor(sb.type, sb.metadata, index),
      } as CxArtifactRefContent);
    }
  }

  flushTextRun();

  return {
    artifacts,
    rewrittenBlocks: rewritten,
    hasChanges: artifacts.length > 0,
  };
}
