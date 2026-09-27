/**
 * The per-item "make this deeper" action says a chosen agent's unusable
 * answer instead of a bare "couldn't deepen this question".
 */
import { deepenItem } from "../deepenItem";
import { runHeadlessAgentJson } from "@/features/agents/redux/execution-system/thunks/run-headless-agent-json";

jest.mock("@/features/agents/redux/execution-system/thunks/run-headless-agent-json", () => ({
  ...jest.requireActual("@/features/agents/redux/execution-system/thunks/run-headless-agent-json"),
  runHeadlessAgentJson: jest.fn(),
}));

const runMock = jest.mocked(runHeadlessAgentJson);
const dispatch = (() => undefined) as never;
const getState = (() => ({})) as never;

const SENTENCE = "Quick Test Agent ran, but its answer is missing prompt this job needs, so nothing was saved.";

describe("deepenItem — unusable output", () => {
  it("carries the sentence out via onUnusable and returns null", async () => {
    runMock.mockResolvedValue({
      success: false,
      data: null,
      fullResponse: "",
      error: SENTENCE,
      errorDetail: "mandate_output_unusable: missing prompt",
    });
    const onUnusable = jest.fn();
    const out = await deepenItem({
      item: {
        prompt: "Q",
        correct_answer: "A",
        question_type: "short_answer",
        depth: "recall",
        topic: null,
      } as never,
      onUnusable,
    })(dispatch, getState);
    expect(out).toBeNull();
    expect(onUnusable).toHaveBeenCalledWith(SENTENCE);
  });
});
