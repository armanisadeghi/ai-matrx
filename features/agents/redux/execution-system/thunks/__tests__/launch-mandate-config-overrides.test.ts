/**
 * Pins THE MANDATE DOOR on the launchAgentExecution path.
 *
 * The bug class this prevents: matrx-frontend resolving mandates a SECOND time
 * in the browser and running the agent it picked, while aidream's own mandate
 * door (`POST /ai/mandates/{key}`) — the resolver every other client already
 * uses — sits unused. Two resolvers means client chat silently ignores
 * server-side rebinds and provisions.
 *
 * What this enforces, end to end through the REAL thunks and reducers:
 *   - `launchAgentExecution({ mandateKey })` stamps the key on the conversation,
 *     so `executeInstance` POSTs the door instead of `/ai/agents/{id}`.
 *   - The binding's `config_overrides` are NOT echoed back on the wire: the
 *     server treats request config as the EXPLICIT layer that WINS over the
 *     binding, so re-sending a client-resolved binding would beat the very
 *     binding it came from. The caller's OWN llmOverrides still ride.
 *   - A caller may pass `agentId` alongside `mandateKey` — it is display
 *     identity (SSR-resolved) and never changes the run target.
 *   - The run-time variable precondition (disease D4) still refuses locally.
 */

// Stub `uuid` — its v13 ESM build trips Jest's CommonJS loader.
let __uuidCounter = 0;
jest.mock("uuid", () => ({
  v4: () => `uuid-stub-${++__uuidCounter}`,
}));

jest.mock(
  "@/features/agents/redux/execution-system/client-capabilities/desktop-presence",
  () => ({
    getLiveDesktopInstance: jest.fn().mockResolvedValue(null),
  }),
);

// The ONLY mandate mock — everything downstream of resolution is real code.
const AGENT_ID = "mandate-agent-1";
/** Mutable so one test can give the mandate a required document variable. */
const __requiredVariables: string[] = [];
jest.mock("@/features/mandates/service", () => ({
  resolveMandate: jest.fn(async (mandateKey: string) => ({
    mandateKey,
    agentId: AGENT_ID,
    // A SETTINGS-ONLY binding: no agent swap, just "run this on my model".
    configOverrides: { model: "user-override-model", thinking_level: "low" },
    provenance: "user",
    contract: {
      requiredVariables: [...__requiredVariables],
      requiredContextPolicyKeys: [],
      requiredOutputKeys: [],
      spillVariables: [],
    },
  })),
  // The run-time precondition (disease D4) runs as REAL code — only resolution
  // is mocked. A contract with no required variables must never block.
  assertMandateVariables: (
    mandate: { mandateKey: string; contract: unknown },
    supplied: unknown,
  ) => {
    const contract = jest.requireActual<
      typeof import("@/features/mandates/contract")
    >("@/features/mandates/contract");
    const missing = contract.missingRequiredVariables(
      mandate.contract as never,
      supplied as never,
    );
    if (missing.length > 0) {
      throw new Error(
        contract.missingVariablesMessage(mandate.mandateKey, missing),
      );
    }
  },
}));

import { configureStore, type UnknownAction } from "@reduxjs/toolkit";
import { launchAgentExecution } from "../launch-agent-execution.thunk";
import { assembleRequest } from "../execute-instance.thunk";
import { resolveMandate } from "@/features/mandates/service";
import conversationsReducer from "../../conversations/conversations.slice";
import conversationFocusReducer from "../../conversation-focus/conversation-focus.slice";
import instanceModelOverridesReducer from "../../instance-model-overrides/instance-model-overrides.slice";
import instanceVariableValuesReducer from "../../instance-variable-values/instance-variable-values.slice";
import instanceResourcesReducer from "../../instance-resources/instance-resources.slice";
import instanceContextReducer from "../../instance-context/instance-context.slice";
import instanceUserInputReducer from "../../instance-user-input/instance-user-input.slice";
import instanceClientToolsReducer from "../../instance-client-tools/instance-client-tools.slice";
import instanceUIStateReducer from "../../instance-ui-state/instance-ui-state.slice";
import messagesReducer from "../../messages/messages.slice";
import creatorDebugReducer from "@/lib/redux/preferences/creatorDebugSlice";
import adminPreferencesReducer from "@/lib/redux/preferences/adminPreferencesSlice";
import userPreferencesReducer from "@/lib/redux/preferences/userPreferencesSlice";
import { editorStateReducer } from "@/features/code-editor/redux/editor-state.slice";
import appContextReducer from "@/lib/redux/slices/appContextSlice";
import overlayReducer from "@/lib/redux/slices/overlaySlice";
import type { AppDispatch, RootState } from "@/lib/redux/store";

// Fully-loaded agent record: Step 0.5's readiness check passes so the thunk
// never reaches the network. `_loadedFields` mirrors the FieldFlags shape.
const agentRecord = {
  id: AGENT_ID,
  agentType: "builtin",
  modelId: "base-model",
  settings: { temperature: 0.7 },
  variableDefinitions: [],
  contextPolicies: [],
  tools: [],
  customTools: [],
  isOwner: false,
  _loadedFields: {
    variableDefinitions: true,
    contextPolicies: true,
    settings: true,
    tools: true,
    customTools: true,
    modelId: true,
  },
  _error: null,
};

const selectedAppContext: ReturnType<typeof appContextReducer> = {
  ...appContextReducer(undefined, { type: "@@INIT" }),
  organization_id: "org-selected-for-test",
  organization_name: "Selected Test Org",
};

function selectedAppContextReducer(
  state = selectedAppContext,
  action: UnknownAction,
) {
  return appContextReducer(state, action);
}

function makeStore() {
  return configureStore({
    reducer: {
      // Read-only in this flow — a frozen stub slice holding the agent.
      agentDefinition: (state = { agents: { [AGENT_ID]: agentRecord } }) =>
        state,
      conversations: conversationsReducer,
      conversationFocus: conversationFocusReducer,
      instanceModelOverrides: instanceModelOverridesReducer,
      instanceVariableValues: instanceVariableValuesReducer,
      instanceResources: instanceResourcesReducer,
      instanceContext: instanceContextReducer,
      instanceUserInput: instanceUserInputReducer,
      instanceClientTools: instanceClientToolsReducer,
      instanceUIState: instanceUIStateReducer,
      messages: messagesReducer,
      creatorDebug: creatorDebugReducer,
      adminPreferences: adminPreferencesReducer,
      userPreferences: userPreferencesReducer,
      editorState: editorStateReducer,
      appContext: selectedAppContextReducer,
      overlay: overlayReducer,
    },
  });
}

async function launch(
  store: ReturnType<typeof makeStore>,
  extra: Partial<Parameters<typeof launchAgentExecution>[0]> = {},
) {
  // The mini store covers only the slices this flow touches; its inferred
  // state type is narrower than RootState, so route dispatch through the
  // app-level thunk dispatch type.
  return (store.dispatch as unknown as AppDispatch)(
      launchAgentExecution({
        mandateKey: "plan_client.shape_planner",
        surfaceKey: "test-surface",
        sourceFeature: "marketing",
        runtime: { variables: { site: "example.com" } },
        // Background + `callerExecutes`: the instance is created and seeded and
        // nothing runs, because THIS TEST is the caller that drives the
        // request — it calls assembleRequest directly below. Without the
        // declaration a headless launch executes on its own (autoRun is a UI
        // control and `background` has no UI), which is the whole point of
        // the flag: the deferral has to be claimed, never assumed.
        callerExecutes: true,
        config: { displayMode: "background" },
        ...extra,
      } as Parameters<typeof launchAgentExecution>[0]),
    )
    .unwrap();
}

describe("launchAgentExecution mandateKey — THE DOOR is the run target", () => {
  test("the mandate key is stamped on the conversation, so turn 1 POSTs /ai/mandates/{key}", async () => {
    const store = makeStore();
    const { conversationId } = await launch(store);

    const state = store.getState() as unknown as RootState;
    // THE POINT: `executeInstance` reads this field to choose the door.
    expect(
      state.conversations.byConversationId[conversationId]?.mandateKey,
    ).toBe("plan_client.shape_planner");
    // The resolved agent is display identity for the instance snapshot.
    expect(
      state.conversations.byConversationId[conversationId]?.agentId,
    ).toBe(AGENT_ID);
  });

  test("the binding's config_overrides are NOT re-sent — the server applies them", async () => {
    const store = makeStore();
    const { conversationId } = await launch(store);

    const state = store.getState() as unknown as RootState;
    const request = assembleRequest(state, conversationId);
    // Echoing the client-resolved binding back would land as the EXPLICIT
    // layer and beat the binding itself inside `resolve_mandated_agent_start`.
    expect(request?.config_overrides?.model).toBeUndefined();
    expect(request?.config_overrides?.thinking_level).toBeUndefined();
  });

  test("the caller's OWN llmOverrides still ride — those really are explicit", async () => {
    const store = makeStore();
    const { conversationId } = await launch(store, {
      config: {
        displayMode: "background",
        llmOverrides: { model: "caller-model", temperature: 0.2 },
      },
    });

    const state = store.getState() as unknown as RootState;
    const request = assembleRequest(state, conversationId);
    expect(request?.config_overrides).toMatchObject({
      model: "caller-model",
      temperature: 0.2,
    });
  });

  test("agentId alongside mandateKey is DISPLAY identity — no client resolution at all", async () => {
    const store = makeStore();
    (resolveMandate as jest.Mock).mockClear();
    // Stands in for `/chat/new`'s SSR-resolved default agent.
    const { conversationId } = await launch(store, { agentId: AGENT_ID });

    // The surface already knew what to paint, so nothing was resolved here.
    expect(resolveMandate).not.toHaveBeenCalled();
    const state = store.getState() as unknown as RootState;
    const record = state.conversations.byConversationId[conversationId];
    expect(record?.agentId).toBe(AGENT_ID);
    // …and the RUN still goes through the door.
    expect(record?.mandateKey).toBe("plan_client.shape_planner");
  });

  test("mandateKey is still mutually exclusive with shortcutId — loud, never a silent merge", async () => {
    const store = makeStore();
    // `.unwrap()` rethrows RTK's SerializedError (a plain object, not an
    // Error instance) — match on message, not toThrow.
    await expect(
      launch(store, { shortcutId: "some-shortcut" }),
    ).rejects.toMatchObject({
      message: expect.stringMatching(/mutually exclusive/),
    });
  });
});

/**
 * DISEASE D4 — the run-time half of the Mandate contract, through the REAL
 * funnel. Arman, 2026-08-19: *"this agent should never have even started
 * without getting the rules in place."*
 *
 * Bind-time enforcement alone verified that the agent could RECEIVE the
 * document while nothing verified that the caller SENT it, which is how the
 * Masterwork Conductor came to fetch its own Rulebook with a tool call on turn
 * 1 and skim it.
 */
describe("launchAgentExecution mandateKey — a required document variable is a RUN-TIME precondition", () => {
  afterEach(() => {
    __requiredVariables.length = 0;
  });

  test("REFUSES the launch when the required document variable was not supplied", async () => {
    __requiredVariables.push("rulebook_document");
    const store = makeStore();
    // RTK rejects with a SerializedError (a plain object), not an Error —
    // match on its message rather than `toThrow`.
    await expect(
      launch(store, { runtime: { variables: { rulebook_id: "rb-1" } } }),
    ).rejects.toMatchObject({
      message: expect.stringContaining("rulebook_document"),
    });
    // Nothing was created: refusing means refusing, not half-starting.
    const state = store.getState() as unknown as RootState;
    expect(Object.keys(state.conversations.byConversationId)).toHaveLength(0);
  });

  test("REFUSES on a blank document — the exact shape of a wiring failure", async () => {
    __requiredVariables.push("rulebook_document");
    const store = makeStore();
    await expect(
      launch(store, {
        runtime: { variables: { rulebook_id: "rb-1", rulebook_document: "  " } },
      }),
    ).rejects.toMatchObject({
      message: expect.stringContaining("rulebook_document"),
    });
  });

  test("launches when the document is bound, and it reaches the wire as a NAMED variable", async () => {
    __requiredVariables.push("rulebook_document");
    const document = "# Their Rulebook\n### Rule 3 [r3]\nNever open with an apology.";
    const store = makeStore();
    const { conversationId } = await launch(store, {
      runtime: { variables: { rulebook_id: "rb-1", rulebook_document: document } },
    });

    const state = store.getState() as unknown as RootState;
    const request = assembleRequest(state, conversationId);
    // THE POINT: the Rulebook arrives under its own NAME, not as prose in the
    // human's turn and not as a tool result the model chose to fetch.
    expect(request?.variables).toMatchObject({ rulebook_document: document });
    expect(request?.user_input ?? "").not.toContain("Never open with an apology");
  });
});
