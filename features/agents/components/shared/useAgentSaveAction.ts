"use client";

import { useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { useAppDispatch, useAppSelector } from "@/lib/redux/hooks";
import {
  selectAgentIsDirty,
  selectAgentIsLoading,
  selectAgentVersion,
  selectAgentModelMissing,
  selectAgentById,
} from "@/features/agents/redux/agent-definition/selectors";
import {
  saveAgent,
  createAgent,
} from "@/features/agents/redux/agent-definition/thunks";
import { toast } from "@/lib/toast-service";

/**
 * Shared save behaviour for an agent record.
 *
 * Centralises the desktop save-status pill (`AgentSaveStatus`) and the mobile
 * save tap target (`AgentSaveTapButton`) so the create-vs-update branching,
 * post-save toasts, and model-missing warning live in exactly one place.
 *
 * Returned `isEditMode` mirrors the legacy desktop check — only the `/build`
 * route or the in-flight `/agents/new` route should expose a save affordance.
 */
export function useAgentSaveAction(agentId: string) {
  const dispatch = useAppDispatch();
  const pathname = usePathname();
  const router = useRouter();

  const isDirty = useAppSelector((state) => selectAgentIsDirty(state, agentId));
  const isLoading = useAppSelector((state) =>
    selectAgentIsLoading(state, agentId),
  );
  const version = useAppSelector((state) => selectAgentVersion(state, agentId));
  const modelMissing = useAppSelector((state) =>
    selectAgentModelMissing(state, agentId),
  );
  const agentRecord = useAppSelector((state) =>
    selectAgentById(state, agentId),
  );

  const [showModelWarning, setShowModelWarning] = useState(false);

  const isNewRoute = pathname === "/agents/new";
  const isEditMode =
    isNewRoute || !!pathname?.includes(`/agents/${agentId}/build`);
  const canSave = (isDirty || isNewRoute) && !isLoading;

  const handleSave = async () => {
    if (isLoading) return;

    try {
      if (isNewRoute) {
        // First-time save: INSERT into the DB using the in-state data, then
        // redirect to the real agent route so the URL reflects the persisted id.
        if (!agentRecord) return;
        const newId = await dispatch(
          createAgent({
            name: agentRecord.name,
            description: agentRecord.description,
            agentType: agentRecord.agentType,
            messages: agentRecord.messages,
            variableDefinitions: agentRecord.variableDefinitions,
            modelId: agentRecord.modelId,
            settings: agentRecord.settings,
            tools: agentRecord.tools,
            customTools: agentRecord.customTools,
            contextSlots: agentRecord.contextSlots,
            category: agentRecord.category,
            tags: agentRecord.tags,
            isActive: agentRecord.isActive,
            isPublic: agentRecord.isPublic,
            isArchived: agentRecord.isArchived,
            isFavorite: agentRecord.isFavorite,
            mcpServers: agentRecord.mcpServers,
          }),
        ).unwrap();
        toast.success("Agent created!");
        router.replace(`/agents/${newId}/build`);
        return;
      }

      await dispatch(saveAgent(agentId)).unwrap();
      toast.success("Agent saved!");
      if (modelMissing) {
        setShowModelWarning(true);
      }
    } catch {
      toast.error(
        isNewRoute ? "Failed to create agent." : "Failed to save agent.",
      );
    }
  };

  return {
    isDirty,
    isLoading,
    version,
    isNewRoute,
    isEditMode,
    canSave,
    handleSave,
    showModelWarning,
    setShowModelWarning,
  } as const;
}
