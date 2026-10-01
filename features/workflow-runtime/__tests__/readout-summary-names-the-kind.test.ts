// A KIND IS NEVER DRAWN AS RAW JSON — the readout summary table (W5 of
// features/content-ir/docs/KIND_NEVER_RAW_CHECKLIST.md, Arman 2026-09-30).
//
// The compact table mode printed the first 80 characters of
// `JSON.stringify(inv.output)` — a flashcard set read `{"__kind":"flashcard_se…`
// and an agent step read its own run envelope. The summary now names the kind
// and the instance's title.
//
// RED BEFORE GREEN: before the fix ReadoutView stringified the output inline
// (the source assertion) and `invocation-summary` did not exist.

import { readFileSync } from "fs";
import { join } from "path";

import { invocationSummary } from "../components/invocation-summary";
import type { NodeInvocationState } from "../redux/workflow-runs.slice";

const base: NodeInvocationState = {
  invocationKey: "n::root:0",
  nodeId: "n",
  specType: "ai.agent.start",
  dispatchId: null,
  itemIndex: 0,
  attempt: 1,
  phase: "settled",
  startedAt: null,
  durationMs: null,
  output: null,
  outputKind: null,
  outputKindDeclared: null,
  outputKindOk: null,
  irEnvelope: null,
  wrapper: null,
  error: null,
  progress: null,
  iteration: null,
  laneRequestId: null,
  textTail: "",
  chunksReceived: 0,
  lastStreamKind: null,
};

const flashcards = {
  __kind: "flashcard_set",
  title: "Cell biology",
  cards: [{ front: "Mitochondria", back: "Makes ATP" }],
};

function summary(over: Partial<NodeInvocationState>): string | null {
  return invocationSummary({ ...base, ...over });
}

describe("readout summary names a kind, never its JSON", () => {
  it("a value carrying __kind reads as kind name and title", () => {
    const text = summary({ output: flashcards });
    expect(text).toBe("Flashcards · Cell biology");
  });

  it("an agent's structured kind answer reads the same way", () => {
    const text = summary({
      output: { final_text: "", structured_output: flashcards },
    });
    expect(text).toBe("Flashcards · Cell biology");
  });

  it("kind JSON streaming in the text tail never shows raw", () => {
    const text = summary({
      phase: "running",
      textTail: '{"__kind":"flashcard_set","title":"Cell bi',
    });
    expect(text).toBe("Flashcards");
    expect(text).not.toContain("__kind");
  });

  it("a declared output kind is spoken in the reader's words", () => {
    expect(summary({ outputKind: "quiz_set", output: { questions: [] } })).toBe(
      "Quiz",
    );
  });

  it("prose and kindless data are still shown", () => {
    expect(summary({ textTail: "Twelve patients confirmed." })).toBe(
      "Twelve patients confirmed.",
    );
    expect(summary({ specType: "transform", output: { rows: 3 } })).toBe(
      '{"rows":3}',
    );
    expect(summary({})).toBeNull();
  });

  it("ReadoutView no longer stringifies an output into the table", () => {
    const source = readFileSync(
      join(__dirname, "..", "components", "ReadoutView.tsx"),
      "utf8",
    );
    expect(source).not.toMatch(/JSON\.stringify\(inv\.output\)/);
  });
});
