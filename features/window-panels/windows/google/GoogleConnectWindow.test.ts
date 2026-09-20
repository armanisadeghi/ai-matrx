import { isGoogleAuthorizationActionDisabled } from "@/features/google-workspace/authorizationReadiness";
import { closeGoogleWorkspaceConnect } from "@/features/google-workspace/GoogleWorkspaceConnectBody";
import {
  createGoogleConnectCallbackGroup,
  emitGoogleConnectEvent,
} from "@/features/overlays/callbacks/googleConnectWindow";

describe("GoogleConnectWindow authorization readiness", () => {
  it("blocks every authorization action until Google Identity Services loads", () => {
    expect(isGoogleAuthorizationActionDisabled(false, null)).toBe(true);
  });

  it("blocks duplicate authorization while another action is running", () => {
    expect(isGoogleAuthorizationActionDisabled(true, "connect")).toBe(true);
  });

  it("enables authorization only when GIS is ready and the panel is idle", () => {
    expect(isGoogleAuthorizationActionDisabled(true, null)).toBe(false);
  });

  it("preserves the callback-group close event before closing the panel", async () => {
    const calls: string[] = [];
    const onWindowClose = jest.fn(() => calls.push("event"));
    const onClose = jest.fn(() => calls.push("close"));
    const callbacks = createGoogleConnectCallbackGroup({ onWindowClose });

    await closeGoogleWorkspaceConnect(callbacks.callbackGroupId, onClose);

    expect(onWindowClose).toHaveBeenCalledWith({ type: "window-close" });
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(calls).toEqual(["event", "close"]);
  });

  it("retains an acknowledged import callback until the explicit terminal close", async () => {
    const onDriveImported = jest.fn();
    const onWindowClose = jest.fn();
    const onClose = jest.fn();
    const callbacks = createGoogleConnectCallbackGroup({
      onDriveImported,
      onWindowClose,
    });

    await expect(
      emitGoogleConnectEvent(callbacks.callbackGroupId, {
        type: "drive-imported",
        files: [],
        failures: [],
      }),
    ).resolves.toBeUndefined();
    await expect(
      closeGoogleWorkspaceConnect(callbacks.callbackGroupId, onClose),
    ).resolves.toBeUndefined();

    expect(onDriveImported).toHaveBeenCalledTimes(1);
    expect(onWindowClose).toHaveBeenCalledTimes(1);
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
