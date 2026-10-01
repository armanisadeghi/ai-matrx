/**
 * Guard: anything a person attaches on /work BEFORE pressing Run is still
 * there when the run executes.
 *
 * The class (found 2026-09-30 on /work/new as admin@admin.com, clone preview):
 * the composer minted its conversation id with `ready: false`, so no instance
 * existed until Run. Every picker in the form (resources, skills) writes into
 * per-conversation slots that only `createInstanceFull` creates, and
 * `addResource` is a no-op when the slot is missing — the attached web page
 * vanished on "Add page" with no chip and no word. Run then went through
 * `launchAgent`, whose `createInstanceFull` resets those slots to `{}`, so
 * even an attachment that had landed would have been wiped before the request
 * was built.
 *
 * SUT: the REAL `useAiWorkRun` and REAL `useAgentLauncher` against the REAL
 * conversations / focus / resources / ui-state / user-input / requests
 * reducers. Only the two network-bound thunks are replaced:
 *   - `launchAgentExecution` → dispatches the real `createInstanceFull` (the
 *     reset is the point) and, when it is asked to run, records what the
 *     request would carry;
 *   - `smartExecute` → records what the request would carry.
 * "What the request would carry" is the conversation's resource slot at the
 * moment execution starts — what `executeInstance` assembles from.
 *
 * Proven failing before passing: against the pre-fix hook (ready:false +
 * launchAgent on Send) the first case fails at the attach step — no slot, the
 * resource is dropped — and the second fails with the executed snapshot empty.
 */

import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { Provider } from "react-redux";
import { configureStore } from "@reduxjs/toolkit";

import conversations from "@/features/agents/redux/execution-system/conversations/conversations.slice";
import conversationFocus from "@/features/agents/redux/execution-system/conversation-focus/conversation-focus.slice";
import messages from "@/features/agents/redux/execution-system/messages/messages.slice";
import instanceUserInput from "@/features/agents/redux/execution-system/instance-user-input/instance-user-input.slice";
import instanceUIState from "@/features/agents/redux/execution-system/instance-ui-state/instance-ui-state.slice";
import instanceResources, {
  addResource,
} from "@/features/agents/redux/execution-system/instance-resources/instance-resources.slice";
import activeRequests, {
  createRequest,
} from "@/features/agents/redux/execution-system/active-requests/active-requests.slice";
import { createInstanceFull } from "@/features/agents/redux/execution-system/create-instance-full";
import type { ManagedAgentOptions } from "@/features/agents/types/instance.types";
import { useAiWorkRun, type AiWorkRun } from "../useAiWorkRun";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT =
  true;

interface Executed {
  conversationId: string;
  resourceSources: unknown[];
  text: string | undefined;
}
const executed: Executed[] = [];

type AnyState = {
  instanceResources: {
    byConversationId: Record<string, Record<string, { source: unknown }>>;
  };
  instanceUserInput: { byConversationId: Record<string, { text?: string }> };
};

function snapshot(state: AnyState, conversationId: string, text?: string) {
  const slot = state.instanceResources.byConversationId[conversationId] ?? {};
  executed.push({
    conversationId,
    resourceSources: Object.values(slot).map((r) => r.source),
    text: text ?? state.instanceUserInput.byConversationId[conversationId]?.text,
  });
}

jest.mock(
  "@/features/agents/redux/execution-system/thunks/launch-agent-execution.thunk",
  () => ({
    launchAgentExecution:
      (payload: ManagedAgentOptions) =>
      (dispatch: (a: unknown) => unknown, getState: () => AnyState) => {
        const conversationId = payload.conversationId as string;
        dispatch(
          createInstanceFull({
            conversationId,
            agentId: payload.agentId as string,
            agentType: "user",
            origin: "manual",
            surfaceKey: payload.surfaceKey,
          }),
        );
        if (payload.config?.autoRun) {
          snapshot(getState(), conversationId, payload.runtime?.userInput);
          dispatch(createRequest({ conversationId }));
        }
        return { unwrap: () => Promise.resolve({ conversationId }) };
      },
  }),
);

jest.mock(
  "@/features/agents/redux/execution-system/thunks/smart-execute.thunk",
  () => ({
    smartExecute:
      ({ conversationId }: { conversationId: string }) =>
      (dispatch: (a: unknown) => unknown, getState: () => AnyState) => {
        snapshot(getState(), conversationId);
        dispatch(createRequest({ conversationId }));
        return { unwrap: () => Promise.resolve() };
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
      instanceResources,
      activeRequests,
    },
    middleware: (gDM) =>
      gDM({ serializableCheck: false, immutableCheck: false }),
  });
}

const AGENT = "6b6b4e45-4699-4860-8dea-d8a60e07d69a";
const PAGE = {
  url: "https://en.wikipedia.org/wiki/Recycling",
  title: "Recycling - Wikipedia",
};

let latest: AiWorkRun | null = null;
function Harness() {
  latest = useAiWorkRun(AGENT);
  return null;
}

let container: HTMLDivElement;
let root: Root;
let store: ReturnType<typeof makeStore>;

beforeEach(async () => {
  executed.length = 0;
  latest = null;
  store = makeStore();
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  await act(async () => {
    root.render(
      <Provider store={store}>
        <Harness />
      </Provider>,
    );
  });
});

afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
});

function attachPage() {
  const id = latest?.conversationId;
  if (!id) throw new Error("composer has no conversation id");
  store.dispatch(
    addResource({ conversationId: id, blockType: "webpage", source: PAGE }),
  );
  return id;
}

it("a page attached before Run lands in the conversation", () => {
  const id = attachPage();
  const slot = store.getState().instanceResources.byConversationId[id];
  expect(slot).toBeDefined();
  expect(Object.values(slot ?? {}).map((r) => r.source)).toEqual([PAGE]);
});

it("Run executes with the page still attached and the typed request", async () => {
  const id = attachPage();
  let started = false;
  await act(async () => {
    started = await (latest as AiWorkRun).send(
      "In two sentences, summarize the attached page about recycling.",
    );
  });
  expect(started).toBe(true);
  expect(executed).toHaveLength(1);
  expect(executed[0].conversationId).toBe(id);
  expect(executed[0].resourceSources).toEqual([PAGE]);
  expect(executed[0].text).toBe(
    "In two sentences, summarize the attached page about recycling.",
  );
});
