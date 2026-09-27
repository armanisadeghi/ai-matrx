/**
 * Assessment grading (typed + image) already always returns a `GradedAnswer`
 * with an on-screen `explanation` — so a chosen grader's unusable answer
 * replaces the generic fallback text with the plain sentence, instead of the
 * person reading "we couldn't auto-grade this" with no reason why.
 */
import { gradeAnswerAI, gradeAnswerImage } from "../grading";
import { runHeadlessAgentJson } from "@/features/agents/redux/execution-system/thunks/run-headless-agent-json";
import * as imageGrading from "../imageGrading";

jest.mock("@/features/agents/redux/execution-system/thunks/run-headless-agent-json", () => ({
  ...jest.requireActual("@/features/agents/redux/execution-system/thunks/run-headless-agent-json"),
  runHeadlessAgentJson: jest.fn(),
}));

const runMock = jest.mocked(runHeadlessAgentJson);
const getState = (() => ({})) as never;
// A minimal thunk-dispatching dispatch: `dispatch(thunk)` runs
// `thunk(dispatch, getState)`, exactly like the real Redux Thunk middleware.
const dispatch = ((action: unknown) =>
  typeof action === "function"
    ? (action as (d: unknown, g: unknown) => unknown)(dispatch, getState)
    : action) as never;

const SENTENCE = "Quick Test Agent ran, but its answer is missing result, explanation this job needs, so nothing was saved.";

describe("gradeAnswerAI — unusable output", () => {
  it("puts the plain sentence in the explanation the learner already sees", async () => {
    runMock.mockResolvedValue({
      success: false,
      data: null,
      fullResponse: "",
      error: SENTENCE,
      errorDetail: "mandate_output_unusable: missing result, explanation",
    });
    const graded = await gradeAnswerAI({
      question: "Q",
      expected: "A",
      learnerAnswer: "A",
    })(dispatch, getState);
    expect(graded.gradedBy).toBe("unusable");
    expect(graded.explanation).toContain(SENTENCE);
  });
});

describe("gradeAnswerImage — unusable output", () => {
  it("puts the plain sentence in the explanation the learner already sees", async () => {
    jest.spyOn(imageGrading, "uploadWorkPhoto").mockResolvedValue("file-1");
    // Simulate `runVisionGrader` firing its `onUnusable` callback exactly as
    // the real lane does when `mandateOutputUnusableSentence` finds one.
    jest.spyOn(imageGrading, "runVisionGrader").mockImplementation(
      (args) =>
        (async () => {
          args.onUnusable?.(SENTENCE);
          return null;
        }) as never,
    );
    const graded = await gradeAnswerImage({
      question: "Q",
      expected: "A",
      photo: new Blob(["x"], { type: "image/png" }),
    })(dispatch);
    expect(graded.gradedBy).toBe("unusable");
    expect(graded.explanation).toContain(SENTENCE);
  });
});
