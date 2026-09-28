/**
 * Guard: a managed launcher whose agent or mandate key changes WHILE IT IS
 * STILL LAUNCHING must end with a live conversation under the id it hands the
 * composer — never a reaped one that makes Send do nothing.
 *
 * The class (first seen on the page guide, fixed there only in d33bbe6454):
 * a page/module mandate override finishes loading mid-launch, the answering
 * rung changes, `mandateKey` changes, and `useAgentLauncher` relaunched under
 * the SAME conversation id. The superseded launch settled later, saw
 * `cancelled`, and reaped the id — the new launch's instance with it. The
 * composer kept pointing at an id with no conversation, and smartExecute
 * dropped the send without a word.
 *
 * SUT: the REAL hook against the REAL conversations / focus / messages /
 * input reducers and the REAL reap thunks. Only the network-bound
 * `launchAgentExecution` is replaced by a gate the test resolves in order,
 * which is exactly the race: the new key's launch lands first (its mandate is
 * cached), the superseded one lands after.
 *
 * Proven failing before passing — against the pre-fix hook the first case
 * fails with `expect(received).toBeDefined()  Received: undefined` (the
 * conversation under the returned id was reaped), and the second with the
 * superseded launch's key winning.
 */

import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { Provider } from "react-redux";
import { configureStore } from "@reduxjs/toolkit";

import conversations, {
  createInstance,
} from "@/features/agents/redux/execution-system/conversations/conversations.slice";
import conversationFocus, {
  setFocus,
} from "@/features/agents/redux/execution-system/conversation-focus/conversation-focus.slice";
import messages from "@/features/agents/redux/execution-system/messages/messages.slice";
import instanceUserInput from "@/features/agents/redux/execution-system/instance-user-input/instance-user-input.slice";
import instanceUIState from "@/features/agents/redux/execution-system/instance-ui-state/instance-ui-state.slice";
import type { ManagedAgentOptions } from "@/features/agents/types/instance.types";
import { useAgentLauncher } from "../useAgentLauncher";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT =
  true;

interface PendingLaunch {
  payload: ManagedAgentOptions;
  resolve: () => void;
}
const pendingLaunches: PendingLaunch[] = [];

jest.mock(
  "@/features/agents/redux/execution-system/thunks/launch-agent-execution.thunk",
  () => ({
    launchAgentExecution:
      (payload: ManagedAgentOptions) =>
      (dispatch: (action: unknown) => unknown) => {
        const done = new Promise<{ conversationId: string }>((resolve) => {
          pendingLaunches.push({
            payload,
            resolve: () => {
              const conversationId = payload.conversationId as string;
              dispatch(
                createInstance({
                  conversationId,
                  agentId: payload.agentId as string,
                  agentType: "user",
                  origin: "manual",
                  mandateKey: payload.mandateKey ?? null,
                  surfaceKey: payload.surfaceKey,
                }),
              );
              dispatch(
                setFocus({
                  surfaceKey: payload.surfaceKey as string,
                  conversationId,
                }),
              );
              resolve({ conversationId });
            },
          });
        });
        return { unwrap: () => done };
      },
  }),
);

jest.mock(
  "@/features/agents/redux/execution-system/thunks/launch-conversation.thunk",
  () => ({ invocationToManagedOptions: (x: unknown) => x }),
);

jest.mock("@/lib/toast", () => ({
  toast: { error: jest.fn(), info: jest.fn(), warning: jest.fn() },
}));

function makeStore() {
  return configureStore({
    reducer: {
      conversations,
      conversationFocus,
      messages,
      instanceUserInput,
      instanceUIState,
    },
    middleware: (gDM) =>
      gDM({ serializableCheck: false, immutableCheck: false }),
  });
}
type TestStore = ReturnType<typeof makeStore>;

interface Props {
  agentId: string;
  mandateKey: string;
  ready: boolean;
  preferFresh: boolean;
}

const seen: { conversationId: string | null } = { conversationId: null };

function Launcher({ agentId, mandateKey, ready, preferFresh }: Props) {
  const { conversationId } = useAgentLauncher(agentId, {
    surfaceKey: "test-surface",
    sourceFeature: "chat",
    mandateKey: mandateKey as ManagedAgentOptions["mandateKey"],
    ready,
    preferFresh,
    retainOnUnmount: true,
  });
  seen.conversationId = conversationId;
  return null;
}

async function flush() {
  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();
  });
}

describe("useAgentLauncher — agent/mandate key changes mid-launch", () => {
  let container: HTMLDivElement;
  let root: Root;
  let store: TestStore;

  const render = (props: Props) =>
    act(() => {
      root.render(
        <Provider store={store}>
          <Launcher {...props} />
        </Provider>,
      );
    });

  beforeEach(() => {
    pendingLaunches.length = 0;
    seen.conversationId = null;
    store = makeStore();
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
  });

  const liveConversation = () =>
    store.getState().conversations.byConversationId[
      seen.conversationId as string
    ];

  for (const preferFresh of [true, false]) {
    describe(`preferFresh=${preferFresh}`, () => {
      it("keeps a live conversation when the new key's launch lands before the superseded one", async () => {
        render({
          agentId: "agent-system",
          mandateKey: "system.page_guidance",
          ready: true,
          preferFresh,
        });
        expect(pendingLaunches).toHaveLength(1);

        // The module override finishes loading: the answering rung changes.
        render({
          agentId: "agent-module",
          mandateKey: "notes.page_guidance",
          ready: true,
          preferFresh,
        });
        expect(pendingLaunches).toHaveLength(2);

        pendingLaunches[1].resolve();
        await flush();
        pendingLaunches[0].resolve();
        await flush();
        render({
          agentId: "agent-module",
          mandateKey: "notes.page_guidance",
          ready: true,
          preferFresh,
        });

        expect(liveConversation()).toBeDefined();
        expect(liveConversation()?.mandateKey).toBe("notes.page_guidance");
      });

      it("keeps a live conversation when the superseded launch lands first", async () => {
        render({
          agentId: "agent-system",
          mandateKey: "system.page_guidance",
          ready: true,
          preferFresh,
        });
        render({
          agentId: "agent-module",
          mandateKey: "notes.page_guidance",
          ready: true,
          preferFresh,
        });
        pendingLaunches[0].resolve();
        await flush();
        pendingLaunches[1].resolve();
        await flush();
        render({
          agentId: "agent-module",
          mandateKey: "notes.page_guidance",
          ready: true,
          preferFresh,
        });

        expect(liveConversation()).toBeDefined();
        expect(liveConversation()?.mandateKey).toBe("notes.page_guidance");
      });

      it("keeps a live conversation when readiness flickers mid-launch under the same key", async () => {
        const props = {
          agentId: "agent-system",
          mandateKey: "system.page_guidance",
          preferFresh,
        };
        render({ ...props, ready: true });
        render({ ...props, ready: false });
        render({ ...props, ready: true });

        for (const launch of [...pendingLaunches].reverse()) {
          launch.resolve();
          await flush();
        }
        render({ ...props, ready: true });

        expect(liveConversation()).toBeDefined();
        expect(liveConversation()?.mandateKey).toBe("system.page_guidance");
      });
    });
  }
});
