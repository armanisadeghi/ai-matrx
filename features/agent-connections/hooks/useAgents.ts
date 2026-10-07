"use client";

import { useEffect, useMemo } from "react";
import { useAppDispatch, useAppSelector } from "@/lib/redux/hooks";
import type { AgentSummary } from "@ai-matrx/agents/catalog";
import { useAgentCatalogError, useAgentCatalogStatus, useCatalogAgents } from "@ai-matrx/chat/agents/identity/agent-catalog-lists";
import { ensureAgentCatalog } from "@ai-matrx/chat/agents/identity/agent-identity";

export interface UseAgentsResult {
  agents: AgentSummary[];
  loading: boolean;
  error: string | null;
  reload: () => void;
}

export function useAgents(): UseAgentsResult {
  const dispatch = useAppDispatch();
  const agents = useCatalogAgents();
  const status = useAgentCatalogStatus();
  const sliceError = useAgentCatalogError();

  useEffect(() => {
    if (status === "idle") {
      void ensureAgentCatalog();
    }
  }, [status, dispatch]);

  const loading = status === "loading";
  // The list read's failure — a view gates its "No agents yet" on this.
  const error = status === "failed" ? (sliceError ?? "The agent list failed to load") : null;
  return useMemo(
    () => ({
      agents,
      loading,
      error,
      reload: () => {
        void ensureAgentCatalog();
      },
    }),
    [agents, loading, error, dispatch],
  );
}
