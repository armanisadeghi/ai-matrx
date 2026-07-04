/**
 * Phase 2: the StreamBlockAccumulator's shadow delegation. JSON regions
 * (fenced + bare) also feed the kind parser; blocks carry a dark
 * `metadata.__ir` envelope identical to the one-shot normalizer's output —
 * the stream/DB lockstep invariant, tested at the HOST level with realistic
 * chunked chat traffic.
 */

import type { RenderBlockPayload } from "@/types/python-generated/stream-events";
import { StreamBlockAccumulator } from "@/features/agents/redux/execution-system/utils/stream-block-accumulator";
import { normalizeJsonRegion } from "../core/normalize";
import { kindRegistry } from "../registry/kind-registry";
import { IR_ENVELOPE_KEY, type CanonicalBlockIR } from "../core/ir-types";
import { isCanonicalBlockIR } from "../core/normalize";
import { chunkText } from "./seeded-random";

type Upsert = { requestId: string; block: RenderBlockPayload };

function makeAccumulator(requestId: string) {
  const upserts: Upsert[] = [];
  const accumulator = new StreamBlockAccumulator(requestId, (payload) => {
    upserts.push(payload as Upsert);
    return { type: "test/upsert", payload };
  });
  const dispatch = (action: unknown) => action;
  return { accumulator, upserts, dispatch };
}

function envelopeOf(block: RenderBlockPayload): CanonicalBlockIR | null {
  const candidate = block.metadata?.[IR_ENVELOPE_KEY];
  return isCanonicalBlockIR(candidate) ? candidate : null;
}

function lastCompleteBlockWithEnvelope(upserts: Upsert[]): {
  block: RenderBlockPayload;
  envelope: CanonicalBlockIR;
} {
  for (let i = upserts.length - 1; i >= 0; i--) {
    const block = upserts[i].block;
    const envelope = envelopeOf(block);
    if (block.status === "complete" && envelope) {
      return { block, envelope };
    }
  }
  throw new Error("no complete block carrying an envelope");
}

const FLASHCARD_JSON = JSON.stringify(
  {
    __kind: "flashcard_set",
    set_title: "Stream Test",
    cards: [
      { __kind: "flashcard", front: "A?", back: "a", bonus_field: "kept" },
      { __kind: "flashcard", front: "B?", back: "b" },
    ],
  },
  null,
  2,
);

describe("accumulator shadow delegation (fenced JSON)", () => {
  it("attaches a complete envelope equal to the one-shot normalizer's", () => {
    const { accumulator, upserts, dispatch } = makeAccumulator("req-fence");
    const stream = `Here are your cards:\n\n\`\`\`json\n${FLASHCARD_JSON}\n\`\`\`\n\nEnjoy!\n`;

    for (const chunk of chunkText(stream, 11, 9)) {
      accumulator.ingest(chunk, dispatch);
    }
    accumulator.finalize(dispatch);

    const { block, envelope } = lastCompleteBlockWithEnvelope(upserts);

    // The block itself is unchanged (dark shadow): content still the raw JSON.
    expect(block.content).toBe(FLASHCARD_JSON);

    // Envelope matches the one-shot path byte-for-byte — including the
    // fingerprint, which proves the region feed mirrors block content exactly.
    const oneShot = normalizeJsonRegion(FLASHCARD_JSON, {
      schemas: kindRegistry.snapshotSchemas(),
    });
    expect(envelope).toEqual(oneShot);

    expect(envelope.root.kind).toBe("flashcard_set");
    expect(envelope.root.status).toBe("complete");
    // Zero data loss: the unknown card key rides the child residue.
    expect(envelope.nodeIndex?.["cards.0"]?.residue?.extra).toEqual({
      bonus_field: "kept",
    });
  });

  it("chunking never changes the final envelope (5 seeds)", () => {
    const stream = `Intro\n\`\`\`json\n${FLASHCARD_JSON}\n\`\`\`\nOutro\n`;
    const envelopes: CanonicalBlockIR[] = [];

    for (let seed = 1; seed <= 5; seed++) {
      const { accumulator, upserts, dispatch } = makeAccumulator(
        `req-seed-${seed}`,
      );
      for (const chunk of chunkText(stream, seed, 6)) {
        accumulator.ingest(chunk, dispatch);
      }
      accumulator.finalize(dispatch);
      envelopes.push(lastCompleteBlockWithEnvelope(upserts).envelope);
    }

    for (const envelope of envelopes.slice(1)) {
      expect(envelope).toEqual(envelopes[0]);
    }
  });
});

describe("accumulator shadow delegation (bare JSON)", () => {
  it("parses a bare multi-line JSON object and attaches the envelope", () => {
    const { accumulator, upserts, dispatch } = makeAccumulator("req-bare");
    const stream = `Result:\n${FLASHCARD_JSON}\nDone.\n`;

    for (const chunk of chunkText(stream, 4, 8)) {
      accumulator.ingest(chunk, dispatch);
    }
    accumulator.finalize(dispatch);

    const { envelope } = lastCompleteBlockWithEnvelope(upserts);
    expect(envelope.root.kind).toBe("flashcard_set");
    expect(envelope.root.status).toBe("complete");
    expect(
      (envelope.root.value.cards as Array<Record<string, unknown>>).length,
    ).toBe(2);
  });

  it("feeds fragment deltas: minified newline-less JSON parses LIVE", () => {
    const { accumulator, upserts, dispatch } = makeAccumulator("req-minified");
    const minified = JSON.stringify({
      __kind: "flashcard_set",
      set_title: "Live",
      cards: [
        { __kind: "flashcard", front: "Q1?", back: "a1" },
        { __kind: "flashcard", front: "Q2?", back: "a2" },
      ],
    });
    // Opening line establishes the region; the rest streams with NO newlines
    // until the very end — the structured-output shape.
    const body = minified.slice(1); // after "{"
    const stream = `{\n${body}\n`;

    let sawLiveCard = false;
    for (const chunk of chunkText(stream, 9, 5)) {
      accumulator.ingest(chunk, dispatch);
      const latest = upserts[upserts.length - 1];
      const envelope = latest ? envelopeOf(latest.block) : null;
      if (
        envelope &&
        envelope.root.status === "streaming" &&
        Array.isArray(envelope.root.value.cards) &&
        (envelope.root.value.cards as unknown[]).length > 0
      ) {
        sawLiveCard = true;
      }
    }
    accumulator.finalize(dispatch);

    // Cards appeared in a STREAMING envelope before the block completed —
    // char-level progress without a single newline in the payload.
    expect(sawLiveCard).toBe(true);

    const { envelope } = lastCompleteBlockWithEnvelope(upserts);
    expect(envelope.root.status).toBe("complete");
    expect(
      (envelope.root.value.cards as Array<Record<string, unknown>>).length,
    ).toBe(2);
  });

  it("a truncated region ends with a status:error envelope, never breaking the block", () => {
    const { accumulator, upserts, dispatch } = makeAccumulator("req-truncated");
    accumulator.ingest('{\n"__kind": "flashcard_set",\n"set_title": "Cut', dispatch);
    accumulator.finalize(dispatch);

    const withEnvelope = upserts
      .filter((u) => u.block.status === "complete" && envelopeOf(u.block))
      .pop();
    expect(withEnvelope).toBeDefined();
    const envelope = envelopeOf(withEnvelope!.block)!;
    expect(envelope.root.status).toBe("error");
    expect(
      envelope.root.residue?.notices?.some((n) => n.code === "parse_error"),
    ).toBe(true);
  });
});

describe("non-JSON blocks stay untouched", () => {
  it("text / xml / non-json fences carry no envelope", () => {
    const { accumulator, upserts, dispatch } = makeAccumulator("req-clean");
    const stream =
      "Plain text.\n\n```python\nprint('hi')\n```\n\n<thinking>hmm</thinking>\n\nMore text.\n";
    for (const chunk of chunkText(stream, 2, 10)) {
      accumulator.ingest(chunk, dispatch);
    }
    accumulator.finalize(dispatch);

    for (const { block } of upserts) {
      expect(envelopeOf(block)).toBeNull();
    }
  });
});
