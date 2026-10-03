/**
 * THE PERSON'S TOOL DECISIONS AND THE PAGE BINDING SURVIVE (independent
 * review of the page-tool binding, 2026-10-03).
 *
 *  1. A launcher re-create keeps `removedTools` and the per-chat `autoTools`
 *     switch, like `addedTools` (instance-ui-state.slice createInstanceFull).
 *  2. The reaper never destroys a conversation whose only configuration is a
 *     removal or the switch (conversations.thunks destroyInstanceIfAbandoned).
 *  3. The surface stamp is part of the saved run configuration, so a reopened
 *     conversation comes back BOUND (run-configuration-persist).
 *  4. A fork carries the source's picks, removals, switch and surface stamp
 *     (fork-conversation.thunk carryRunConfigurationToFork) — fork-and-resubmit
 *     executes the branch right after, so this is what its first turn sends.
 *
 * Real reducers; no network.
 */

jest.mock("../../../../../host/db", () => ({ supabase: {} }));

import { combineReducers, configureStore } from "@reduxjs/toolkit";
import instanceUIStateReducer, {
  setBuilderAdvancedSettings,
} from "../instance-ui-state.slice";
import conversationsReducer, {
  destroyInstance,
  patchConversation,
} from "../../conversations/conversations.slice";
import { createInstanceFull } from "../../create-instance-full";
import { destroyInstanceIfAbandoned } from "../../conversations/conversations.thunks";
import {
  parsePersistedRunConfiguration,
  selectRunConfiguration,
} from "../run-configuration-persist";
import { carryRunConfigurationToFork } from "../../message-crud/fork-conversation.thunk";
import type { ChatRootState } from "../../../../../store/root-state";

const CONV = "conv-1";

function createAction(conversationId = CONV) {
  return createInstanceFull({
    conversationId,
    agentId: "agent-1",
    agentType: "standard",
    origin: "manual",
  } as unknown as Parameters<typeof createInstanceFull>[0]);
}

let warnSpy: jest.SpyInstance;
beforeEach(() => {
  warnSpy = jest.spyOn(console, "warn").mockImplementation(() => {});
});
afterEach(() => warnSpy.mockRestore());

it("a re-create keeps the person's removals and auto-tools switch", () => {
  let ui = instanceUIStateReducer(undefined, createAction());
  ui = instanceUIStateReducer(
    ui,
    setBuilderAdvancedSettings({
      conversationId: CONV,
      changes: { removedTools: ["memory"], autoTools: false },
    }),
  );
  ui = instanceUIStateReducer(ui, createAction());
  const s = ui.byConversationId[CONV].builderAdvancedSettings;
  expect(s.removedTools).toEqual(["memory"]);
  expect(s.autoTools).toBe(false);
});

it("the reaper keeps a conversation whose only configuration is a removal or the switch", () => {
  const run = (changes: Record<string, unknown>) => {
    const ui = instanceUIStateReducer(
      instanceUIStateReducer(undefined, createAction()),
      setBuilderAdvancedSettings({ conversationId: CONV, changes }),
    );
    const dispatched: unknown[] = [];
    destroyInstanceIfAbandoned(CONV)(
      ((a: unknown) => {
        dispatched.push(a);
        return a;
      }) as never,
      (() =>
        ({
          conversations: { debugSessionActive: false },
          messages: { byConversationId: {} },
          instanceUserInput: { byConversationId: {} },
          instanceUIState: ui,
        }) as unknown as ChatRootState) as never,
      undefined,
    );
    return dispatched;
  };
  expect(run({ removedTools: ["memory"] })).toEqual([]);
  expect(run({ autoTools: false })).toEqual([]);
  // Forcing the other way: nothing configured is still reaped.
  expect(run({})).toEqual([destroyInstance(CONV)]);
});

it("the surface stamp is saved with the run configuration and read back", () => {
  const state = {
    instanceUIState: { byConversationId: { [CONV]: { builderAdvancedSettings: {} } } },
    conversations: { byConversationId: { [CONV]: { surfaceName: "matrx-user/notes" } } },
  } as unknown as ChatRootState;
  expect(selectRunConfiguration(state, CONV).surfaceName).toBe("matrx-user/notes");
  expect(
    parsePersistedRunConfiguration({
      run_configuration: { surface_name: "matrx-user/notes" },
    })?.surfaceName,
  ).toBe("matrx-user/notes");
});

it("a fork carries the picks, removals, switch and the page binding", () => {
  const reducer = combineReducers({
    instanceUIState: instanceUIStateReducer,
    conversations: conversationsReducer,
  });
  const store = configureStore({
    reducer,
    preloadedState: {
      conversations: {
        byConversationId: {
          [CONV]: { conversationId: CONV, surfaceName: "matrx-user/notes" },
          fork: { conversationId: "fork" },
        },
        allConversationIds: [CONV, "fork"],
      },
    } as unknown as ReturnType<typeof reducer>,
    middleware: (g) => g({ serializableCheck: false, immutableCheck: false }),
  });
  store.dispatch(createAction());
  store.dispatch(createAction("fork"));
  // The source was launched on a page: its stamp.
  store.dispatch(patchConversation({ conversationId: CONV, surfaceName: "matrx-user/notes" }));
  store.dispatch(
    setBuilderAdvancedSettings({
      conversationId: CONV,
      changes: { addedTools: ["tool-id"], removedTools: ["memory"], autoTools: false },
    }),
  );

  carryRunConfigurationToFork(
    store.getState() as unknown as ChatRootState,
    store.dispatch as never,
    CONV,
    "fork",
  );

  const after = store.getState() as unknown as ChatRootState;
  const forkSettings = after.instanceUIState.byConversationId.fork.builderAdvancedSettings;
  expect(forkSettings?.addedTools).toEqual(["tool-id"]);
  expect(forkSettings?.removedTools).toEqual(["memory"]);
  expect(forkSettings?.autoTools).toBe(false);
  expect(after.conversations.byConversationId.fork.surfaceName).toBe("matrx-user/notes");
});
