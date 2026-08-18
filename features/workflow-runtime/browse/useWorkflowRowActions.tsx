"use client";

// features/workflow-runtime/browse/useWorkflowRowActions.tsx
//
// Binds the workflow action registry to real behaviour, and owns the modals
// those actions open. One instance per page — the modals are singletons keyed
// by the workflow currently acted on, never one modal per row (that mistake put
// 372 mounted ShareModals on /agents/all).
//
// Row click goes straight to `/workflows/[id]` — running it is the primary
// verb, and a chooser modal in front of a two-destination record is a click
// tax. The kebab carries the FULL action list, same handlers, one code path.

import { useCallback, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "@/lib/toast";
import { toastDoor } from "@/components/official/entity-ref/toastDoor";
import { confirm } from "@/components/dialogs/confirm/ConfirmDialogHost";
import { buildRecordReferenceFence } from "@/features/matrx-envelope/recordReference";
import type { ItemMenuConfig } from "@/components/official/item/types";
import {
  buildWorkflowMenu,
  workflowDesignHref,
  workflowRunHref,
} from "./workflowActionRegistry";
import {
  deleteWorkflow,
  duplicateWorkflow,
  setWorkflowFlag,
} from "./service";
import type { WorkflowBrowseRow } from "./types";

export interface WorkflowRowActionsHost {
  /** Build the full menu for one row. Lazy — pass straight to ItemMenu/ItemRow. */
  menuFor: (row: WorkflowBrowseRow) => () => ItemMenuConfig;
  /** The card star and the menu entry call THIS, so they cannot drift. */
  toggleFavorite: (row: WorkflowBrowseRow) => void;
  /** Whole-row click. */
  openRow: (row: WorkflowBrowseRow) => void;
  /** Modal state the page must render. */
  shareWorkflow: WorkflowBrowseRow | null;
  closeShare: () => void;
  renameWorkflow: WorkflowBrowseRow | null;
  closeRename: () => void;
  commitRename: (next: string) => Promise<void>;
}

export interface UseWorkflowRowActionsArgs {
  /** Optimistically patch a row in the caller's list. */
  patchRow: (id: string, patch: Partial<WorkflowBrowseRow>) => void;
  /** Drop a row from the caller's list after a confirmed delete. */
  removeRow: (id: string) => void;
  /** Re-run the query (after a duplicate creates a new row). */
  refresh: () => void;
}

export function useWorkflowRowActions({
  patchRow,
  removeRow,
  refresh,
}: UseWorkflowRowActionsArgs): WorkflowRowActionsHost {
  const router = useRouter();
  const [shareWorkflow, setShareWorkflow] = useState<WorkflowBrowseRow | null>(
    null,
  );
  const [renameWorkflow, setRenameWorkflow] =
    useState<WorkflowBrowseRow | null>(null);

  /**
   * Optimistic single-field write with our own revert. This surface holds its
   * own rows rather than hydrating every workflow into Redux, so the local
   * patch IS the state that has to be rolled back on failure.
   */
  const saveFlag = useCallback(
    async (
      row: WorkflowBrowseRow,
      rowPatch: Partial<WorkflowBrowseRow>,
      dbPatch: Parameters<typeof setWorkflowFlag>[1],
      revert: Partial<WorkflowBrowseRow>,
      failureMessage: string,
    ) => {
      patchRow(row.id, rowPatch);
      try {
        await setWorkflowFlag(row.id, dbPatch);
      } catch (err) {
        patchRow(row.id, revert);
        toast.error(failureMessage, {
          description: err instanceof Error ? err.message : undefined,
        });
      }
    },
    [patchRow],
  );

  const toggleFavorite = useCallback(
    (row: WorkflowBrowseRow) => {
      void saveFlag(
        row,
        { is_favorite: !row.is_favorite },
        { is_favorite: !row.is_favorite },
        { is_favorite: row.is_favorite },
        "Could not update favorite",
      );
    },
    [saveFlag],
  );

  const renameTo = useCallback(
    async (row: WorkflowBrowseRow, next: string) => {
      const trimmed = next.trim();
      if (!trimmed || trimmed === row.name) return;
      await saveFlag(
        row,
        { name: trimmed },
        { name: trimmed },
        { name: row.name },
        "Could not rename workflow",
      );
    },
    [saveFlag],
  );

  const commitRename = useCallback(
    async (next: string) => {
      const row = renameWorkflow;
      if (!row) return;
      setRenameWorkflow(null);
      await renameTo(row, next);
    },
    [renameWorkflow, renameTo],
  );

  const duplicate = useCallback(
    async (row: WorkflowBrowseRow) => {
      try {
        const copy = await duplicateWorkflow(row.id);
        // A duplicate the user cannot reach is a dead end — the toast carries
        // the door to the copy that was just made.
        toast.success(`Duplicated "${row.name}"`, {
          action: toastDoor("workflow", copy.id),
        });
        refresh();
      } catch (err) {
        toast.error("Could not duplicate workflow", {
          description: err instanceof Error ? err.message : undefined,
        });
      }
    },
    [refresh],
  );

  const remove = useCallback(
    async (row: WorkflowBrowseRow) => {
      const runNote =
        Number(row.run_count ?? 0) > 0
          ? ` Its ${row.run_count} past ${Number(row.run_count) === 1 ? "run stays" : "runs stay"} readable.`
          : "";
      const ok = await confirm({
        title: `Delete "${row.name}"?`,
        description: `This moves the workflow to the trash and removes it from your lists.${runNote}`,
        variant: "destructive",
        confirmLabel: "Delete",
      });
      if (!ok) return;
      try {
        await deleteWorkflow(row.id);
        removeRow(row.id);
        toast.success(`Deleted "${row.name}"`);
      } catch (err) {
        toast.error("Could not delete workflow", {
          description: err instanceof Error ? err.message : undefined,
        });
      }
    },
    [removeRow],
  );

  const openRow = useCallback(
    (row: WorkflowBrowseRow) => router.push(workflowRunHref(row.id)),
    [router],
  );

  const menuFor = useCallback(
    (row: WorkflowBrowseRow) => () =>
      buildWorkflowMenu({
        workflow: row,

        onRun: () => router.push(workflowRunHref(row.id)),
        onDesign: () => router.push(workflowDesignHref(row.id)),

        onDuplicate: () => void duplicate(row),
        onShare: () => setShareWorkflow(row),
        onRename: () => setRenameWorkflow(row),
        onToggleFavorite: () => toggleFavorite(row),

        onToggleArchived: () =>
          void saveFlag(
            row,
            { is_archived: !row.is_archived },
            { is_archived: !row.is_archived },
            { is_archived: row.is_archived },
            "Could not update archive state",
          ),

        onCopyLink: () => {
          const url = `${window.location.origin}${workflowRunHref(row.id)}`;
          void navigator.clipboard.writeText(url);
          toast.success("Link copied");
        },

        onCopyForAgent: () => {
          void navigator.clipboard.writeText(
            buildRecordReferenceFence({
              type: "workflow",
              id: row.id,
              label: row.name,
            }),
          );
          toast.success("Workflow reference copied");
        },

        onDelete: () => void remove(row),
      }),
    [duplicate, remove, router, saveFlag, toggleFavorite],
  );

  return useMemo(
    () => ({
      menuFor,
      toggleFavorite,
      openRow,
      shareWorkflow,
      closeShare: () => setShareWorkflow(null),
      renameWorkflow,
      closeRename: () => setRenameWorkflow(null),
      commitRename,
    }),
    [menuFor, toggleFavorite, openRow, shareWorkflow, renameWorkflow, commitRename],
  );
}
