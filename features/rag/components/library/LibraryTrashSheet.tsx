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
} from "@/components/ui/sheet";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "sonner";
import { confirm } from "@/components/dialogs/confirm/ConfirmDialogHost";
import { restoreFileDirect } from "@/features/files/api/direct";
import { supabase } from "@/utils/supabase/client";
import { ragDb } from "@/utils/supabase/ragDb";
import { RAG_VOCAB } from "@/features/rag/constants/vocabulary";

interface TrashRow {
  id: string;
  name: string | null;
  source_kind: string;
  source_id: string;
  derivation_kind: string;
  total_pages: number | null;
  deleted_at: string;
  deleted_via: string | null;
  file_name: string | null;
  hidden_chunks: number;
}

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
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = useCallback(async () => {
    const { data, error } = await ragDb(supabase).rpc("fn_list_library_trash");
    if (error) {
      toast.error(`Failed to load trash: ${error.message}`);
      setRows([]);
      return;
    }
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
        if (error) throw new Error(error.message);
        toast.success(`Restored "${row.name ?? "document"}"`);
      }
      await finishMutation();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Restore failed");
    } finally {
      setBusyId(null);
    }
  };

  const handlePurge = async (row: TrashRow) => {
    const proceed = await confirm({
      title: `Permanently delete "${row.name ?? "document"}"?`,
      description: `Erases the document, its pages, ${RAG_VOCAB.segmentsShort.toLowerCase()}, and embeddings forever. This cannot be undone.`,
      variant: "destructive",
      confirmLabel: "Delete forever",
    });
    if (!proceed) return;
    setBusyId(row.id);
    try {
      const { error } = await ragDb(supabase).rpc("fn_purge_library_document", {
        p_id: row.id,
      });
      if (error) throw new Error(error.message);
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
          ) : rows.length === 0 ? (
            <div className="text-sm text-muted-foreground py-10 text-center">
              Trash is empty.
            </div>
          ) : (
            <ul className="space-y-1.5">
              {rows.map((row) => {
                const busy = busyId === row.id;
                const isFamily = row.deleted_via === "file_cascade";
                return (
                  <li
                    key={row.id}
                    className="flex items-center gap-2 rounded-md border border-border bg-card px-2.5 py-2"
                  >
                    <FileText className="h-4 w-4 shrink-0 text-muted-foreground" />
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-sm text-foreground">
                        {row.name ?? row.file_name ?? row.id}
                      </div>
                      <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
                        <span>
                          {new Date(row.deleted_at).toLocaleString()}
                        </span>
                        <span>·</span>
                        <span>
                          {row.hidden_chunks}{" "}
                          {RAG_VOCAB.segmentsShort.toLowerCase()}
                        </span>
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
                      size="sm"
                      variant="outline"
                      className="h-7 gap-1 px-2 text-xs"
                      disabled={busy}
                      onClick={() => handleRestore(row)}
                    >
                      {busy ? (
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      ) : (
                        <ArchiveRestore className="h-3.5 w-3.5" />
                      )}
                      {isFamily ? "Restore file" : "Restore"}
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-7 gap-1 px-2 text-xs text-destructive hover:text-destructive"
                      disabled={busy}
                      onClick={() => handlePurge(row)}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                      Purge
                    </Button>
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
