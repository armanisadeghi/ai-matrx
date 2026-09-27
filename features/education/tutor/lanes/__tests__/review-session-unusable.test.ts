/**
 * The mode-agnostic end-of-session review (`FC_MANDATES.reviewBatch`) says a
 * chosen agent's unusable answer instead of silently landing a `null` review.
 */
import { reviewSession } from "../reviewSession";
import { runHeadlessAgentJson } from "@/features/agents/redux/execution-system/thunks/run-headless-agent-json";

jest.mock("@/features/agents/redux/execution-system/thunks/run-headless-agent-json", () => ({
  ...jest.requireActual("@/features/agents/redux/execution-system/thunks/run-headless-agent-json"),
  runHeadlessAgentJson: jest.fn(),
}));
jest.mock("@/features/overlays/openers/liveRunWindow", () => ({
  openLiveRunWindowAction: jest.fn(() => ({ type: "noop" })),
}));
jest.mock("@/features/education/study/reviewRun", () => ({
  ...jest.requireActual("@/features/education/study/reviewRun"),
  stampReviewRun: jest.fn().mockResolvedValue(undefined),
}));
jest.mock("@/features/education/study/service/studyService", () => ({
  studyService: { updateSession: jest.fn().mockResolvedValue({ error: null }) },
}));

const runMock = jest.mocked(runHeadlessAgentJson);
const dispatch = (() => undefined) as never;
const getState = (() => ({})) as never;

const SENTENCE = "Quick Test Agent ran, but its answer is missing summary this job needs, so nothing was saved.";

describe("reviewSession (tutor) — unusable output", () => {
  it("carries the sentence out via onUnusable and returns null", async () => {
    runMock.mockResolvedValue({
      success: false,
      data: null,
      fullResponse: "",
      error: SENTENCE,
      errorDetail: "mandate_output_unusable: missing summary",
      conversationId: "conv-1",
    });
    const onUnusable = jest.fn();
    const out = await reviewSession({
      sessionId: "sess-1",
      attempts: [{ front: "Q", transcript: "a", result: "correct", score: 1 } as never],
      aggregate: { total: 1, graded: 1, correct: 1, accuracy: 1 },
      onUnusable,
    })(dispatch, getState);
    expect(out).toBeNull();
    expect(onUnusable).toHaveBeenCalledWith(SENTENCE);
  });
});
