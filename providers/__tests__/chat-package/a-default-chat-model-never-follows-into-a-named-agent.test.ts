/**
 * W-81 (PB-07, 2026-10-01): a direct run of Compass Dispatch Assistant (an agent
 * on Claude Sonnet 5) executed on Gemini 3.8 Flash. The person's
 * default-chat-model preference had been seeded into the DEFAULT chat's
 * override layer by the launch, and the same-tab agent switch
 * (Search agents → Select → copyInstanceRequestDraft) copied the whole override
 * layer onto the named agent's conversation as if the person had picked it.
 *
 * The break this catches: any launch default (preference, shortcut, caller
 * config) crossing an agent switch into `config_overrides.model`.
 * The second case catches the opposite break: a model the PERSON picked in the
 * picker for this conversation being dropped by the switch.
 */
import "@/__tests__/helpers/register-chat-host";
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
import conversations from "@ai-matrx/chat/agents/redux/execution-system/conversations/conversations.slice";
import { applyLaunchModelOverrides } from "@ai-matrx/chat/agents/redux/execution-system/instance-model-overrides/launch-model-overrides";
import { selectSettingsOverridesForApi } from "@ai-matrx/chat/agents/redux/execution-system/instance-model-overrides/instance-model-overrides.selectors";
import { copyInstanceRequestDraft } from "@ai-matrx/chat/agents/redux/execution-system/thunks/copy-instance-request-draft.thunk";

// The knob read is the external dependency (settings ladder over the network).
jest.mock("@/lib/scoped-config/sessionKnob", () => ({
  resolveSessionKnob: jest.fn(async () => GEMINI_FLASH),
}));

const GEMINI_FLASH = "b32f2079-4fa5-4613-a01d-726f1243ebe5";
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
      baseSettings: { model: SONNET },
    }),
  );
  return store;
}

async function openDefaultChatThenSwitch(personPicked: string | null) {
  const store = makeStore();
  // The default chat launches through the basic-chat door: the launch seeds
  // the person's default-chat-model preference.
  await applyLaunchModelOverrides(store.dispatch as never, {
    conversationId: defaultChat,
    mandateKey: MANDATE_KEYS.chat__default_new_chat,
  });
  // Only when the person opens the picker and chooses a model for this chat.
  if (personPicked) {
    store.dispatch(
      setOverrides({
        conversationId: defaultChat,
        changes: { model: personPicked },
      }),
    );
  }
  // Search agents → Select: the same-tab switch copies the draft.
  store.dispatch(
    copyInstanceRequestDraft({
      sourceConversationId: defaultChat,
      targetConversationId: dispatchAssistant,
      chatSemantics: true,
    }) as never,
  );
  return store;
}

describe("a default-chat model never follows the person into a named agent", () => {
  it.each([
    // [what the person picked in the picker, model on the named agent's wire]
    [null, undefined],
    [GPT_PICKED, GPT_PICKED],
  ])(
    "person picked %p → the named agent's request carries model %p",
    async (personPicked, expectedWireModel) => {
      const store = await openDefaultChatThenSwitch(personPicked);
      const wire = selectSettingsOverridesForApi(dispatchAssistant)(
        store.getState() as never,
      );
      expect(wire?.model).toBe(expectedWireModel);
      // The default chat itself still runs on the person's preference (or pick).
      const defaultWire = selectSettingsOverridesForApi(defaultChat)(
        store.getState() as never,
      );
      expect(defaultWire?.model).toBe(personPicked ?? GEMINI_FLASH);
    },
  );
});
