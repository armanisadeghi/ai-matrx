/**
 * Pre-generated helper audio (the "I'm confused" zero-wait lane) says a
 * chosen enrich agent's unusable answer instead of a bare failed-card count.
 */
import { generateHelperAudio } from "../generateHelperAudio.thunk";
import { runHeadlessAgentJson } from "@/features/agents/redux/execution-system/thunks/run-headless-agent-json";
import type { CardWithDetails } from "@/features/flashcards/data/types";

jest.mock("@/features/agents/redux/execution-system/thunks/run-headless-agent-json", () => ({
  ...jest.requireActual("@/features/agents/redux/execution-system/thunks/run-headless-agent-json"),
  runHeadlessAgentJson: jest.fn(),
}));

const runMock = jest.mocked(runHeadlessAgentJson);
const getState = (() => ({})) as never;
// A minimal thunk-dispatching dispatch — `generateHelperAudio` dispatches
// `writeHelperText`, a nested thunk, so a no-op dispatch would silently skip
// the whole run instead of exercising the coercion + onUnusable path.
const dispatch = ((action: unknown) =>
  typeof action === "function"
    ? (action as (d: unknown, g: unknown) => unknown)(dispatch, getState)
    : action) as never;

const card = { id: "card-1", front: "Q", back: "A", topic: null, details: [] } as unknown as CardWithDetails;

const SENTENCE = "Quick Test Agent ran, but its answer is missing details this job needs, so nothing was saved.";

describe("generateHelperAudio — unusable output", () => {
  it("carries the sentence out via onUnusable and returns null", async () => {
    runMock.mockResolvedValue({
      success: false,
      data: null,
      fullResponse: "",
      error: SENTENCE,
      errorDetail: "mandate_output_unusable: missing details",
    });
    const onUnusable = jest.fn();
    const out = await generateHelperAudio(card, onUnusable)(dispatch);
    expect(out).toBeNull();
    expect(onUnusable).toHaveBeenCalledWith(SENTENCE);
  });
});
