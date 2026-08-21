const mockDetectExtensionId = jest.fn();
const mockSendChromeRpc = jest.fn();

jest.mock("@/lib/extension-bridge/chrome-rpc", () => ({
  MATRX_EXTEND_EXTENSION_IDS: ["dev-extension", "store-extension"],
  detectExtensionId: mockDetectExtensionId,
  sendChromeRpc: mockSendChromeRpc,
}));

import {
  invokeMatrxExtendTool,
  resetMatrxExtendClientCache,
} from "@/lib/extension-bridge/matrx-extend-client";

describe("invokeMatrxExtendTool", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    resetMatrxExtendClientCache();
  });

  it("fails closed when no installed extension responds", async () => {
    mockDetectExtensionId.mockResolvedValue(null);

    await expect(
      invokeMatrxExtendTool("tabs", { action: "active" }),
    ).resolves.toEqual({
      handled: false,
      reason: "matrx_extend_unavailable",
    });
    expect(mockSendChromeRpc).not.toHaveBeenCalled();
  });

  it("discovers live tool ownership and executes through callTool", async () => {
    mockDetectExtensionId.mockResolvedValue({ id: "dev-extension" });
    mockSendChromeRpc
      .mockResolvedValueOnce({
        ok: true,
        result: {
          version: "0.2.2",
          tools: [{ name: "tabs", tier: "action", admin_only: false }],
        },
      })
      .mockResolvedValueOnce({
        ok: true,
        result: { ok: true, title: "Chat — AI Matrx" },
      });

    await expect(
      invokeMatrxExtendTool("tabs", { action: "active" }),
    ).resolves.toEqual({
      handled: true,
      ok: true,
      output: { ok: true, title: "Chat — AI Matrx" },
    });
    expect(mockSendChromeRpc).toHaveBeenNthCalledWith(
      2,
      "dev-extension",
      "callTool",
      { toolName: "tabs", args: { action: "active" } },
      { timeoutMs: 310000 },
    );
  });

  it("does not claim a tool absent from the extension catalog", async () => {
    mockDetectExtensionId.mockResolvedValue({ id: "dev-extension" });
    mockSendChromeRpc.mockResolvedValue({
      ok: true,
      result: {
        version: "0.2.2",
        tools: [{ name: "tabs", tier: "action" }],
      },
    });

    await expect(invokeMatrxExtendTool("unknown_tool", {})).resolves.toEqual({
      handled: false,
      reason: "tool_not_owned_by_matrx_extend",
    });
    expect(mockSendChromeRpc).toHaveBeenCalledTimes(1);
  });
});
