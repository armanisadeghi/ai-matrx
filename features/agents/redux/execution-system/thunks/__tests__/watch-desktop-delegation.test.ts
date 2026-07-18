const mockFetchPending = jest.fn((conversationId: string) => ({
  kind: "pending" as const,
  conversationId,
}));
const mockLoadConversation = jest.fn((args: { conversationId: string }) => ({
  kind: "load" as const,
  ...args,
}));
const mockResumeInstance = jest.fn(
  (args: { conversationId: string; userRequestId: string }) => ({
    kind: "resume" as const,
    ...args,
  }),
);
const mockHasAbortController = jest.fn(() => false);
const mockToastError = jest.fn();

jest.mock("@/features/agents/api/fetch-pending-calls", () => ({
  fetchConversationPendingCallsStrict: mockFetchPending,
}));
jest.mock("../load-conversation.thunk", () => ({
  loadConversation: mockLoadConversation,
}));
jest.mock("../resume-instance.thunk", () => ({
  resumeInstance: mockResumeInstance,
}));
jest.mock("../abort-registry", () => ({
  hasAbortController: mockHasAbortController,
}));
jest.mock("sonner", () => ({
  toast: { error: mockToastError },
}));

import {
  __resetDesktopDelegationWatchesForTests,
  watchDesktopDelegation,
} from "../watch-desktop-delegation.thunk";

interface PendingRow {
  call_id: string;
  user_request_id: string;
}

const USER_REQUEST_ID = "11111111-1111-4111-8111-111111111111";
const LIFECYCLE_REQUEST_ID = "req_client-lifecycle";

describe("watchDesktopDelegation", () => {
  beforeEach(() => {
    jest.useFakeTimers();
    jest.clearAllMocks();
    __resetDesktopDelegationWatchesForTests();
  });

  afterEach(() => {
    __resetDesktopDelegationWatchesForTests();
    jest.useRealTimers();
  });

  it("waits for every parallel call before hydrating and resuming", async () => {
    const pendingResponses: PendingRow[][] = [
      [{ call_id: "call-2", user_request_id: USER_REQUEST_ID }],
      [],
    ];
    let status = "paused";
    let loadCount = 0;
    const dispatch = jest.fn((action: { kind?: string; type?: string }) => {
      if (action.type) return action;
      if (action.kind === "pending") {
        return Promise.resolve(pendingResponses.shift() ?? []);
      }
      if (action.kind === "load") {
        loadCount += 1;
        return { unwrap: () => Promise.resolve() };
      }
      if (action.kind === "resume") {
        status = "complete";
        return Promise.resolve({ type: "instances/resume/fulfilled" });
      }
      throw new Error(`Unexpected dispatch: ${action.kind}`);
    });
    const getState = () => ({
      conversations: {
        byConversationId: { "conversation-1": { status } },
      },
    });

    const first = watchDesktopDelegation({
      conversationId: "conversation-1",
      lifecycleRequestId: LIFECYCLE_REQUEST_ID,
      userRequestId: USER_REQUEST_ID,
      callId: "call-1",
    })(dispatch as never, getState as never, undefined);
    const second = watchDesktopDelegation({
      conversationId: "conversation-1",
      lifecycleRequestId: LIFECYCLE_REQUEST_ID,
      userRequestId: USER_REQUEST_ID,
      callId: "call-2",
    })(dispatch as never, getState as never, undefined);

    expect(second).toBe(first);
    await jest.advanceTimersByTimeAsync(750);
    expect(mockLoadConversation).not.toHaveBeenCalled();
    expect(mockResumeInstance).not.toHaveBeenCalled();

    await jest.advanceTimersByTimeAsync(750);
    await first;
    expect(mockResumeInstance).toHaveBeenCalledTimes(1);
    expect(mockResumeInstance).toHaveBeenCalledWith({
      conversationId: "conversation-1",
      userRequestId: USER_REQUEST_ID,
    });
    expect(loadCount).toBe(2); // resolved tool rows, then winning continuation
  });

  it("retries a transient resolved-tool hydration failure", async () => {
    let status = "paused";
    let loadCount = 0;
    const dispatch = jest.fn((action: { kind?: string; type?: string }) => {
      if (action.type) return action;
      if (action.kind === "pending") return Promise.resolve([]);
      if (action.kind === "load") {
        loadCount += 1;
        return {
          unwrap: () =>
            loadCount === 1
              ? Promise.reject(new Error("temporary Supabase outage"))
              : Promise.resolve(),
        };
      }
      if (action.kind === "resume") {
        status = "complete";
        return Promise.resolve({ type: "instances/resume/fulfilled" });
      }
      throw new Error(`Unexpected dispatch: ${action.kind}`);
    });
    const getState = () => ({
      conversations: {
        byConversationId: { "conversation-1": { status } },
      },
    });

    const watch = watchDesktopDelegation({
      conversationId: "conversation-1",
      lifecycleRequestId: LIFECYCLE_REQUEST_ID,
      userRequestId: USER_REQUEST_ID,
      callId: "call-1",
    })(dispatch as never, getState as never, undefined);

    await jest.advanceTimersByTimeAsync(750);
    expect(mockResumeInstance).not.toHaveBeenCalled();
    await jest.advanceTimersByTimeAsync(750);
    await watch;

    expect(loadCount).toBe(3); // failed hydrate, successful hydrate, final hydrate
    expect(mockResumeInstance).toHaveBeenCalledTimes(1);
  });

  it("recovers the server UUID without using the Redux lifecycle key", async () => {
    const pendingResponses: PendingRow[][] = [
      [{ call_id: "call-1", user_request_id: USER_REQUEST_ID }],
      [],
    ];
    let status = "paused";
    const dispatch = jest.fn((action: { kind?: string; type?: string }) => {
      if (action.type) return action;
      if (action.kind === "pending") {
        return Promise.resolve(pendingResponses.shift() ?? []);
      }
      if (action.kind === "load") {
        return { unwrap: () => Promise.resolve() };
      }
      if (action.kind === "resume") {
        status = "complete";
        return Promise.resolve({ type: "instances/resume/fulfilled" });
      }
      throw new Error(`Unexpected dispatch: ${action.kind}`);
    });
    const getState = () => ({
      conversations: {
        byConversationId: { "conversation-1": { status } },
      },
    });

    const watch = watchDesktopDelegation({
      conversationId: "conversation-1",
      lifecycleRequestId: LIFECYCLE_REQUEST_ID,
      callId: "call-1",
    })(dispatch as never, getState as never, undefined);

    await jest.advanceTimersByTimeAsync(1_500);
    await watch;

    expect(mockResumeInstance).toHaveBeenCalledWith({
      conversationId: "conversation-1",
      userRequestId: USER_REQUEST_ID,
    });
    expect(mockResumeInstance).not.toHaveBeenCalledWith(
      expect.objectContaining({ userRequestId: LIFECYCLE_REQUEST_ID }),
    );
  });

  it("does not repeatedly hydrate while another runner owns resume", async () => {
    let status = "paused";
    let loadCount = 0;
    let resumeCount = 0;
    const dispatch = jest.fn((action: { kind?: string; type?: string }) => {
      if (action.type) return action;
      if (action.kind === "pending") return Promise.resolve([]);
      if (action.kind === "load") {
        loadCount += 1;
        return { unwrap: () => Promise.resolve() };
      }
      if (action.kind === "resume") {
        resumeCount += 1;
        status = resumeCount === 1 ? "paused" : "complete";
        return Promise.resolve({ type: "instances/resume/fulfilled" });
      }
      throw new Error(`Unexpected dispatch: ${action.kind}`);
    });
    const getState = () => ({
      conversations: {
        byConversationId: { "conversation-1": { status } },
      },
    });

    const watch = watchDesktopDelegation({
      conversationId: "conversation-1",
      lifecycleRequestId: LIFECYCLE_REQUEST_ID,
      userRequestId: USER_REQUEST_ID,
      callId: "call-1",
    })(dispatch as never, getState as never, undefined);

    await jest.advanceTimersByTimeAsync(750);
    expect(loadCount).toBe(1);
    await jest.advanceTimersByTimeAsync(5_250);
    await watch;

    expect(resumeCount).toBe(2);
    expect(loadCount).toBe(2); // initial resolution + one final authoritative read
  });

  it("surfaces prolonged ledger failures while continuing to retry", async () => {
    let status = "paused";
    let pendingAttempts = 0;
    const dispatch = jest.fn((action: { kind?: string; type?: string }) => {
      if (action.type) return action;
      if (action.kind === "pending") {
        pendingAttempts += 1;
        return pendingAttempts <= 8
          ? Promise.reject(new Error("persistent API failure"))
          : Promise.resolve([]);
      }
      if (action.kind === "load") {
        return { unwrap: () => Promise.resolve() };
      }
      if (action.kind === "resume") {
        status = "complete";
        return Promise.resolve({ type: "instances/resume/fulfilled" });
      }
      throw new Error(`Unexpected dispatch: ${action.kind}`);
    });
    const getState = () => ({
      conversations: {
        byConversationId: { "conversation-1": { status } },
      },
    });

    const watch = watchDesktopDelegation({
      conversationId: "conversation-1",
      lifecycleRequestId: LIFECYCLE_REQUEST_ID,
      userRequestId: USER_REQUEST_ID,
      callId: "call-1",
    })(dispatch as never, getState as never, undefined);

    await jest.advanceTimersByTimeAsync(750 * 9);
    await watch;

    expect(mockToastError).toHaveBeenCalledTimes(1);
    expect(pendingAttempts).toBe(9);
  });
});
