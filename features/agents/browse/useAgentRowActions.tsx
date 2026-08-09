"use client";

// features/agents/browse/useAgentRowActions.tsx
//
// Binds the action registry to real behaviour, and owns the modals those
// actions open. One instance per page — the modals are singletons keyed by the
// agent currently acted on, never one modal per row (that was 372 mounted
// ShareModals on /agents/all).
//
// Row click opens AgentActionModal (classic Run/Edit/View chooser). The kebab
// ItemMenu still carries the FULL action list — same handlers, never a second
// code path.

import { useCallback, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "@/lib/toast";
import { toastDoor } from "@/components/official/entity-ref/toastDoor";
import { useAppDispatch, useAppSelector } from "@/lib/redux/hooks";
import { selectIsSuperAdmin } from "@/lib/redux/selectors/userSelectors";
import {
  deleteAgent,
  duplicateAgent,
  saveAgentField,
} from "@/features/agents/redux/agent-definition/thunks";
import { openOverlay } from "@/lib/redux/slices/overlaySlice";
import { buildRecordReferenceFence } from "@/features/matrx-envelope/recordReference";
import { confirm } from "@/components/dialogs/confirm/ConfirmDialogHost";
import { announceComingSoon } from "@/lib/coming-soon/announce";
import type { ItemMenuConfig } from "@/components/official/item/types";
import { buildAgentMenu } from "./agentActionRegistry";
import type { AgentBrowseRow } from "./types";

export interface AgentRowActionsHost {
  /** Build the full menu for one row. Lazy — pass straight to ItemMenu/ItemRow. */
  menuFor: (agent: AgentBrowseRow) => () => ItemMenuConfig;
  /**
   * Direct handles for the two actions a surface also exposes OUTSIDE the menu
   * (the card's star, the row's inline rename). They call the same code the
   * menu entries do, so the two can never drift.
   */
  toggleFavorite: (agent: AgentBrowseRow) => void;
  renameTo: (agent: AgentBrowseRow, next: string) => Promise<void>;
  /** Classic row-click chooser (Run / Edit / View / …). */
  openActionModal: (agent: AgentBrowseRow) => void;
  closeActionModal: () => void;
  actionAgent: AgentBrowseRow | null;
  actionModal: {
    onRun: () => void;
    onEdit: () => void;
    onView: () => void;
    onDuplicate: () => void;
    onShare: () => void;
    onDelete: () => void;
    onCreateApp: () => void;
    isDeleting: boolean;
    isDuplicating: boolean;
  };
  /** Modal state the page must render. */
  peekAgentId: string | null;
  closePeek: () => void;
  shareAgent: AgentBrowseRow | null;
  closeShare: () => void;
  addToSetAgent: AgentBrowseRow | null;
  closeAddToSet: () => void;
  renameAgent: AgentBrowseRow | null;
  closeRename: () => void;
  commitRename: (next: string) => Promise<void>;
}

export interface UseAgentRowActionsArgs {
  /** Optimistically patch a row in the caller's list. */
  patchRow: (id: string, patch: Partial<AgentBrowseRow>) => void;
  /** Drop a row from the caller's list after a confirmed delete. */
  removeRow: (id: string) => void;
  /** Re-run the query (after a duplicate creates a new row). */
  refresh: () => void;
}

export function useAgentRowActions({
  patchRow,
  removeRow,
  refresh,
}: UseAgentRowActionsArgs): AgentRowActionsHost {
  const router = useRouter();
  const dispatch = useAppDispatch();
  const isSuperAdmin = useAppSelector(selectIsSuperAdmin);

  const [peekAgentId, setPeekAgentId] = useState<string | null>(null);
  const [shareAgent, setShareAgent] = useState<AgentBrowseRow | null>(null);
  const [addToSetAgent, setAddToSetAgent] = useState<AgentBrowseRow | null>(
    null,
  );
  const [renameAgent, setRenameAgent] = useState<AgentBrowseRow | null>(null);
  const [actionAgent, setActionAgent] = useState<AgentBrowseRow | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [isDuplicating, setIsDuplicating] = useState(false);

  /**
   * Single-field write through the canonical thunk, with our own revert — the
   * thunk's built-in rollback only restores the Redux slice, and this surface
   * deliberately holds its own rows rather than hydrating 358 agents into it.
   */
  const saveField = useCallback(
    async (
      agent: AgentBrowseRow,
      field: "isFavorite" | "isArchived" | "name",
      rowPatch: Partial<AgentBrowseRow>,
      revert: Partial<AgentBrowseRow>,
      failureMessage: string,
    ) => {
      patchRow(agent.id, rowPatch);
      try {
        await dispatch(
          saveAgentField({
            agentId: agent.id,
            field,
            value: Object.values(rowPatch)[0] as never,
          }),
        ).unwrap();
      } catch (err) {
        patchRow(agent.id, revert);
        toast.error(failureMessage, {
          description: err instanceof Error ? err.message : undefined,
        });
      }
    },
    [dispatch, patchRow],
  );

  const renameTo = useCallback(
    async (agent: AgentBrowseRow, next: string) => {
      const trimmed = next.trim();
      if (!trimmed || trimmed === agent.name) return;
      await saveField(
        agent,
        "name",
        { name: trimmed },
        { name: agent.name },
        "Could not rename agent",
      );
    },
    [saveField],
  );

  const commitRename = useCallback(
    async (next: string) => {
      const agent = renameAgent;
      if (!agent) return;
      setRenameAgent(null);
      await renameTo(agent, next);
    },
    [renameAgent, renameTo],
  );

  const toggleFavorite = useCallback(
    (agent: AgentBrowseRow) => {
      void saveField(
        agent,
        "isFavorite",
        { is_favorite: !agent.is_favorite },
        { is_favorite: agent.is_favorite },
        "Could not update favorite",
      );
    },
    [saveField],
  );

  const runAgent = useCallback(
    (agent: AgentBrowseRow) => router.push(`/agents/${agent.id}/run`),
    [router],
  );
  const editAgent = useCallback(
    (agent: AgentBrowseRow) => router.push(`/agents/${agent.id}/build`),
    [router],
  );
  const viewAgent = useCallback(
    (agent: AgentBrowseRow) => router.push(`/agents/${agent.id}`),
    [router],
  );

  const duplicate = useCallback(
    async (agent: AgentBrowseRow) => {
      setIsDuplicating(true);
      try {
        // `duplicateAgent` RETURNS the new agent's id and every caller in the
        // repo threw it away — so the user made a copy and had no way to reach
        // it but to go hunting in the list. The door is the whole point of the
        // toast.
        const newAgentId = await dispatch(duplicateAgent(agent.id)).unwrap();
        toast.success(`Duplicated "${agent.name}"`, {
          action: toastDoor("agent", newAgentId),
        });
        refresh();
      } catch (err) {
        toast.error("Could not duplicate agent", {
          description: err instanceof Error ? err.message : undefined,
        });
      } finally {
        setIsDuplicating(false);
      }
    },
    [dispatch, refresh],
  );

  const remove = useCallback(
    async (agent: AgentBrowseRow) => {
      const ok = await confirm({
        title: `Delete "${agent.name}"?`,
        description:
          "This permanently removes the agent and its versions. This cannot be undone.",
        variant: "destructive",
        confirmLabel: "Delete",
      });
      if (!ok) return;
      setIsDeleting(true);
      try {
        await dispatch(deleteAgent(agent.id)).unwrap();
        removeRow(agent.id);
        toast.success(`Deleted "${agent.name}"`);
        setActionAgent(null);
      } catch (err) {
        toast.error("Could not delete agent", {
          description: err instanceof Error ? err.message : undefined,
        });
      } finally {
        setIsDeleting(false);
      }
    },
    [dispatch, removeRow],
  );

  const menuFor = useCallback(
    (agent: AgentBrowseRow) => () =>
      buildAgentMenu({
        agent,
        isSuperAdmin,

        onRun: () => runAgent(agent),
        onEdit: () => editAgent(agent),
        onView: () => viewAgent(agent),
        onPeek: () => setPeekAgentId(agent.id),
        onVersions: () => router.push(`/agents/${agent.id}/v/${agent.version}`),
        onEditDetails: () =>
          dispatch(
            openOverlay({
              overlayId: "agentAdvancedEditorWindow",
              data: { initialAgentId: agent.id, initialTab: "overview" },
            }),
          ),

        onDuplicate: () => void duplicate(agent),

        onShare: () => setShareAgent(agent),
        onAddToSet: () => setAddToSetAgent(agent),
        onRename: () => setRenameAgent(agent),

        onToggleFavorite: () => toggleFavorite(agent),

        onToggleArchived: () =>
          void saveField(
            agent,
            "isArchived",
            { is_archived: !agent.is_archived },
            { is_archived: agent.is_archived },
            "Could not update archive state",
          ),

        onCopyLink: () => {
          const url = `${window.location.origin}/agents/${agent.id}/run`;
          void navigator.clipboard.writeText(url);
          toast.success("Link copied");
        },

        onCopyForAgent: () => {
          void navigator.clipboard.writeText(
            buildRecordReferenceFence({
              type: "agent",
              id: agent.id,
              label: agent.name,
            }),
          );
          toast.success("Agent reference copied");
        },

        onDelete: () => void remove(agent),
      }),
    [
      dispatch,
      duplicate,
      editAgent,
      isSuperAdmin,
      remove,
      router,
      runAgent,
      saveField,
      toggleFavorite,
      viewAgent,
    ],
  );

  const openActionModal = useCallback((agent: AgentBrowseRow) => {
    setActionAgent(agent);
  }, []);

  const closeActionModal = useCallback(() => {
    setActionAgent(null);
  }, []);

  const actionModal = useMemo(() => {
    const agent = actionAgent;
    return {
      onRun: () => {
        if (!agent) return;
        runAgent(agent);
        setActionAgent(null);
      },
      onEdit: () => {
        if (!agent) return;
        editAgent(agent);
        setActionAgent(null);
      },
      onView: () => {
        if (!agent) return;
        viewAgent(agent);
        setActionAgent(null);
      },
      onDuplicate: () => {
        if (!agent) return;
        void duplicate(agent);
      },
      onShare: () => {
        if (!agent) return;
        setShareAgent(agent);
        // Keep the action modal open until share closes? Classic closes
        // everything except share — AgentActionModal itself skips close on share.
      },
      onDelete: () => {
        if (!agent) return;
        void remove(agent);
      },
      onCreateApp: () => {
        void announceComingSoon("agents.create-app");
      },
      isDeleting,
      isDuplicating,
    };
  }, [
    actionAgent,
    duplicate,
    editAgent,
    isDeleting,
    isDuplicating,
    remove,
    runAgent,
    viewAgent,
  ]);

  return useMemo(
    () => ({
      menuFor,
      toggleFavorite,
      renameTo,
      openActionModal,
      closeActionModal,
      actionAgent,
      actionModal,
      peekAgentId,
      closePeek: () => setPeekAgentId(null),
      shareAgent,
      closeShare: () => setShareAgent(null),
      addToSetAgent,
      closeAddToSet: () => setAddToSetAgent(null),
      renameAgent,
      closeRename: () => setRenameAgent(null),
      commitRename,
    }),
    [
      menuFor,
      toggleFavorite,
      renameTo,
      openActionModal,
      closeActionModal,
      actionAgent,
      actionModal,
      peekAgentId,
      shareAgent,
      addToSetAgent,
      renameAgent,
      commitRename,
    ],
  );
}
