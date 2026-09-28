/**
 * A headless marketing run that FAILS on the server must surface the server's
 * reason, never an empty answer the caller misreports as "answered without a
 * usable block" (agent-review d3b5f4be, 2026-09-27: the video metadata agent's
 * model route was retired and the page blamed the agent's output format).
 */
jest.mock(
  "@/features/agents/redux/execution-system/thunks/launch-agent-execution.thunk",
  () => ({ launchAgentExecution: jest.fn() }),
);
jest.mock(
  "@/features/agents/redux/execution-system/thunks/execute-instance.thunk",
  () => ({ executeInstance: jest.fn() }),
);
jest.mock(
  "@/features/agents/redux/execution-system/conversations/conversations.thunks",
  () => ({ destroyInstanceIfAllowed: jest.fn() }),
);
jest.mock("@/features/overlays/openers/liveRunWindow", () => ({
  openLiveRunWindowAction: jest.fn(),
}));
jest.mock("@/features/mandates/service", () => ({ resolveMandate: jest.fn() }));

import type { RootState } from "@/lib/redux/store";
import { waitForAnswerText } from "./generate-page-image";

function stateWith(request: Record<string, unknown>): () => RootState {
  const state = { activeRequests: { byRequestId: { r1: request } } };
  return () => state as unknown as RootState;
}

describe("waitForAnswerText — a failed run carries the server's reason", () => {
  it("rejects with the error's user_message when the run errored", async () => {
    await expect(
      waitForAnswerText(
        stateWith({
          status: "error",
          error: {
            error_type: "matrx_catalog_error",
            message: "resolve_call_profile: model has no available ai.offering",
            user_message: "This AI step is configured with a model route that is no longer available.",
          },
        }),
        "r1",
        1_000,
        10,
      ),
    ).rejects.toThrow("model route that is no longer available");
  });

  it("falls back to the technical message when no user_message exists", async () => {
    await expect(
      waitForAnswerText(
        stateWith({ status: "error", error: { error_type: "x", message: "boom" } }),
        "r1",
        1_000,
        10,
      ),
    ).rejects.toThrow("boom");
  });

  it("rejects when the run timed out or was cancelled", async () => {
    await expect(
      waitForAnswerText(stateWith({ status: "cancelled" }), "r1", 1_000, 10),
    ).rejects.toThrow("cancelled");
  });
});
