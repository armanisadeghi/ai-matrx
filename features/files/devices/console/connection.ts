/**
 * What the device console's status pill says, from the client's connection state and the relay's
 * last word on the device. Pure, so the honest-state rules are tested, not eyeballed.
 *
 *   Live           — the client is open: requests and terminals flow.
 *   Reconnecting…  — the socket is down or coming up and the device is (or was last) online.
 *   Offline        — the relay says the device itself is gone; we keep retrying quietly.
 *   Signed out     — the relay refused us for good (revoked, not the owner, unknown device).
 */
import type { RelayDeviceStatusEvent } from "@ai-matrx/desktop-protocol";
import type { DesktopClientState } from "@ai-matrx/desktop-protocol/client";

export type ConsolePill = "live" | "reconnecting" | "offline" | "refused";

export interface ConsoleStatus {
  pill: ConsolePill;
  label: string;
  /** When the device went offline (ms), for "last seen"; null when unknown or online. */
  offlineSinceMs: number | null;
  /** For a refusal: the one line that says why. */
  detail: string | null;
}

export function consoleStatus(state: Pick<DesktopClientState, "status" | "lastError">, device: RelayDeviceStatusEvent | null): ConsoleStatus {
  if (state.status === "open") return { pill: "live", label: "Live", offlineSinceMs: null, detail: null };
  if (state.status === "closed" && state.lastError && state.lastError.code !== "CANCELLED") {
    const [label, detail] = refused(state.lastError.code);
    return { pill: "refused", label, offlineSinceMs: null, detail };
  }
  // The relay's own word wins: it watches the Mac's socket. A hello refused with DEVICE_OFFLINE
  // before any status event arrived means the same thing.
  const deviceOffline = device ? !device.online : state.lastError?.code === "DEVICE_OFFLINE";
  if (deviceOffline) return { pill: "offline", label: "Offline", offlineSinceMs: device && !device.online ? device.since_ms : null, detail: null };
  if (state.lastError === null) return { pill: "reconnecting", label: "Connecting…", offlineSinceMs: null, detail: null };
  return { pill: "reconnecting", label: "Reconnecting…", offlineSinceMs: null, detail: null };
}

function refused(code: string): [string, string] {
  switch (code) {
    case "AUTH_DEVICE_REVOKED":
      return ["Removed", "This computer was removed from your devices"];
    case "NOT_FOUND":
      return ["Not found", "This computer is not registered"];
    case "PROTOCOL_VERSION_UNSUPPORTED":
      return ["Update needed", "This computer needs a newer Matrx 2"];
    case "CONFLICT":
      return ["Replaced", "This console was opened somewhere else"];
    default:
      return ["No access", "This computer belongs to another account"];
  }
}
