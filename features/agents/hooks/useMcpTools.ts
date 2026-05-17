"use client";

import { useCallback, useEffect, useMemo } from "react";
import { useAppDispatch, useAppSelector } from "@/lib/redux/hooks";
import {
  fetchCatalog,
  discoverServerTools,
  selectMcpCatalog,
  selectMcpCatalogStatus,
  selectMcpServerById,
  selectMcpServerDiscovery,
  selectMcpServerTools,
  selectAllDiscoveredMcpTools,
  selectMcpDiscoveries,
} from "@/features/agents/redux/mcp/mcp.slice";
import type { McpToolSchema } from "@/features/agents/services/mcp-client/tool-discovery";

const EMPTY_MCP_TOOLS: McpToolSchema[] = [];

// ─── useMcpCatalog ───────────────────────────────────────────────────────────

/**
 * Load and access the MCP server catalog.
 * Auto-fetches on mount if not already loaded.
 */
export function useMcpCatalog() {
  const dispatch = useAppDispatch();
  const catalog = useAppSelector(selectMcpCatalog);
  const status = useAppSelector(selectMcpCatalogStatus);

  useEffect(() => {
    if (status === "idle") {
      dispatch(fetchCatalog());
    }
  }, [dispatch, status]);

  const connectedServers = useMemo(
    () => catalog.filter((s) => s.connectionStatus === "connected"),
    [catalog],
  );

  return { catalog, connectedServers, status };
}

// ─── useMcpServerTools ───────────────────────────────────────────────────────

/**
 * Discover and access tools for a specific MCP server.
 * Auto-discovers on mount if the server is connected and tools haven't been loaded.
 */
export function useMcpServerTools(serverId: string | null) {
  const dispatch = useAppDispatch();
  const server = useAppSelector((state) =>
    serverId ? selectMcpServerById(state, serverId) : null,
  );
  const discovery = useAppSelector((state) =>
    serverId ? selectMcpServerDiscovery(state, serverId) : null,
  );
  const tools = useAppSelector((state) =>
    serverId ? selectMcpServerTools(state, serverId) : EMPTY_MCP_TOOLS,
  );

  const isConnected = server?.connectionStatus === "connected";
  const discoveryStatus = discovery?.status ?? "idle";

  useEffect(() => {
    if (serverId && isConnected && discoveryStatus === "idle") {
      dispatch(discoverServerTools(serverId));
    }
  }, [dispatch, serverId, isConnected, discoveryStatus]);

  const refresh = useCallback(() => {
    if (serverId) {
      dispatch(discoverServerTools(serverId));
    }
  }, [dispatch, serverId]);

  const invokeTool = useCallback(
    async (toolName: string, args?: Record<string, unknown>) => {
      if (!serverId) throw new Error("No server ID");

      const response = await fetch(`/api/mcp/servers/${serverId}/invoke`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tool: toolName, arguments: args }),
      });

      if (!response.ok) {
        const body = await response.json().catch(() => ({}));
        throw new Error(body.error ?? `Invocation failed (${response.status})`);
      }

      return response.json();
    },
    [serverId],
  );

  return {
    server,
    tools,
    discovery,
    isConnected,
    discoveryStatus,
    refresh,
    invokeTool,
  };
}

// ─── useMcpAllTools ──────────────────────────────────────────────────────────

/**
 * Access all discovered MCP tools across all connected servers.
 * Useful for tool routing — each tool includes its serverId.
 */
export function useMcpAllTools() {
  const allTools = useAppSelector(selectAllDiscoveredMcpTools);
  const discoveries = useAppSelector(selectMcpDiscoveries);

  const isLoading = useMemo(
    () => Object.values(discoveries).some((d) => d.status === "loading"),
    [discoveries],
  );

  const findTool = useCallback(
    (toolName: string) => allTools.find((t) => t.name === toolName) ?? null,
    [allTools],
  );

  const invokeByName = useCallback(
    async (toolName: string, args?: Record<string, unknown>) => {
      const tool = allTools.find((t) => t.name === toolName);
      if (!tool) throw new Error(`MCP tool not found: ${toolName}`);

      const response = await fetch(`/api/mcp/servers/${tool.serverId}/invoke`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tool: toolName, arguments: args }),
      });

      if (!response.ok) {
        const body = await response.json().catch(() => ({}));
        throw new Error(body.error ?? `Invocation failed (${response.status})`);
      }

      return response.json();
    },
    [allTools],
  );

  return { allTools, isLoading, findTool, invokeByName };
}

// ─── useDiscoverAgentMcpTools ────────────────────────────────────────────────

/**
 * Given a list of MCP server IDs (from an agent definition),
 * discovers tools for all connected servers that haven't been discovered yet.
 */
export function useDiscoverAgentMcpTools(serverIds: string[]) {
  const dispatch = useAppDispatch();
  const discoveries = useAppSelector(selectMcpDiscoveries);
  const catalog = useAppSelector(selectMcpCatalog);

  useEffect(() => {
    for (const serverId of serverIds) {
      const catalogEntry = catalog.find((e) => e.serverId === serverId);
      if (!catalogEntry || catalogEntry.connectionStatus !== "connected")
        continue;

      const existing = discoveries[serverId];
      if (!existing || existing.status === "idle") {
        dispatch(discoverServerTools(serverId));
      }
    }
  }, [dispatch, serverIds, catalog, discoveries]);

  const agentTools = useMemo(() => {
    const tools: Array<
      McpToolSchema & { serverId: string; serverName: string }
    > = [];
    for (const serverId of serverIds) {
      const discovery = discoveries[serverId];
      if (!discovery || discovery.status !== "succeeded") continue;
      const catalogEntry = catalog.find((e) => e.serverId === serverId);
      const serverName = catalogEntry?.name ?? serverId;
      for (const tool of discovery.tools) {
        tools.push({ ...tool, serverId, serverName });
      }
    }
    return tools;
  }, [serverIds, discoveries, catalog]);

  const isLoading = useMemo(
    () =>
      serverIds.some((id) => {
        const d = discoveries[id];
        return d?.status === "loading";
      }),
    [serverIds, discoveries],
  );

  return { agentTools, isLoading };
}
