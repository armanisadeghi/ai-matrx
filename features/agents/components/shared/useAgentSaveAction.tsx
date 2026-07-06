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
  selectAgentIsReadOnly,
  selectAgentAccessResolved,
} from "@/features/agents/redux/agent-definition/selectors";
import {
  saveAgent,
  createAgent,
} from "@/features/agents/redux/agent-definition/thunks";
import { toast } from "@/lib/toast-service";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { useAgentDuplicateFlow } from "@/features/agents/hooks/useAgentDuplicateFlow";

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
export function useAgentSaveAction(
  agentId: string,
  options?: { editModeOverride?: boolean },
) {
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
  const accessResolved = useAppSelector((state) =>
    selectAgentAccessResolved(state, agentId),
  );
  const isReadOnly = useAppSelector((state) =>
    selectAgentIsReadOnly(state, agentId),
  );

  const [showModelWarning, setShowModelWarning] = useState(false);
  const [readOnlySavePromptOpen, setReadOnlySavePromptOpen] = useState(false);
  const {
    startDuplicate,
    dialog: duplicateDialog,
    isDuplicating,
  } = useAgentDuplicateFlow(agentId);

  const isNewRoute = pathname === "/agents/new";
  const isEditMode =
    options?.editModeOverride === true ||
    isNewRoute ||
    !!pathname?.includes(`/agents/${agentId}/build`);
  const canSave = (isDirty || isNewRoute) && !isLoading;
  const isReadOnlySave = accessResolved && isReadOnly && !isNewRoute;

  const handleSave = async () => {
    if (isLoading || isDuplicating) return;

    if (isReadOnlySave) {
      setReadOnlySavePromptOpen(true);
      return;
    }

    try {
      if (isNewRoute) {
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

  const handleReadOnlyDuplicate = async () => {
    setReadOnlySavePromptOpen(false);
    await startDuplicate();
  };

  const readOnlySavePrompt = (
    <AlertDialog
      open={readOnlySavePromptOpen}
      onOpenChange={setReadOnlySavePromptOpen}
    >
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>View-only agent</AlertDialogTitle>
          <AlertDialogDescription>
            This agent is shared with you as view-only, so changes cannot be
            saved here. Create your own copy to edit it. Unsaved edits in this
            session will not carry over — the copy starts from the last saved
            version.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Keep browsing</AlertDialogCancel>
          <AlertDialogAction
            disabled={isDuplicating}
            onClick={() => void handleReadOnlyDuplicate()}
          >
            Create my copy
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );

  return {
    isDirty,
    isLoading,
    version,
    isNewRoute,
    isEditMode,
    canSave,
    isReadOnly: accessResolved && isReadOnly,
    isReadOnlySave,
    handleSave,
    showModelWarning,
    setShowModelWarning,
    readOnlySavePrompt,
    duplicateDialog,
  } as const;
}
