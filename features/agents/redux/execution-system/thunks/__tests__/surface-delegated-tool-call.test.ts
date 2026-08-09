const mockGetLiveDesktopInstance = jest.fn();
const mockWatchDesktopDelegation = jest.fn((args) => ({
  type: "test/watchDesktopDelegation",
  payload: args,
}));
const mockSubmitToolResult = jest.fn((args) => ({
  type: "test/submitToolResult",
  payload: args,
}));
const mockToastError = jest.fn();

jest.mock(
  "@/features/agents/redux/execution-system/client-capabilities/desktop-presence",
  () => ({ getLiveDesktopInstance: mockGetLiveDesktopInstance }),
);
jest.mock("../watch-desktop-delegation.thunk", () => ({
  watchDesktopDelegation: mockWatchDesktopDelegation,
}));
jest.mock("@/features/agents/api/submit-tool-results", () => ({
  submitToolResult: mockSubmitToolResult,
}));
jest.mock("sonner", () => ({ toast: { error: mockToastError } }));

jest.mock("@/features/agents/types/widget-handle.types", () => ({
  isWidgetActionName: () => false,
}));
jest.mock("@/features/agents/ui-first-tools/tools/names", () => ({
  isUiFirstToolName: () => false,
}));
jest.mock("@/features/agents/war-room-tools/tools/names", () => ({
  isWarRoomToolName: () => false,
}));
jest.mock("@/features/agents/war-room-master-tools/tools/names", () => ({
  isWarRoomMasterToolName: () => false,
}));
jest.mock("@/features/agents/scribe-tools/tools/names", () => ({
  isScribeToolName: () => false,
}));
jest.mock("../dispatch-widget-action.thunk", () => ({
  dispatchWidgetAction: jest.fn(),
}));
jest.mock(
  "@/features/agents/ui-first-tools/dispatcher/dispatch-ui-first-tool.thunk",
  () => ({ dispatchUiFirstTool: jest.fn() }),
);
jest.mock(
  "@/features/agents/war-room-tools/dispatcher/dispatch-war-room-tool.thunk",
  () => ({ dispatchWarRoomTool: jest.fn() }),
);
jest.mock(
  "@/features/agents/war-room-master-tools/dispatcher/dispatch-war-room-master-tool.thunk",
  () => ({ dispatchWarRoomMasterTool: jest.fn() }),
);
jest.mock(
  "@/features/agents/scribe-tools/dispatcher/dispatch-scribe-tool.thunk",
  () => ({ dispatchScribeTool: jest.fn() }),
);
const mockDispatchSurfaceWrite = jest.fn((args) => ({
  type: "test/dispatchSurfaceWrite",
  payload: args,
}));
jest.mock("@/features/surfaces/runtime/surface-writeback", () => ({
  SURFACE_WRITE_TOOL_NAME: "apply_surface_write",
}));
jest.mock("../dispatch-surface-write.thunk", () => ({
  dispatchSurfaceWrite: mockDispatchSurfaceWrite,
}));

import { surfaceDelegatedToolCall } from "../surface-delegated-tool-call.thunk";

const BASE_ARGS = {
  conversationId: "conversation-1",
  requestId: "request-1",
  userRequestId: "11111111-1111-4111-8111-111111111111",
  callId: "call-1",
  toolName: "local_file_ops",
  data: { arguments: { operation: "read" } },
  source: "cold-resume" as const,
};

async function flushPromises(): Promise<void> {
  await Promise.resolve();
  await Promise.resolve();
}

function surfaceColdCall() {
  const dispatch = jest.fn((action) => action);
  surfaceDelegatedToolCall(BASE_ARGS)(
    dispatch as never,
    jest.fn() as never,
    undefined,
  );
  return dispatch;
}

function expectPausedWaitingState(dispatch: jest.Mock): void {
  expect(dispatch).toHaveBeenCalledWith(
    expect.objectContaining({
      type: expect.stringContaining("setInstanceStatus"),
      payload: { conversationId: "conversation-1", status: "paused" },
    }),
  );
  expect(dispatch).not.toHaveBeenCalledWith(
    expect.objectContaining({
      payload: expect.objectContaining({
        errorType: "unsupported_client_tool",
      }),
    }),
  );
}

describe("surfaceDelegatedToolCall cold desktop reconciliation", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("keeps an online desktop call pending and starts reconciliation", async () => {
    mockGetLiveDesktopInstance.mockResolvedValue({
      instanceId: "desktop-1",
      instanceName: "Test Mac",
    });

    const dispatch = surfaceColdCall();
    await flushPromises();

    expectPausedWaitingState(dispatch);
    expect(mockWatchDesktopDelegation).toHaveBeenCalledWith({
      conversationId: "conversation-1",
      lifecycleRequestId: "request-1",
      userRequestId: "11111111-1111-4111-8111-111111111111",
      callId: "call-1",
    });
    expect(mockSubmitToolResult).not.toHaveBeenCalled();
  });

  it("keeps a cold call durable when no desktop is currently online", async () => {
    mockGetLiveDesktopInstance.mockResolvedValue(null);

    const dispatch = surfaceColdCall();
    await flushPromises();

    expectPausedWaitingState(dispatch);
    expect(mockWatchDesktopDelegation).toHaveBeenCalledTimes(1);
    expect(mockSubmitToolResult).not.toHaveBeenCalled();
  });

  it("keeps a cold call durable when the presence query fails", async () => {
    mockGetLiveDesktopInstance.mockRejectedValue(
      new Error("presence query unavailable"),
    );

    const dispatch = surfaceColdCall();
    await flushPromises();

    expectPausedWaitingState(dispatch);
    expect(mockWatchDesktopDelegation).toHaveBeenCalledTimes(1);
    expect(mockSubmitToolResult).not.toHaveBeenCalled();
    expect(mockToastError).toHaveBeenCalledWith(
      "Desktop connection status is unavailable",
      expect.any(Object),
    );
  });

  it("routes apply_surface_write to the surface write dispatcher", async () => {
    const dispatch = jest.fn((action) => action);
    surfaceDelegatedToolCall({
      ...BASE_ARGS,
      toolName: "apply_surface_write",
      data: { arguments: { target: "page_meta_tags", value: { meta_title: "T" } } },
    })(dispatch as never, jest.fn() as never, undefined);
    await flushPromises();

    expect(mockDispatchSurfaceWrite).toHaveBeenCalledWith({
      conversationId: "conversation-1",
      requestId: "request-1",
      callId: "call-1",
      toolName: "apply_surface_write",
      args: { target: "page_meta_tags", value: { meta_title: "T" } },
    });
    // Routed — never answered as unsupported, never resolved here.
    expect(mockSubmitToolResult).not.toHaveBeenCalled();
  });

  it("still rejects an unknown non-desktop delegated tool", async () => {
    const dispatch = jest.fn((action) => action);
    surfaceDelegatedToolCall({
      ...BASE_ARGS,
      toolName: "unknown_client_tool",
    })(dispatch as never, jest.fn() as never, undefined);
    await flushPromises();

    expect(mockWatchDesktopDelegation).not.toHaveBeenCalled();
    expect(mockSubmitToolResult).toHaveBeenCalledWith(
      expect.objectContaining({
        call_id: "call-1",
        tool_name: "unknown_client_tool",
        is_error: true,
        output: expect.objectContaining({ reason: "unsupported_client_tool" }),
      }),
    );
  });
});
