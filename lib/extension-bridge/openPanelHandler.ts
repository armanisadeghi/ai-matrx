/**
 * openPanelHandler — extension-bridge → window-panels glue.
 *
 * The matrx-extend Chrome extension publishes
 * `{ action: "openPanel", payload: { panelId, instanceId?, data? } }`
 * envelopes when it wants this app to surface a specific overlay (modal,
 * floating window, etc.) without the user navigating manually.
 *
 * This module owns the translation:
 *   1. Validate the inbound payload with `OpenPanelPayloadSchema`.
 *   2. Confirm `panelId` is a registered overlayId (string-literal union
 *      kept in sync with the static registry by `pnpm check:registry`).
 *   3. Dispatch the existing `openOverlay({ overlayId, instanceId, data })`
 *      Redux action — exactly the same path every in-app caller takes.
 *
 * It does NOT touch the registry or the URL hydrator: the
 * `?panels=<typeKey>:<instanceId>` deep-link path remains unchanged for
 * cases where the extension prefers to navigate the active tab instead
 * of cross-machine signaling.
 *
 * Consumers:
 *   - `lib/extension-bridge/ExtensionBridgeSubscriber.tsx` — top-level
 *     subscriber that receives `extension->frontend` envelopes and
 *     forwards `openPanel` actions here.
 *
 * Wire format: see `lib/types/bridge-envelope.ts` (OpenPanelPayloadSchema)
 * and `/Users/armanisadeghi/code/common-docs/systems/clients/extension/CHANNELS.md`.
 */

import type { Dispatch, UnknownAction } from "@reduxjs/toolkit";
import {
  OpenPanelPayloadSchema,
  type OpenPanelPayload,
} from "@/lib/types/bridge-envelope";
import { openOverlay } from "@/lib/redux/slices/overlaySlice";
import {
  isOverlayId,
  type OverlayId,
} from "@/features/window-panels/registry/overlay-ids";

/**
 * Result returned to the extension over the bridge. Mirrors the
 * `FrontendRpcResponse` shape so the extension's `chrome.runtime.sendMessage`
 * callback and its Broadcast reply handler can use one branch.
 */
export type OpenPanelResult =
  | { ok: true; opened: true; panelId: OverlayId; instanceId: string | null }
  | { ok: false; error: string; details?: unknown };

/** Default instance id used by singleton overlays (matches overlaySlice). */
const DEFAULT_INSTANCE_ID = "default";

/**
 * Translate an inbound `openPanel` envelope into a Redux `openOverlay`
 * dispatch. Pure function (Redux dispatch passed in) so it's trivially
 * testable and has no React-tree coupling.
 *
 * Failure modes are returned as `{ ok: false, error }` rather than thrown —
 * the bridge subscriber needs to publish them back to the extension verbatim.
 */
export function handleExtensionOpenPanel(
  dispatch: Dispatch<UnknownAction>,
  rawPayload: unknown,
): OpenPanelResult {
  // 1. Wire-format validation. The extension may ship a malformed
  // envelope; better to surface a structured error than to throw.
  const parsed = OpenPanelPayloadSchema.safeParse(rawPayload);
  if (!parsed.success) {
    return {
      ok: false,
      error: "invalid_payload",
      details: parsed.error.issues,
    };
  }

  const payload: OpenPanelPayload = parsed.data;

  // 2. Registry membership check. We MUST narrow `panelId` to the typed
  // `OverlayId` union before calling `openOverlay` — the action creator
  // is typed against that union and would otherwise fail at the type
  // boundary. Dispatching an unknown overlayId would also write a dead
  // entry into Redux state that no controller renders.
  if (!isOverlayId(payload.panelId)) {
    return {
      ok: false,
      error: "unknown_panel",
      details: {
        panelId: payload.panelId,
        hint: "panelId must match a registered window-panels overlayId. See features/window-panels/registry/overlay-ids.ts.",
      },
    };
  }

  const overlayId: OverlayId = payload.panelId;
  const instanceId = payload.instanceId ?? DEFAULT_INSTANCE_ID;

  // 3. Dispatch — same path every in-app caller takes. The reducer
  // handles "open already-open instance" idempotently (just refreshes
  // data + lastUsedAt), so re-firing the same envelope is safe.
  dispatch(
    openOverlay({
      overlayId,
      instanceId,
      data: payload.data,
    }),
  );

  return {
    ok: true,
    opened: true,
    panelId: overlayId,
    // Echo back the resolved instanceId. `null` (rather than
    // `"default"`) when the caller did not supply one, so the extension
    // can tell whether it was using a singleton slot.
    instanceId: payload.instanceId ?? null,
  };
}
