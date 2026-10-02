/**
 * Guard: a conversation that has NOT been loaded is never left permanently
 * un-loadable.
 *
 * The defect (owner, 2026-09-13): reloading a bound chat sometimes rendered a
 * thread with no messages at all. `useConversationResume` latched
 * `loadedKeyRef` to the conversation id BEFORE doing any async work, while the
 * effect's cleanup ABORTED that work. So any re-run of the effect — a dep
 * change such as `enabled` flipping while auth re-hydrates, or a StrictMode
 * double-mount — aborted attempt #1 and short-circuited attempt #2 on the
 * latch. The load never happened and nothing ever released the latch (only the
 * `catch` reset it, and the abort path returns before the catch).
 *
 * The SUT is the hook's resume SEQUENCING — when it starts a load, when it
 * skips one, and whether it can recover from an aborted attempt. The two
 * thunks it calls (instance creation, bundle hydration) are dependencies and
 * are stubbed at the module boundary; the store, its reducers and the hydrated
 * transcript are real, and the transcript in that real store is what is
 * asserted, never a call count alone.
 *
 * Proven failing before passing (verbatim output in the fix commit's report):
 *   - "recovers…": expected ["m1"], received [] — the transcript never loaded.
 */

import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { Provider } from "react-redux";
import { configureStore } from "@reduxjs/toolkit";

import messages from "@/features/agents/redux/execution-system/messages/messages.slice";
import conversations from "@/features/agents/redux/execution-system/conversations/conversations.slice";
import { useConversationResume } from "../useConversationResume";

// `mock`-prefixed so the hoisted jest.mock factories below may close over it.
const mockLoadCalls: { conversationId: string; aborted: boolean }[] = [];

jest.mock(
  "@/features/agents/redux/execution-system/thunks/create-instance.thunk",
  () => {
    const { createAsyncThunk } = jest.requireActual("@reduxjs/toolkit");
    return {
      createManualInstance: createAsyncThunk(
        "test/createManualInstance",
        async ({ conversationId }: { conversationId: string }) => ({
          conversationId,
        }),
      ),
    };
  },
);

jest.mock(
  "@/features/agents/redux/execution-system/thunks/load-conversation.thunk",
  () => {
    const { createAsyncThunk } = jest.requireActual("@reduxjs/toolkit");
    const slice = jest.requireActual(
      "@/features/agents/redux/execution-system/messages/messages.slice",
    );
    return {
      loadConversation: createAsyncThunk(
        "test/loadConversation",
        async (
          args: { conversationId: string; signal?: AbortSignal },
          { dispatch }: { dispatch: (action: unknown) => unknown },
        ) => {
          const call = { conversationId: args.conversationId, aborted: false };
          mockLoadCalls.push(call);
          // One real turn of the event loop, so an abort raised by the
          // effect's cleanup lands mid-flight exactly as it does in the app.
          await Promise.resolve();
          if (args.signal?.aborted) {
            call.aborted = true;
            throw new Error("aborted");
          }
          dispatch(
            slice.hydrateMessages({
              conversationId: args.conversationId,
              messages: [
                {
                  id: "m1",
                  conversationId: args.conversationId,
                  agentId: null,
                  role: "user",
                  content: [{ type: "text", content: "the saved turn" }],
                  contentHistory: null,
                  userContent: null,
                  position: 0,
                  source: "user",
                  status: "active",
                  isVisibleToModel: true,
                  isVisibleToUser: true,
                  metadata: {},
                  createdAt: "2026-09-13T10:00:00Z",
                  deletedAt: null,
                  _clientStatus: "complete",
                },
              ],
            }),
          );
          return { conversationId: args.conversationId };
        },
      ),
    };
  },
);

jest.mock(
  "@/features/agents/redux/execution-system/thunks/surface-cold-pending-calls.thunk",
  () => ({
    surfaceColdPendingCalls: () => ({ type: "test/surfaceColdPendingCalls" }),
  }),
);
jest.mock(
  "@/features/agents/runtime-reconnect/reconnect-server-operation.thunk",
  () => ({
    reconnectServerOperation: () => ({ type: "test/reconnectServerOperation" }),
  }),
);

const CONVERSATION_ID = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa";
const AGENT_ID = "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb";

function makeStore() {
  return configureStore({ reducer: { messages, conversations } });
}

type Store = ReturnType<typeof makeStore>;

function Harness({ enabled }: { enabled: boolean }) {
  useConversationResume({
    conversationId: CONVERSATION_ID,
    agentId: AGENT_ID,
    surfaceKey: "test-surface",
    enabled,
    messageLimit: 12,
  });
  return null;
}

describe("useConversationResume — never permanently un-loadable", () => {
  let container: HTMLDivElement;
  let root: Root;
  let store: Store;

  beforeEach(() => {
    Object.defineProperty(globalThis, "IS_REACT_ACT_ENVIRONMENT", {
      configurable: true,
      value: true,
    });
    mockLoadCalls.length = 0;
    store = makeStore();
    container = document.createElement("div");
    document.body.appendChild(container);
    act(() => {
      root = createRoot(container);
    });
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
  });

  const render = (enabled: boolean) =>
    act(() => {
      root.render(
        <Provider store={store}>
          <Harness enabled={enabled} />
        </Provider>,
      );
    });

  const flush = async () => {
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
      await Promise.resolve();
      await Promise.resolve();
    });
  };

  const transcript = () =>
    store.getState().messages.byConversationId[CONVERSATION_ID]?.orderedIds ??
    [];

  it("recovers when a dep change aborts the first attempt at the same conversation", async () => {
    render(true);
    // The production trigger: `enabled` is `!isInitializing && authReady`, and
    // a session re-hydrate flips it false then true again. The effect re-runs,
    // its cleanup aborts attempt #1, and attempt #2 must still load.
    render(false);
    render(true);
    await flush();

    // The forcing output: the saved turn is in the real store. It can only get
    // there if a load actually ran to completion for this conversation.
    expect(transcript()).toEqual(["m1"]);
    expect(mockLoadCalls.length).toBeGreaterThan(0);
  });

  it("loads a conversation exactly once when nothing interrupts it", async () => {
    render(true);
    await flush();
    // Re-runs AFTER a completed load must stay short-circuited: re-fetching
    // would clobber an in-flight stream (the "the stream is missed" bug the
    // latch exists for).
    render(false);
    render(true);
    await flush();

    expect(mockLoadCalls).toHaveLength(1);
    expect(transcript()).toEqual(["m1"]);
  });
});
