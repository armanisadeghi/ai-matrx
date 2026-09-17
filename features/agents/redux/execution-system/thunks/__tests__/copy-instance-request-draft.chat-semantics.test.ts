/** REGRESSION: an agent switch used to retain only trimmed text in storage. */
import { combineReducers, configureStore } from "@reduxjs/toolkit";
import input from "../../instance-user-input/instance-user-input.slice";
import variables from "../../instance-variable-values/instance-variable-values.slice";
import resources from "../../instance-resources/instance-resources.slice";
import context from "../../instance-context/instance-context.slice";
import clientTools from "../../instance-client-tools/instance-client-tools.slice";
import ui from "../../instance-ui-state/instance-ui-state.slice";
import overrides from "../../instance-model-overrides/instance-model-overrides.slice";
import conversations from "../../conversations/conversations.slice";
import {
  addResource,
  removeResource,
  setResourceEditedContent,
} from "../../instance-resources/instance-resources.slice";
import {
  copyInstanceRequestDraft,
  syncInstanceRequestDraftResources,
} from "../copy-instance-request-draft.thunk";

const source = "source-chat";
const target = "target-chat";
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

function storeFor(text: string, model: string) {
  return configureStore({
    reducer,
    preloadedState: {
      instanceUserInput: {
        byConversationId: {
          [source]: {
            conversationId: source,
            text,
            messageParts: [{ type: "text", text }],
            submissionPhase: "idle",
            lastSubmittedText: "",
            lastSubmittedUserValues: {},
            _undoPast: [],
            _undoFuture: [],
          },
          [target]: {
            conversationId: target,
            text: "target",
            messageParts: null,
            submissionPhase: "idle",
            lastSubmittedText: "",
            lastSubmittedUserValues: {},
            _undoPast: [],
            _undoFuture: [],
          },
        },
      },
      instanceVariableValues: {
        byConversationId: {
          [source]: {
            userValues: { brief: "exact" },
            scopeValues: { context: "scope" },
            resourcePolicies: {},
          },
          [target]: { userValues: {}, scopeValues: {}, resourcePolicies: {} },
        },
      },
      instanceResources: {
        byConversationId: {
          [source]: {
            "file-1": {
              resourceId: "file-1",
              blockType: "file",
              source: { id: "f1" },
              preview: null,
              status: "ready",
              errorMessage: null,
              userEdited: false,
              editedContent: null,
              options: {},
              finalPayload: { type: "file", file_id: "f1" },
              sortOrder: 0,
            },
          },
          [target]: {},
        },
        submittedIds: { [source]: [], [target]: [] },
        handoffInheritedIds: { [source]: [], [target]: [] },
        handoffRemovedIds: { [source]: [], [target]: [] },
      },
      instanceContext: {
        byConversationId: {
          [source]: {
            "ctx-1": {
              key: "ctx-1",
              value: "kept",
              slotMatched: false,
              type: "text",
              label: "Context 1",
            },
          },
          [target]: {},
        },
        surfaceKeysByConversationId: { [source]: [], [target]: [] },
      },
      instanceClientTools: {
        byConversationId: { [source]: ["tool-a"], [target]: [] },
      },
      instanceUIState: {
        byConversationId: {
          [source]: {
            builderAdvancedSettings: { addedMcpServers: ["github"] },
            serverOverrideUrl: null,
            serverOverrideAuthToken: null,
            serverOverrideAuthTokenError: null,
          },
          [target]: { builderAdvancedSettings: {} },
        },
        pendingByConversationId: {},
      },
      instanceModelOverrides: {
        byConversationId: {
          [source]: {
            conversationId: source,
            baseSettings: { model: "base-a" },
            overrides: { model },
            removals: ["temperature"],
          },
          [target]: {
            conversationId: target,
            baseSettings: { model: "target-base" },
            overrides: {},
            removals: [],
          },
        },
      },
      conversations: {
        debugSessionActive: false,
        allConversationIds: [source, target],
        byConversationId: {
          [source]: { sandboxBinding: { rowId: "sandbox-1" } },
          [target]: {},
        },
      },
    } as never,
  });
}

describe("copyInstanceRequestDraft chat semantics", () => {
  it.each([
    ["  keep every space  ", "model-alpha"],
    ["\nsecond draft\t", "model-beta"],
  ])("copies the complete unsent request for %p", (text, model) => {
    const store = storeFor(text, model);
    store.dispatch(
      copyInstanceRequestDraft({
        sourceConversationId: source,
        targetConversationId: target,
        chatSemantics: true,
      }) as never,
    );
    const state = store.getState() as never as {
      instanceUserInput: {
        byConversationId: Record<
          string,
          { text: string; messageParts: unknown[] }
        >;
      };
      instanceVariableValues: {
        byConversationId: Record<
          string,
          { userValues: unknown; scopeValues: unknown }
        >;
      };
      instanceResources: {
        byConversationId: Record<string, Record<string, unknown>>;
      };
      instanceContext: {
        byConversationId: Record<string, Record<string, unknown>>;
      };
      instanceClientTools: { byConversationId: Record<string, string[]> };
      instanceModelOverrides: {
        byConversationId: Record<
          string,
          { baseSettings: unknown; overrides: unknown; removals: string[] }
        >;
      };
      conversations: {
        byConversationId: Record<
          string,
          { sandboxBinding?: unknown; sandboxBindingPersisted?: boolean }
        >;
      };
    };
    expect(state.instanceUserInput.byConversationId[target].text).toBe(text);
    expect(
      state.instanceUserInput.byConversationId[target].messageParts,
    ).toEqual([{ type: "text", text }]);
    expect(state.instanceVariableValues.byConversationId[target]).toMatchObject(
      { userValues: { brief: "exact" }, scopeValues: { context: "scope" } },
    );
    expect(
      state.instanceResources.byConversationId[target]["file-1"],
    ).toMatchObject({ finalPayload: { type: "file", file_id: "f1" } });
    expect(state.instanceContext.byConversationId[target]).toEqual({
      "ctx-1": {
        key: "ctx-1",
        value: "kept",
        slotMatched: false,
        type: "text",
        label: "Context 1",
      },
    });
    expect(state.instanceClientTools.byConversationId[target]).toEqual([
      "tool-a",
    ]);
    expect(state.instanceModelOverrides.byConversationId[target]).toEqual(
      expect.objectContaining({
        baseSettings: { model: "target-base" },
        overrides: { model },
        removals: ["temperature"],
      }),
    );
    expect(state.conversations.byConversationId[target]).toMatchObject({
      sandboxBinding: { rowId: "sandbox-1" },
      sandboxBindingPersisted: false,
    });
  });

  it("mirrors resolver completion without clobbering a destination resource edit", () => {
    const store = storeFor("draft", "model-alpha");
    store.dispatch(
      copyInstanceRequestDraft({
        sourceConversationId: source,
        targetConversationId: target,
        chatSemantics: true,
      }) as never,
    );
    store.dispatch(
      setResourceEditedContent({
        conversationId: target,
        resourceId: "file-1",
        content: "destination edit",
      }),
    );
    store.dispatch(
      syncInstanceRequestDraftResources({
        sourceConversationId: source,
        targetConversationId: target,
      }) as never,
    );

    expect(
      store.getState().instanceResources.byConversationId[target]["file-1"],
    ).toMatchObject({
      userEdited: true,
      editedContent: "destination edit",
      sortOrder: 0,
    });
  });

  it("does not resurrect an inherited resource removed on the intermediate agent", () => {
    const store = storeFor("draft", "model-alpha");
    store.dispatch(
      copyInstanceRequestDraft({
        sourceConversationId: source,
        targetConversationId: target,
        chatSemantics: true,
      }) as never,
    );
    store.dispatch(
      removeResource({ conversationId: target, resourceId: "file-1" }),
    );
    store.dispatch(
      addResource({
        conversationId: target,
        resourceId: "local-file",
        blockType: "document",
        source: { id: "local" },
      }),
    );

    store.dispatch(
      syncInstanceRequestDraftResources({
        sourceConversationId: source,
        draftSourceConversationId: target,
        targetConversationId: target,
      }) as never,
    );

    expect(
      Object.keys(store.getState().instanceResources.byConversationId[target]),
    ).toEqual(["local-file"]);
  });
});
