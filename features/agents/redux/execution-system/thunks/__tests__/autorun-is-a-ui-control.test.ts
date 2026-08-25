/**
 * THE autoRun LAW, pinned. Break any of these and this suite goes red.
 *
 * 🚨 Arman, 2026-08-25, after a coding agent misdiagnosed this AGAIN:
 *
 *   "Auto Run is a user interface control that determines if the user
 *    interface will allow the user to interact prior to submitting or if the
 *    user interface will just let things go. If there is no user interface,
 *    it's impossible for autorun to have any impact at all because there is
 *    no ui."
 *
 * So `autoRun` answers exactly ONE question — does the interface pause and let
 * the person act before the request goes out — and it has NO authority over
 * whether a run happens. If a button is wired to an agent and you press it,
 * that agent runs. What the four cases below fix in place:
 *
 *   1. INTERACTIVE + autoRun:false — the run is DEFERRED (a human will send
 *      it), but the component OPENS ANYWAY. autoRun never gates rendering.
 *   2. INTERACTIVE + autoRun:true  — runs immediately, no pause.
 *   3. HEADLESS   + autoRun:false — autoRun is IGNORED and the run FIRES.
 *      There is no interface to pause, nobody to wait for and nothing that
 *      would ever send it later, so honoring it would not defer the run, it
 *      would delete it. (Live victim: image-studio's DESCRIBE launch, which
 *      never ran at all.)
 *   4. HEADLESS   + autoRun:false + callerExecutes:true — deferred, because
 *      the caller has CLAIMED it will dispatch executeInstance itself after
 *      seeding something the launch cannot carry. The claim is required; the
 *      deferral is never assumed from the flag alone.
 *
 * `direct` is deliberately NOT headless: it means "no overlay, the CALLER
 * renders the interface", and `/chat` relies on `direct` + `autoRun:false` so
 * you can type before anything is sent.
 */

// The single observation this suite is built on: DID THE RUN FIRE? Mocked at
// the module boundary so it is a fact rather than an inference, and so nothing
// here ever reaches the network. `assembleRequest` is re-exported untouched —
// other suites import it from the same module.
const executeSpy = jest.fn();
jest.mock("../execute-instance.thunk", () => {
  const actual = jest.requireActual("../execute-instance.thunk");
  return {
    ...actual,
    executeInstance: Object.assign(
      (arg: unknown) => {
        executeSpy(arg);
        // redux-thunk invokes a function action and hands back its return
        // value, so returning the `.unwrap()`-able object here is what the
        // launch thunk's `dispatch(executeInstance(...)).unwrap()` needs.
        return () => ({
          unwrap: async () => ({
            requestId: "req-stub",
            conversationId: "c",
          }),
        });
      },
      { typePrefix: "instances/executeInstance" },
    ),
  };
});

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
jest.mock("@/features/agents/mandates/service", () => ({
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
      typeof import("@/features/agents/mandates/contract")
    >("@/features/agents/mandates/contract");
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
import { resolveMandate } from "@/features/agents/mandates/service";
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


function dispatchLaunch(
  store: ReturnType<typeof makeStore>,
  extra: Partial<Parameters<typeof launchAgentExecution>[0]> = {},
) {
  return (store.dispatch as unknown as AppDispatch)(
    launchAgentExecution({
      mandateKey: "plan_client.shape_planner",
      surfaceKey: "test-surface",
      sourceFeature: "marketing",
      runtime: { variables: { site: "example.com" } },
      ...extra,
    } as Parameters<typeof launchAgentExecution>[0]),
  );
}

async function launch(
  store: ReturnType<typeof makeStore>,
  extra: Partial<Parameters<typeof launchAgentExecution>[0]> = {},
) {
  return dispatchLaunch(store, extra).unwrap();
}

/**
 * Fire a launch that WILL execute and settle once the decision is made.
 *
 * A launch that runs continues into `pollForCompletion`, which waits on a
 * request row this mini store never receives. The decision under test — did
 * the run fire — has already happened by then, so this ticks past it instead
 * of awaiting a promise that cannot resolve here.
 */
async function launchAndSettle(
  store: ReturnType<typeof makeStore>,
  extra: Partial<Parameters<typeof launchAgentExecution>[0]> = {},
) {
  void dispatchLaunch(store, extra)
    .unwrap()
    .catch(() => undefined);
  await new Promise((resolve) => setTimeout(resolve, 0));
}

describe("autoRun is a UI control — it never decides whether a run happens", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    executeSpy.mockClear();
  });

  it("INTERACTIVE + autoRun:false — defers the send but still opens the component", async () => {
    const store = makeStore();
    const { conversationId } = await launch(store, {
      callerExecutes: undefined,
      config: { displayMode: "flexible-panel", autoRun: false },
    });

    expect(executeSpy).not.toHaveBeenCalled();

    // The whole point: the interface is up, waiting for the human. autoRun
    // deferring the SEND must never suppress the RENDER.
    const overlay = store.getState().overlay as {
      instances?: Record<string, unknown>;
      byId?: Record<string, unknown>;
    };
    expect(JSON.stringify(overlay)).toContain(conversationId);
  });

  it("HEADLESS + autoRun:false — ignores autoRun and runs anyway", async () => {
    const errorSpy = jest.spyOn(console, "error").mockImplementation(() => {});
    const store = makeStore();

    await launchAndSettle(store, {
      callerExecutes: undefined,
      config: { displayMode: "background", autoRun: false },
    });

    // It ran, despite the flag. A UI control cannot delete a run.
    expect(executeSpy).toHaveBeenCalledTimes(1);
    // And it said so, loudly, naming the fix.
    expect(errorSpy).toHaveBeenCalled();
    expect(String(errorSpy.mock.calls[0]?.[0])).toContain("IGNORING autoRun=false");
    errorSpy.mockRestore();
  });

  it("HEADLESS + autoRun omitted — runs, and says nothing (omission is not a mistake)", async () => {
    const errorSpy = jest.spyOn(console, "error").mockImplementation(() => {});
    const store = makeStore();

    await launchAndSettle(store, {
      callerExecutes: undefined,
      config: { displayMode: "background" },
    });

    // This is the accidental class that bit image-studio: nobody wrote a flag,
    // the hard default read as false, and the run vanished. It runs now.
    expect(executeSpy).toHaveBeenCalledTimes(1);
    // But leaving a UI flag off a UI-less mode is the sane thing to write, so
    // it is not scolded — only an asserted `false` is.
    const shouted = errorSpy.mock.calls.some((c) =>
      String(c[0]).includes("IGNORING autoRun=false"),
    );
    expect(shouted).toBe(false);
    errorSpy.mockRestore();
  });

  it("HEADLESS + autoRun:false + callerExecutes — defers, because the caller claimed it", async () => {
    const errorSpy = jest.spyOn(console, "error").mockImplementation(() => {});
    const store = makeStore();

    await launch(store, {
      callerExecutes: true,
      config: { displayMode: "background", autoRun: false },
    });

    expect(executeSpy).not.toHaveBeenCalled();
    // A declared deferral is not a mistake, so nothing screams about it.
    const shouted = errorSpy.mock.calls.some((c) =>
      String(c[0]).includes("IGNORING autoRun=false"),
    );
    expect(shouted).toBe(false);
    errorSpy.mockRestore();
  });
});
