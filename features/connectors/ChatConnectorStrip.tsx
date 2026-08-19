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
 * MCP-backed connectors are resolved generically by matching the connector id
 * to the canonical MCP server slug. Adding the next official MCP provider is a
 * registry entry, not another connect-flow implementation.
 */

import { useAppDispatch } from "@/lib/redux/hooks";
import { useGoogleConnectionInventory } from "@/features/marketing/google/hooks";
import { GOOGLE_SCOPE } from "@/lib/googleScopes";
import { useOpenGoogleConnectWindow } from "@/features/overlays/openers/googleConnectWindow";
import { useMcpCatalog } from "@/features/agents/hooks/useMcpTools";
import { fetchCatalog } from "@/features/agents/redux/mcp/mcp.slice";
import { startMcpOAuthPopup } from "@/features/agents/services/mcp-oauth/popup";
import { toast } from "@/lib/toast";
import { ConnectorStrip } from "./ConnectorStrip";
import type { ConnectorId } from "./types";

export interface ChatConnectorStripProps {
  className?: string;
}

export function ChatConnectorStrip({ className }: ChatConnectorStripProps) {
  const dispatch = useAppDispatch();
  const inventory = useGoogleConnectionInventory();
  const mcp = useMcpCatalog();
  const openGoogleConnect = useOpenGoogleConnectWindow();

  const rows = inventory.data?.connections ?? [];
  const live = rows.filter((row) => row.health === "connected");
  const connectedIds: ConnectorId[] = [];
  if (live.some((row) => row.scopes.includes(GOOGLE_SCOPE.driveFile))) {
    connectedIds.push("google-workspace");
  }
  if (live.some((row) => row.scopes.includes(GOOGLE_SCOPE.gmailSend))) {
    connectedIds.push("gmail");
  }
  if (live.some((row) => row.scopes.includes(GOOGLE_SCOPE.webmastersReadonly))) {
    connectedIds.push("google-search-console");
  }
  for (const server of mcp.catalog) {
    if (server.connectionStatus === "connected") {
      connectedIds.push(server.slug);
    }
  }

  const onConnect = (id: ConnectorId) => {
    if (id === "google-workspace" || id === "gmail") {
      openGoogleConnect({
        reason:
          id === "gmail"
            ? "so an agent can draft email you review before it sends"
            : "so an agent can work with docs and sheets you choose",
      });
      return;
    }

    const server = mcp.catalog.find((entry) => entry.slug === id);
    const connectable =
      server &&
      (server.serverStatus === "active" ||
        server.serverStatus === "beta" ||
        server.serverStatus === "community") &&
      server.authStrategy === "oauth_discovery" &&
      Boolean(server.endpointUrl);
    if (!connectable) {
      toast.error(`${server?.name ?? id} is not available to connect yet`, {
        description: "Open Integrations to review its current availability.",
      });
      return;
    }

    void startMcpOAuthPopup(server.serverId).then((outcome) => {
      if (outcome.ok) {
        dispatch(fetchCatalog());
        toast.success(`Connected to ${server.name}`);
      } else if (!outcome.cancelled) {
        toast.error(`Could not connect to ${server.name}`, {
          description: outcome.error,
        });
      }
    });
  };

  // While the inventory is still loading, everything would render as
  // "not connected" and the strip would flash a nag at a user who has already
  // connected. Wait for the answer instead.
  if (
    inventory.isLoading ||
    (mcp.status === "loading" && mcp.catalog.length === 0)
  ) {
    return null;
  }

  return (
    <ConnectorStrip
      connectedIds={connectedIds}
      onConnect={onConnect}
      className={className}
    />
  );
}
