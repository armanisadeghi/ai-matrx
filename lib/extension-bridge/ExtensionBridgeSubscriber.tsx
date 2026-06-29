/**
 * ExtensionBridgeSubscriber — top-level subscriber that wires the
 * matrx-extend Chrome extension's bridge into this app's window-panels
 * system.
 *
 * Mounted once near the root of the authenticated provider tree (see
 * `app/Providers.tsx`). When the extension publishes an
 * `extension->frontend` envelope with `action: "openPanel"`, this
 * component:
 *
 *   1. Forwards the payload to `handleExtensionOpenPanel(...)`, which
 *      validates and dispatches `openOverlay`.
 *   2. Publishes a `frontend->extension` reply on the same Broadcast
 *      channel, preserving the inbound `requestId` so the extension
 *      SW's pending-promise table resolves cleanly.
 *
 * Why this lives in its own component (not in `useExtensionBridgeChannel`):
 * the hook is generic — every consumer registers its own `onMessage`
 * handler. The window-panels translation belongs at the consumer layer
 * so the hook stays free of feature-specific knowledge.
 *
 * Renders nothing. Cheap to mount: short-circuits when no user is signed
 * in (the underlying hook does too) and listens passively until torn
 * down. Bundles only this file + `openPanelHandler` + the Redux action
 * — no window-panels component code is pulled into the static graph.
 */

"use client";

import { useEffect } from "react";
import { useSelector } from "react-redux";
import { useAppDispatch } from "@/lib/redux/hooks";
import { useExtensionBridgeChannel } from "@/hooks/useExtensionBridgeChannel";
import { selectUserId } from "@/lib/redux/selectors/userSelectors";
import { getMessagingService } from "@/lib/supabase/messaging";
import {
  handleExtensionOpenPanel,
  type OpenPanelResult,
} from "./openPanelHandler";

export function ExtensionBridgeSubscriber(): null {
  const dispatch = useAppDispatch();
  const userId = useSelector(selectUserId);
  const { onMessage, isAuthenticated } = useExtensionBridgeChannel();

  useEffect(() => {
    // Hook short-circuits when no user is signed in; nothing to wire up.
    if (!isAuthenticated || !userId) return undefined;

    const messagingService = getMessagingService();

    const unsubscribe = onMessage((envelope) => {
      // Hook already filters to `direction: "extension->frontend"`, so
      // every envelope here is genuinely inbound.
      if (envelope.action !== "openPanel") return;

      // Translate + dispatch. The handler is synchronous — Redux work
      // happens immediately, the result is what we publish back.
      const result: OpenPanelResult = handleExtensionOpenPanel(
        dispatch,
        envelope.payload,
      );

      // Publish the reply on the same Broadcast channel. We use the
      // service directly (not the hook's `send`) because the hook
      // generates a fresh requestId — for a reply we MUST echo the
      // inbound requestId so the extension's pending-promise table
      // resolves the right caller.
      void messagingService
        .sendBridgeMessage(userId, {
          action: envelope.action,
          payload: result,
          requestId: envelope.requestId,
        })
        .catch((err) => {
          // Channel teardown / not-yet-subscribed errors. Swallow with
          // a console message so we don't tear down the whole
          // subscriber for a transient publish failure — the extension
          // will retry or fall back to its `chrome.runtime.sendMessage`
          // path.
          console.error(
            "[ExtensionBridgeSubscriber] Failed to publish openPanel reply:",
            err,
          );
        });
    });

    return unsubscribe;
  }, [dispatch, isAuthenticated, onMessage, userId]);

  return null;
}
