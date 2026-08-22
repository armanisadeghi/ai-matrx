"use client";

/**
 * MarkdownKindBlock — the registered web renderer for the `markdown` kind.
 *
 * ## Why it exists
 *
 * Arman's render law had two paths: "official declared kind component, or
 * streaming markdown — that's it"
 * (common-docs/systems/content-ir-system/WORKFLOW_KINDS_DESIGN.md §4). The
 * `markdown` kind — `{ text: string }`, the shape the agent output contract
 * (§6) folds prose into — collapses those two paths into ONE by making the
 * second path a kind whose component IS the proven streaming renderer.
 *
 * So this component invents NOTHING. It reads `text` off the kind instance and
 * hands it to {@link MarkdownStream}, the engine that already renders every
 * streamed assistant message. Prose renders as prose; a fenced kind payload
 * inside that prose routes to ITS component through the same pipeline, exactly
 * as it does in chat. Without this route the kind fell to
 * `GenericStructuredBlock`, which showed a reader the field label "Text" above
 * their own document — markdown source, unrendered.
 *
 * ## Route contract
 *
 * Reached ONLY through `applyIrKindRoute`'s resolver-only path (a
 * `content_ir.kind_component` row: `markdown` / web / output /
 * `markdown_stream`), which CLEARS `serverData` — the raw region's
 * `{ language: "json" }` annotation is not kind data. The value comes from the
 * envelope on `metadata.__ir`, with the same descending-fidelity recovery
 * `WebAnalysisItemBlock` and the generic block use, so a region that never
 * parsed still shows its source verbatim rather than nothing.
 *
 * ## Bare by construction (THE WRAPPER LAW)
 *
 * Every host that routes a block here already draws chrome, and MarkdownStream
 * is the documented import for "bare rendering with no actions" (the
 * `RichDocument` front door adds the toolkit). No card, no border, no padding.
 */

import React from "react";

import MarkdownStream from "@/components/MarkdownStream";
import { readEnvelope } from "@/features/content-ir/redux/render-block-envelope";
import { reconstructRegionValue } from "@ai-matrx/content-ir";

export interface MarkdownKindBlockProps {
  /** The raw region source — the zero-loss floor when no envelope survived. */
  content: string;
  /** Carries `__ir` (the parsed envelope) and `__ir_route` (the seam marker). */
  metadata?: Record<string, unknown>;
  /** True while the producing stream is still open. */
  isStreamActive?: boolean;
  className?: string;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/**
 * Descending fidelity, same order as the generic block: the envelope is the
 * source of truth (it merges residues back, so unknown keys survive), a bare
 * `JSON.parse` is the floor, and unparseable text is never swallowed.
 */
function readValue(
  content: string,
  metadata: Record<string, unknown> | undefined,
): unknown {
  const envelope = readEnvelope(metadata);
  if (envelope) return reconstructRegionValue(envelope);
  try {
    return JSON.parse(content) as unknown;
  } catch {
    return null;
  }
}

/**
 * The kind's one required field. A partial instance mid-stream may carry no
 * `text` yet (or a non-string residue) — that is "nothing to show yet", not an
 * error, and never a reason to drop what DID arrive.
 */
function readText(value: unknown): string | null {
  if (!isRecord(value)) return null;
  return typeof value.text === "string" ? value.text : null;
}

const MarkdownKindBlock: React.FC<MarkdownKindBlockProps> = ({
  content,
  metadata,
  isStreamActive,
  className,
}) => {
  const text = readText(readValue(content, metadata));

  // NEVER SWALLOW: no recoverable `text` means the instance did not parse (or
  // has not arrived). Show the region's own source through the same renderer —
  // the reader sees what the producer sent, verbatim.
  const markdown = text ?? content;
  if (!markdown) return null;

  return (
    <div className={className}>
      <MarkdownStream content={markdown} isStreamActive={isStreamActive} />
    </div>
  );
};

export default MarkdownKindBlock;
