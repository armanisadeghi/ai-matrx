/**
 * The handwritten/photo answer grading core says a chosen vision grader's
 * unusable answer instead of a bare null.
 */
import { runVisionGrader } from "../imageGrading";
import { runHeadlessAgentJson } from "@/features/agents/redux/execution-system/thunks/run-headless-agent-json";

jest.mock("@/features/agents/redux/execution-system/thunks/run-headless-agent-json", () => ({
  ...jest.requireActual("@/features/agents/redux/execution-system/thunks/run-headless-agent-json"),
  runHeadlessAgentJson: jest.fn(),
}));

const runMock = jest.mocked(runHeadlessAgentJson);
const dispatch = (() => undefined) as never;
const getState = (() => ({})) as never;

const SENTENCE = "Quick Test Agent ran, but its answer is missing steps this job needs, so nothing was saved.";

describe("runVisionGrader — unusable output", () => {
  it("carries the sentence out via onUnusable and returns null", async () => {
    runMock.mockResolvedValue({
      success: false,
      data: null,
      fullResponse: "",
      error: SENTENCE,
      errorDetail: "mandate_output_unusable: missing steps",
    });
    const onUnusable = jest.fn();
    const out = await runVisionGrader({
      mandateKey: "education.grade_handwritten" as never,
      question: "Q",
      expected: "A",
      responseImageFileId: "file-1",
      surfaceKey: "test",
      sourceFeature: "education-assessment" as never,
      onUnusable,
    })(dispatch, getState);
    expect(out).toBeNull();
    expect(onUnusable).toHaveBeenCalledWith(SENTENCE);
  });
});
