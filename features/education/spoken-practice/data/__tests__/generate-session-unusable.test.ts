/**
 * The spoken-practice session designer says a chosen agent's unusable answer
 * instead of a bare "couldn't design your session".
 */
import { generateSession } from "../generateSession";
import { runHeadlessAgentJson } from "@/features/agents/redux/execution-system/thunks/run-headless-agent-json";

jest.mock("@/features/agents/redux/execution-system/thunks/run-headless-agent-json", () => ({
  ...jest.requireActual("@/features/agents/redux/execution-system/thunks/run-headless-agent-json"),
  runHeadlessAgentJson: jest.fn(),
}));

const runMock = jest.mocked(runHeadlessAgentJson);
const dispatch = (() => undefined) as never;
const getState = (() => ({})) as never;

const SENTENCE = "Quick Test Agent ran, but its answer is missing prompts this job needs, so nothing was saved.";

describe("generateSession — unusable output", () => {
  it("carries the sentence out via onUnusable and returns null", async () => {
    runMock.mockResolvedValue({
      success: false,
      data: null,
      fullResponse: "",
      error: SENTENCE,
      errorDetail: "mandate_output_unusable: missing prompts",
    });
    const onUnusable = jest.fn();
    const out = await generateSession({
      mode: "recall" as never,
      focus: "topic",
      difficulty: "medium",
      count: 5,
      studyMaterial: "",
      source: null,
      onUnusable,
    })(dispatch, getState);
    expect(out).toBeNull();
    expect(onUnusable).toHaveBeenCalledWith(SENTENCE);
  });
});
