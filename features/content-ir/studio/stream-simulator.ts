/**
 * Stream simulator — the pure engine behind /shapes/[kind]/stream.
 *
 * PURPOSE: replay the EXACT stream a kind component receives in production —
 * no lookalike renderer, no synthetic envelope. The tab feeds the wire text
 * built here, chunk by chunk, into the REAL `StreamBlockAccumulator` (the
 * same class every chat surface runs), and renders the resulting
 * `RenderBlockPayload`s through the REAL `SafeBlockRenderer` → BlockRenderer
 * stages. What Arman sees on the tab is what a user sees in chat — loading
 * skeleton, progressive fill, final swap — for THIS kind, before an agent
 * ever streams it for real.
 *
 * Contract background (who closes the JSON, and where):
 * `common-docs/systems/content-ir-system/STREAMING_PARTIAL_KINDS.md`.
 * Two producers exist in production:
 *   - the FRONTEND accumulator parses raw chunk text itself and emits
 *     STREAMING `metadata.__ir` envelopes (this is what chat surfaces run,
 *     and what this simulator exercises);
 *   - the PYTHON `__ir_partial` channel closes partial JSON server-side for
 *     run pages / workflows. The partial parity gate pins both producers to
 *     the same values, so exercising the accumulator here is representative
 *     of both.
 *
 * This module is pure (no React, no Redux, no fetch) so the chunker, wire
 * builders, and verdict derivation are unit-testable.
 */

import {
  IR_ENVELOPE_KEY,
  isCanonicalBlockIR,
  type CanonicalBlockIR,
} from "@ai-matrx/content-ir";
import type { RenderBlockPayload } from "@/types/python-generated/stream-events";

export type WireMode = "fenced" | "bare";

export const WIRE_MODE_LABEL: Record<WireMode, string> = {
  fenced: "Chat fence (```json in prose)",
  bare: "Structured output (bare minified JSON)",
};

/** Strip any existing discriminator and re-emit it as the FIRST key (§6a:
 * pre-recognition happens on the first key; the wire always leads with it). */
export function withKindFirst(
  data: Record<string, unknown>,
  kind: string,
): Record<string, unknown> {
  const { __kind: _existing, ...rest } = data;
  return { __kind: kind, ...rest };
}

/**
 * Build the wire text an agent emission produces for this example.
 *
 *  - `fenced`: prose + a pretty-printed ```json fence + prose — the classic
 *    chat emission (`kind_<slug>` skill teaching).
 *  - `bare`: ONE minified line, no newline anywhere — the provider
 *    structured-output shape (`response_format_for_kind`), the exact form
 *    that historically flashed raw JSON until the live-open fix.
 */
export function buildWireText(
  data: Record<string, unknown>,
  kind: string,
  mode: WireMode,
): string {
  const payload = withKindFirst(data, kind);
  if (mode === "bare") {
    return JSON.stringify(payload);
  }
  const pretty = JSON.stringify(payload, null, 2);
  return `Here is your ${kind}:\n\n\`\`\`json\n${pretty}\n\`\`\`\n\nLet me know if you want changes.\n`;
}

/** Fixed-size chunks covering the text exactly (last one may be shorter). */
export function chunkWireText(text: string, chunkSize: number): string[] {
  const size = Math.max(1, Math.floor(chunkSize));
  const chunks: string[] = [];
  for (let i = 0; i < text.length; i += size) {
    chunks.push(text.slice(i, i + size));
  }
  return chunks;
}

// ── Tick records + verdicts ─────────────────────────────────────────────────

/** One accumulator upsert, reduced to the facts the verdicts need. */
export interface StreamTickRecord {
  /** 1-based chunk number at which this upsert fired (chunks.length + 1 = finalize). */
  chunk: number;
  blockId: string;
  type: string;
  status: RenderBlockPayload["status"];
  /** Envelope facts (null when the block carries no `metadata.__ir`). */
  envelope: {
    kind: string | null;
    kindState: string | null;
    status: string;
    /** JSON.stringify(root.value).length — the progressive-growth signal. */
    valueChars: number;
  } | null;
  /** True when a STREAMING block would reach the reader as raw text carrying
   * the discriminator — the "shows the whole JSON, converts when done" flash. */
  rawKindTextVisible: boolean;
}

export function recordFromUpsert(
  chunk: number,
  block: RenderBlockPayload,
): StreamTickRecord {
  const candidate = block.metadata?.[IR_ENVELOPE_KEY];
  const envelope: CanonicalBlockIR | null = isCanonicalBlockIR(candidate)
    ? candidate
    : null;
  return {
    chunk,
    blockId: block.blockId,
    type: block.type,
    status: block.status,
    envelope: envelope
      ? {
          kind: envelope.root.kind || null,
          kindState: envelope.root.kindState ?? null,
          status: envelope.root.status,
          valueChars: JSON.stringify(envelope.root.value ?? {}).length,
        }
      : null,
    rawKindTextVisible:
      block.status === "streaming" &&
      envelope === null &&
      (block.type === "text" || block.type === "code") &&
      (block.content ?? "").includes('"__kind"'),
  };
}

export interface StreamVerdicts {
  /** The region was detected as structured (an envelope existed) while streaming. */
  detectedWhileStreaming: boolean;
  /** 1-based chunk of the FIRST streaming envelope (null = never). */
  detectedAtChunk: number | null;
  /** The kind slug itself resolved while the region was still streaming. */
  kindResolvedWhileStreaming: boolean;
  /** Number of streaming snapshots whose value GREW — >1 means progressive. */
  growthSteps: number;
  /** A streaming upsert exposed raw `"__kind"` text with no envelope. */
  rawTextFlash: boolean;
  /** A complete envelope with the expected kind closed the stream. */
  completedAsKind: boolean;
}

export function deriveStreamVerdicts(
  records: readonly StreamTickRecord[],
  kind: string,
): StreamVerdicts {
  let detectedAtChunk: number | null = null;
  let kindResolvedWhileStreaming = false;
  let growthSteps = 0;
  let rawTextFlash = false;
  let completedAsKind = false;
  const lastValueChars = new Map<string, number>();

  for (const r of records) {
    if (r.rawKindTextVisible) rawTextFlash = true;
    if (!r.envelope) continue;
    if (r.envelope.status === "streaming") {
      if (detectedAtChunk === null) detectedAtChunk = r.chunk;
      if (r.envelope.kind === kind) kindResolvedWhileStreaming = true;
      const prev = lastValueChars.get(r.blockId) ?? 0;
      if (r.envelope.valueChars > prev) {
        growthSteps += 1;
        lastValueChars.set(r.blockId, r.envelope.valueChars);
      }
    }
    if (
      r.status === "complete" &&
      r.envelope.status === "complete" &&
      r.envelope.kind === kind
    ) {
      completedAsKind = true;
    }
  }

  return {
    detectedWhileStreaming: detectedAtChunk !== null,
    detectedAtChunk,
    kindResolvedWhileStreaming,
    growthSteps,
    rawTextFlash,
    completedAsKind,
  };
}
