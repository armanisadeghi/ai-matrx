"use client";

/**
 * The global scratchpad's pool switcher — every saved scratchpad (the active
 * one checked), New, and Delete (confirmed) — for a host's chrome (the
 * scratchpad canvas tab's header). The caller supplies the trigger button.
 * Kept apart from `ScratchpadQuickPanel` so the chrome never pulls the editor
 * into the bundle that registers it.
 */

import { toast } from "../../../host/notify";
import { useCallback, useState, type ReactNode } from "react";
import { Check, Loader2, NotebookPen, Plus, Trash2 } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@ai-matrx/design-system";
import { ConfirmDialog } from "@ai-matrx/chat/host/ui-slots";
import { cn } from "@ai-matrx/design-system";
import { useAppDispatch, useAppSelector } from "../../../store/hooks";
import { scratchScopeId } from "../../redux/execution-system/instance-working-document/instance-working-document.slice";
import {
  selectActiveScratchpadId,
  selectWorkingDocTitle,
} from "../../redux/execution-system/instance-working-document/instance-working-document.selectors";
import {
  createScratchpadThunk,
  deleteScratchpadThunk,
  setActiveScratchpadThunk,
} from "../../redux/execution-system/instance-working-document/scratchpad.thunks";
import {
  listUserDocuments,
  type CxWorkingDocument,
} from "../../redux/execution-system/instance-working-document/cx-working-document.service";
import { ReadFailure } from "@ai-matrx/chat/host/ui-slots";

/** A spinner that says what is loading (announced as a live status). */
export function LoadingLine({ message, small = false }: { message: string; small?: boolean }) {
  return (
    <span role="status" className={cn("inline-flex items-center gap-2 text-muted-foreground", small ? "text-xs" : "text-sm")}>
      <Loader2 className={cn("animate-spin opacity-60", small ? "h-3 w-3" : "h-4 w-4")} aria-hidden />
      {message}
    </span>
  );
}

/** The active scratchpad's title, for a host that names its tab after it. */
export function useActiveScratchpadTitle(): string | null {
  const activeId = useAppSelector(selectActiveScratchpadId);
  const activeScope = activeId ? scratchScopeId(activeId) : null;
  const title = useAppSelector(selectWorkingDocTitle(activeScope ?? "sp:none", "scratch"));
  return activeScope ? title?.trim() || null : null;
}

export function ScratchpadSwitcherMenu({ trigger }: { trigger: ReactNode }) {
  const dispatch = useAppDispatch();
  const activeId = useAppSelector(selectActiveScratchpadId);
  const [pool, setPool] = useState<CxWorkingDocument[] | null>(null);
  const [poolError, setPoolError] = useState<unknown>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const loadPool = useCallback(() => {
    void listUserDocuments("scratch")
      .then((rows) => {
        setPool(rows);
        setPoolError(null);
      })
      .catch((err: unknown) => {
        console.error("[scratchpad] pool list failed", err);
        setPoolError(err);
        setPool([]);
      });
  }, []);

  const handleDelete = useCallback(() => {
    if (!activeId) return;
    setDeleting(true);
    void dispatch(deleteScratchpadThunk({ documentId: activeId }))
      .unwrap()
      .catch((err: unknown) => {
        console.error("[scratchpad] delete failed", err);
        toast.error("Couldn't delete this scratchpad — it is still here.");
      })
      .finally(() => {
        setDeleting(false);
        setConfirmDelete(false);
      });
  }, [dispatch, activeId]);

  return (
    <>
      <DropdownMenu onOpenChange={(open) => open && loadPool()}>
        <DropdownMenuTrigger asChild>{trigger}</DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-64">
          {(pool ?? []).map((doc) => (
            <DropdownMenuItem
              key={doc.id}
              onSelect={() =>
                void dispatch(setActiveScratchpadThunk({ documentId: doc.id }))
                  .unwrap()
                  .catch(() =>
                    toast.error(`Couldn't open ${doc.title?.trim() || "that scratchpad"} — the read failed.`),
                  )
              }
              className="gap-2"
            >
              <NotebookPen className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
              <span className="min-w-0 flex-1 truncate">{doc.title?.trim() || "Untitled scratchpad"}</span>
              {doc.id === activeId && <Check className="h-3.5 w-3.5 shrink-0 text-primary" />}
            </DropdownMenuItem>
          ))}
          {poolError != null ? (
            <ReadFailure error={poolError} what="your saved scratchpads" onRetry={loadPool} size="compact" />
          ) : pool === null ? (
            <div className="px-2 py-2">
              <LoadingLine message="Loading scratchpads…" small />
            </div>
          ) : (
            pool.length === 0 && <div className="px-2 py-2 text-xs text-muted-foreground">No saved scratchpads yet</div>
          )}
          <DropdownMenuSeparator />
          <DropdownMenuItem onSelect={() => void dispatch(createScratchpadThunk())} className="gap-2">
            <Plus className="h-3.5 w-3.5" />
            New scratchpad
          </DropdownMenuItem>
          <DropdownMenuItem
            onSelect={() => setConfirmDelete(true)}
            disabled={!activeId}
            className="gap-2 text-destructive focus:text-destructive"
          >
            <Trash2 className="h-3.5 w-3.5" />
            Delete this scratchpad
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      <ConfirmDialog
        open={confirmDelete}
        onOpenChange={setConfirmDelete}
        title="Delete this scratchpad?"
        description="Its version history is kept, but it will no longer appear in your scratchpads or be sent to agents."
        confirmLabel="Delete"
        variant="destructive"
        busy={deleting}
        onConfirm={handleDelete}
      />
    </>
  );
}
