/**
 * "Make this deeper" (enrichCard/expandCard) says a chosen agent's unusable
 * answer instead of a bare "nothing new" — same pattern as gradeTypedSemantic.
 * RED on the old tree: `onUnusable` did not exist and the sentence was dropped.
 */
import { enrichCard, expandCard } from "../enhanceCard";
import { runHeadlessAgentJson } from "@/features/agents/redux/execution-system/thunks/run-headless-agent-json";
import type { CardWithDetails } from "../types";

jest.mock("@/features/agents/redux/execution-system/thunks/run-headless-agent-json", () => ({
  ...jest.requireActual("@/features/agents/redux/execution-system/thunks/run-headless-agent-json"),
  runHeadlessAgentJson: jest.fn(),
}));

const runMock = jest.mocked(runHeadlessAgentJson);
const dispatch = (() => undefined) as never;
const getState = (() => ({})) as never;

const card = { id: "card-1", front: "Q", back: "A", topic: "t", details: [] } as unknown as CardWithDetails;

const SENTENCE =
  "Quick Test Agent ran, but its answer is missing details this job needs, so nothing was saved.";

describe("enrichCard / expandCard — unusable output", () => {
  it("enrichCard carries the sentence out via onUnusable and returns null", async () => {
    runMock.mockResolvedValue({
      success: false,
      data: null,
      fullResponse: "",
      error: SENTENCE,
      errorDetail: "mandate_output_unusable: missing details",
    });
    const onUnusable = jest.fn();
    const out = await enrichCard({ card, depth: "applied", onUnusable })(dispatch, getState);
    expect(out).toBeNull();
    expect(onUnusable).toHaveBeenCalledWith(SENTENCE);
  });

  it("expandCard carries the sentence out via onUnusable and returns null", async () => {
    runMock.mockResolvedValue({
      success: false,
      data: null,
      fullResponse: "",
      error: SENTENCE,
      errorDetail: "mandate_output_unusable: missing sub_cards",
    });
    const onUnusable = jest.fn();
    const out = await expandCard({ card, depth: "applied", onUnusable })(dispatch, getState);
    expect(out).toBeNull();
    expect(onUnusable).toHaveBeenCalledWith(SENTENCE);
  });

  it("any other failure never calls onUnusable (existing toast stands)", async () => {
    runMock.mockResolvedValue({ success: false, data: null, fullResponse: "", error: "timed out" });
    const onUnusable = jest.fn();
    await enrichCard({ card, depth: "applied", onUnusable })(dispatch, getState);
    expect(onUnusable).not.toHaveBeenCalled();
  });
});
