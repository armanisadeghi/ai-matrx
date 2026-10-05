"use client";

import { useMemo } from "react";
import { useAppSelector } from "../../store/hooks";
import {
  selectAllTools,
  selectToolIdentityMap,
} from "../redux/tools/tools.selectors";
import { selectMcpCatalog } from "../redux/mcp/mcp.slice";
import type { EnrichmentContext } from "@ai-matrx/diff/react";
import type { ChatRootState } from "../../store/root-state";
import { selectModelIdentityMap } from "../model-registry/modelRegistrySlice";

export function useDiffEnrichment(): EnrichmentContext {
  const allTools = useAppSelector(selectAllTools);
  const toolIdentities = useAppSelector(selectToolIdentityMap);
  const mcpCatalog = useAppSelector(selectMcpCatalog);
  const modelEntities = useAppSelector(
    (state: ChatRootState) => state.modelRegistry.entities,
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
