"use client";

import { useEffect, useMemo } from "react";
import { useAppDispatch, useAppSelector } from "@/lib/redux/hooks";
import {
  selectMcpCatalog,
  selectMcpCatalogStatus,
  selectMcpCatalogError,
  fetchCatalog,
  connectServer,
  disconnectServer,
  discoverServerTools,
} from "@/features/agents/redux/mcp/mcp.slice";
import type { McpCatalogEntry } from "@/features/agents/types/mcp.types";
import type { UpsertConnectionParams } from "@/features/agents/services/mcp.service";

export interface UseMcpCatalogResult {
  servers: McpCatalogEntry[];
  loading: boolean;
  error: string | null;
  reload: () => void;
  connect: (params: UpsertConnectionParams) => Promise<void>;
  disconnect: (serverId: string) => Promise<void>;
  discover: (serverId: string) => Promise<void>;
}

export function useMcpCatalog(): UseMcpCatalogResult {
  const dispatch = useAppDispatch();
  const servers = useAppSelector(selectMcpCatalog);
  const status = useAppSelector(selectMcpCatalogStatus);
  const error = useAppSelector(selectMcpCatalogError);

  useEffect(() => {
    if (status === "idle") void dispatch(fetchCatalog());
  }, [status, dispatch]);

  return useMemo(
    () => ({
      servers,
      loading: status === "loading",
      error,
      reload: () => {
        void dispatch(fetchCatalog());
      },
      connect: async (params) => {
        await dispatch(connectServer(params)).unwrap();
      },
      disconnect: async (serverId) => {
        await dispatch(disconnectServer(serverId)).unwrap();
      },
      discover: async (serverId) => {
        await dispatch(discoverServerTools(serverId)).unwrap();
      },
    }),
    [servers, status, error, dispatch],
  );
}
