/**
 * The Matrx 2 relay: where a browser reaches a device. A per-environment VALUE (law: env vars are
 * values) with the production default, so a missing variable can never point a live page at a
 * test relay. A process wired to the nightly copy sets it to the TEST relay, which trusts only
 * that copy.
 */
import { BEARER_PREFIX, PROTOCOL_VERSION, RelayStatusResponse, SUBPROTOCOL, versionSubprotocol } from "@ai-matrx/desktop-protocol";
import type { RelayDeviceStatusEvent } from "@ai-matrx/desktop-protocol";

export const MATRX_RELAY_URL: string = process.env.NEXT_PUBLIC_MATRX_RELAY_URL || "https://relay.matrxserver.com";

/** wss://…/v1/devices/{id}/connect — the token rides the subprotocol, never this URL. */
export function relayConnectUrl(deviceId: string, base: string = MATRX_RELAY_URL): string {
  return `${base.replace(/^http/, "ws").replace(/\/$/, "")}/v1/devices/${encodeURIComponent(deviceId)}/connect`;
}

/**
 * The relay's subprotocol, this client's protocol minor (so the relay answers in what we read —
 * e.g. `since_ms: null` for a computer that never connected) and the token. Never the URL.
 */
export function relaySubprotocols(token: string): string[] {
  return [SUBPROTOCOL, versionSubprotocol(PROTOCOL_VERSION), `${BEARER_PREFIX}${token}`];
}

/**
 * GET /v1/devices/{id}/status with the owner's token. null when the relay cannot say (unreachable,
 * not the owner, unknown device) — the caller shows "—", never a guessed state.
 */
export async function fetchRelayStatus(deviceId: string, token: string, signal?: AbortSignal): Promise<RelayDeviceStatusEvent | null> {
  try {
    const res = await fetch(`${MATRX_RELAY_URL.replace(/\/$/, "")}/v1/devices/${encodeURIComponent(deviceId)}/status`, {
      headers: { authorization: `Bearer ${token}` },
      signal,
    });
    if (!res.ok) return null;
    const parsed = RelayStatusResponse.safeParse(await res.json());
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}
