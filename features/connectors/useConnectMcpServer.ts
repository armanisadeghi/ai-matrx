"use client";

/**
 * ONE connect/re-authorize action for an MCP server, wherever it is offered.
 *
 * A chip that says "Needs re-auth" must carry the door that fixes it — in the
 * chat tool picker, in the agent tools manager, and on the connectors surface
 * alike (CLAUDE.md § NO DEAD ENDS). Before this, only the connectors surface
 * knew how to start the real flow, so every other screen could do nothing but
 * describe the problem.
 *
 * The route itself stays in `mcp-connection-route.ts`: GitHub goes to the
 * first-party GitHub App install, OAuth servers open the popup, no-auth
 * servers are a metadata-only connect, everything else needs the credential
 * editor.
 */

import { useCallback, useState } from "react";
import { useRouter } from "next/navigation";
import { useAppDispatch, useAppSelector } from "@/lib/redux/hooks";
import { mcpConnectionRouteFor } from "@/features/agent-connections/mcp-connection-route";
import {
  connectServer,
  fetchAvailability,
  fetchCatalog,
} from "@/features/agents/redux/mcp/mcp.slice";
import { startMcpOAuthPopup } from "@/features/agents/services/mcp-oauth/popup";
import { githubConnectUrl } from "@/features/github-integration/service";
import type { McpCatalogEntry } from "@/features/agents/types/mcp.types";
import { selectOrganizationId } from "@/lib/redux/slices/appContextSlice";
import { toast } from "@/lib/toast";

export function useConnectMcpServer() {
  const dispatch = useAppDispatch();
  const router = useRouter();
  const organizationId = useAppSelector(selectOrganizationId);
  const [connectingSlug, setConnectingSlug] = useState<string | null>(null);

  const connect = useCallback(
    async (server: McpCatalogEntry) => {
      const route = mcpConnectionRouteFor(server);

      if (route === "configure") {
        router.push(
          `/user-settings/integrations?provider=${encodeURIComponent(server.slug)}`,
        );
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

      setConnectingSlug(server.slug);
      try {
        if (route === "none") {
          await dispatch(
            connectServer({
              serverId: server.serverId,
              transport: server.transport,
            }),
          ).unwrap();
          toast.success(`Connected to ${server.name}`);
        } else {
          const outcome = await startMcpOAuthPopup(server.serverId);
          if (outcome.ok) {
            toast.success(`Connected to ${server.name}`);
          } else if (!outcome.cancelled) {
            toast.error(`Could not connect to ${server.name}`, {
              description: outcome.error,
            });
            return;
          } else {
            return;
          }
        }
        // Re-read BOTH the catalog row and the server's health: a fresh
        // connection row means nothing until aidream confirms it can be used.
        dispatch(fetchCatalog());
        if (organizationId) {
          dispatch(fetchAvailability({ organizationId }));
        }
      } catch (cause) {
        toast.error(`Could not connect to ${server.name}`, {
          description: cause instanceof Error ? cause.message : String(cause),
        });
      } finally {
        setConnectingSlug(null);
      }
    },
    [dispatch, organizationId, router],
  );

  return { connect, connectingSlug };
}
