"use client";

import { useState } from "react";
import { usePathname, useRouter } from "@ai-matrx/chat/host/navigation";
import { useAppDispatch, useAppSelector } from "@ai-matrx/chat/store/hooks";
import {
  selectAgentIsDirty,
  selectAgentIsLoading,
  selectAgentVersion,
  selectAgentModelMissing,
  selectAgentById,
  selectAgentIsReadOnly,
  selectAgentAccessResolved,
} from "@ai-matrx/chat/agents/redux/agent-definition/selectors";
import { getBuilderDoor, requireBuilderDoor } from "@ai-matrx/chat/host/builder-door";
import { toast } from "@ai-matrx/chat/host/notify";
import { agentNameTaken } from "@ai-matrx/chat/agents/redux/agent-definition/agentNameTaken";
import { setAgentField } from "@ai-matrx/chat/agents/redux/agent-definition/slice";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@ai-matrx/design-system";
import { useAgentDuplicateFlow } from "../../hooks/useAgentDuplicateFlow";
import { useAgentChangeReach } from "@ai-matrx/chat/host/ui-slots";

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

  // Agent Change Impact (I6): after a save lands, which jobs does it reach?
  // Non-blocking — the read runs after the save has succeeded and never
  // delays it; the badge and the toast's "Review" door open the impact panel.
  const {
    badge: reachBadge,
    tapBadge: reachTapBadge,
    announce: announceReach,
  } = useAgentChangeReach(agentId);

  const isNewRoute = pathname === "/agents/new";
  const isEditMode =
    options?.editModeOverride === true ||
    isNewRoute ||
    // agent-link-ok: save-as creates a user agent for this user; the pathname check is a route test, not a link
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
          requireBuilderDoor().createAgent({
            name: agentRecord.name,
            description: agentRecord.description,
            agentType: agentRecord.agentType,
            messages: agentRecord.messages,
            variableDefinitions: agentRecord.variableDefinitions,
            modelId: agentRecord.modelId,
            settings: agentRecord.settings,
            tools: agentRecord.tools,
            customTools: agentRecord.customTools,
            contextPolicies: agentRecord.contextPolicies,
            category: agentRecord.category,
            tags: agentRecord.tags,
            isActive: agentRecord.isActive,
            isArchived: agentRecord.isArchived,
            isFavorite: agentRecord.isFavorite,
            mcpServers: agentRecord.mcpServers,
          }),
        ).unwrap();
        toast.success("Agent created!");
        // agent-link-ok: save-as creates a user agent for this user; the pathname check is a route test, not a link
        router.replace(`/agents/${newId}/build`);
        return;
      }

      await dispatch(requireBuilderDoor().saveAgent(agentId)).unwrap();
      toast.success("Agent saved!");
      void announceReach(agentRecord?.name ?? null);
      if (modelMissing) {
        setShowModelWarning(true);
      }
    } catch (e) {
      // THE CATALOG'S OWN SENTENCE, WITH ITS OFFER (V24-TAILS): a name already taken in this
      // organization is refused in words, and one press takes the free name and saves again.
      const taken = agentNameTaken(e);
      if (taken && agentId) {
        toast.error(taken.sentence, {
          action: {
            label: `Use "${taken.suggestion}"`,
            onClick: () => {
              dispatch(setAgentField({ id: agentId, field: "name", value: taken.suggestion }));
              void handleSave();
            },
          },
        });
        return;
      }
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
    /** The post-save reach icon + count (Agent Change Impact I6), or null. */
    reachBadge,
    /** The same badge as one 44pt tap target, for the mobile header. */
    reachTapBadge,
    /** False in a host that registered no builder door: save controls are left out (reported once). */
    available: getBuilderDoor() !== null,
  } as const;
}
