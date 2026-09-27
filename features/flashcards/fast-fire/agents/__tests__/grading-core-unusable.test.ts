/**
 * The spoken-answer grading core says a chosen grader's unusable answer
 * instead of a bare "no grade" — every FastFire / spoken-practice surface
 * that drives `runSpokenGrader` inherits this for free.
 */
import { runSpokenGrader } from "../grading-core";
import { runHeadlessAgentJson } from "@/features/agents/redux/execution-system/thunks/run-headless-agent-json";

jest.mock("@/features/agents/redux/execution-system/thunks/run-headless-agent-json", () => ({
  ...jest.requireActual("@/features/agents/redux/execution-system/thunks/run-headless-agent-json"),
  runHeadlessAgentJson: jest.fn(),
}));

const runMock = jest.mocked(runHeadlessAgentJson);
const dispatch = (() => undefined) as never;
const getState = (() => ({})) as never;

const SENTENCE = "Quick Test Agent ran, but its answer is missing result, explanation this job needs, so nothing was saved.";

describe("runSpokenGrader — unusable output", () => {
  it("carries the sentence out via onUnusable and returns null (no retry)", async () => {
    runMock.mockResolvedValue({
      success: false,
      data: null,
      fullResponse: "",
      error: SENTENCE,
      errorDetail: "mandate_output_unusable: missing result, explanation",
    });
    const onUnusable = jest.fn();
    const out = await runSpokenGrader({
      mandateKey: "flashcards.grade_spoken" as never,
      front: "Q",
      back: "A",
      secondsAllowed: 20,
      responseAudioFileId: "file-1",
      surfaceKey: "test",
      sourceFeature: "education-fastfire" as never,
      onUnusable,
    })(dispatch, getState);
    expect(out).toBeNull();
    expect(onUnusable).toHaveBeenCalledWith(SENTENCE);
    // Unusable output is a WARNED, terminal answer — never retried like a
    // malformed one.
    expect(runMock).toHaveBeenCalledTimes(1);
  });
});
