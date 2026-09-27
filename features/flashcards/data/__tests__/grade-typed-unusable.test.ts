/**
 * A chosen grader that cannot answer this job is SAID, never swallowed.
 *
 * Live run 2026-09-27: a plain-text agent bound for
 * `flashcards.grade_typed_answer` ran, answered in prose, and the learner saw
 * only the spelling fallback with no word about why. The funnel now fails such
 * a run with `mandate_output_unusable`; this lane must carry the sentence out.
 *
 * RED on the old tree: `gradeTypedSemantic` returned `null` for it.
 */
import { gradeTypedSemantic } from "../gradeTypedSemantic";
import { runHeadlessAgentJson } from "@/features/agents/redux/execution-system/thunks/run-headless-agent-json";

jest.mock("@/features/agents/redux/execution-system/thunks/run-headless-agent-json", () => ({
  ...jest.requireActual("@/features/agents/redux/execution-system/thunks/run-headless-agent-json"),
  runHeadlessAgentJson: jest.fn(),
}));

const runMock = jest.mocked(runHeadlessAgentJson);
const ctx = { question: "Capital of France?", expectedAnswer: "Paris", learnerAnswer: "paris" };
const dispatch = (() => undefined) as never;
const getState = (() => ({})) as never;

const SENTENCE =
  "Quick Test Agent ran, but its answer is missing result, explanation this job needs, so nothing was saved. It was chosen although it does not declare those keys — pick one that does.";

describe("gradeTypedSemantic", () => {
  it("carries the unusable-output sentence out to the surface", async () => {
    runMock.mockResolvedValue({
      success: false,
      data: null,
      fullResponse: "Here is a guide…",
      error: SENTENCE,
      errorDetail: "mandate_output_unusable: missing result, explanation",
    });
    expect(await gradeTypedSemantic(ctx)(dispatch, getState)).toEqual({ kind: "unusable", sentence: SENTENCE });
  });

  it("any other failure stays null (the spelling suggestion stands)", async () => {
    runMock.mockResolvedValue({ success: false, data: null, fullResponse: "", error: "timed out" });
    expect(await gradeTypedSemantic(ctx)(dispatch, getState)).toBeNull();
  });

  it("a verdict comes back as a verdict", async () => {
    runMock.mockResolvedValue({
      success: true,
      data: { result: "correct", explanation: "Same meaning." },
      fullResponse: "{}",
    });
    const out = await gradeTypedSemantic(ctx)(dispatch, getState);
    expect(out?.kind).toBe("verdict");
  });
});
