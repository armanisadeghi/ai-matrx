const mockInvokeMatrxExtendTool = jest.fn();
const mockSubmitToolResult = jest.fn((args) => ({
  type: "test/submitToolResult",
  payload: args,
}));

jest.mock("@/lib/extension-bridge/matrx-extend-client", () => ({
  invokeMatrxExtendTool: mockInvokeMatrxExtendTool,
}));
jest.mock("@/features/agents/api/submit-tool-results", () => ({
  submitToolResult: mockSubmitToolResult,
}));

import { dispatchMatrxExtendTool } from "../dispatch-matrx-extend-tool.thunk";

const PAYLOAD = {
  conversationId: "conversation-1",
  requestId: "request-1",
  callId: "call-1",
  toolName: "tabs",
  args: { action: "active" },
};

async function runDispatch() {
  const dispatch = jest.fn((action) => action);
  await dispatchMatrxExtendTool(PAYLOAD)(
    dispatch as never,
    () => ({}) as never,
    undefined,
  );
  return dispatch;
}

describe("dispatchMatrxExtendTool", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("submits a successful extension result and closes the lifecycle", async () => {
    mockInvokeMatrxExtendTool.mockResolvedValue({
      handled: true,
      ok: true,
      output: { ok: true, title: "Chat — AI Matrx" },
    });

    const dispatch = await runDispatch();

    expect(mockInvokeMatrxExtendTool).toHaveBeenCalledWith("tabs", {
      action: "active",
    });
    expect(dispatch).toHaveBeenCalledWith(
      expect.objectContaining({
        payload: expect.objectContaining({
          requestId: "request-1",
          callId: "call-1",
          status: "completed",
          result: { ok: true, title: "Chat — AI Matrx" },
        }),
      }),
    );
    expect(mockSubmitToolResult).toHaveBeenCalledWith(
      expect.objectContaining({
        conversationId: "conversation-1",
        call_id: "call-1",
        tool_name: "tabs",
        is_error: false,
        output: { ok: true, title: "Chat — AI Matrx" },
      }),
    );
  });

  it("preserves a known extension execution error", async () => {
    mockInvokeMatrxExtendTool.mockResolvedValue({
      handled: true,
      ok: false,
      error: "User denied this action",
    });

    const dispatch = await runDispatch();

    expect(dispatch).toHaveBeenCalledWith(
      expect.objectContaining({
        payload: expect.objectContaining({
          status: "error",
          errorType: "matrx_extend_tool_error",
          errorMessage: "User denied this action",
        }),
      }),
    );
    expect(mockSubmitToolResult).toHaveBeenCalledWith(
      expect.objectContaining({
        is_error: true,
        error_message: "User denied this action",
      }),
    );
  });

  it("keeps the canonical unsupported error for an unowned tool", async () => {
    mockInvokeMatrxExtendTool.mockResolvedValue({
      handled: false,
      reason: "tool_not_owned_by_matrx_extend",
    });

    const dispatch = await runDispatch();

    expect(dispatch).toHaveBeenCalledWith(
      expect.objectContaining({
        payload: expect.objectContaining({
          status: "error",
          errorType: "unsupported_client_tool",
        }),
      }),
    );
    expect(mockSubmitToolResult).toHaveBeenCalledWith(
      expect.objectContaining({
        is_error: true,
        output: expect.objectContaining({
          reason: "unsupported_client_tool",
        }),
      }),
    );
  });

  // W49 class (2026-09-12): a delegated tool whose OWNER is absent must answer
  // with something the model can act on. Both no-handler outcomes used to send
  // the identical generic sentence, with the real reason kept in Redux where
  // only a developer could see it.
  it("tells the model the extension is MISSING, with the remedy", async () => {
    mockInvokeMatrxExtendTool.mockResolvedValue({
      handled: false,
      reason: "matrx_extend_unavailable",
    });

    await runDispatch();

    const answer = mockSubmitToolResult.mock.calls[0][0].output.message;
    expect(answer).toContain("Matrx Extend");
    expect(answer).toContain("no Matrx Extend is installed or reachable");
    expect(answer).toContain("Nothing ran");
    expect(answer).toMatch(/install or enable Matrx Extend/);
  });

  it("tells the model the extension is THERE but does not own the name", async () => {
    mockInvokeMatrxExtendTool.mockResolvedValue({
      handled: false,
      reason: "tool_not_owned_by_matrx_extend",
    });

    await runDispatch();

    const answer = mockSubmitToolResult.mock.calls[0][0].output.message;
    expect(answer).toContain("Matrx Extend is installed here");
    expect(answer).toContain("does not own a tool named");
    expect(answer).toContain("Do not retry the same name");
  });

  it("never sends the same sentence for both absences", async () => {
    mockInvokeMatrxExtendTool.mockResolvedValue({
      handled: false,
      reason: "matrx_extend_unavailable",
    });
    await runDispatch();
    const missing = mockSubmitToolResult.mock.calls[0][0].output.message;

    jest.clearAllMocks();
    mockInvokeMatrxExtendTool.mockResolvedValue({
      handled: false,
      reason: "tool_not_owned_by_matrx_extend",
    });
    await runDispatch();
    const unowned = mockSubmitToolResult.mock.calls[0][0].output.message;

    expect(missing).not.toBe(unowned);
  });
});
