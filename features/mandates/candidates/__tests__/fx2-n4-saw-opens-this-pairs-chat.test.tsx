/**
 * 🚨 V2 N4 — "WHAT THE LIVE AGENT SAW" / "WHAT THE CANDIDATE SAW" ALWAYS OPENS
 * THIS PAIR'S CHAT.
 *
 * V2 shot 14: with a review-walk window already open, the click on another
 * pair's button did nothing — the old window (another pair's transcript)
 * stayed, the URL did not change. The button was DISABLED while its transcript
 * lookup ran (a slow clone read; it looked enabled), so the click was
 * swallowed and the person was left looking at the previous pair's walk.
 *
 * The button is never dead: a click during the lookup resolves THIS pair's
 * conversation on the spot and opens (or focuses) its walk.
 */

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

jest.mock("@/lib/api/typed-client", () => ({ apiGet: jest.fn(), apiPost: jest.fn(), buildPath: jest.fn() }));
jest.mock("@/utils/supabase/client", () => ({ supabase: {} }));
jest.mock("@/components/cost/Cost", () => ({ Cost: () => <span>—</span> }));
jest.mock("@/features/mandates/admin/bench-output-preview", () => ({
  OutputPreview: ({ output }: { output: string }) => <div>{output}</div>,
}));
jest.mock("@/features/overlays/openers/diffViewerWindow", () => ({ useOpenDiffViewerWindow: () => jest.fn() }));
const openWalk = jest.fn();
jest.mock("@/features/overlays/openers/reviewWalkWindow", () => ({ useOpenReviewWalkWindow: () => openWalk }));
jest.mock("../openers", () => ({ useOpenCandidateSummary: () => jest.fn(), useOpenCandidateRun: () => jest.fn() }));
const findTranscriptUnit = jest.fn();
jest.mock("../transcripts", () => ({
  // The lookup has not answered yet when the person clicks.
  useTranscriptUnit: () => ({ state: "loading" }),
  findTranscriptUnit: (...args: unknown[]) => findTranscriptUnit(...args),
}));
jest.mock("@/lib/redux/hooks", () => ({ useAppDispatch: () => jest.fn(), useAppSelector: () => "user-1" }));
// The chat package reads these hooks through its own module (P3): one double covers both.
jest.mock("@ai-matrx/chat/store/hooks", () => jest.requireMock("@/lib/redux/hooks"));

import { CandidateRunBody } from "../components/CandidateRunBody";

let container: HTMLDivElement;
let root: Root | null = null;

afterEach(() => {
  act(() => root?.unmount());
  root = null;
  container?.remove();
  openWalk.mockReset();
  findTranscriptUnit.mockReset();
});

function pairRow(id: string, liveConv: string, candConv: string) {
  return {
    run: {
      id,
      candidate_id: "cand-1",
      number: 2,
      door: "chat_start",
      status: "completed",
      verdict: "worse",
      live_request_id: "r",
      live_conversation_id: liveConv,
      candidate_conversation_id: candConv,
      input_differences: { identical: true, expected: [], flagged: [], unmeasured: [] },
      tool_dispositions: [],
      created_at: "2026-10-01T01:00:00Z",
      updated_at: "2026-10-01T01:01:00Z",
      payload: { live_output: { text: "live" }, candidate_output: { text: "cand" } },
    },
    candidate: null,
  } as never;
}

it("a click while the lookup runs opens the walk of THIS pair's live conversation", async () => {
  findTranscriptUnit.mockImplementation(async ({ conversationId }: { conversationId: string }) => ({
    state: "ready",
    unit: { unitKind: "agent_request", unitId: `request-of-${conversationId}` },
  }));
  container = document.createElement("div");
  document.body.appendChild(container);
  act(() => {
    root = createRoot(container);
    root.render(<CandidateRunBody row={pairRow("kelp", "conv-kelp-live", "conv-kelp-cand")} />);
  });

  const button = container.querySelector<HTMLButtonElement>('[data-candidate-saw="live"]')!;
  expect(button).not.toBeNull();
  expect(button.disabled).toBe(false);

  await act(async () => {
    button.dispatchEvent(new MouseEvent("click", { bubbles: true }));
  });
  await act(async () => {
    await Promise.resolve();
  });

  expect(findTranscriptUnit).toHaveBeenCalledWith({ requestId: "r", conversationId: "conv-kelp-live" });
  expect(openWalk).toHaveBeenCalledTimes(1);
  expect(openWalk.mock.calls[0][0]).toMatchObject({
    unitKind: "agent_request",
    unitId: "request-of-conv-kelp-live",
  });
});
