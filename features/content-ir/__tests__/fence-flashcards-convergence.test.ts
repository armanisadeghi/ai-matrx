/**
 * The FENCE twin of the keystone: a ```flashcards fence region converges to
 * the canonical `flashcard_set` kind at region finalize — same strategy as
 * the XML surface, fence discriminator. Proven at the HOST level on the REAL
 * StreamBlockAccumulator (chunked) and the REAL splitContentIntoBlocksV2
 * (one-shot); a truncated fence (stream death, no closing fence) stays on
 * legacy rendering with no envelope.
 */

import type { RenderBlockPayload } from "@/types/python-generated/stream-events";
import { StreamBlockAccumulator } from "@/features/agents/redux/execution-system/utils/stream-block-accumulator";
import { splitContentIntoBlocksV2 } from "@/components/mardown-display/markdown-classification/processors/utils/content-splitter-v2";
import { isCanonicalBlockIR } from "../core/normalize";
import { IR_ENVELOPE_KEY, type CanonicalBlockIR } from "../core/ir-types";
import { chunkText } from "./seeded-random";

const FENCE_BODY = [
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
].join("\n");

const SAMPLE_FENCE = ["```flashcards", FENCE_BODY, "```"].join("\n");

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

function lastCompleteFlashcards(upserts: Upsert[]): RenderBlockPayload {
  for (let i = upserts.length - 1; i >= 0; i--) {
    const block = upserts[i].block;
    if (block.type === "flashcards" && block.status === "complete") {
      return block;
    }
  }
  throw new Error("no complete flashcards block emitted");
}

describe("```flashcards fence → flashcard_set convergence (accumulator)", () => {
  it("stamps a complete envelope with the fence discriminator on clean close", () => {
    const stream = `Cards below:\n\n${SAMPLE_FENCE}\n\nDone.\n`;
    const upserts = runAccumulator(stream, "req-fence-flashcards", 5);
    const block = lastCompleteFlashcards(upserts);
    const envelope = envelopeOf(
      block.metadata as Record<string, unknown> | null | undefined,
    );
    expect(envelope).not.toBeNull();
    expect(envelope!.root.kind).toBe("flashcard_set");
    expect(envelope!.root.discriminator).toEqual({
      format: "fence",
      language: "flashcards",
    });
    expect(envelope!.root.status).toBe("complete");
  });

  it("a truncated fence (stream death) gets NO envelope — legacy rendering stands", () => {
    const truncated = "Cards below:\n\n```flashcards\n" + FENCE_BODY; // no closing fence
    const upserts = runAccumulator(truncated, "req-fence-truncated", 7);
    const block = lastCompleteFlashcards(upserts);
    expect(
      envelopeOf(block.metadata as Record<string, unknown> | null | undefined),
    ).toBeNull();
  });
});

describe("```flashcards fence → flashcard_set convergence (splitter one-shot)", () => {
  it("stamps the same canonical value as the accumulator path", () => {
    const upserts = runAccumulator(
      `x\n\n${SAMPLE_FENCE}\n\ny\n`,
      "req-fence-parity",
      11,
    );
    const streamed = envelopeOf(
      lastCompleteFlashcards(upserts).metadata as
        | Record<string, unknown>
        | null
        | undefined,
    );

    const blocks = splitContentIntoBlocksV2(`x\n\n${SAMPLE_FENCE}\n\ny\n`);
    const fenceBlock = blocks.find((b) => b.type === "flashcards");
    expect(fenceBlock).toBeDefined();
    const oneShot = envelopeOf(
      fenceBlock!.metadata as Record<string, unknown> | null | undefined,
    );
    expect(oneShot).not.toBeNull();
    expect(oneShot!.root.kind).toBe("flashcard_set");
    expect(oneShot!.root.value).toEqual(streamed!.root.value);
    expect(oneShot!.fingerprint).toBe(streamed!.fingerprint);
  });

  it("an EOF-truncated fence gets NO envelope in the one-shot path", () => {
    const blocks = splitContentIntoBlocksV2(
      "x\n\n```flashcards\n" + FENCE_BODY,
    );
    const fenceBlock = blocks.find((b) => b.type === "flashcards");
    expect(fenceBlock).toBeDefined();
    expect(
      envelopeOf(
        fenceBlock!.metadata as Record<string, unknown> | null | undefined,
      ),
    ).toBeNull();
  });
});
