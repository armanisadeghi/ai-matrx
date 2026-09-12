/**
 * surfaceDelegatedToolCall — the ONE router from a client-delegated tool call
 * to its executor.
 *
 * SUT: `surfaceDelegatedToolCall`. It OWNS the request bookkeeping (pending
 * call, `started` lifecycle, `paused` conversation), the routing decision, the
 * desktop-presence branching (leave the durable row for the desktop vs answer
 * `unsupported_client_tool`), and argument normalization for Matrx Extend.
 *
 * Real: the store and every reducer the router writes (conversations,
 * activeRequests, pendingAsks) and every tool-name predicate. Replaced: only
 * what the router CALLS — the Supabase presence read, the durable-ledger
 * watcher, the tool-result POST, and each executor. Each replacement records
 * the exact payload the router built, so a wrong route, a wrong key, or a
 * dropped argument is visible.
 */

import type { WatchDesktopDelegationArgs } from "../watch-desktop-delegation.thunk";
import type { PendingToolResult } from "@/features/agents/api/submit-tool-results";
import type { DesktopPresence } from "../../client-capabilities/desktop-presence";

const mockPresence = jest.fn<Promise<DesktopPresence | null>, []>();
const mockWatches: WatchDesktopDelegationArgs[] = [];
const mockSubmitted: PendingToolResult[] = [];
const mockRouted: Array<{ executor: string; args: unknown }> = [];
const mockToastError = jest.fn();

function mockExecutor(executor: string) {
  return (args: unknown) => {
    mockRouted.push({ executor, args });
    return () => undefined;
  };
}

jest.mock(
  "@/features/agents/redux/execution-system/client-capabilities/desktop-presence",
  () => ({ getLiveDesktopInstance: () => mockPresence() }),
);
jest.mock("../watch-desktop-delegation.thunk", () => ({
  watchDesktopDelegation: (args: WatchDesktopDelegationArgs) => {
    mockWatches.push(args);
    return () => undefined;
  },
}));
jest.mock("@/features/agents/api/submit-tool-results", () => ({
  submitToolResult: (pending: PendingToolResult) => {
    mockSubmitted.push(pending);
    return () => undefined;
  },
}));
jest.mock("sonner", () => ({
  // Callable with error+warning: @ai-matrx/kit's createMatrxToast refuses a
  // non-callable toast object at module load.
  toast: Object.assign(jest.fn(), {
    error: mockToastError,
    warning: jest.fn(),
  }),
}));
jest.mock("../dispatch-widget-action.thunk", () => ({
  dispatchWidgetAction: mockExecutor("widget"),
}));
jest.mock(
  "@/features/agents/ui-first-tools/dispatcher/dispatch-ui-first-tool.thunk",
  () => ({ dispatchUiFirstTool: mockExecutor("uiFirst") }),
);
jest.mock(
  "@/features/agents/war-room-tools/dispatcher/dispatch-war-room-tool.thunk",
  () => ({ dispatchWarRoomTool: mockExecutor("warRoom") }),
);
jest.mock(
  "@/features/agents/war-room-master-tools/dispatcher/dispatch-war-room-master-tool.thunk",
  () => ({ dispatchWarRoomMasterTool: mockExecutor("warRoomMaster") }),
);
jest.mock(
  "@/features/agents/scribe-tools/dispatcher/dispatch-scribe-tool.thunk",
  () => ({ dispatchScribeTool: mockExecutor("scribe") }),
);
jest.mock("../dispatch-surface-client-tool.thunk", () => ({
  dispatchSurfaceClientTool: mockExecutor("surfaceClientTool"),
}));
jest.mock("../dispatch-surface-write.thunk", () => ({
  dispatchSurfaceWrite: mockExecutor("surfaceWrite"),
}));
jest.mock("../dispatch-matrx-extend-tool.thunk", () => ({
  dispatchMatrxExtendTool: mockExecutor("matrxExtend"),
}));

import { configureStore } from "@reduxjs/toolkit";
import { createSlimRootReducer } from "@/lib/redux/rootReducer";
import { createInstance } from "../../conversations/conversations.slice";
import { createRequest } from "../../active-requests/active-requests.slice";
import {
  surfaceDelegatedToolCall,
  type SurfaceDelegatedToolCallArgs,
} from "../surface-delegated-tool-call.thunk";

const CONVERSATION_ID = "conversation-1";
const REQUEST_ID = "req_client-lifecycle";
const USER_REQUEST_ID = "11111111-1111-4111-8111-111111111111";
const CALL_ID = "call-1";

const ONLINE_DESKTOP = {
  instanceId: "desktop-1",
  instanceName: "Test Mac",
  platform: "darwin",
  engineVersion: "1.4.0",
  tunnelActive: false,
  lastSeen: "2026-09-10T12:00:00Z",
} satisfies DesktopPresence;

function makeStore() {
  // Same dev-check posture as the production makeStore (lib/redux/store.ts).
  const store = configureStore({
    reducer: createSlimRootReducer(),
    middleware: (getDefaultMiddleware) =>
      getDefaultMiddleware({ serializableCheck: false, immutableCheck: false }),
  });
  store.dispatch(
    createInstance({
      conversationId: CONVERSATION_ID,
      agentId: "agent-1",
      agentType: "user",
      origin: "manual",
      status: "streaming",
    }),
  );
  store.dispatch(
    createRequest({ requestId: REQUEST_ID, conversationId: CONVERSATION_ID }),
  );
  return store;
}

type TestStore = ReturnType<typeof makeStore>;

function route(
  store: TestStore,
  overrides: Partial<SurfaceDelegatedToolCallArgs> = {},
): void {
  store.dispatch(
    surfaceDelegatedToolCall({
      conversationId: CONVERSATION_ID,
      requestId: REQUEST_ID,
      userRequestId: USER_REQUEST_ID,
      callId: CALL_ID,
      toolName: "local_file_ops",
      data: { arguments: { operation: "read" } },
      source: "cold-resume",
      ...overrides,
    }),
  );
}

/**
 * The desktop branch settles through a presence promise and, on the
 * unsupported path, a dynamic `import()` of the result submitter. Waiting for
 * a positive witness first and then yielding one macrotask turn guarantees
 * every queued microtask — including that dynamic import — has run, so a
 * "nothing was submitted" assertion cannot pass merely because it ran early.
 */
async function waitFor(
  condition: () => boolean,
  whatNeverHappened: string,
): Promise<void> {
  for (let turn = 0; turn < 50; turn += 1) {
    if (condition()) {
      await new Promise<void>((resolve) => setTimeout(resolve, 0));
      return;
    }
    await new Promise<void>((resolve) => setTimeout(resolve, 0));
  }
  throw new Error(`Timed out: ${whatNeverHappened}`);
}

function requestRow(store: TestStore) {
  return store.getState().activeRequests.byRequestId[REQUEST_ID];
}

describe("surfaceDelegatedToolCall", () => {
  beforeEach(() => {
    mockPresence.mockReset();
    mockWatches.length = 0;
    mockSubmitted.length = 0;
    mockRouted.length = 0;
    mockToastError.mockReset();
  });

  it("records the delegated call as pending, started and delegated, and pauses the conversation before routing", () => {
    const store = makeStore();
    route(store, {
      toolName: "unknown_client_tool",
      data: { arguments: { selector: "#main", depth: 2 } },
      source: "live",
    });

    const request = requestRow(store);
    expect(request.status).toBe("awaiting-tools");
    expect(request.pendingToolCalls).toEqual([
      expect.objectContaining({
        callId: CALL_ID,
        toolName: "unknown_client_tool",
        arguments: { arguments: { selector: "#main", depth: 2 } },
        resolved: false,
      }),
    ]);
    expect(request.toolLifecycle[CALL_ID]).toEqual(
      expect.objectContaining({
        status: "started",
        isDelegated: true,
        errorType: null,
        arguments: { arguments: { selector: "#main", depth: 2 } },
      }),
    );
    expect(
      store.getState().conversations.byConversationId[CONVERSATION_ID].status,
    ).toBe("paused");
  });

  it("leaves an online desktop's call delegated and arms the ledger watcher with the server UUID", async () => {
    mockPresence.mockResolvedValue(ONLINE_DESKTOP);
    const store = makeStore();
    route(store);
    await waitFor(() => mockWatches.length > 0, "the watcher was never armed");

    expect(mockWatches).toEqual([
      {
        conversationId: CONVERSATION_ID,
        lifecycleRequestId: REQUEST_ID,
        userRequestId: USER_REQUEST_ID,
        callId: CALL_ID,
      },
    ]);
    expect(mockSubmitted).toEqual([]);
    expect(mockRouted).toEqual([]);
    expect(requestRow(store).toolLifecycle[CALL_ID].status).toBe("started");
  });

  it("keeps a cold-resumed desktop call durable when no desktop is online", async () => {
    mockPresence.mockResolvedValue(null);
    const store = makeStore();
    route(store, { source: "cold-resume" });
    await waitFor(() => mockWatches.length > 0, "the watcher was never armed");

    expect(mockWatches).toHaveLength(1);
    expect(mockSubmitted).toEqual([]);
    expect(requestRow(store).toolLifecycle[CALL_ID].status).toBe("started");
  });

  it("answers a live desktop call as unsupported when no desktop is online, so the turn never wedges", async () => {
    mockPresence.mockResolvedValue(null);
    const store = makeStore();
    route(store, { source: "live" });
    await waitFor(
      () => mockSubmitted.length > 0,
      "no tool result was submitted for the orphaned live call",
    );

    // W49 class (2026-09-12): the answer must NAME the absent owner and the
    // remedy. "Client has no handler" told the model nothing it could act on.
    expect(mockSubmitted).toHaveLength(1);
    const [submitted] = mockSubmitted;
    expect(submitted).toEqual(
      expect.objectContaining({
        conversationId: CONVERSATION_ID,
        call_id: CALL_ID,
        tool_name: "local_file_ops",
        is_error: true,
      }),
    );
    const answer = (submitted as { output: { message: string } }).output.message;
    expect(answer).toContain("Matrx Local");
    expect(answer).toContain("no desktop is connected");
    expect(answer).toContain("Nothing ran");
    expect((submitted as { error_message: string }).error_message).toBe(answer);
    expect(requestRow(store).toolLifecycle[CALL_ID]).toEqual(
      expect.objectContaining({
        status: "error",
        errorType: "unsupported_client_tool",
        errorMessage: answer,
      }),
    );
    expect(mockWatches).toEqual([]);
  });

  it("retains the call and tells the user when the presence query fails", async () => {
    mockPresence.mockRejectedValue(new Error("presence query unavailable"));
    const store = makeStore();
    route(store, { source: "live" });
    await waitFor(() => mockWatches.length > 0, "the watcher was never armed");

    expect(mockToastError).toHaveBeenCalledWith(
      "Desktop connection status is unavailable",
      expect.objectContaining({
        description: expect.stringContaining("still waiting safely"),
      }),
    );
    expect(mockSubmitted).toEqual([]);
    expect(requestRow(store).toolLifecycle[CALL_ID].status).toBe("started");
  });

  it("routes apply_surface_write to the surface write executor and nowhere else", () => {
    const store = makeStore();
    route(store, {
      toolName: "apply_surface_write",
      data: {
        arguments: { target: "page_meta_tags", value: { meta_title: "T" } },
      },
    });

    expect(mockRouted).toEqual([
      {
        executor: "surfaceWrite",
        args: {
          conversationId: CONVERSATION_ID,
          requestId: REQUEST_ID,
          callId: CALL_ID,
          toolName: "apply_surface_write",
          args: { target: "page_meta_tags", value: { meta_title: "T" } },
        },
      },
    ]);
    expect(mockSubmitted).toEqual([]);
  });

  it("queues an SMS exact-action approval card instead of routing the call", async () => {
    const store = makeStore();
    route(store, {
      toolName: "task_update",
      data: {
        arguments: { task_id: "task-1", status: "done" },
        execution_authorization: {
          kind: "sms_consequential_action",
          version: 1,
          action_digest: "a".repeat(64),
          side_effect_class: "db_write",
          tool_name: "task_update",
          requested_at: "2026-08-18T00:00:00Z",
          expires_at: "2026-08-18T00:15:00Z",
        },
      },
    });
    await new Promise<void>((resolve) => setTimeout(resolve, 0));

    expect(
      store.getState().pendingAsks.byConversationId[CONVERSATION_ID],
    ).toEqual([
      expect.objectContaining({
        callId: CALL_ID,
        kind: "sms_action_authorization",
        toolName: "task_update",
        status: "pending",
        smsActionArguments: { task_id: "task-1", status: "done" },
        expiresAtMs: 1787012100000,
      }),
    ]);
    expect(mockRouted).toEqual([]);
    expect(mockWatches).toEqual([]);
    expect(mockSubmitted).toEqual([]);
  });

  it("offers an unknown non-desktop tool to Matrx Extend with its arguments", () => {
    const store = makeStore();
    route(store, { toolName: "unknown_client_tool" });

    expect(mockRouted).toEqual([
      {
        executor: "matrxExtend",
        args: {
          conversationId: CONVERSATION_ID,
          requestId: REQUEST_ID,
          callId: CALL_ID,
          toolName: "unknown_client_tool",
          args: { operation: "read" },
        },
      },
    ]);
    expect(mockWatches).toEqual([]);
  });

  it.each([
    ["an array", ["read"]],
    ["a string", "read"],
    ["null", null],
  ])(
    "hands Matrx Extend an empty argument object when the arguments are %s",
    (_label, malformed) => {
      const store = makeStore();
      route(store, {
        toolName: "unknown_client_tool",
        data: { arguments: malformed },
      });

      expect(mockRouted).toEqual([
        expect.objectContaining({
          executor: "matrxExtend",
          args: expect.objectContaining({ args: {} }),
        }),
      ]);
    },
  );
});
