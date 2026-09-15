/**
 * Guard: a RESERVED conversation is never reported as a failed read — and an
 * EXPECTED one still is.
 *
 * The wall (census W1, observed live 2026-09-15 by a user-driver): every
 * freshly opened `/masterwork/vision-interview/<id>` room wore
 *
 *   "Couldn't load this conversation, so this list is empty because the read
 *    failed — not because there is nothing here.(it may have been removed, or
 *    your sign-in lost access to it)"
 *
 * over a Try-again button that reproduced the same banner every time.
 *
 * Measured cause: aidream's `ensure_role_agents` mints a `uuid4` per role as a
 * stable room id and `chat.conversation` is written lazily by the first turn —
 * on that session 0 of 8 bindings had a row. `useConversationResume` inferred
 * "nothing in memory ⇒ the server is supposed to have this", so an id nobody
 * had written yet was classified as a conversation that failed to read.
 *
 * The SUT is that classification, exercised through the REAL hook and the REAL
 * `loadConversation` thunk into the REAL messages reducer — the assertion is
 * the transcript's own `hydrationFailure`, which is exactly what paints the
 * banner. Only the network edge (the bundle RPC, supabase auth) is stubbed.
 *
 * Proven failing before passing — against the pre-fix hook, with the option
 * ignored, the first case reports the banner text and fails with:
 *   expect(received).toBeNull()
 *   Received: "it may have been removed, or your sign-in lost access to it"
 */

import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { Provider } from "react-redux";
import { configureStore } from "@reduxjs/toolkit";

import messages from "@/features/agents/redux/execution-system/messages/messages.slice";
import conversations from "@/features/agents/redux/execution-system/conversations/conversations.slice";
import { CONVERSATION_NOT_MATERIALIZED } from "@/features/agents/redux/execution-system/thunks/conversation-bundle";
import { useConversationResume } from "../useConversationResume";

const mockFetchBundle = jest.fn();

jest.mock("@/utils/supabase/client", () => ({
  supabase: { auth: { getUser: async () => ({ data: { user: null } }) } },
}));

jest.mock(
  "@/features/agents/redux/execution-system/thunks/conversation-bundle",
  () => {
    const actual = jest.requireActual(
      "@/features/agents/redux/execution-system/thunks/conversation-bundle",
    );
    return {
      ...actual,
      fetchConversationBundle: (...args: unknown[]) => mockFetchBundle(...args),
    };
  },
);

jest.mock("@/features/code/redux/codeEditHistoryHydration", () => ({
  loadCodeEditHistoryThunk: () => ({ type: "test/loadCodeEditHistory" }),
}));

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

const CONVERSATION_ID = "cccccccc-cccc-cccc-cccc-cccccccccccc";
const AGENT_ID = "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb";

function makeStore() {
  return configureStore({ reducer: { messages, conversations } });
}

type Store = ReturnType<typeof makeStore>;

function Harness({ expectMaterialized }: { expectMaterialized?: boolean }) {
  useConversationResume({
    conversationId: CONVERSATION_ID,
    agentId: AGENT_ID,
    surfaceKey: "vision-interview-room",
    enabled: true,
    messageLimit: 12,
    expectMaterialized,
  });
  return null;
}

describe("useConversationResume — a reservation is not a failed read", () => {
  let container: HTMLDivElement;
  let root: Root;
  let store: Store;

  beforeEach(() => {
    Object.defineProperty(globalThis, "IS_REACT_ACT_ENVIRONMENT", {
      configurable: true,
      value: true,
    });
    mockFetchBundle.mockReset();
    mockFetchBundle.mockRejectedValue(
      Object.assign(new Error("conversation unavailable"), {
        code: CONVERSATION_NOT_MATERIALIZED,
      }),
    );
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

  const renderWith = (expectMaterialized?: boolean) =>
    act(() => {
      root.render(
        <Provider store={store}>
          <Harness expectMaterialized={expectMaterialized} />
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

  const failure = () =>
    store.getState().messages.byConversationId[CONVERSATION_ID]
      ?.hydrationFailure ?? null;

  it("stays honest and silent for a room whose row is not written yet", async () => {
    renderWith(false);
    await flush();

    expect(failure()).toBeNull();
  });

  it("still reports a failure for a conversation the server should hold", async () => {
    renderWith(undefined);
    await flush();

    // The inference is untouched: an unexplained empty read of a conversation
    // nobody declared a reservation is still a read the user is told about.
    expect(failure()).toEqual(expect.any(String));
  });

  it("reports a failure when a room says its row EXISTS and the read comes back empty", async () => {
    renderWith(true);
    await flush();

    // The other half of the contract: once the first turn has written the row,
    // the room declares `existing`, and a missing row is a genuine failure the
    // banner must still be able to report.
    expect(failure()).toEqual(expect.any(String));
  });
});
