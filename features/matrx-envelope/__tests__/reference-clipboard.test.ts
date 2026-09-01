import {
  _registerManualCopyHost,
  _unregisterManualCopyHost,
} from "@/components/dialogs/clipboard-fallback/manualCopyOpener";
import { copyReferenceFence } from "@/features/matrx-envelope/referenceClipboard";

describe("copyReferenceFence", () => {
  const originalClipboard = navigator.clipboard;

  afterEach(() => {
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: originalClipboard,
    });
    jest.restoreAllMocks();
  });

  it("opens the manual-copy path with the exact fence when clipboard access is blocked", async () => {
    const show = jest.fn();
    const host = { show };
    _registerManualCopyHost(host);
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: { writeText: jest.fn().mockRejectedValue(new Error("blocked")) },
    });
    jest.spyOn(console, "error").mockImplementation(() => undefined);

    const fence = '```matrx\n{"__kind":"directive_v1_reference_agent"}\n```';
    await expect(copyReferenceFence(fence)).resolves.toBe(false);
    expect(show).toHaveBeenCalledWith({ text: fence });

    _unregisterManualCopyHost(host);
  });
});
