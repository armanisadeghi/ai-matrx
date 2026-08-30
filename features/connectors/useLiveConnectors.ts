"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useAppDispatch, useAppSelector } from "@/lib/redux/hooks";
import { useGoogleConnectionInventory } from "@/features/marketing/google/hooks";
import { useOpenGoogleConnectWindow } from "@/features/overlays/openers/googleConnectWindow";
import { useMcpCatalog } from "@/features/agents/hooks/useMcpTools";
import {
  connectServer,
  fetchCatalog,
  selectMcpCatalogError,
} from "@/features/agents/redux/mcp/mcp.slice";
import { startMcpOAuthPopup } from "@/features/agents/services/mcp-oauth/popup";
import { mcpConnectionRouteFor } from "@/features/agent-connections/mcp-connection-route";
import { githubConnectUrl } from "@/features/github-integration/service";
import { toast } from "@/lib/toast";
import { selectOrganizationId } from "@/lib/redux/slices/appContextSlice";
import { googleConnectedIds } from "./google-status";
import {
  buildLiveConnectorDefinitions,
  connectorActionLabel,
} from "./live-connectors";
import type { ConnectorId, ConnectorStatus } from "./types";

export function useLiveConnectors() {
  const dispatch = useAppDispatch();
  const router = useRouter();
  const inventory = useGoogleConnectionInventory();
  const mcp = useMcpCatalog();
  const mcpError = useAppSelector(selectMcpCatalogError);
  const organizationId = useAppSelector(selectOrganizationId);
  const openGoogleConnect = useOpenGoogleConnectWindow();
  const [connectingId, setConnectingId] = useState<ConnectorId | null>(null);
  const [isNavigating, startTransition] = useTransition();

  const connectedIds: ConnectorId[] = googleConnectedIds(
    inventory.data?.connections ?? [],
  );
  for (const server of mcp.catalog) {
    if (server.connectionStatus === "connected") connectedIds.push(server.slug);
  }
  const connectedSet = new Set(connectedIds);
  const connectors = buildLiveConnectorDefinitions(mcp.catalog);
  const entriesBySlug = new Map(
    mcp.catalog.map((entry) => [entry.slug, entry]),
  );

  const items = connectors.map((connector) => {
    const connected = connectedSet.has(connector.id);
    return {
      connector,
      status: (connected ? "connected" : "not_connected") as ConnectorStatus,
      actionLabel: connectorActionLabel(
        connector.id,
        entriesBySlug.get(connector.id),
        connected,
      ),
    };
  });

  const connect = async (id: ConnectorId) => {
    if (id === "google-workspace" || id === "gmail") {
      openGoogleConnect({
        reason:
          id === "gmail"
            ? "so an agent can draft email you review before it sends"
            : "so an agent can work with docs and sheets you choose",
      });
      return;
    }

    const server = entriesBySlug.get(id);
    if (!server) {
      toast.error(`${id} is not available to connect right now`);
      return;
    }

    const route = mcpConnectionRouteFor(server);
    if (route === "configure") {
      startTransition(() => {
        router.push(
          `/user-settings/integrations?provider=${encodeURIComponent(server.slug)}`,
        );
      });
      return;
    }
    if (route === "github") {
      if (!organizationId) {
        toast.error("Select an organization before connecting GitHub.");
        return;
      }
      window.location.assign(
        githubConnectUrl(window.location.pathname, organizationId),
      );
      return;
    }

    setConnectingId(id);
    try {
      if (route === "none") {
        await dispatch(
          connectServer({
            serverId: server.serverId,
            transport: server.transport,
          }),
        ).unwrap();
        toast.success(`Connected to ${server.name}`);
        return;
      }

      const outcome = await startMcpOAuthPopup(server.serverId);
      if (outcome.ok) {
        dispatch(fetchCatalog());
        toast.success(`Connected to ${server.name}`);
      } else if (!outcome.cancelled) {
        toast.error(`Could not connect to ${server.name}`, {
          description: outcome.error,
        });
      }
    } catch (cause) {
      toast.error(`Could not connect to ${server.name}`, {
        description: cause instanceof Error ? cause.message : String(cause),
      });
    } finally {
      setConnectingId(null);
    }
  };

  const refresh = () => dispatch(fetchCatalog());
  const isLoading =
    inventory.isLoading ||
    ((mcp.status === "idle" || mcp.status === "loading") &&
      mcp.catalog.length === 0);

  return {
    items,
    connect,
    refresh,
    connectingId,
    isNavigating,
    isLoading,
    error: mcp.status === "failed" ? mcpError : null,
  };
}
