/**
 * Stream simulator engine (/shapes/[kind]/stream): the wire builders, the
 * chunker, and the verdicts — proven against the REAL StreamBlockAccumulator
 * so the tab's pass/fail chips measure production behavior, not a lookalike.
 */

import type { RenderBlockPayload } from "@/types/python-generated/stream-events";
import { StreamBlockAccumulator } from "@/features/agents/redux/execution-system/utils/stream-block-accumulator";
import {
  buildWireText,
  chunkWireText,
  deriveStreamVerdicts,
  recordFromUpsert,
  withKindFirst,
  type StreamTickRecord,
} from "@/features/content-ir/studio/stream-simulator";

const FLASHCARDS = {
  title: "Sim Test",
  cards: [
    { __kind: "flashcard", front: "A?", back: "a" },
    { __kind: "flashcard", front: "B?", back: "b" },
    { __kind: "flashcard", front: "C?", back: "c" },
  ],
};

describe("wire builders", () => {
  it("puts __kind FIRST (pre-recognition on the first key)", () => {
    const reordered = withKindFirst(
      { title: "x", __kind: "elsewhere" },
      "flashcard_set",
    );
    expect(Object.keys(reordered)[0]).toBe("__kind");
    expect(reordered.__kind).toBe("flashcard_set");

    const bare = buildWireText(FLASHCARDS, "flashcard_set", "bare");
    expect(bare.startsWith('{"__kind":"flashcard_set"')).toBe(true);
    expect(bare.includes("\n")).toBe(false); // the structured-output shape

    const fenced = buildWireText(FLASHCARDS, "flashcard_set", "fenced");
    expect(fenced).toContain("```json");
    expect(/```json\n\{\n\s+"__kind": "flashcard_set"/.test(fenced)).toBe(true);
  });

  it("chunker covers the text exactly", () => {
    const text = buildWireText(FLASHCARDS, "flashcard_set", "fenced");
    for (const size of [1, 7, 36, 10_000]) {
      expect(chunkWireText(text, size).join("")).toBe(text);
    }
  });
});

function runThroughAccumulator(wire: string, chunkSize: number) {
  const records: StreamTickRecord[] = [];
  let chunkNo = 0;
  const accumulator = new StreamBlockAccumulator("sim-test", (payload) => {
    records.push(recordFromUpsert(chunkNo, payload.block as RenderBlockPayload));
    return payload;
  });
  const dispatch = (action: unknown) => action;
  const chunks = chunkWireText(wire, chunkSize);
  for (const chunk of chunks) {
    chunkNo += 1;
    accumulator.ingest(chunk, dispatch);
  }
  chunkNo += 1;
  accumulator.finalize(dispatch);
  return records;
}

describe("verdicts against the REAL accumulator", () => {
  it("fenced flashcard_set: detected + kind-resolved + progressive + clean finish", () => {
    const wire = buildWireText(FLASHCARDS, "flashcard_set", "fenced");
    const verdicts = deriveStreamVerdicts(
      runThroughAccumulator(wire, 24),
      "flashcard_set",
    );
    expect(verdicts.detectedWhileStreaming).toBe(true);
    expect(verdicts.kindResolvedWhileStreaming).toBe(true);
    expect(verdicts.growthSteps).toBeGreaterThan(1);
    expect(verdicts.rawTextFlash).toBe(false);
    expect(verdicts.completedAsKind).toBe(true);
  });

  it("bare structured-output flashcard_set: same guarantees, no raw flash", () => {
    const wire = buildWireText(FLASHCARDS, "flashcard_set", "bare");
    const verdicts = deriveStreamVerdicts(
      runThroughAccumulator(wire, 16),
      "flashcard_set",
    );
    expect(verdicts.detectedWhileStreaming).toBe(true);
    expect(verdicts.kindResolvedWhileStreaming).toBe(true);
    expect(verdicts.rawTextFlash).toBe(false);
    expect(verdicts.completedAsKind).toBe(true);
  });
});

describe("verdict derivation (unit)", () => {
  it("flags a raw-JSON flash and a stream that never detects", () => {
    const records: StreamTickRecord[] = [
      {
        chunk: 1,
        blockId: "b1",
        type: "text",
        status: "streaming",
        envelope: null,
        rawKindTextVisible: true,
      },
      {
        chunk: 2,
        blockId: "b1",
        type: "text",
        status: "complete",
        envelope: null,
        rawKindTextVisible: false,
      },
    ];
    const verdicts = deriveStreamVerdicts(records, "quiz_set");
    expect(verdicts.rawTextFlash).toBe(true);
    expect(verdicts.detectedWhileStreaming).toBe(false);
    expect(verdicts.completedAsKind).toBe(false);
  });
});
