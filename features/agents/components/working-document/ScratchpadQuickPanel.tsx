"use client";

/**
 * ScratchpadQuickPanel — the global scratchpad, one click from every page.
 *
 * Rendered by the `scratchpadPanel` overlay (a non-blocking right
 * SidePanelSurface opened from the Quick Actions menu). No fanfare: a slim
 * switcher row (pick / new / delete the pool's scratchpads — one is ALWAYS
 * active and follows the user into every conversation's agent context) over
 * the shared `WorkingDocumentPanel` editor bound to the active scratchpad's
 * `sp:<id>` scope. Rows materialize on the first byte of content; versions
 * live in `history.row_versions` via the panel's History view.
 */

import { useCallback, useEffect, useState } from "react";
import { Check, ChevronDown, NotebookPen, Plus, Trash2 } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { cn } from "@/lib/utils";
import { useAppDispatch, useAppSelector, useAppStore } from "@/lib/redux/hooks";
import { scratchScopeId } from "@/features/agents/redux/execution-system/instance-working-document/instance-working-document.slice";
import {
  selectActiveScratchpadId,
  selectWorkingDocTitle,
} from "@/features/agents/redux/execution-system/instance-working-document/instance-working-document.selectors";
import {
  createScratchpadThunk,
  deleteScratchpadThunk,
  hydrateActiveScratchpadThunk,
  setActiveScratchpadThunk,
} from "@/features/agents/redux/execution-system/instance-working-document/scratchpad.thunks";
import {
  listUserDocuments,
  type CxWorkingDocument,
} from "@/features/agents/redux/execution-system/instance-working-document/cx-working-document.service";
import { WorkingDocumentPanel } from "./WorkingDocumentPanel";

export function ScratchpadQuickPanel({ className }: { className?: string }) {
  const dispatch = useAppDispatch();
  const store = useAppStore();
  const activeId = useAppSelector(selectActiveScratchpadId);
  const activeScope = activeId ? scratchScopeId(activeId) : null;
  const activeTitle = useAppSelector(
    selectWorkingDocTitle(activeScope ?? "sp:none", "scratch"),
  );

  const [pool, setPool] = useState<CxWorkingDocument[] | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);

  // Always hydrate on open (cheap + deduped; a fresh page load has the pointer
  // but no loaded entry), then ensure one active scratchpad exists.
  useEffect(() => {
    let cancelled = false;
    void dispatch(hydrateActiveScratchpadThunk())
      .then(() => {
        if (cancelled) return;
        if (!selectActiveScratchpadId(store.getState())) {
          void dispatch(createScratchpadThunk());
        }
      })
      .catch((err: unknown) => {
        console.error("[scratchpad-panel] resolve failed", err);
      });
    return () => {
      cancelled = true;
    };
  }, [dispatch, store]);

  const loadPool = useCallback(() => {
    void listUserDocuments("scratch")
      .then(setPool)
      .catch((err: unknown) => {
        console.error("[scratchpad-panel] pool list failed", err);
        setPool([]);
      });
  }, []);

  const handleDelete = useCallback(() => {
    if (!activeId) return;
    setDeleting(true);
    void dispatch(deleteScratchpadThunk({ documentId: activeId }))
      .unwrap()
      .catch((err: unknown) => {
        console.error("[scratchpad-panel] delete failed", err);
      })
      .finally(() => {
        setDeleting(false);
        setConfirmDelete(false);
      });
  }, [dispatch, activeId]);

  return (
    <div className={cn("flex h-full min-h-0 flex-col", className)}>
      {/* Switcher row — pick / new / delete. The picked one becomes ACTIVE
          (it is what every conversation's agent context receives). */}
      <div className="flex shrink-0 items-center gap-1.5 border-b border-border px-2 py-1.5">
        <DropdownMenu onOpenChange={(open) => open && loadPool()}>
          <DropdownMenuTrigger asChild>
            <button
              type="button"
              className="flex min-w-0 flex-1 items-center gap-1.5 rounded-md px-1.5 py-1 text-left text-sm font-medium text-foreground transition-colors hover:bg-accent"
            >
              <NotebookPen className="h-4 w-4 shrink-0 text-muted-foreground" />
              <span className="min-w-0 flex-1 truncate">
                {activeTitle?.trim() || "Scratchpad"}
              </span>
              <ChevronDown className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="w-64">
            {(pool ?? []).map((doc) => (
              <DropdownMenuItem
                key={doc.id}
                onSelect={() =>
                  void dispatch(
                    setActiveScratchpadThunk({ documentId: doc.id }),
                  )
                }
                className="gap-2"
              >
                <span className="min-w-0 flex-1 truncate">
                  {doc.title?.trim() || "Untitled scratchpad"}
                </span>
                {doc.id === activeId && (
                  <Check className="h-3.5 w-3.5 shrink-0 text-primary" />
                )}
              </DropdownMenuItem>
            ))}
            {pool !== null && pool.length === 0 && (
              <div className="px-2 py-2 text-xs text-muted-foreground">
                No saved scratchpads yet
              </div>
            )}
            <DropdownMenuSeparator />
            <DropdownMenuItem
              onSelect={() => void dispatch(createScratchpadThunk())}
              className="gap-2"
            >
              <Plus className="h-3.5 w-3.5" />
              New scratchpad
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
        <button
          type="button"
          onClick={() => setConfirmDelete(true)}
          disabled={!activeId}
          aria-label="Delete this scratchpad"
          title="Delete this scratchpad"
          className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-accent hover:text-destructive disabled:opacity-50"
        >
          <Trash2 className="h-3.5 w-3.5" />
        </button>
      </div>

      <div className="min-h-0 flex-1">
        {activeScope ? (
          <WorkingDocumentPanel
            conversationId={activeScope}
            kind="scratch"
            showHeader
            showHeaderTitle={false}
            showOpenInWindow={false}
            className="h-full"
          />
        ) : (
          <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
            Preparing your scratchpad…
          </div>
        )}
      </div>

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
    </div>
  );
}
