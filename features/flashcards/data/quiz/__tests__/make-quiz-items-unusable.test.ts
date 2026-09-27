/**
 * Test mode's AI distractor fallback says a chosen agent's unusable answer
 * instead of quietly shipping fewer options. Same pattern as gradeTypedSemantic.
 */
import { makeQuizItems } from "../makeQuizItems";
import { runHeadlessAgentJson } from "@/features/agents/redux/execution-system/thunks/run-headless-agent-json";

jest.mock("@/features/agents/redux/execution-system/thunks/run-headless-agent-json", () => ({
  ...jest.requireActual("@/features/agents/redux/execution-system/thunks/run-headless-agent-json"),
  runHeadlessAgentJson: jest.fn(),
}));

const runMock = jest.mocked(runHeadlessAgentJson);
const dispatch = (() => undefined) as never;
const getState = (() => ({})) as never;

const SENTENCE = "Quick Test Agent ran, but its answer is missing distractors this job needs, so nothing was saved.";

describe("makeQuizItems — unusable output", () => {
  it("carries the sentence out via onUnusable and returns null", async () => {
    runMock.mockResolvedValue({
      success: false,
      data: null,
      fullResponse: "",
      error: SENTENCE,
      errorDetail: "mandate_output_unusable: missing distractors",
    });
    const onUnusable = jest.fn();
    const out = await makeQuizItems({
      front: "Q",
      back: "A",
      distractorCount: 3,
      onUnusable,
    })(dispatch, getState);
    expect(out).toBeNull();
    expect(onUnusable).toHaveBeenCalledWith(SENTENCE);
  });

  it("a real item still comes back normally", async () => {
    runMock.mockResolvedValue({
      success: true,
      data: { question: "Q?", correct: "A", distractors: ["B", "C"], explanation: "" },
      fullResponse: "{}",
    });
    const onUnusable = jest.fn();
    const out = await makeQuizItems({ front: "Q", back: "A", distractorCount: 2, onUnusable })(
      dispatch,
      getState,
    );
    expect(out?.correct).toBe("A");
    expect(onUnusable).not.toHaveBeenCalled();
  });
});
