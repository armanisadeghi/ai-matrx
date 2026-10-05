"use client";

/**
 * The agent picker's filter from this conversation's Output types — see
 * `agent-output-filter.ts`. `undefined` when the types ask for no filter.
 */

import type { AgentListFilter } from "@ai-matrx/agents/catalog/react";
import type { AgentSummary } from "@ai-matrx/agents/catalog";
import { useAppSelector } from "../../../../../store/hooks";
import { selectBuilderAdvancedSettings } from "../../../../redux/execution-system/instance-ui-state/instance-ui-state.selectors";
import { selectAllModels } from "@host/features/ai-models/redux/modelRegistrySlice";
import { readOutputTypes } from "./output-selection";
import { agentOutputFilterSpec, modelMakesAny, modelOutputModalities } from "./agent-output-filter";

export function useComposerAgentFilter(conversationId: string): AgentListFilter | undefined {
  const settings = useAppSelector(selectBuilderAdvancedSettings(conversationId));
  const models = useAppSelector(selectAllModels);
  const spec = agentOutputFilterSpec(readOutputTypes(settings?.outputTypes));
  if (!spec) return undefined;
  const outputsById = new Map(models.map((model) => [model.id, modelOutputModalities(model.capabilities)]));
  return {
    label: spec.label,
    test: (agent: AgentSummary) =>
      modelMakesAny(agent.modelId ? (outputsById.get(agent.modelId) ?? null) : null, spec.modalities),
  };
}
