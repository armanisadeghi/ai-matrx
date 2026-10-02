import { DesktopProtocolError } from "@ai-matrx/desktop-protocol/client";
import { consoleStatus } from "./connection";

const err = (code: ConstructorParameters<typeof DesktopProtocolError>[0], retryable = true) => new DesktopProtocolError(code, "x", { retryable });
const online = { online: true, since_ms: 1, app_version: "0.1.0", protocol_version: "1.0" };
const offline = { online: false, since_ms: 1_000, app_version: null, protocol_version: null };

describe("device console status pill", () => {
  it("open is Live while the computer is online", () => {
    expect(consoleStatus({ status: "open", lastError: err("DEVICE_OFFLINE") }, online).pill).toBe("live");
    expect(consoleStatus({ status: "open", lastError: null }, null).pill).toBe("live");
  });

  it("the computer going away flips an OPEN page to Offline (our socket to the relay is still up)", () => {
    expect(consoleStatus({ status: "open", lastError: null }, offline)).toEqual({ pill: "offline", label: "Offline", offlineSinceMs: 1_000, detail: null });
  });

  it("a never-connected computer (since 0) is offline with no invented time", () => {
    expect(consoleStatus({ status: "open", lastError: null }, { ...offline, since_ms: 0 }).offlineSinceMs).toBeNull();
  });

  it("first dial is Connecting…, a drop is Reconnecting…", () => {
    expect(consoleStatus({ status: "connecting", lastError: null }, null).label).toBe("Connecting…");
    expect(consoleStatus({ status: "reconnecting", lastError: err("DEVICE_OFFLINE") }, online).label).toBe("Reconnecting…");
    expect(consoleStatus({ status: "reconnecting", lastError: err("TIMEOUT") }, null).label).toBe("Reconnecting…");
  });

  it("the relay saying the Mac is gone is Offline, with when", () => {
    expect(consoleStatus({ status: "reconnecting", lastError: err("DEVICE_OFFLINE") }, offline)).toEqual({ pill: "offline", label: "Offline", offlineSinceMs: 1_000, detail: null });
    expect(consoleStatus({ status: "reconnecting", lastError: err("DEVICE_OFFLINE") }, null)).toMatchObject({ pill: "offline", offlineSinceMs: null });
  });

  it("a terminal refusal is said plainly and never as Reconnecting", () => {
    expect(consoleStatus({ status: "closed", lastError: err("AUTH_DEVICE_REVOKED", false) }, null)).toMatchObject({ pill: "refused", label: "Removed", detail: "This computer was removed from your devices" });
    expect(consoleStatus({ status: "closed", lastError: err("AUTH_FORBIDDEN", false) }, null)).toMatchObject({ pill: "refused", label: "No access" });
  });
});
