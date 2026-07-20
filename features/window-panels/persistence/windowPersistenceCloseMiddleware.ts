import type { Middleware } from "@reduxjs/toolkit";
import {
  markWindowClosing,
  type WindowManagerState,
} from "@/lib/redux/slices/windowManagerSlice";
import { isOverlayId, type OverlayId } from "../registry/overlay-ids";

interface CloseIdentity {
  overlayId: OverlayId;
  instanceId: string;
}

interface PersistenceRootState {
  overlays: {
    overlays: Partial<
      Record<OverlayId, Record<string, { isOpen?: boolean }>>
    >;
  };
  windowManager: WindowManagerState;
}

let flushLocalWorkspace: (() => void) | null = null;
let observeClosedWindows: ((identities: CloseIdentity[]) => void) | null = null;

export function registerWindowPersistenceFlusher(
  flush: () => void,
  observeClosed?: (identities: CloseIdentity[]) => void,
): () => void {
  flushLocalWorkspace = flush;
  observeClosedWindows = observeClosed ?? null;
  return () => {
    if (flushLocalWorkspace === flush) flushLocalWorkspace = null;
    if (observeClosedWindows === observeClosed) observeClosedWindows = null;
  };
}

function dedupe(identities: CloseIdentity[]): CloseIdentity[] {
  return [
    ...new Map(
      identities.map((identity) => [
        `${identity.overlayId}:${identity.instanceId}`,
        identity,
      ]),
    ).values(),
  ];
}

function preservedIdentities(
  state: PersistenceRootState,
  overlayId?: OverlayId,
): CloseIdentity[] {
  const identities: CloseIdentity[] = [];
  Object.values(state.windowManager.windows).forEach((entry) => {
    if (!entry.persistence || entry.persistence.closing) return;
    if (overlayId && entry.persistence.overlayId !== overlayId) return;
    identities.push({
      overlayId: entry.persistence.overlayId,
      instanceId: entry.persistence.instanceId,
    });
  });
  Object.values(state.windowManager.pendingRestores).forEach((session) => {
    if (overlayId && session.overlayId !== overlayId) return;
    identities.push({
      overlayId: session.overlayId,
      instanceId: session.instanceId,
    });
  });
  return identities;
}

/**
 * Every public overlay close path synchronously tombstones exact preservation
 * identities, then writes the post-close localStorage workspace.
 */
export const windowPersistenceCloseMiddleware: Middleware =
  (api) => (next) => (action) => {
    if (typeof action !== "object" || action === null || !("type" in action)) {
      return next(action);
    }
    const type = action.type;
    const payload = "payload" in action ? action.payload : null;
    const before = api.getState() as PersistenceRootState;
    let closing: CloseIdentity[] = [];

    if (type === "overlays/closeAllOverlays") {
      closing = preservedIdentities(before);
    } else if (
      type === "overlays/closeOverlay" ||
      type === "overlays/toggleOverlay" ||
      type === "overlays/closeAllInstancesOfOverlay"
    ) {
      const rawOverlayId =
        payload && typeof payload === "object" && "overlayId" in payload
          ? payload.overlayId
          : null;
      if (typeof rawOverlayId === "string" && isOverlayId(rawOverlayId)) {
        if (type === "overlays/closeAllInstancesOfOverlay") {
          closing = preservedIdentities(before, rawOverlayId);
        } else {
          const instanceId =
            payload &&
            typeof payload === "object" &&
            "instanceId" in payload &&
            typeof payload.instanceId === "string"
              ? payload.instanceId
              : "default";
          const wasOpen =
            before.overlays.overlays[rawOverlayId]?.[instanceId]?.isOpen ===
            true;
          if (type === "overlays/closeOverlay" || wasOpen) {
            closing = [{ overlayId: rawOverlayId, instanceId }];
          }
        }
      }
    }

    const result = next(action);
    const exact = dedupe(closing);
    if (exact.length > 0) {
      exact.forEach((identity) => api.dispatch(markWindowClosing(identity)));
      observeClosedWindows?.(exact);
      flushLocalWorkspace?.();
    } else if (
      type === "overlays/closeAllOverlays" ||
      type === "overlays/closeAllInstancesOfOverlay"
    ) {
      // The reducer may have removed a pending-only session that was not
      // observable in overlaySlice. Persist that reducer result regardless.
      flushLocalWorkspace?.();
    }
    return result;
  };
