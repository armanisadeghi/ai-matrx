/**
 * An older pair whose request id names no request opens the newest run of its
 * chat — and when that chat holds several runs, the Saw button says so in one
 * short line instead of silently picking one (see
 * `saw-opens-this-pairs-own-request.test.tsx` for the lookup itself).
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
jest.mock("@/features/overlays/openers/reviewWalkWindow", () => ({ useOpenReviewWalkWindow: () => jest.fn() }));
jest.mock("../openers", () => ({ useOpenCandidateSummary: () => jest.fn(), useOpenCandidateRun: () => jest.fn() }));
jest.mock("../transcripts", () => ({
  useTranscriptUnit: ({ conversationId }: { conversationId: string | null }) =>
    conversationId === "conv-shared"
      ? { state: "ready", unit: { unitKind: "agent_request", unitId: "x" }, runsInChat: 3 }
      : conversationId === "conv-own"
        ? { state: "ready", unit: { unitKind: "agent_request", unitId: "y" } }
        : { state: "none" },
  findTranscriptUnit: jest.fn(),
}));
jest.mock("@/lib/redux/hooks", () => ({ useAppDispatch: () => jest.fn(), useAppSelector: () => "user-1" }));
jest.mock("@ai-matrx/chat/store/hooks", () => jest.requireMock("@/lib/redux/hooks"));

import { CandidateRunBody } from "../components/CandidateRunBody";

let container: HTMLDivElement;
let root: Root | null = null;
afterEach(() => {
  act(() => root?.unmount());
  root = null;
  container?.remove();
});

function render(liveConv: string, candConv: string) {
  const row = {
    run: {
      id: "pair-1",
      candidate_id: "cand-1",
      number: 1,
      door: "run_mandate",
      status: "completed",
      verdict: "worse",
      live_request_id: "old-id",
      candidate_request_id: "cand-id",
      live_conversation_id: liveConv,
      candidate_conversation_id: candConv,
      input_differences: { identical: true, expected: [], flagged: [], unmeasured: [] },
      tool_dispositions: [],
      created_at: "2026-10-03T22:20:00Z",
      updated_at: "2026-10-03T22:21:00Z",
      payload: { live_output: { text: "live" }, candidate_output: { text: "cand" } },
    },
    candidate: null,
  } as never;
  container = document.createElement("div");
  document.body.appendChild(container);
  act(() => {
    root = createRoot(container);
    root.render(<CandidateRunBody row={row} />);
  });
}

it("says the button opens the newest of several runs when it cannot tell them apart", () => {
  render("conv-shared", "conv-own");
  const live = container.querySelector('[data-candidate-answer="live"]')!;
  const cand = container.querySelector('[data-candidate-answer="candidate"]')!;
  expect(live.querySelector('[data-candidate-saw="live"]')?.getAttribute("data-request-id")).toBe("old-id");
  expect(live.textContent).toContain("Newest of 3 runs in this chat");
  expect(cand.querySelector('[data-candidate-saw="candidate"]')).not.toBeNull();
  expect(cand.textContent).not.toContain("runs in this chat");
});
