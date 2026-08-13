"use client";

import { useMemo } from "react";
import { useAppSelector } from "@/lib/redux/hooks";
import {
  selectAllTools,
  selectToolIdentityMap,
} from "@/features/agents/redux/tools/tools.selectors";
import { selectMcpCatalog } from "@/features/agents/redux/mcp/mcp.slice";
import type { EnrichmentContext } from "@/components/diff/adapters/types";
import type { RootState } from "@/lib/redux/store";
import { selectModelIdentityMap } from "@/features/ai-models/redux/modelRegistrySlice";

export function useDiffEnrichment(): EnrichmentContext {
  const allTools = useAppSelector(selectAllTools);
  const toolIdentities = useAppSelector(selectToolIdentityMap);
  const mcpCatalog = useAppSelector(selectMcpCatalog);
  const modelEntities = useAppSelector(
    (state: RootState) => state.modelRegistry.entities,
  );
  const modelIdentities = useAppSelector(selectModelIdentityMap);

  return useMemo(
    (): EnrichmentContext => ({
      resolveModelId: (id: string) => {
        const model = modelEntities[id];
        const identity = modelIdentities[id];
        return (
          model?.common_name ??
          model?.name ??
          identity?.common_name ??
          identity?.name ??
          undefined
        );
      },
      resolveToolId: (id: string) => {
        const tool = allTools.find((t) => t.id === id);
        return tool?.name ?? toolIdentities[id]?.name ?? undefined;
      },
      resolveMcpServerId: (id: string) => {
        const server = mcpCatalog.find((s) => s.serverId === id);
        return server?.name ?? undefined;
      },
    }),
    [allTools, mcpCatalog, modelEntities, modelIdentities, toolIdentities],
  );
}
