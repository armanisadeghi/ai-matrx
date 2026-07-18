/**
 * Phase 5: reload without re-parse.
 *
 * (1) Persisted part cache — a stream run through the REAL
 *     StreamBlockAccumulator commits its envelopes onto the assembled
 *     `CxTextContent.metadata.__ir` (IrEnvelopeCache); the read path
 *     (normalizeContentBlocks → splitContentIntoBlocksV2) then reuses the
 *     persisted envelope BY REFERENCE — reference identity to the persisted
 *     object is the mechanical proof that nothing re-parsed (a parser run
 *     always constructs a fresh envelope object).
 *
 * (2) Inbound Python-built envelopes (engine "py-block-detector") — a valid
 *     `metadata.__ir` on a server render_block passes the ingest guard by
 *     reference and rides the same part cache at assemble time; a malformed
 *     one is stripped loudly (captureError) and never poisons the pipeline.
 *     Contract: features/content-ir/docs/PYTHON_ENVELOPE_CONTRACT.md.
 */

import type {
  MessagePart,
  RenderBlockPayload,
} from "@/types/python-generated/stream-events";
import { StreamBlockAccumulator } from "@/features/agents/redux/execution-system/utils/stream-block-accumulator";
import { assembleMessageParts } from "@/features/agents/redux/execution-system/utils/assemble-cx-content-blocks";
import { normalizeContentBlocks } from "@/features/agents/redux/execution-system/utils/normalize-content-blocks";
import { splitContentIntoBlocksV2 } from "@/components/mardown-display/markdown-classification/processors/utils/content-splitter-v2";
import type { ActiveRequest } from "@/features/agents/types/request.types";
import type { CxTextContent } from "@/features/public-chat/types/cx-tables";
import {
  clearCapturedErrors,
  getSnapshot,
} from "@/lib/diagnostics/errorCaptureStore";
import { IR_ENVELOPE_KEY, type CanonicalBlockIR } from "../core/ir-types";
import { isCanonicalBlockIR } from "../core/normalize";
import {
  IR_ENVELOPE_CACHE_VERSION,
  envelopeCacheFromEnvelopes,
  isIrEnvelopeCache,
  type IrEnvelopeCache,
} from "../core/envelope-cache";
import { sanitizeInboundEnvelopeMetadata } from "../redux/render-block-envelope";
import { fingerprintText } from "../core/fingerprint";
import { chunkText } from "./seeded-random";

// ---------------------------------------------------------------------------
// Harness
// ---------------------------------------------------------------------------

/** Full ActiveRequest shape (mirrors the slice's createRequest initializer). */
function makeRequest(overrides: Partial<ActiveRequest>): ActiveRequest {
  return {
    requestId: "req-envelope-persistence",
    conversationId: "conv-envelope-persistence",
    parentConversationId: null,
    status: "complete",
    chunkCount: 0,
    editedText: null,
    reasoningChunks: [],
    accumulatedReasoning: "",
    isReasoningStreaming: false,
    reasoningRunChunkStart: 0,
    currentPhase: null,
    phaseHistory: [],
    activeOperations: {},
    completedOperations: {},
    renderBlocks: {},
    renderBlockOrder: [],
    liveCitations: [],
    toolLifecycle: {},
    pendingToolCalls: [],
    completion: null,
    error: null,
    warnings: [],
    infoEvents: [],
    providerRetry: null,
    providerRetryHistory: [],
    reservations: {},
    dataPayloads: [],
    timeline: [],
    rawEvents: [],
    isTextStreaming: false,
    textRunBlockStart: 0,
    currentTextRunRaw: "",
    extractedJson: null,
    jsonExtractionRevision: 0,
    jsonExtractionComplete: false,
    startedAt: new Date().toISOString(),
    firstChunkAt: null,
    completedAt: null,
    clientMetrics: null,
    routing: null,
    ...overrides,
  };
}

/** Run the REAL accumulator; return final complete blocks in block order. */
function runAccumulator(
  requestId: string,
  stream: string,
  seed: number,
): RenderBlockPayload[] {
  const upserts: Array<{ block: RenderBlockPayload }> = [];
  const accumulator = new StreamBlockAccumulator(requestId, (payload) => {
    upserts.push(payload as { block: RenderBlockPayload });
    return payload;
  });
  const dispatch = (a: unknown) => a;
  for (const chunk of chunkText(stream, seed, 8)) {
    accumulator.ingest(chunk, dispatch);
  }
  accumulator.finalize(dispatch);

  const finalByBlock = new Map<string, RenderBlockPayload>();
  for (const { block } of upserts) {
    if (block.status === "complete") finalByBlock.set(block.blockId, block);
  }
  return [...finalByBlock.values()].sort((a, b) => a.blockIndex - b.blockIndex);
}

function envelopeOf(
  metadata: Record<string, unknown> | undefined,
): CanonicalBlockIR | null {
  const candidate = metadata?.[IR_ENVELOPE_KEY];
  return isCanonicalBlockIR(candidate) ? candidate : null;
}

function cacheOf(part: CxTextContent): IrEnvelopeCache {
  const candidate = part.metadata?.[IR_ENVELOPE_KEY];
  if (!isIrEnvelopeCache(candidate)) {
    throw new Error("part carries no valid IrEnvelopeCache");
  }
  return candidate;
}

// ---------------------------------------------------------------------------
// Fixtures — text unique to THIS file so the module-scoped splitter memo
// can't already hold a parse for them (first split must hit the seeded path).
// ---------------------------------------------------------------------------

const ROUNDTRIP_JSON = JSON.stringify(
  {
    __kind: "flashcard_set",
    title: "Reload Roundtrip P5",
    cards: [
      { __kind: "flashcard", front: "R1?", back: "r1", extra_key: "kept" },
      { __kind: "flashcard", front: "R2?", back: "r2" },
    ],
  },
  null,
  2,
);
const ROUNDTRIP_STREAM = `Cards below:\n\n\`\`\`json\n${ROUNDTRIP_JSON}\n\`\`\`\n\nDone.\n`;

const PY_SOURCE = JSON.stringify(
  {
    __kind: "flashcard_set",
    title: "Python Built P5",
    cards: [{ __kind: "flashcard", front: "P1?", back: "p1" }],
  },
  null,
  2,
);

function makePyEnvelope(source: string): CanonicalBlockIR {
  return {
    v: 1,
    engine: "py-block-detector",
    fingerprint: fingerprintText(source),
    root: {
      role: "structured",
      kind: "flashcard_set",
      kindState: "resolved",
      discriminator: { format: "json", key: "__kind" },
      path: [],
      status: "complete",
      value: JSON.parse(source) as Record<string, unknown>,
      residue: null,
    },
  };
}

// ---------------------------------------------------------------------------
// Task 1 — persisted part cache: stream → assemble → reload without re-parse
// ---------------------------------------------------------------------------

describe("persisted envelope cache (stream → parts → reload)", () => {
  it("round-trips the streamed envelope through cx content parts with ZERO re-parse", () => {
    // ── Stream: the REAL accumulator parses the region once ────────────────
    const blocks = runAccumulator("req-roundtrip", ROUNDTRIP_STREAM, 3);
    const streamedEnvelope = blocks
      .map((b) => envelopeOf(b.metadata))
      .find((e): e is CanonicalBlockIR => e !== null);
    if (!streamedEnvelope) throw new Error("stream produced no envelope");
    expect(streamedEnvelope.root.status).toBe("complete");

    // ── Commit: assemble the CxContentBlock[] exactly as process-stream does
    const renderBlocks: Record<string, RenderBlockPayload> = {};
    const renderBlockOrder: string[] = [];
    for (const block of blocks) {
      renderBlocks[block.blockId] = block;
      renderBlockOrder.push(block.blockId);
    }
    const request = makeRequest({
      renderBlocks,
      renderBlockOrder,
      timeline: [
        { kind: "text_start", seq: 0, timestamp: 0, blockStartIndex: 0 },
        {
          kind: "text_end",
          seq: 1,
          timestamp: 1,
          blockStartIndex: 0,
          blockEndIndex: renderBlockOrder.length,
          blockCount: renderBlockOrder.length,
          rawText: ROUNDTRIP_STREAM,
        },
      ],
    });

    const parts = assembleMessageParts(request);
    expect(parts).toHaveLength(1);
    const textPart = parts[0] as CxTextContent;
    expect(textPart.type).toBe("text");
    expect(textPart.text).toBe(ROUNDTRIP_STREAM);

    // The stamped cache holds the STREAM's envelope object by reference,
    // keyed by its fingerprint.
    const cache = cacheOf(textPart);
    expect(cache.v).toBe(IR_ENVELOPE_CACHE_VERSION);
    expect(Object.keys(cache.blocks)).toEqual([streamedEnvelope.fingerprint]);
    expect(cache.blocks[streamedEnvelope.fingerprint]).toBe(streamedEnvelope);

    // ── Reload: JSON round-trip (what cx_message.content storage does) ─────
    const persisted = JSON.parse(JSON.stringify(parts)) as MessagePart[];
    const persistedEnvelope = cacheOf(persisted[0] as CxTextContent).blocks[
      streamedEnvelope.fingerprint
    ];
    expect(persistedEnvelope).not.toBe(streamedEnvelope); // distinct object post-storage

    // The read boundary seeds the cache…
    normalizeContentBlocks(persisted);

    // …and the splitter pass reuses the persisted envelope BY REFERENCE.
    const reloaded = splitContentIntoBlocksV2(
      (persisted[0] as CxTextContent).text,
    )
      .map((b) => envelopeOf(b.metadata))
      .find((e): e is CanonicalBlockIR => e !== null);
    if (!reloaded) throw new Error("reload split attached no envelope");

    // Mechanical no-re-parse proof: a kind-parser run always builds a FRESH
    // envelope object, so identity with the persisted object can only come
    // from the seeded-cache short-circuit.
    expect(reloaded).toBe(persistedEnvelope);
    // And the reload envelope EQUALS the streamed one, byte for byte.
    expect(reloaded).toEqual(streamedEnvelope);
  });

  it("a malformed persisted cache seeds nothing and screams", () => {
    clearCapturedErrors();
    const parts: MessagePart[] = [
      {
        type: "text",
        text: "hello",
        metadata: { [IR_ENVELOPE_KEY]: { v: 999, blocks: "not-a-record" } },
      },
    ];
    normalizeContentBlocks(parts);
    const captured = getSnapshot();
    expect(
      captured.some(
        (e) => e.source === "content-ir" && e.message.includes("cache"),
      ),
    ).toBe(true);
  });

  it("envelopeCacheFromEnvelopes keeps only complete envelopes, keyed by fingerprint", () => {
    const complete = makePyEnvelope(PY_SOURCE);
    const streaming: CanonicalBlockIR = {
      ...complete,
      fingerprint: "other-fp",
      root: { ...complete.root, status: "streaming" },
    };
    const cache = envelopeCacheFromEnvelopes([complete, streaming]);
    if (!cache) throw new Error("expected a cache for the complete envelope");
    expect(Object.keys(cache.blocks)).toEqual([complete.fingerprint]);
    expect(envelopeCacheFromEnvelopes([streaming])).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Task 2 — inbound Python-built envelopes (engine "py-block-detector")
// ---------------------------------------------------------------------------

describe("inbound py-block-detector envelopes", () => {
  it("a valid envelope passes the ingest guard by reference (metadata untouched)", () => {
    const pyEnvelope = makePyEnvelope(PY_SOURCE);
    const metadata: Record<string, unknown> = {
      [IR_ENVELOPE_KEY]: pyEnvelope,
      other_key: "kept",
    };
    const out = sanitizeInboundEnvelopeMetadata(metadata, {
      blockId: "srv-block-1",
    });
    expect(out).toBe(metadata); // reuse-by-reference — the idempotence law
    expect(out?.[IR_ENVELOPE_KEY]).toBe(pyEnvelope);
  });

  it("a malformed __ir is stripped into a copy + captured loudly; input never mutated", () => {
    clearCapturedErrors();
    const metadata: Record<string, unknown> = {
      [IR_ENVELOPE_KEY]: { v: 2, engine: "py-block-detector", junk: true },
      other_key: "kept",
    };
    const out = sanitizeInboundEnvelopeMetadata(metadata, {
      blockId: "srv-block-bad",
    });
    expect(out).not.toBe(metadata);
    expect(out?.[IR_ENVELOPE_KEY]).toBeUndefined();
    expect(out?.other_key).toBe("kept");
    // The inbound object itself is not mutated.
    expect(metadata[IR_ENVELOPE_KEY]).toBeDefined();

    const captured = getSnapshot();
    expect(
      captured.some(
        (e) =>
          e.source === "content-ir" &&
          e.message.includes("srv-block-bad") &&
          e.message.includes("py-block-detector"),
      ),
    ).toBe(true);
  });

  it("absent __ir passes through by reference", () => {
    const metadata: Record<string, unknown> = { anything: 1 };
    expect(
      sanitizeInboundEnvelopeMetadata(metadata, { blockId: "b" }),
    ).toBe(metadata);
    expect(
      sanitizeInboundEnvelopeMetadata(undefined, { blockId: "b" }),
    ).toBeUndefined();
  });

  it("a server render_block's envelope rides the part cache engine-agnostically and is reused on reload", () => {
    const pyEnvelope = makePyEnvelope(PY_SOURCE);
    const metadata = sanitizeInboundEnvelopeMetadata(
      { [IR_ENVELOPE_KEY]: pyEnvelope },
      { blockId: "srv-1" },
    );

    // A pure render_block-event stream: no chunk text, no timeline text runs
    // (server blocks bypass the StreamBlockAccumulator entirely — only chunk
    // events feed it), so assemble's Pass 2 emits the block as a text part.
    const request = makeRequest({
      renderBlocks: {
        "srv-1": {
          blockId: "srv-1",
          blockIndex: 0,
          type: "code",
          status: "complete",
          content: PY_SOURCE,
          data: { language: "json" },
          metadata,
        },
      },
      renderBlockOrder: ["srv-1"],
    });

    const parts = assembleMessageParts(request);
    expect(parts).toHaveLength(1);
    const textPart = parts[0] as CxTextContent;
    expect(textPart.text).toBe("```json\n" + PY_SOURCE + "\n```");

    // Stamped identically to an FE-parsed envelope — by reference.
    const cache = cacheOf(textPart);
    expect(cache.blocks[pyEnvelope.fingerprint]).toBe(pyEnvelope);

    // Reload: storage round-trip → seed → splitter reuses by reference.
    const persisted = JSON.parse(JSON.stringify(parts)) as MessagePart[];
    const persistedEnvelope = cacheOf(persisted[0] as CxTextContent).blocks[
      pyEnvelope.fingerprint
    ];
    normalizeContentBlocks(persisted);

    const reloaded = splitContentIntoBlocksV2(
      (persisted[0] as CxTextContent).text,
    )
      .map((b) => envelopeOf(b.metadata))
      .find((e): e is CanonicalBlockIR => e !== null);
    if (!reloaded) throw new Error("reload split attached no envelope");

    expect(reloaded).toBe(persistedEnvelope); // no re-parse
    expect(reloaded.engine).toBe("py-block-detector"); // provenance preserved
    expect(reloaded).toEqual(pyEnvelope);
  });
});
