"use client";

/**
 * Owner-only Trash for library documents (Wave A soft-delete, Decision 5).
 *
 * Lists the caller's soft-deleted processed documents via
 * `rag.fn_list_library_trash` (SECURITY DEFINER, owner-scoped). Two row
 * flavors:
 *   - individually trashed (no `deleted_via`): Restore + Purge per document
 *     (`fn_restore_library_document` / `fn_purge_library_document`).
 *   - file-cascade trashed (`deleted_via='file_cascade'`): the family
 *     restores TOGETHER via the file — Restore here calls the cloud-files
 *     `restore_file` RPC, and the DB trigger brings back the whole family
 *     (docs + chunks + memberships) atomically.
 *
 * Purge is the ONLY hard-delete path in the system and works exclusively on
 * rows that are already in the trash (the lifecycle invariant).
 */

import { ReadFailure } from "@ai-matrx/design-system";
import { useCallback, useEffect, useState } from "react";
import {
  ArchiveRestore,
  FileText,
  Loader2,
  Trash2,
} from "lucide-react";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@ai-matrx/design-system";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@ai-matrx/design-system";
import { toast } from "@/lib/toast";
import { confirm } from "@/components/dialogs/confirm/ConfirmDialogHost";
import { restoreFileDirect } from "@/features/files/api/direct";
import { supabase } from "@/utils/supabase/client";
import { ragDb } from "@/utils/supabase/ragDb";
import { RAG_VOCAB } from "@/features/rag/constants/vocabulary";
import {
  groupTrashRows,
  piecesWords,
  type TrashGroup,
  type TrashRow,
} from "@/features/rag/components/library/trashGroups";

interface LibraryTrashSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Called after any restore/purge so the live list can refresh. */
  onMutated?: () => void;
}

export function LibraryTrashSheet({
  open,
  onOpenChange,
  onMutated,
}: LibraryTrashSheetProps) {
  const [rows, setRows] = useState<TrashRow[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = useCallback(async () => {
    const { data, error } = await ragDb(supabase).rpc("fn_list_library_trash");
    if (error) {
      setLoadError(`Failed to load trash: ${error.message}`);
      setRows([]);
      return;
    }
    setLoadError(null);
    setRows((data ?? []) as unknown as TrashRow[]);
  }, []);

  useEffect(() => {
    if (open) {
      setRows(null);
      void load();
    }
  }, [open, load]);

  const finishMutation = useCallback(async () => {
    await load();
    onMutated?.();
  }, [load, onMutated]);

  const handleRestore = async (row: TrashRow) => {
    setBusyId(row.id);
    try {
      if (row.deleted_via === "file_cascade") {
        // Family restore rides the file — the DB cascade trigger brings the
        // docs + chunks + memberships back in one transaction.
        await restoreFileDirect(row.source_id);
        toast.success(
          `Restored "${row.file_name ?? row.name ?? "file"}" and its documents`,
        );
      } else {
        const { error } = await ragDb(supabase).rpc(
          "fn_restore_library_document",
          { p_id: row.id },
        );
        if (error) {
          throw new Error(
            "We couldn't restore this document. You may not be allowed to restore it.",
          );
        }
        toast.success(`Restored "${row.name ?? "document"}"`);
      }
      await finishMutation();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Restore failed");
    } finally {
      setBusyId(null);
    }
  };

  const handlePurge = async (group: TrashGroup) => {
    const row = group.head;
    const proceed = await confirm({
      title: `Permanently delete "${row.name ?? "document"}"?`,
      description: `Erases ${group.versions > 1 ? `all ${group.versions} versions of this Source` : "the document"}, its pages, ${RAG_VOCAB.segmentsShort.toLowerCase()}, and embeddings forever. This cannot be undone.`,
      variant: "destructive",
      confirmLabel: "Delete forever",
    });
    if (!proceed) return;
    setBusyId(row.id);
    try {
      // Children before parents: a person's edits, then recaptures, then the first capture.
      const order = (id: string) => {
        const kind = rows?.find((r) => r.id === id)?.derivation_kind;
        return kind === "manual_curation" ? 0 : kind === "recapture" ? 1 : 2;
      };
      const ids = [...group.ids].sort((a, b) => order(a) - order(b));
      for (const [i, id] of ids.entries()) {
        const { error } = await ragDb(supabase).rpc("fn_purge_library_document", {
          p_id: id,
        });
        if (error) {
          throw new Error(
            i === 0
              ? "We couldn't permanently delete this document. You may not be allowed to delete it."
              : `${i} of ${ids.length} versions were deleted forever; the rest could not be. You may not be allowed to delete them.`,
          );
        }
      }
      toast.success(`Permanently deleted "${row.name ?? "document"}"`);
      await finishMutation();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Purge failed");
    } finally {
      setBusyId(null);
    }
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full sm:max-w-xl flex flex-col">
        <SheetHeader>
          <SheetTitle className="flex items-center gap-2">
            <Trash2 className="h-4 w-4" />
            Library trash
          </SheetTitle>
          <SheetDescription>
            Trashed documents stay restorable until purged. Documents trashed
            with their file restore together as a family.
          </SheetDescription>
        </SheetHeader>

        <div className="flex-1 overflow-y-auto mt-2 pr-1">
          {rows === null ? (
            <div className="space-y-2">
              {[0, 1, 2].map((i) => (
                <Skeleton key={i} className="h-14 w-full" />
              ))}
            </div>
          ) : loadError ? (
            <ReadFailure error={loadError} what="Trash" onRetry={() => void load()} />
          ) : rows.length === 0 ? (
            <div className="type-body text-muted-foreground py-10 text-center">
              Trash is empty.
            </div>
          ) : (
            <ul className="space-y-1.5">
              {groupTrashRows(rows).map((group) => {
                const row = group.head;
                const busy = busyId === row.id;
                const isFamily = row.deleted_via === "file_cascade";
                return (
                  <li
                    key={group.key}
                    className="flex items-center gap-2 rounded-md border border-border bg-card px-2.5 py-2"
                  >
                    <FileText className="h-4 w-4 shrink-0 text-muted-foreground" />
                    <div className="min-w-0 flex-1">
                      <div className="truncate type-body text-foreground">
                        {row.name ?? row.file_name ?? row.id}
                      </div>
                      <div className="flex items-center gap-1.5 type-meta text-muted-foreground">
                        <span>
                          {new Date(row.deleted_at).toLocaleString()}
                        </span>
                        <span>·</span>
                        {group.versions > 1 ? (
                          <>
                            <span>{group.versions} versions</span>
                            <span>·</span>
                          </>
                        ) : null}
                        <span>{piecesWords(group.hiddenChunks)}</span>
                        {isFamily && (
                          <Badge
                            variant="outline"
                            className="h-4 px-1 text-[10px]"
                          >
                            with file
                          </Badge>
                        )}
                      </div>
                    </div>
                    <Button
                      icon={busy ? (
                        <Loader2 className="animate-spin" />
                      ) : (
                        <ArchiveRestore />
                      )}
                      variant="outline"
                      disabled={busy}
                      onClick={() => handleRestore(row)}
                    >
                      {isFamily ? "Restore file" : "Restore"}
                    </Button>
                    {!isFamily && (
                      // Family rows purge together via the file — the RPC
                      // rejects per-doc purge for them, so no button.
                      <Button
                        icon={<Trash2 />}
                        variant="quiet"
                        disabled={busy}
                        onClick={() => handlePurge(group)}
                      >
                        Purge
                      </Button>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}
