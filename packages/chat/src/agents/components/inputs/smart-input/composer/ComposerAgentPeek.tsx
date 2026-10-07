"use client";

/**
 * The agent answering this chat, as the agent menu's own hover peek shows it
 * (`AgentDetailCard`, the ONE agent card) — so Chat mode, whose pill names a
 * preset or "Custom", still opens the agent itself: see it, open it, and
 * Duplicate it when it is not yours (Arman, 2026-10-06).
 *
 * The card reads the catalogue row; an agent the catalogue has not listed (a
 * shared or public one reached by link) is described from its loaded record.
 * Opening it loads the full record, as every peek does, so Duplicate knows
 * whose agent this is.
 */

import { useEffect } from "react";
import type { AgentSummary } from "@ai-matrx/agents/catalog";
import { AgentDetailCard, useAgentCatalogState } from "@ai-matrx/agents/catalog/react";
import { useAppDispatch, useAppSelector } from "../../../../../store/hooks";
import { selectAgentById, selectAgentReadyForBuilder } from "../../../../redux/agent-definition/selectors";
import { fetchFullAgent } from "../../../../redux/agent-definition/thunks";
import { AgentPeekDuplicateButton } from "../../../shared/AgentPeekDuplicateButton";

export function ComposerAgentPeek({ agentId, onDone }: { agentId: string; onDone?: () => void }) {
  const dispatch = useAppDispatch();
  const row = useAgentCatalogState((state) => state.byId[agentId]);
  const record = useAppSelector((state) => selectAgentById(state, agentId));
  const isReady = useAppSelector((state) => selectAgentReadyForBuilder(state, agentId));
  useEffect(() => {
    // A failed read leaves the card as the catalogue row describes it; only
    // Duplicate (which needs the owner) stays hidden.
    if (!isReady) void dispatch(fetchFullAgent(agentId)).unwrap().catch(() => undefined);
  }, [dispatch, agentId, isReady]);
  const agent: AgentSummary | null =
    row ??
    (record
      ? {
          id: record.id,
          name: record.name,
          description: record.description,
          category: record.category,
          tags: record.tags,
          agentType: record.agentType,
          modelId: record.modelId,
          isActive: record.isActive,
          isArchived: record.isArchived,
          isFavorite: record.isFavorite,
          createdBy: record.createdBy,
          organizationId: record.organizationId,
          taskId: record.taskId,
          sourceAgentId: record.sourceAgentId,
          createdAt: record.createdAt,
          updatedAt: record.updatedAt,
          isOwner: record.isOwner,
          accessLevel: record.accessLevel,
          sharedByEmail: record.sharedByEmail,
          orchestra: null,
        }
      : null);
  if (!agent) return null;
  return (
    <AgentDetailCard
      agent={agent}
      actions={<AgentPeekDuplicateButton agentId={agentId} onDuplicated={onDone} />}
    />
  );
}
