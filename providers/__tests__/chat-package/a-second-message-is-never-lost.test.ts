/**
 * USER INPUT IS NEVER LOST (2026-10-01, conversation 12084ef6…, 11:34:06 PT).
 *
 * A person typed line A and pressed Enter, then typed line B and pressed
 * Enter a few seconds later. Only B was ever saved; A had no row anywhere and
 * nothing on screen said so. The console said "[execute-instance] refused a
 * concurrent turn … it sends the composer as it stands, so this one was
 * dropped". The send read the composer AFTER its awaits, by which time the
 * box held B; the second send was then refused as a duplicate.
 *
 * Pinned here against the REAL `smartExecute` and the REAL `executeInstance`
 * door over a real store — only the network edges and the gates' answers are
 * stubbed. The organization gate is held open, exactly the window the runner
 * typed into:
 *   1. A then B in quick succession → A is the turn sent, B is queued into
 *      that run, in that order; the composer ends empty.
 *   2. The second submit is visible the moment it is pressed (never silent).
 *   3. A submit cancelled at a gate returns its text to the composer, and a
 *      next message typed meanwhile is kept after it.
 *   4. The same draft submitted twice still goes once.
 */

// ── Gates: the organization gate is the first await of both thunks. ──────
let orgGateMode: "open" | "hold" | "cancel" = "open";
const heldGates: Array<{
  resolve: () => void;
  reject: (error: unknown) => void;
}> = [];
jest.mock("@ai-matrx/chat/agents/redux/execution-system/utils/required-organization", () => ({
  ...jest.requireActual("@ai-matrx/chat/agents/redux/execution-system/utils/required-organization"),
  ensureExecutionOrganization: jest.fn(() => {
    if (orgGateMode === "open") return Promise.resolve();
    if (orgGateMode === "cancel") {
      return Promise.reject(
        Object.assign(new Error("cancelled"), { __cancelled: true }),
      );
    }
    return new Promise<void>((resolve, reject) =>
      heldGates.push({ resolve, reject }),
    );
  }),
  executionOrganizationForRequest: jest.fn(() => "org-test"),
  requireExecutionOrganizationId: jest.fn(() => "org-test"),
}));

const thunkResolving = (value: unknown) => () => {
  const p = Promise.resolve(value);
  return Object.assign(p, { unwrap: () => p });
};
jest.mock("@ai-matrx/chat/agents/redux/execution-system/thunks/refresh-surface-scope.thunk", () => ({
  ...jest.requireActual("@ai-matrx/chat/agents/redux/execution-system/thunks/refresh-surface-scope.thunk"),
  refreshSurfaceScope: () => thunkResolving(undefined),
}));
jest.mock("@ai-matrx/chat/agents/redux/execution-system/thunks/sandbox-gate.thunk", () => ({
  ...jest.requireActual("@ai-matrx/chat/agents/redux/execution-system/thunks/sandbox-gate.thunk"),
  ensureSandboxOrDecide: () => thunkResolving("ok"),
}));
jest.mock("@ai-matrx/chat/context/sources/scopes", () => ({
  ...jest.requireActual("@ai-matrx/chat/context/sources/scopes"),
  ...(() => ({
  ensureConversationScopesOrAsk: () => () =>
    Promise.resolve({ blocked: false, scopeIdsOverride: undefined }),
}))(),
}));
jest.mock("@ai-matrx/chat/agents/ui-first-tools/redux/resolve-asks-with-input.thunk", () => ({
  resolvePendingAsksWithInput: () => () => false,
}));
jest.mock("@ai-matrx/chat/agents/redux/execution-system/context-rules/context-rules.thunks", () => ({
  ...jest.requireActual("@ai-matrx/chat/agents/redux/execution-system/context-rules/context-rules.thunks"),
  ensureContextRulesReady: () => () => Promise.resolve(),
}));
jest.mock("@ai-matrx/chat/agents/redux/execution-system/context-rules/mandate-kill-switch", () => ({
  ...jest.requireActual("@ai-matrx/chat/agents/redux/execution-system/context-rules/mandate-kill-switch"),
  resolveMandateKillSwitch: () => Promise.resolve(false),
}));
jest.mock("@ai-matrx/chat/agents/runtime/generation-job", () => ({
  ...jest.requireActual("@ai-matrx/chat/agents/runtime/generation-job"),
  labelGenerationJob: () => Promise.resolve(),
}));
jest.mock("@ai-matrx/chat/agents/runtime/get-model-capabilities", () => ({
  ...jest.requireActual("@ai-matrx/chat/agents/runtime/get-model-capabilities"),
  getCapabilitiesForConversation: () => null,
}));
// The stream itself is not under test: once the door has sent the turn
// (optimistic row + `running`), the run stays open.
jest.mock("@ai-matrx/chat/agents/redux/execution-system/utils/build-tool-injection", () => ({
  ...jest.requireActual("@ai-matrx/chat/agents/redux/execution-system/utils/build-tool-injection"),
  buildToolInjection: () => new Promise(() => undefined),
}));

// The ONE network edge reached: the queue POST.
const inboxPosts: Array<{ text: string; delivery: string }> = [];
jest.mock("@ai-matrx/chat/agents/redux/execution-system/thunks/call-conversation-api", () => ({
  callConversationApi: (_conversationId: string, args: { body: { text: string; delivery: string } }) => () => {
    inboxPosts.push({ text: args.body.text, delivery: args.body.delivery });
    return Promise.resolve({
      data: { injection_id: `inj-${inboxPosts.length}`, run_active: true },
    });
  },
}));
jest.mock("@ai-matrx/chat/host/notify", () => ({
  toast: { info: jest.fn(), error: jest.fn(), warning: jest.fn() },
}));

let __uuid = 0;
jest.mock("uuid", () => ({ v4: () => `uuid-stub-${++__uuid}` }));
// The org seam (P7) carries the names this test stood in for above; the rest stay real.
jest.mock("@ai-matrx/chat/host/org", () => {
  const standIns: Record<string, unknown> = {
    ...(() => ({
  isOrganizationSelectionCancelled: (error: unknown) =>
    Boolean((error as { __cancelled?: boolean })?.__cancelled),
}))(),
  };
  const moved = ["selectOrganizationId","selectOrganizationName","ensureOrgId","getActiveOrgId","isOrganizationSelectionCancelled","ensureOrganizationContext","ensureOrganizationForRequest"];
  return {
    ...jest.requireActual("@ai-matrx/chat/host/org"),
    ...Object.fromEntries(Object.entries(standIns).filter(([name]) => moved.includes(name))),
  };
});

import { configureStore, type UnknownAction } from "@reduxjs/toolkit";
import conversationsReducer, {
  createInstance,
  setInstanceStatus,
} from "@ai-matrx/chat/agents/redux/execution-system/conversations/conversations.slice";
import conversationFocusReducer from "@ai-matrx/chat/agents/redux/execution-system/conversation-focus/conversation-focus.slice";
import instanceModelOverridesReducer from "@ai-matrx/chat/agents/redux/execution-system/instance-model-overrides/instance-model-overrides.slice";
import instanceVariableValuesReducer, {
  initInstanceVariables,
} from "@ai-matrx/chat/agents/redux/execution-system/instance-variable-values/instance-variable-values.slice";
import instanceResourcesReducer, {
  initInstanceResources,
} from "@ai-matrx/chat/agents/redux/execution-system/instance-resources/instance-resources.slice";
import instanceContextReducer from "@ai-matrx/chat/agents/redux/execution-system/instance-context/instance-context.slice";
import instanceUserInputReducer, {
  initInstanceUserInput,
  setUserInputText,
} from "@ai-matrx/chat/agents/redux/execution-system/instance-user-input/instance-user-input.slice";
import instanceClientToolsReducer from "@ai-matrx/chat/agents/redux/execution-system/instance-client-tools/instance-client-tools.slice";
import instanceUIStateReducer from "@ai-matrx/chat/agents/redux/execution-system/instance-ui-state/instance-ui-state.slice";
import messagesReducer, {
  initInstanceMessages,
} from "@ai-matrx/chat/agents/redux/execution-system/messages/messages.slice";
import activeRequestsReducer from "@ai-matrx/chat/agents/redux/execution-system/active-requests/active-requests.slice";
import conversationInboxReducer from "@ai-matrx/chat/agents/redux/execution-system/inbox/inbox.slice";
import creatorDebugReducer from "@/lib/redux/preferences/creatorDebugSlice";
import adminPreferencesReducer from "@/lib/redux/preferences/adminPreferencesSlice";
import userPreferencesReducer from "@/lib/redux/preferences/userPreferencesSlice";
import { editorStateReducer } from "@/features/code-editor/redux/editor-state.slice";
import appContextReducer from "@/lib/redux/slices/appContextSlice";
import { configureRecordingWindows } from "@ai-matrx/chat/testing/recording-windows";
import type { ChatDispatch, ChatRootState } from "@ai-matrx/chat/store/root-state";
import { smartExecute } from "@ai-matrx/chat/agents/redux/execution-system/thunks/smart-execute.thunk";

const AGENT_ID = "compass-itinerary-clerk";
const LINE_A =
  "Now draft the 40-stop itinerary for the Whitcombe move, Tacoma to Boise.";
const LINE_B = "Also list the Whitcombe wine fridge as its own line item.";

const agentRecord = {
  id: AGENT_ID,
  agentType: "user",
  modelId: "base-model",
  settings: {},
  variableDefinitions: [],
  contextPolicies: [],
  tools: [],
  customTools: [],
  isOwner: true,
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

const appContext: ReturnType<typeof appContextReducer> = {
  ...appContextReducer(undefined, { type: "@@INIT" }),
  organization_id: "org-test",
};

function testAppContextReducer(state = appContext, action: UnknownAction) {
  return appContextReducer(state, action);
}

function makeStore(conversationId: string) {
  const store = configureStore({
    reducer: {
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
      activeRequests: activeRequestsReducer,
      conversationInbox: conversationInboxReducer,
      creatorDebug: creatorDebugReducer,
      adminPreferences: adminPreferencesReducer,
      userPreferences: userPreferencesReducer,
      editorState: editorStateReducer,
      appContext: testAppContextReducer,
    },
    middleware: (getDefault) =>
      getDefault({ serializableCheck: false, immutableCheck: false }),
  });
  store.dispatch(
    createInstance({
      conversationId,
      agentId: AGENT_ID,
      agentType: "user",
      origin: "manual",
      organizationId: "org-test",
    } as Parameters<typeof createInstance>[0]),
  );
  store.dispatch(initInstanceUserInput({ conversationId }));
  store.dispatch(initInstanceResources({ conversationId }));
  store.dispatch(initInstanceVariables({ conversationId, definitions: [] }));
  store.dispatch(initInstanceMessages({ conversationId }));
  return store;
}

type TestStore = ReturnType<typeof makeStore>;

/** What the person does: type into the box, press Enter. */
function type(store: TestStore, conversationId: string, text: string) {
  store.dispatch(setUserInputText({ conversationId, text }));
}
function pressEnter(store: TestStore, conversationId: string) {
  void (store.dispatch as unknown as ChatDispatch)(
    smartExecute({ conversationId }),
  );
}
const tick = (ms = 0) => new Promise((resolve) => setTimeout(resolve, ms));

function userRows(store: TestStore, conversationId: string): string[] {
  const entry = (store.getState() as unknown as ChatRootState).messages
    .byConversationId[conversationId];
  if (!entry) return [];
  return entry.orderedIds
    .map((id) => entry.byId[id])
    .filter((r) => r?.role === "user")
    .map((r) =>
      (r.content as Array<{ type: string; text?: string }>)
        .filter((p) => p.type === "text")
        .map((p) => p.text ?? "")
        .join(""),
    );
}
function composer(store: TestStore, conversationId: string) {
  return (store.getState() as unknown as ChatRootState).instanceUserInput
    .byConversationId[conversationId];
}
function queueCards(store: TestStore, conversationId: string) {
  return (
    (store.getState() as unknown as ChatRootState).conversationInbox
      .byConversationId[conversationId] ?? []
  );
}

// Windows open through the chat host's windows port (P18).
beforeEach(() => {
  configureRecordingWindows();
});

describe("a second message typed while the first is being sent is never lost", () => {
  let consoleError: jest.SpyInstance;
  beforeEach(() => {
    orgGateMode = "open";
    heldGates.length = 0;
    inboxPosts.length = 0;
    consoleError = jest.spyOn(console, "error").mockImplementation(() => {});
    jest.spyOn(console, "warn").mockImplementation(() => {});
    jest.spyOn(console, "debug").mockImplementation(() => {});
  });
  afterEach(() => jest.restoreAllMocks());

  it("replays the runner: A then B within seconds → A sent, B queued after it, composer empty", async () => {
    const id = "conv-runner-replay";
    const store = makeStore(id);
    orgGateMode = "hold";

    type(store, id, LINE_A);
    pressEnter(store, id);
    // The box empties at the keypress — the person can type the next line.
    expect(composer(store, id)?.submissionPhase).toBe("pending");

    // Still inside the organization gate: the person types B, presses Enter.
    await tick();
    type(store, id, LINE_B);
    pressEnter(store, id);

    // B is visible at once — a queued card, never a silent drop.
    expect(queueCards(store, id).map((c) => c.text)).toEqual([LINE_B]);
    expect(composer(store, id)?.text).toBe("");

    // The gates answer (smartExecute's, then the door's).
    orgGateMode = "open";
    while (heldGates.length) heldGates.shift()!.resolve();
    for (let i = 0; i < 20 && inboxPosts.length === 0; i++) await tick(30);

    // A is the turn that went; B rides the queue into that run, in order.
    expect(userRows(store, id)).toEqual([LINE_A]);
    expect(inboxPosts).toEqual([{ text: LINE_B, delivery: "turn_end" }]);
    expect(queueCards(store, id).map((c) => c.text)).toEqual([LINE_B]);
    expect(composer(store, id)?.text).toBe("");
    const refusals = consoleError.mock.calls.filter((c) =>
      String(c[0]).includes("refused a concurrent turn"),
    );
    expect(refusals).toHaveLength(0);
  });

  it("a send cancelled at a gate returns its text — and keeps the next line typed meanwhile", async () => {
    const id = "conv-gate-cancel";
    const store = makeStore(id);
    orgGateMode = "hold";
    type(store, id, LINE_A);
    pressEnter(store, id);
    await tick();
    type(store, id, LINE_B); // typed into the (visibly empty) box, no Enter

    heldGates
      .shift()!
      .reject(Object.assign(new Error("declined"), { __cancelled: true }));
    await tick(30);

    expect(userRows(store, id)).toEqual([]);
    expect(composer(store, id)?.text).toBe(`${LINE_A}\n\n${LINE_B}`);
    expect(composer(store, id)?.submissionPhase).toBe("idle");
  });

  it("a declined organization prompt puts the message back in the composer", async () => {
    const id = "conv-org-declined";
    const store = makeStore(id);
    orgGateMode = "cancel";
    type(store, id, LINE_A);
    pressEnter(store, id);
    await tick(10);
    expect(composer(store, id)?.text).toBe(LINE_A);
    expect(composer(store, id)?.submissionPhase).toBe("idle");
    expect(userRows(store, id)).toEqual([]);
  });

  it("a message sent while the run waits on a person (paused) is QUEUED into that run — never a colliding turn", async () => {
    // Owner proof on /chat 2026-10-03: the run was suspended on the canvas
    // edit's approval card (status "paused"); `selectIsExecuting` reads only
    // running/streaming, so the send was treated as idle and never reached the
    // run's queue.
    const id = "conv-paused-on-approval";
    const store = makeStore(id);
    store.dispatch(setInstanceStatus({ conversationId: id, status: "paused" }));
    type(store, id, LINE_B);
    pressEnter(store, id);
    for (let i = 0; i < 20 && inboxPosts.length === 0; i++) await tick(30);

    expect(inboxPosts).toEqual([{ text: LINE_B, delivery: "turn_end" }]);
    expect(queueCards(store, id).map((c) => c.text)).toEqual([LINE_B]);
    expect(userRows(store, id)).toEqual([]);
    expect(composer(store, id)?.text).toBe("");
  });

  it("the same draft submitted twice goes once", async () => {
    const id = "conv-double-enter";
    const store = makeStore(id);
    type(store, id, LINE_A);
    pressEnter(store, id);
    pressEnter(store, id);
    await tick(30);
    expect(userRows(store, id)).toEqual([LINE_A]);
    expect(inboxPosts).toEqual([]);
    expect(queueCards(store, id)).toEqual([]);
  });
});
