"use client";

import { useEffect } from "react";
import { useAppDispatch } from "@/lib/redux/hooks";
import {
  mergePartialAgent,
  setAgentFetchStatus,
  setAgentsStatus,
} from "@/features/agents/redux/agent-definition/slice";
import type { AgentListRow } from "@/features/agents/types/agent-definition.types";

export function AgentListHydrator({ seeds }: { seeds: AgentListRow[] }) {
  const dispatch = useAppDispatch();

  useEffect(() => {
    for (const row of seeds) {
      dispatch(
        mergePartialAgent({
          id: row.id,
          name: row.name,
          description: row.description,
          category: row.category,
          tags: row.tags ?? [],
          agentType: row.agent_type,
          modelId: row.model_id,
          isActive: row.is_active,
          isArchived: row.is_archived,
          isFavorite: row.is_favorite,
          userId: row.user_id,
          organizationId: row.organization_id,
          taskId: row.task_id ?? null,
          sourceAgentId: row.source_agent_id,
          createdAt: row.created_at,
          updatedAt: row.updated_at,
          isVersion: false,
          isOwner: row.is_owner,
          accessLevel: row.access_level,
          sharedByEmail: row.shared_by_email,
        }),
      );
      dispatch(setAgentFetchStatus({ id: row.id, status: "list" }));
    }
    dispatch(setAgentsStatus("succeeded"));
    // seeds is server-provided and stable — intentionally omitted to run once
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return null;
}
