
const sendChromeRpc = jest.fn();
const findOwnBrowserExtension = jest.fn();
jest.mock("@/lib/extension-bridge/chrome-rpc", () => ({
  sendChromeRpc: (...a: unknown[]) => sendChromeRpc(...a),
  getRememberedExtensionId: () => null,
  forgetRememberedExtensionId: jest.fn(),
}));
jest.mock("@/lib/extension-bridge/handToOwnBrowser", () => ({
  findOwnBrowserExtension: () => findOwnBrowserExtension(),
}));

import { CAPTURE_GUIDE_ACTION, guideCapture } from "../guideCapture";

const req = { organizationId: "11111111-1111-4111-8111-111111111111", handoffId: "h1" };

describe("guideCapture", () => {
  beforeEach(() => {
    sendChromeRpc.mockReset();
    findOwnBrowserExtension.mockReset();
  });

  it("is not an error to have no extension", async () => {
    findOwnBrowserExtension.mockResolvedValue(null);
    const out = await guideCapture(req);
    expect(out.kind).toBe("no_extension");
    expect(sendChromeRpc).not.toHaveBeenCalled();
  });

  it("sends the organization and the job to the extension", async () => {
    findOwnBrowserExtension.mockResolvedValue("ext");
    sendChromeRpc.mockResolvedValue({ ok: true, result: { organizationName: "Acme" } });
    const out = await guideCapture(req);
    expect(out.kind).toBe("opened");
    expect(sendChromeRpc).toHaveBeenCalledWith("ext", CAPTURE_GUIDE_ACTION, {
      organizationId: req.organizationId,
      handoffId: "h1",
    });
  });

  it("passes the extension's own refusal sentence through", async () => {
    findOwnBrowserExtension.mockResolvedValue("ext");
    sendChromeRpc.mockResolvedValue({ ok: false, error: "Sign in to the extension first." });
    expect(await guideCapture(req)).toEqual({
      kind: "refused",
      sentence: "Sign in to the extension first.",
    });
  });

  it("refuses a request with no workspace instead of misfiling it", async () => {
    const out = await guideCapture({ organizationId: "", handoffId: "h1" });
    expect(out.kind).toBe("refused");
    expect(findOwnBrowserExtension).not.toHaveBeenCalled();
  });
});
