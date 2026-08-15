import { decideWaitingInputRecovery } from "../waiting-input-recovery";

describe("waiting-input recovery", () => {
  it("continues a resolved request instead of inventing a missing question", () => {
    expect(
      decideWaitingInputRecovery({
        pendingCallCount: 0,
        pendingAskCount: 0,
        userRequestId: "e8452c51-8453-4764-85df-ce111890e8e1",
      }),
    ).toBe("continue");
  });

  it("shows real prompts and lets unresolved tools finish their own result", () => {
    expect(
      decideWaitingInputRecovery({
        pendingCallCount: 1,
        pendingAskCount: 1,
        userRequestId: "request-1",
      }),
    ).toBe("prompt_visible");
    expect(
      decideWaitingInputRecovery({
        pendingCallCount: 1,
        pendingAskCount: 0,
        userRequestId: "request-1",
      }),
    ).toBe("pending_tool");
  });

  it("keeps an explicit escape when old server data lacks a request id", () => {
    expect(
      decideWaitingInputRecovery({
        pendingCallCount: 0,
        pendingAskCount: 0,
        userRequestId: null,
      }),
    ).toBe("needs_action");
  });
});
