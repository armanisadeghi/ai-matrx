/**
 * NO ORGANIZATION IS A QUESTION, NEVER A DEAD WINDOW (shortcut stall, 2026-10-03).
 *
 * A shortcut launched with no active organization opened its window at "Ready to
 * run", then the execution gate asked which organization — and when the person
 * closed that picker nothing was sent and nothing was said: a window that can
 * never run. The launch now asks BEFORE any window opens. Picking continues the
 * launch; closing the picker opens nothing and starts nothing.
 */

// The one org-gate mock: what the picker answers. Everything else is real.
const askOrganization = jest.fn();
jest.mock("../../../../../host/org", () => ({
  ...jest.requireActual("../../../../../host/org"),
  ensureOrganizationContext: (...args: unknown[]) => askOrganization(...args),
}));

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

// A signed-in person: the launch's sign-in gate (isSignedOutVisitor) reads the
// browser session, which this suite has no host for. Everything else is real.
jest.mock("../../../../../host/identity", () => ({
  ...jest.requireActual("../../../../../host/identity"),
  isSignedOutVisitor: async () => false,
}));

// Stub `uuid` — its v13 ESM build trips Jest's CommonJS loader.
let __uuidCounter = 0;
jest.mock("uuid", () => ({
  v4: () => `uuid-stub-${++__uuidCounter}`,
}));

jest.mock(
  "../../client-capabilities/desktop-presence",
  () => ({
    getLiveDesktopInstance: jest.fn().mockResolvedValue(null),
  }),
);

// The ONLY mandate mock — everything downstream of resolution is real code.
const AGENT_ID = "mandate-agent-1";
/** Mutable so one test can give the mandate a required document variable. */
const __requiredVariables: string[] = [];
jest.mock("../../../../../mandates/service", () => ({
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
      typeof import("@ai-matrx/agents/mandates")
    >("@ai-matrx/agents/mandates");
    const missing = contract.missingRequiredVariables(
      mandate.contract as never,
      supplied as never,
    );
    if (missing.length > 0) {
      throw new Error(
        contract.missingVariablesMessage(storedMandateKey(mandate.mandateKey), missing),
      );
    }
  },
}));

import { configureStore, type UnknownAction } from "@reduxjs/toolkit";
import { launchAgentExecution } from "../launch-agent-execution.thunk";
import { assembleRequest } from "../execute-instance.thunk";
import { resolveMandate } from "../../../../../mandates/service";
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
import { configureRecordingWindows, type RecordingWindows } from "../../../../../testing/recording-windows";
import { CHAT_WINDOWS } from "../../../../../host/windows";
import type { ChatDispatch, ChatRootState } from "../../../../../store/root-state";
import { storedMandateKey } from "@ai-matrx/agents/mandates";

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
  // Readiness is the FETCH STATUS (P24 run tier), never field presence alone.
  _fetchStatus: "customExecution",
  _error: null,
};

const selectedAppContext = {
  organization_id: "org-selected-for-test",
  organization_name: "Selected Test Org",
};

// Read-only in this flow: the package reads only the selected organization.
function selectedAppContextReducer(state = selectedAppContext) {
  return state;
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
      appContext: selectedAppContextReducer,
    },
  });
}


function dispatchLaunch(
  store: ReturnType<typeof makeStore>,
  extra: Partial<Parameters<typeof launchAgentExecution>[0]> = {},
) {
  return (store.dispatch as unknown as ChatDispatch)(
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


let windows: RecordingWindows;
beforeEach(() => {
  windows = configureRecordingWindows();
  askOrganization.mockReset();
  executeSpy.mockClear();
});

const PANEL = { config: { displayMode: "flexible-panel", autoRun: false } } as const;

function cancelledPicker() {
  const error = new Error("") as Error & { name: string };
  error.name = "OrganizationSelectionCancelled";
  return error;
}

describe("a launch with no organization asks before it opens anything", () => {
  it("closing the picker opens NO window and sends nothing", async () => {
    askOrganization.mockRejectedValue(cancelledPicker());
    const store = makeStore();
    await expect(launch(store, PANEL)).rejects.toMatchObject({
      name: expect.stringMatching(/Cancelled|OrganizationSelectionCancelled/),
    });
    expect(askOrganization).toHaveBeenCalled();
    expect(windows.opened).toHaveLength(0);
    expect(executeSpy).not.toHaveBeenCalled();
  });

  it("picking an organization continues the launch and opens the window", async () => {
    askOrganization.mockResolvedValue("org-picked");
    const store = makeStore();
    await launchAndSettle(store, PANEL);
    expect(askOrganization).toHaveBeenCalled();
    expect((windows.opened).length).toBeGreaterThan(0);
  });
});
