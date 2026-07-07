/**
 * THE KEYSTONE (Shape System Stage 1): the `<flashcards>` XML surface
 * converges to the canonical `flashcard_set` kind at region finalize, so XML
 * and `__kind` JSON render through the SAME kind pipeline.
 *
 * Proven at the HOST level: the REAL StreamBlockAccumulator (chunked live
 * traffic) and the REAL splitContentIntoBlocksV2 (one-shot DB path) both
 * stamp a complete `metadata.__ir` envelope with root kind `flashcard_set`
 * and the XML discriminator; streaming emits stay envelope-free (today's
 * per-tag skeleton until COMPLETE); a malformed region falls back to legacy
 * rendering loudly, without an envelope and without breaking the stream.
 */

import type { RenderBlockPayload } from "@/types/python-generated/stream-events";
import { StreamBlockAccumulator } from "@/features/agents/redux/execution-system/utils/stream-block-accumulator";
import { splitContentIntoBlocksV2 } from "@/components/mardown-display/markdown-classification/processors/utils/content-splitter-v2";
import { applyIrKindRoute, type IrRoutableBlock } from "../react/kind-route";
import { normalizeJsonRegion, isCanonicalBlockIR } from "../core/normalize";
import { kindRegistry } from "../registry/kind-registry";
import { IR_ENVELOPE_KEY, type CanonicalBlockIR } from "../core/ir-types";
import { chunkText } from "./seeded-random";

// The exact keystone sample (spec input, verbatim).
const SAMPLE_XML = [
  "<flashcards>",
  "---",
  "",
  "Front: What is the capital of France?",
  "Back: Paris",
  "",
  "---",
  "",
  "Front: Name three primary colors",
  "Back:",
  "- Red",
  "- Blue",
  "- Yellow",
  "",
  "---",
  "</flashcards>",
].join("\n");

const EXPECTED_VALUE = {
  __kind: "flashcard_set",
  // The schema-required set title — the legacy text format carries none, so
  // the strategy emits the family default (see flashcards-legacy-text.ts).
  title: "Flashcards",
  cards: [
    {
      __kind: "flashcard",
      front: "What is the capital of France?",
      back: "Paris",
    },
    {
      __kind: "flashcard",
      front: "Name three primary colors",
      back: "- Red\n- Blue\n- Yellow",
    },
  ],
};

type Upsert = { requestId: string; block: RenderBlockPayload };

function runAccumulator(stream: string, requestId: string, seed: number) {
  const upserts: Upsert[] = [];
  const accumulator = new StreamBlockAccumulator(requestId, (payload) => {
    upserts.push(payload as Upsert);
    return { type: "test/upsert", payload };
  });
  const dispatch = (action: unknown) => action;

  for (const chunk of chunkText(stream, seed, 9)) {
    accumulator.ingest(chunk, dispatch);
  }
  accumulator.finalize(dispatch);
  return upserts;
}

function envelopeOf(
  metadata: Record<string, unknown> | null | undefined,
): CanonicalBlockIR | null {
  const candidate = metadata?.[IR_ENVELOPE_KEY];
  return isCanonicalBlockIR(candidate) ? candidate : null;
}

function finalFlashcardsBlock(upserts: Upsert[]): RenderBlockPayload {
  for (let i = upserts.length - 1; i >= 0; i--) {
    const block = upserts[i].block;
    if (block.type === "flashcards" && block.status === "complete") {
      return block;
    }
  }
  throw new Error("no complete flashcards block emitted");
}

describe("<flashcards> XML → flashcard_set convergence (accumulator)", () => {
  it("stamps a complete envelope with the XML discriminator at finalize", () => {
    const stream = `Here are your cards:\n\n${SAMPLE_XML}\n\nEnjoy!\n`;
    const upserts = runAccumulator(stream, "req-xml-flashcards", 3);

    const block = finalFlashcardsBlock(upserts);
    const envelope = envelopeOf(block.metadata);
    expect(envelope).not.toBeNull();
    if (!envelope) throw new Error("unreachable");

    expect(envelope.root.kind).toBe("flashcard_set");
    expect(envelope.root.status).toBe("complete");
    expect(envelope.root.kindState).toBe("resolved");
    expect(envelope.root.discriminator).toEqual({
      format: "xml",
      tag: "flashcards",
    });
    expect(envelope.root.value).toEqual(EXPECTED_VALUE);

    // Today's XML metadata contract is preserved alongside the envelope.
    expect(block.metadata?.isComplete).toBe(true);
    expect(typeof block.metadata?.rawXml).toBe("string");

    // Complete-only law: while the region streamed, NO emit carried an
    // envelope — today's per-tag skeleton stands until the region closes.
    const streamingEmits = upserts.filter(
      ({ block: b }) =>
        b.blockId === block.blockId && b.status === "streaming",
    );
    expect(streamingEmits.length).toBeGreaterThan(0);
    for (const { block: b } of streamingEmits) {
      expect(envelopeOf(b.metadata)).toBeNull();
    }
  });

  it("chunking never changes the envelope (4 seeds)", () => {
    const stream = `Intro.\n${SAMPLE_XML}\nOutro.\n`;
    const envelopes: CanonicalBlockIR[] = [];
    for (let seed = 1; seed <= 4; seed++) {
      const upserts = runAccumulator(stream, `req-xml-seed-${seed}`, seed);
      const envelope = envelopeOf(finalFlashcardsBlock(upserts).metadata);
      expect(envelope).not.toBeNull();
      if (envelope) envelopes.push(envelope);
    }
    for (const envelope of envelopes.slice(1)) {
      expect(envelope).toEqual(envelopes[0]);
    }
  });
});

describe("<flashcards> XML → flashcard_set convergence (splitter one-shot)", () => {
  it("produces an envelope value-identical (and byte-identical) to the stream's", () => {
    const source = `Here are your cards:\n\n${SAMPLE_XML}\n\nEnjoy!\n`;

    const fromStream = envelopeOf(
      finalFlashcardsBlock(runAccumulator(source, "req-xml-parity", 2))
        .metadata,
    );
    expect(fromStream).not.toBeNull();

    const splitBlocks = splitContentIntoBlocksV2(source);
    const flashcards = splitBlocks.find((b) => b.type === "flashcards");
    expect(flashcards).toBeDefined();
    const fromSplitter = envelopeOf(flashcards?.metadata);
    expect(fromSplitter).not.toBeNull();
    if (!fromSplitter || !fromStream) throw new Error("unreachable");

    // Value parity (title/cards)…
    expect(fromSplitter.root.value).toEqual(fromStream.root.value);
    // …and full-envelope parity: the fingerprint hashes the canonical value,
    // so stream ≡ static holds by construction for XML convergence too.
    expect(fromSplitter).toEqual(fromStream);
  });
});

describe("keystone routing — XML converges into the SAME kind pipeline as __kind JSON", () => {
  it("applyIrKindRoute derives identical serverData from the XML envelope and a __kind JSON arrival", () => {
    const upserts = runAccumulator(
      `${SAMPLE_XML}\n`,
      "req-xml-route",
      5,
    );
    const xmlEnvelope = envelopeOf(finalFlashcardsBlock(upserts).metadata);
    expect(xmlEnvelope).not.toBeNull();
    if (!xmlEnvelope) throw new Error("unreachable");

    const xmlBlock: IrRoutableBlock = {
      type: "flashcards",
      metadata: { [IR_ENVELOPE_KEY]: xmlEnvelope },
    };
    const routedFromXml = applyIrKindRoute(xmlBlock);
    expect(routedFromXml.type).toBe("flashcards");
    expect(routedFromXml.serverData).toBeDefined();

    // The same content arriving as canonical __kind JSON routes to the same
    // component with the same serverData — one pipeline, two surfaces.
    const jsonEnvelope = normalizeJsonRegion(JSON.stringify(EXPECTED_VALUE), {
      schemas: kindRegistry.snapshotSchemas(),
    });
    expect(jsonEnvelope.root.kind).toBe("flashcard_set");
    const jsonBlock: IrRoutableBlock = {
      type: "code",
      metadata: { [IR_ENVELOPE_KEY]: jsonEnvelope },
    };
    const routedFromJson = applyIrKindRoute(jsonBlock);
    expect(routedFromJson.type).toBe("flashcards");
    expect(routedFromXml.serverData).toEqual(routedFromJson.serverData);

    const cards = routedFromXml.serverData?.cards;
    if (!Array.isArray(cards)) throw new Error("routed serverData has no cards array");
    expect(cards.length).toBe(2);
  });
});

describe("malformed inner text — graceful, loud fallback", () => {
  const MALFORMED_XML = [
    "<flashcards>",
    "This region has no card lines at all — just prose.",
    "</flashcards>",
  ].join("\n");

  let errorSpy: jest.SpyInstance;
  beforeEach(() => {
    errorSpy = jest.spyOn(console, "error").mockImplementation(() => {});
  });
  afterEach(() => {
    errorSpy.mockRestore();
  });

  it("accumulator: no envelope, block intact, exactly one console.error", () => {
    const upserts = runAccumulator(
      `Before.\n${MALFORMED_XML}\nAfter.\n`,
      "req-xml-malformed",
      1,
    );
    const block = finalFlashcardsBlock(upserts);

    expect(envelopeOf(block.metadata)).toBeNull();
    expect(block.metadata?.isComplete).toBe(true);
    expect(block.content).toContain("no card lines at all");
    expect(errorSpy).toHaveBeenCalledTimes(1);
  });

  it("splitter: no envelope, and the failure memo keeps the error to one per region", () => {
    const source = `Before.\n${MALFORMED_XML}\nAfter.\n`;

    const first = splitContentIntoBlocksV2(source);
    const block = first.find((b) => b.type === "flashcards");
    expect(block).toBeDefined();
    expect(envelopeOf(block?.metadata)).toBeNull();
    const callsAfterFirst = errorSpy.mock.calls.length;
    expect(callsAfterFirst).toBe(1);

    // Hot re-split of the same message: memoized failure, no error spam.
    const second = splitContentIntoBlocksV2(source);
    expect(envelopeOf(second.find((b) => b.type === "flashcards")?.metadata)).toBeNull();
    expect(errorSpy.mock.calls.length).toBe(callsAfterFirst);
  });
});
