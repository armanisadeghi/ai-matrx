"use client";

/**
 * ChatConnectorStrip — the connector strip, wired to real account state.
 *
 * `ConnectorStrip` is presentational on purpose: it raises a connect intent and
 * knows nothing about Google or OAuth. This container is the one place that
 * answers "what has this user actually connected?" and "what happens when they
 * click?", so every surface that mounts the strip gets the same answers.
 *
 * Clicking opens the floating connect window OVER the conversation. It never
 * navigates to settings — being sent away from your work to attach a file is
 * the dead end this whole path exists to remove.
 *
 * Adding the next provider is a case in `resolveStatus` plus its `onConnect`
 * branch; nothing else here changes.
 */

import { useCallback, useMemo } from "react";
import { useGoogleConnectionInventory } from "@/features/marketing/google/hooks";
import { GOOGLE_SCOPE } from "@/lib/googleScopes";
import { useOpenGoogleConnectWindow } from "@/features/overlays/openers/googleConnectWindow";
import { ConnectorStrip } from "./ConnectorStrip";
import type { ConnectorId } from "./types";

export interface ChatConnectorStripProps {
  className?: string;
}

export function ChatConnectorStrip({ className }: ChatConnectorStripProps) {
  const inventory = useGoogleConnectionInventory();
  const openGoogleConnect = useOpenGoogleConnectWindow();

  const connectedIds = useMemo<ConnectorId[]>(() => {
    const rows = inventory.data?.connections ?? [];
    const live = rows.filter((row) => row.health === "connected");
    const ids: ConnectorId[] = [];
    if (live.some((row) => row.scopes.includes(GOOGLE_SCOPE.driveFile))) {
      ids.push("google-workspace");
    }
    if (live.some((row) => row.scopes.includes(GOOGLE_SCOPE.gmailSend))) {
      ids.push("gmail");
    }
    if (live.some((row) => row.scopes.includes(GOOGLE_SCOPE.webmastersReadonly))) {
      ids.push("google-search-console");
    }
    return ids;
  }, [inventory.data]);

  const onConnect = useCallback(
    (id: ConnectorId) => {
      if (id === "google-workspace" || id === "gmail") {
        openGoogleConnect({
          reason:
            id === "gmail"
              ? "so an agent can draft email you review before it sends"
              : "so an agent can work with docs and sheets you choose",
        });
        return;
      }
      // Anything else is either coming-soon (the strip handles that itself) or
      // a provider whose connect flow is not built yet. Staying silent here
      // would read as a broken button, so the branch is explicit.
      openGoogleConnect();
    },
    [openGoogleConnect],
  );

  // While the inventory is still loading, everything would render as
  // "not connected" and the strip would flash a nag at a user who has already
  // connected. Wait for the answer instead.
  if (inventory.isLoading) return null;

  return (
    <ConnectorStrip
      connectedIds={connectedIds}
      onConnect={onConnect}
      className={className}
    />
  );
}
