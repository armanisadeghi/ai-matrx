/**
 * The per-card memory aid says a chosen agent's unusable answer instead of a
 * bare "couldn't come up with a memory aid" — same pattern as microCoach.
 */
import { memoryHint } from "../memoryHint";
import { runHeadlessAgentJson } from "@/features/agents/redux/execution-system/thunks/run-headless-agent-json";

jest.mock("@/features/agents/redux/execution-system/thunks/run-headless-agent-json", () => ({
  ...jest.requireActual("@/features/agents/redux/execution-system/thunks/run-headless-agent-json"),
  runHeadlessAgentJson: jest.fn(),
}));

const runMock = jest.mocked(runHeadlessAgentJson);
const dispatch = (() => undefined) as never;
const getState = (() => ({})) as never;

const SENTENCE = "Quick Test Agent ran, but its answer is missing aid this job needs, so nothing was saved.";

describe("memoryHint — unusable output", () => {
  it("carries the sentence out via onUnusable and returns null", async () => {
    runMock.mockResolvedValue({
      success: false,
      data: null,
      fullResponse: "",
      error: SENTENCE,
      errorDetail: "mandate_output_unusable: missing aid",
    });
    const onUnusable = jest.fn();
    const out = await memoryHint({ front: "Q", back: "A", onUnusable })(dispatch, getState);
    expect(out).toBeNull();
    expect(onUnusable).toHaveBeenCalledWith(SENTENCE);
  });
});
