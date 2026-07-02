"use client";

import { useMemo } from "react";
import { useAppSelector } from "@/lib/redux/hooks";
import {
  selectAgentById,
  selectAgentDirtyFields,
  selectAgentFieldHistory,
} from "@/features/agents/redux/agent-definition/selectors";
import type { AgentDefinition } from "@/features/agents/types/agent-definition.types";
import { AgentDiffViewer } from "./AgentDiffViewer";

interface UnsavedChangesDiffProps {
  agentId: string;
}

export function UnsavedChangesDiff({ agentId }: UnsavedChangesDiffProps) {
  const agent = useAppSelector((state) => selectAgentById(state, agentId));
  const dirtyFields = useAppSelector((state) => selectAgentDirtyFields(state, agentId));
  const fieldHistory = useAppSelector((state) => selectAgentFieldHistory(state, agentId));

  const { oldAgent, newAgent } = useMemo(() => {
    if (!agent || !dirtyFields || !fieldHistory) {
      return { oldAgent: {} as Partial<AgentDefinition>, newAgent: {} as Partial<AgentDefinition> };
    }

    // Build "last saved" by overlaying original values for dirty fields
    const current: Record<string, unknown> = {};
    const saved: Record<string, unknown> = {};

    for (const field of Object.keys(dirtyFields) as Array<keyof AgentDefinition>) {
      current[field] = agent[field];
      saved[field] = fieldHistory[field];
    }

    return {
      oldAgent: saved as Partial<AgentDefinition>,
      newAgent: current as Partial<AgentDefinition>,
    };
  }, [agent, dirtyFields, fieldHistory]);

  if (!agent || !dirtyFields || Object.keys(dirtyFields).length === 0) {
    return (
      <div className="flex items-center justify-center py-12 text-sm text-muted-foreground">
        No unsaved changes
      </div>
    );
  }

  return (
    <AgentDiffViewer
      oldAgent={oldAgent}
      newAgent={newAgent}
      oldLabel="Last Saved"
      newLabel="Current"
      defaultMode="summary"
      className="h-full"
    />
  );
}
