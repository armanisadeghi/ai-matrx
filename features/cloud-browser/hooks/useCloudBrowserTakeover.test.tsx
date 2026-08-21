/**
 * The takeover duality (Arman 2026-08-21). What these lock down is not "a
 * button works" — it is WHICH of the two shipped chat mechanisms fires, and
 * when control actually moves:
 *
 *   - steering an idle agent would be a lie (and steering one that is already
 *     parked waiting for a human is a DEADLOCK — it never reaches another turn
 *     boundary), so both claim immediately;
 *   - a running agent is told through the Turn-Boundary Inbox and control moves
 *     on the delivery ack, never before it;
 *   - the immediate escape stops the run AND leaves the agent's next turn an
 *     explanation, because `cancelExecution` carries no reason of its own.
 */

import * as React from "react";
import { renderHook, settle } from "@/test-utils/renderHook";

const CONV = "conv-1";

type FakeState = {
  conversations: { byConversationId: Record<string, { status: string }> };
  conversationInbox: {
    byConversationId: Record<
      string,
      Array<{ injectionId: string; status: string }>
    >;
  };
};

const mockListeners = new Set<() => void>();
const mockRef: { state: FakeState } = {
  state: {
    conversations: { byConversationId: {} },
    conversationInbox: { byConversationId: {} },
  },
};
const mockActions: Array<{ type: string; [k: string]: unknown }> = [];

function setStatus(status: string) {
  mockRef.state = {
    ...mockRef.state,
    conversations: { byConversationId: { [CONV]: { status } } },
  };
  mockListeners.forEach((l) => l());
}

function setInbox(items: Array<{ injectionId: string; status: string }>) {
  mockRef.state = {
    ...mockRef.state,
    conversationInbox: { byConversationId: { [CONV]: items } },
  };
  mockListeners.forEach((l) => l());
}

const mockDispatch = (action: { type: string; [k: string]: unknown }) => {
  mockActions.push(action);
  if (action.type === "enqueue") {
    const args = action.args as { mode?: string };
    if (args.mode === "steer") {
      // Mirror the real slice: the card exists until `injection_consumed`.
      setInbox([{ injectionId: "inj-1", status: "pending" }]);
    }
    return {
      unwrap: async () => ({ injectionId: "inj-1", runActive: true }),
    };
  }
  return Promise.resolve();
};

jest.mock("@/lib/redux/hooks", () => ({
  useAppSelector: (sel: (s: unknown) => unknown) => {
    const [, force] = React.useReducer((n: number) => n + 1, 0);
    React.useEffect(() => {
      mockListeners.add(force);
      return () => {
        mockListeners.delete(force);
      };
    }, []);
    return sel(mockRef.state);
  },
  useAppDispatch: () => mockDispatch,
  useAppStore: () => ({ getState: () => mockRef.state }),
}));

jest.mock(
  "@/features/agents/redux/execution-system/inbox/inbox.thunks",
  () => ({
    enqueueInboxMessage: (args: unknown) => ({ type: "enqueue", args }),
    retractInboxItem: (args: unknown) => ({ type: "retract", args }),
  }),
);

jest.mock(
  "@/features/agents/redux/execution-system/thunks/smart-execute.thunk",
  () => ({
    cancelExecution: (conversationId: string) => ({
      type: "cancel",
      conversationId,
    }),
  }),
);

jest.mock("@/lib/toast", () => ({
  toast: { warning: jest.fn(), error: jest.fn(), info: jest.fn() },
}));

import { useCloudBrowserTakeover } from "./useCloudBrowserTakeover";

function reset() {
  mockActions.length = 0;
  mockRef.state = {
    conversations: { byConversationId: {} },
    conversationInbox: { byConversationId: {} },
  };
}

const types = () => mockActions.map((a) => a.type);

describe("useCloudBrowserTakeover", () => {
  beforeEach(reset);

  it("claims immediately when no chat is bound — nothing to steer", async () => {
    const claim = jest.fn(async () => {});
    const h = await renderHook(() =>
      useCloudBrowserTakeover({ conversationId: null, claim }),
    );
    await h.act(() => h.current.begin());
    expect(claim).toHaveBeenCalledTimes(1);
    expect(types()).not.toContain("enqueue");
    await h.unmount();
  });

  it("claims immediately when the agent is idle", async () => {
    setStatus("idle");
    const claim = jest.fn(async () => {});
    const h = await renderHook(() =>
      useCloudBrowserTakeover({ conversationId: CONV, claim }),
    );
    await h.act(() => h.current.begin());
    expect(claim).toHaveBeenCalledTimes(1);
    expect(types()).not.toContain("enqueue");
    await h.unmount();
  });

  it("claims immediately when the AGENT asked for a person (no deadlock)", async () => {
    setStatus("streaming");
    const claim = jest.fn(async () => {});
    const h = await renderHook(() =>
      useCloudBrowserTakeover({
        conversationId: CONV,
        agentAwaitingHuman: true,
        claim,
      }),
    );
    await h.act(() => h.current.begin());
    expect(claim).toHaveBeenCalledTimes(1);
    expect(types()).not.toContain("enqueue");
    await h.unmount();
  });

  it("steers a running agent and holds control until the note is delivered", async () => {
    setStatus("streaming");
    const claim = jest.fn(async () => {});
    const h = await renderHook(() =>
      useCloudBrowserTakeover({ conversationId: CONV, claim }),
    );

    await h.act(() => h.current.begin());
    await settle(h, (v) => v.waiting, "the wait notice");

    const enqueued = mockActions.find((a) => a.type === "enqueue")
      ?.args as { mode: string; kind: string; text: string };
    expect(enqueued.mode).toBe("steer");
    expect(enqueued.kind).toBe("system_message");
    expect(enqueued.text).toMatch(/taking control of the cloud browser/i);
    expect(claim).not.toHaveBeenCalled(); // control has NOT moved yet

    // `injection_consumed` retires the card — that is the delivery ack.
    await h.act(() => setInbox([]));
    await settle(h, () => claim.mock.calls.length > 0, "the claim");
    expect(claim).toHaveBeenCalledTimes(1);
    await h.unmount();
  });

  it("stops waiting when the run ends before any boundary arrives", async () => {
    setStatus("streaming");
    const claim = jest.fn(async () => {});
    const h = await renderHook(() =>
      useCloudBrowserTakeover({ conversationId: CONV, claim }),
    );
    await h.act(() => h.current.begin());
    await settle(h, (v) => v.waiting, "the wait notice");

    await h.act(() => setStatus("idle"));
    await settle(h, () => claim.mock.calls.length > 0, "the claim");
    expect(claim).toHaveBeenCalledTimes(1);
    await h.unmount();
  });

  it("takes over immediately: stop, withdraw, explain, claim", async () => {
    setStatus("streaming");
    const claim = jest.fn(async () => {});
    const h = await renderHook(() =>
      useCloudBrowserTakeover({ conversationId: CONV, claim }),
    );
    await h.act(() => h.current.begin());
    await settle(h, (v) => v.waiting, "the wait notice");
    mockActions.length = 0;

    await h.act(() => h.current.takeOverImmediately());
    await settle(h, () => claim.mock.calls.length > 0, "the claim");

    expect(types()).toEqual(["cancel", "retract", "enqueue"]);
    const note = mockActions.find((a) => a.type === "enqueue")?.args as {
      mode: string;
      kind: string;
      text: string;
    };
    // The WHY the cancel itself cannot carry, held for the agent's next turn.
    expect(note.mode).toBe("queue");
    expect(note.kind).toBe("system_message");
    expect(note.text).toMatch(/took\s+immediate control/i);
    expect(claim).toHaveBeenCalledTimes(1);
    await h.unmount();
  });
});
