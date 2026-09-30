/**
 * THE NEVER-BLANK LAW.
 *
 * A stream used to end with a TRAILING EMPTY TEXT BLOCK after the structured
 * region closed, so any consumer that rendered "the newest block" blanked the
 * moment the stream finished. (Observed 2026-08-24 on the streaming-options
 * demo: every kind "went blank again at the end".)
 *
 * Since 2684db5b52 / c0cbcad2ac the accumulator keeps that post-root text slot
 * internal and never emits it when nothing follows the root. This test pins
 * the contract that makes a blank ending impossible: (1) no upsert after the
 * structured block is an empty completed block — the newest upsert IS the
 * structured, non-empty answer — and (2) selecting by the `__ir` envelope
 * yields the structured, renderable block after `finalize`.
 *
 * Source-independence: the SAME assertions run for a chunked stream and for a
 * single whole-document ingest (the DB-reload path). One pipeline, one result.
 */

import type { RenderBlockPayload } from "@/types/python-generated/stream-events";
import { StreamBlockAccumulator } from "@/features/agents/redux/execution-system/utils/stream-block-accumulator";
import { applyIrKindRoute } from "../react/kind-route";
import { readEnvelope } from "../redux/render-block-envelope";
import { buildWireText, chunkWireText } from "../studio/stream-simulator";

const QUIZ = {
  title: "Cell Biology Fundamentals",
  questions: [
    {
      __kind: "quiz_question",
      type: "multiple_choice",
      question: "Which organelle is the primary site of ATP production?",
      options: ["Mitochondrion", "Nucleus", "Lysosome", "Golgi apparatus"],
      correct_answer: "Mitochondrion",
    },
    {
      __kind: "quiz_question",
      type: "true_false",
      question: "Prokaryotic cells contain membrane-bound organelles.",
      options: ["True", "False"],
      correct_answer: "False",
    },
  ],
};

/** Run a quiz_set through the accumulator; return every block it upserted. */
function runStream(mode: "chunked" | "whole"): {
  ordered: RenderBlockPayload[];
  byId: Map<string, RenderBlockPayload>;
} {
  const ordered: RenderBlockPayload[] = [];
  const byId = new Map<string, RenderBlockPayload>();
  const accumulator = new StreamBlockAccumulator("never-blank", (payload) => {
    const block = payload.block as RenderBlockPayload;
    ordered.push(block);
    byId.set(block.blockId, block);
    return payload;
  });
  const dispatch = (action: unknown) => action;
  const wire = buildWireText(QUIZ, "quiz_set", "bare");
  if (mode === "whole") {
    accumulator.ingest(wire, dispatch);
  } else {
    for (const chunk of chunkWireText(wire, 30)) accumulator.ingest(chunk, dispatch);
  }
  accumulator.finalize(dispatch);
  return { ordered, byId };
}

/** The demo/host selection rule: the block carrying the `__ir` envelope. */
function pickStructured(
  byId: Map<string, RenderBlockPayload>,
): RenderBlockPayload | null {
  for (const block of byId.values()) {
    if (readEnvelope(block.metadata)) return block;
  }
  return null;
}

describe.each(["chunked", "whole"] as const)(
  "quiz_set stream (%s) never ends blank",
  (mode) => {
    it("ends on the structured block, never on an empty trailing one", () => {
      const { ordered } = runStream(mode);
      const last = ordered[ordered.length - 1];
      // Even a naive "render the last upsert" consumer must land on the answer.
      expect(readEnvelope(last.metadata)?.root.kind).toBe("quiz_set");
      expect(last.status).toBe("complete");
      expect((last.content ?? "").trim()).not.toBe("");

      // No completed block anywhere in the stream is blank.
      const blankCompleted = ordered.filter(
        (b) => b.status === "complete" && !(b.content ?? "").trim(),
      );
      expect(blankCompleted).toEqual([]);
    });

    it("still holds a structured block that routes to the real renderer", () => {
      const { byId } = runStream(mode);
      const structured = pickStructured(byId);
      expect(structured).not.toBeNull();

      const routed = applyIrKindRoute({
        type: structured!.type,
        content: structured!.content ?? "",
        serverData: structured!.data ?? undefined,
        metadata: structured!.metadata,
      });

      expect(routed.type).toBe("quiz");
      expect(Object.keys(routed.serverData ?? {})).toEqual(
        expect.arrayContaining(["quizTitle", "multipleChoice"]),
      );
      expect(
        (routed.serverData as { multipleChoice: unknown[] }).multipleChoice,
      ).toHaveLength(QUIZ.questions.length);
    });
  },
);

it("streamed and whole-document ingests reach the SAME final render", () => {
  const streamed = pickStructured(runStream("chunked").byId);
  const loaded = pickStructured(runStream("whole").byId);

  const route = (block: RenderBlockPayload | null) =>
    applyIrKindRoute({
      type: block!.type,
      content: block!.content ?? "",
      serverData: block!.data ?? undefined,
      metadata: block!.metadata,
    });

  const a = route(streamed);
  const b = route(loaded);
  expect(a.type).toBe(b.type);
  expect(a.serverData).toEqual(b.serverData);
});
