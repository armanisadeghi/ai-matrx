/**
 * A saved request comes back identical: capture → JSON (as stored in jsonb)
 * → apply onto a fresh composer. Attachments that cannot come back identically
 * are named in `omitted`, never saved silently.
 */
import { combineReducers, configureStore } from "@reduxjs/toolkit";
import input from "../../instance-user-input/instance-user-input.slice";
import variables from "../../instance-variable-values/instance-variable-values.slice";
import resources from "../../instance-resources/instance-resources.slice";
import context from "../../instance-context/instance-context.slice";
import ui from "../../instance-ui-state/instance-ui-state.slice";
import overrides from "../../instance-model-overrides/instance-model-overrides.slice";
import {
  applyRequestDraft,
  attachmentDurabilityProblem,
  captureRequestDraft,
  isRequestDraftSnapshot,
} from "../request-draft-snapshot";

const source = "source-draft";
const target = "target-draft";
const reducer = combineReducers({
  instanceUserInput: input,
  instanceVariableValues: variables,
  instanceResources: resources,
  instanceContext: context,
  instanceUIState: ui,
  instanceModelOverrides: overrides,
});

const inputRow = (conversationId: string, text: string) => ({
  conversationId,
  text,
  messageParts: null,
  submissionPhase: "idle",
  lastSubmittedText: "",
  lastSubmittedUserValues: {},
  _undoPast: [],
  _undoFuture: [],
});

const resource = (
  resourceId: string,
  sortOrder: number,
  source: unknown,
  status = "ready",
  preview: unknown = { label: resourceId },
) => ({
  resourceId,
  blockType: "document",
  source,
  preview,
  status,
  errorMessage: null,
  userEdited: false,
  editedContent: null,
  options: { editable: true },
  finalPayload: { type: "document" },
  sortOrder,
});

function makeStore() {
  return configureStore({
    reducer,
    preloadedState: {
      instanceUserInput: {
        byConversationId: {
          [source]: inputRow(source, "Summarize {{topic}}"),
          [target]: inputRow(target, "leftover"),
        },
      },
      instanceVariableValues: {
        byConversationId: {
          [source]: {
            userValues: { topic: "tides" },
            scopeValues: { region: "west" },
            resourcePolicies: {},
          },
          [target]: {
            userValues: { stale: "x" },
            scopeValues: {},
            resourcePolicies: {},
          },
        },
      },
      instanceResources: {
        byConversationId: {
          [source]: {
            stored: resource("stored", 1, { file_id: "file-1", url: "https://x.s3.amazonaws.com/a?X-Amz-Signature=abc&X-Amz-Expires=60" }),
            uploading: resource("uploading", 2, { url: "blob:http://local/123" }, "pending", "blob:http://local/123"),
            signed: resource("signed", 3, { url: "https://x.s3.amazonaws.com/b.png?X-Amz-Algorithm=AWS4-HMAC-SHA256&X-Amz-Signature=abc&X-Amz-Expires=60" }),
            failed: resource("failed", 4, { file_id: "file-2" }, "error"),
            web: resource("web", 0, "https://example.com/page", "pending", null),
          },
          [target]: {
            old: resource("old", 0, { file_id: "file-old" }),
          },
        },
        submittedIds: { [source]: [], [target]: [] },
        handoffInheritedIds: { [source]: [], [target]: [] },
        handoffRemovedIds: { [source]: [], [target]: [] },
      },
      instanceContext: {
        byConversationId: {
          [source]: {
            brief: {
              key: "brief",
              value: { a: 1 },
              slotMatched: false,
              type: "text",
              label: "Brief",
            },
          },
          [target]: {},
        },
        surfaceKeysByConversationId: { [source]: [], [target]: [] },
      },
      instanceUIState: {
        byConversationId: {
          [source]: {
            builderAdvancedSettings: { addedMcpServers: ["github"] },
            serverOverrideUrl: "https://secret.example",
            serverOverrideAuthToken: "secret-token",
          },
          [target]: { builderAdvancedSettings: {} },
        },
        pendingByConversationId: {},
      },
      instanceModelOverrides: {
        byConversationId: {
          [source]: {
            conversationId: source,
            baseSettings: { model: "base" },
            overrides: { reasoning_effort: "high" },
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
    } as never,
  });
}

type S = {
  instanceUserInput: { byConversationId: Record<string, { text: string }> };
  instanceVariableValues: {
    byConversationId: Record<
      string,
      { userValues: Record<string, unknown>; scopeValues: Record<string, unknown> }
    >;
  };
  instanceResources: {
    byConversationId: Record<
      string,
      Record<string, { status: string; source: unknown; sortOrder: number }>
    >;
  };
  instanceContext: { byConversationId: Record<string, Record<string, unknown>> };
  instanceUIState: {
    byConversationId: Record<string, { builderAdvancedSettings: unknown }>;
  };
  instanceModelOverrides: {
    byConversationId: Record<
      string,
      { baseSettings: unknown; overrides: unknown; removals: string[] }
    >;
  };
};

describe("request draft snapshot", () => {
  it("round-trips the complete request through JSON onto a fresh composer", () => {
    const store = makeStore();
    const { snapshot, omitted } = captureRequestDraft(
      store.getState() as never,
      source,
    );
    const stored = JSON.parse(JSON.stringify(snapshot));
    expect(isRequestDraftSnapshot(stored)).toBe(true);

    store.dispatch(
      applyRequestDraft({ snapshot: stored, conversationId: target }) as never,
    );
    const state = store.getState() as never as S;

    expect(state.instanceUserInput.byConversationId[target].text).toBe(
      "Summarize {{topic}}",
    );
    expect(state.instanceVariableValues.byConversationId[target].userValues).toEqual({
      topic: "tides",
    });
    expect(state.instanceVariableValues.byConversationId[target].scopeValues).toEqual({
      region: "west",
    });

    const restored = state.instanceResources.byConversationId[target];
    expect(Object.keys(restored).sort()).toEqual(["stored", "web"]);
    expect(restored.stored.source).toEqual(snapshot.resources[1].source);
    expect(restored.stored.status).toBe("ready");
    expect(restored.web.status).toBe("ready");
    expect(restored.web.sortOrder).toBeLessThan(restored.stored.sortOrder);

    expect(Object.keys(state.instanceContext.byConversationId[target])).toEqual([
      "brief",
    ]);
    expect(
      state.instanceUIState.byConversationId[target].builderAdvancedSettings,
    ).toMatchObject({ addedMcpServers: ["github"] });
    const targetOverrides = state.instanceModelOverrides.byConversationId[target];
    expect(targetOverrides.baseSettings).toEqual({ model: "target-base" });
    expect(targetOverrides.overrides).toEqual({ reasoning_effort: "high" });
    expect(targetOverrides.removals).toEqual(["temperature"]);

    expect(omitted.map((o) => o.reason).sort()).toEqual([
      "it failed to attach",
      "it is a temporary link that expires",
      "it was still uploading",
    ]);
  });

  it("never stores the server override URL or its auth token", () => {
    const store = makeStore();
    const { snapshot } = captureRequestDraft(store.getState() as never, source);
    const json = JSON.stringify(snapshot);
    expect(json).not.toContain("secret-token");
    expect(json).not.toContain("secret.example");
  });

  it("keeps a stored file by its id even when it also carries a signed link", () => {
    expect(
      attachmentDurabilityProblem({
        status: "ready",
        source: { file_id: "f", url: "https://x.s3.amazonaws.com/a?X-Amz-Signature=abc" },
      }),
    ).toBeNull();
  });

  it("rejects values that are not a snapshot this build can restore", () => {
    expect(isRequestDraftSnapshot(null)).toBe(false);
    expect(isRequestDraftSnapshot({ v: 2, resources: [] })).toBe(false);
    expect(isRequestDraftSnapshot({ user_message: "hi" })).toBe(false);
  });
});
