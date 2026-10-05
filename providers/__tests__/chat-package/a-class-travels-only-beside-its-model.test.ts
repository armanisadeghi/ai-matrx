/**
 * A class (offering) travels ONLY beside its model across an agent switch.
 *
 * The break (2026-10-02): on a seeded default chat the person pinned a class
 * from a Service chip, then switched agent. The seeded model stayed behind (a
 * launch default never crosses) but the class — a person key — was copied, so
 * the named agent ran its own model with another model's class and the run
 * raised. A removed class likewise must not strip the target's own pin.
 */
import { combineReducers, configureStore } from "@reduxjs/toolkit";
import { MANDATE_KEYS } from "@ai-matrx/agents/mandates";
import input from "@ai-matrx/chat/agents/redux/execution-system/instance-user-input/instance-user-input.slice";
import variables from "@ai-matrx/chat/agents/redux/execution-system/instance-variable-values/instance-variable-values.slice";
import resources from "@ai-matrx/chat/agents/redux/execution-system/instance-resources/instance-resources.slice";
import context from "@ai-matrx/chat/agents/redux/execution-system/instance-context/instance-context.slice";
import clientTools from "@ai-matrx/chat/agents/redux/execution-system/instance-client-tools/instance-client-tools.slice";
import ui from "@ai-matrx/chat/agents/redux/execution-system/instance-ui-state/instance-ui-state.slice";
import overrides, {
  initInstanceOverrides,
  setOverrides,
} from "@ai-matrx/chat/agents/redux/execution-system/instance-model-overrides/instance-model-overrides.slice";
import { setOfferingPin } from "@ai-matrx/chat/agents/redux/execution-system/instance-model-overrides/offering-pin";
import conversations from "@ai-matrx/chat/agents/redux/execution-system/conversations/conversations.slice";
import { applyLaunchModelOverrides } from "@ai-matrx/chat/agents/redux/execution-system/instance-model-overrides/launch-model-overrides";
import { selectSettingsOverridesForApi } from "@ai-matrx/chat/agents/redux/execution-system/instance-model-overrides/instance-model-overrides.selectors";
import { copyInstanceRequestDraft } from "@ai-matrx/chat/agents/redux/execution-system/thunks/copy-instance-request-draft.thunk";

// The knob read is the external dependency (settings ladder over the network).
jest.mock("@/lib/scoped-config/sessionKnob", () => ({
  resolveSessionKnob: jest.fn(async () => GEMINI_FLASH),
}));
jest.mock("@/features/ai-models/preferredChatModel", () => ({
  ...jest.requireActual("@/features/ai-models/preferredChatModel"),
  resolvePreferredChatModel: jest.fn(async () => ({
    modelId: GEMINI_FLASH,
    offeringId: GEMINI_FAST_CLASS,
  })),
}));

const GEMINI_FLASH = "b32f2079-4fa5-4613-a01d-726f1243ebe5";
const GEMINI_FAST_CLASS = "2245f5ca-2dd2-4fed-b34f-7f30aa2c1c6d";
const GEMINI_LIGHTNING_CLASS = "29874e67-5683-40c2-9adb-fb797ea9a176";
const SONNET_OWN_CLASS = "4b0a5c1d-7e2f-4a3b-9c8d-1e2f3a4b5c6d";
const SONNET = "617abdcd-79e2-4a4b-be76-4a9960cdffa1";
const GPT_PICKED = "c0ffee00-1111-4222-8333-944455556666";
const DEFAULT_CHAT_AGENT_MODEL = "0d1e2f30-aaaa-4bbb-8ccc-ddddeeeeffff";

const defaultChat = "default-chat-conversation";
const dispatchAssistant = "compass-dispatch-conversation";

const reducer = combineReducers({
  instanceUserInput: input,
  instanceVariableValues: variables,
  instanceResources: resources,
  instanceContext: context,
  instanceClientTools: clientTools,
  instanceUIState: ui,
  instanceModelOverrides: overrides,
  conversations,
});

function inputEntry(conversationId: string, text: string) {
  return {
    conversationId,
    text,
    messageParts: null,
    submissionPhase: "idle",
    lastSubmittedText: "",
    lastSubmittedUserValues: {},
    _undoPast: [],
    _undoFuture: [],
  };
}

function makeStore() {
  const ids = [defaultChat, dispatchAssistant];
  const each = <T,>(make: (id: string) => T) =>
    Object.fromEntries(ids.map((id) => [id, make(id)]));
  const store = configureStore({
    reducer,
    preloadedState: {
      instanceUserInput: {
        byConversationId: {
          [defaultChat]: inputEntry(defaultChat, "Read this back for move 5208"),
          [dispatchAssistant]: inputEntry(dispatchAssistant, ""),
        },
      },
      instanceVariableValues: {
        byConversationId: each(() => ({
          userValues: {},
          scopeValues: {},
          resourcePolicies: {},
        })),
      },
      instanceResources: {
        byConversationId: each(() => ({})),
        submittedIds: each(() => []),
        handoffInheritedIds: each(() => []),
        handoffRemovedIds: each(() => []),
      },
      instanceContext: {
        byConversationId: each(() => ({})),
        surfaceKeysByConversationId: each(() => []),
      },
      instanceClientTools: { byConversationId: each(() => []) },
      instanceUIState: {
        byConversationId: each(() => ({ builderAdvancedSettings: {} })),
        pendingByConversationId: {},
      },
      conversations: {
        debugSessionActive: false,
        allConversationIds: ids,
        byConversationId: each(() => ({})),
      },
    } as never,
  });
  // Each conversation snapshots ITS agent's own model as the base.
  store.dispatch(
    initInstanceOverrides({
      conversationId: defaultChat,
      baseSettings: { model: DEFAULT_CHAT_AGENT_MODEL },
    }),
  );
  store.dispatch(
    initInstanceOverrides({
      conversationId: dispatchAssistant,
      baseSettings: { model: SONNET, offering_id: SONNET_OWN_CLASS },
    }),
  );
  return store;
}


async function seededDefaultChat() {
  const store = makeStore();
  await applyLaunchModelOverrides(store.dispatch as never, {
    conversationId: defaultChat,
    mandateKey: MANDATE_KEYS.chat__default_new_chat,
  });
  return store;
}

function switchToNamedAgent(store: ReturnType<typeof makeStore>) {
  store.dispatch(
    copyInstanceRequestDraft({
      sourceConversationId: defaultChat,
      targetConversationId: dispatchAssistant,
      chatSemantics: true,
    }) as never,
  );
  return selectSettingsOverridesForApi(dispatchAssistant)(store.getState() as never);
}

const runThunk = (store: ReturnType<typeof makeStore>, thunk: unknown) =>
  (thunk as (d: unknown, g: unknown) => void)(store.dispatch, store.getState);

describe("a class travels only beside its model across an agent switch", () => {
  it("a class pinned on the seeded default model does not follow without the model", async () => {
    const store = await seededDefaultChat();
    runThunk(
      store,
      setOfferingPin({ conversationId: defaultChat, offeringId: GEMINI_LIGHTNING_CLASS }),
    );
    const wire = switchToNamedAgent(store);
    expect(wire?.model).toBeUndefined();
    expect(wire?.offering_id).toBeUndefined();
  });

  it("a removed class on the default chat does not strip the named agent's own class", async () => {
    const store = await seededDefaultChat();
    runThunk(store, setOfferingPin({ conversationId: defaultChat, offeringId: undefined }));
    const wire = switchToNamedAgent(store);
    expect(wire).toBeUndefined();
  });

  it("a person-picked model carries its class with it", async () => {
    const store = await seededDefaultChat();
    runThunk(
      store,
      setOfferingPin({ conversationId: defaultChat, offeringId: GEMINI_LIGHTNING_CLASS }),
    );
    store.dispatch(
      setOverrides({ conversationId: defaultChat, changes: { model: GEMINI_FLASH } }),
    );
    expect(switchToNamedAgent(store)).toEqual({
      model: GEMINI_FLASH,
      offering_id: GEMINI_LIGHTNING_CLASS,
    });
  });

  it("a person-picked model with no class never runs the target's own class", async () => {
    const store = await seededDefaultChat();
    runThunk(store, setOfferingPin({ conversationId: defaultChat, offeringId: undefined }));
    store.dispatch(
      setOverrides({ conversationId: defaultChat, changes: { model: GEMINI_FLASH } }),
    );
    expect(switchToNamedAgent(store)).toEqual({
      model: GEMINI_FLASH,
      offering_id: null,
    });
  });
});
