import { decideWaitingInputRecovery } from "../waiting-input-recovery";

describe("waiting-input recovery", () => {
  it("continues a resolved request instead of inventing a missing question", () => {
    expect(
      decideWaitingInputRecovery({
        pendingCallCount: 0,
        pendingAskCount: 0,
        parkedOnPersonCount: 0,
        userRequestId: "e8452c51-8453-4764-85df-ce111890e8e1",
      }),
    ).toBe("continue");
  });

  it("shows real prompts and lets unresolved tools finish their own result", () => {
    expect(
      decideWaitingInputRecovery({
        pendingCallCount: 1,
        pendingAskCount: 1,
        parkedOnPersonCount: 0,
        userRequestId: "request-1",
      }),
    ).toBe("prompt_visible");
    expect(
      decideWaitingInputRecovery({
        pendingCallCount: 1,
        pendingAskCount: 0,
        parkedOnPersonCount: 0,
        userRequestId: "request-1",
      }),
    ).toBe("pending_tool");
  });

  it("keeps an explicit escape when old server data lacks a request id", () => {
    expect(
      decideWaitingInputRecovery({
        pendingCallCount: 0,
        pendingAskCount: 0,
        parkedOnPersonCount: 0,
        userRequestId: null,
      }),
    ).toBe("needs_action");
  });
});

/**
 * A TURN PARKED ON A PERSON IS WAITING, NOT LOST (OpenSEO Wave 1, Lane L, 2026-09-29).
 *
 * `seo_keywords.research` parked its own call on an `approve_spend` request: the row is
 * `status='delegated'` with `metadata.parked_on`, and since core's fix `pending_calls` no longer
 * lists it (a client must never answer it). So after a stream loss or a cold load the recovery
 * sees ZERO pending calls and no in-chat ask of the old kind — and used to decide "continue",
 * i.e. resume a turn that is still waiting on the person's approval. The durable fact that it is
 * waiting is the open action request; with one, the decision is to wait.
 */
describe("a turn parked on a person", () => {
  it("is waiting on the person — never continued, never 'needs action'", () => {
    expect(
      decideWaitingInputRecovery({
        pendingCallCount: 0,
        pendingAskCount: 0,
        parkedOnPersonCount: 1,
        userRequestId: "5ece0e81-6212-4909-aaec-99da75c72b19",
      }),
    ).toBe("waiting_on_person");
    expect(
      decideWaitingInputRecovery({
        pendingCallCount: 0,
        pendingAskCount: 0,
        parkedOnPersonCount: 1,
        userRequestId: null,
      }),
    ).toBe("waiting_on_person");
  });

  it("a visible prompt or a client tool still wins; nothing parked still continues", () => {
    expect(
      decideWaitingInputRecovery({
        pendingCallCount: 0,
        pendingAskCount: 1,
        parkedOnPersonCount: 1,
        userRequestId: "r",
      }),
    ).toBe("prompt_visible");
    expect(
      decideWaitingInputRecovery({
        pendingCallCount: 1,
        pendingAskCount: 0,
        parkedOnPersonCount: 1,
        userRequestId: "r",
      }),
    ).toBe("pending_tool");
    expect(
      decideWaitingInputRecovery({
        pendingCallCount: 0,
        pendingAskCount: 0,
        parkedOnPersonCount: 0,
        userRequestId: "r",
      }),
    ).toBe("continue");
  });
});
