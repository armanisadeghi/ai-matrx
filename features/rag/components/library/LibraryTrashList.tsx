"use client";

/**
 * The Source trash as a list — the Knowledge hub's Trash view (KNOWLEDGE-HUB
 * §8 H6a; it replaced the Sources page's Trash sheet). One item per Source
 * (`groupTrashRows`); Restore and Purge go through the same doors the sheet
 * used (`libraryTrash.ts`). Delete means archive: the trash only restores —
 * there is no erase control (retention is a data-lifecycle policy).
 */

import { ErrorAlchemyMenu } from "@/components/errors/ErrorAlchemyMenu";
import { useCallback, useEffect, useState } from "react";
import { ArchiveRestore, FileText, Loader2, RotateCw } from "lucide-react";
import { Skeleton } from "@ai-matrx/design-system";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { toast } from "@/lib/toast";
import { restoreFileDirect } from "@/features/files/api/direct";
import { supabase } from "@/utils/supabase/client";
import { ragDb } from "@/utils/supabase/ragDb";
import { groupTrashRows, piecesWords, type TrashRow } from "@/features/rag/components/library/trashGroups";
import {
  listTrash,
  restoreTrashRow,
  type TrashDoors,
} from "@/features/rag/components/library/libraryTrash";

const liveDoors: TrashDoors = {
  rpc: (fn, args) => ragDb(supabase).rpc(fn as never, args as never) as never,
  restoreFile: restoreFileDirect,
};

export function LibraryTrashList({
  filterText,
  onMutated,
  doors = liveDoors,
}: {
  /** Words from the hub's search box narrow the list by name. */
  filterText?: string;
  onMutated?: () => void;
  doors?: TrashDoors;
}) {
  const [rows, setRows] = useState<TrashRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      setRows(await listTrash(doors));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Your trash could not be read.");
      setRows([]);
    }
  }, [doors]);

  useEffect(() => {
    void load();
  }, [load]);

  const after = async () => {
    await load();
    onMutated?.();
  };

  const restore = async (row: TrashRow) => {
    setBusyId(row.id);
    try {
      toast.success(await restoreTrashRow(row, doors));
      await after();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Restore failed.");
    } finally {
      setBusyId(null);
    }
  };

  const words = (filterText ?? "").trim().toLowerCase();
  const groups = groupTrashRows(rows ?? []).filter(
    (g) => !words || `${g.head.name ?? ""} ${g.head.file_name ?? ""}`.toLowerCase().includes(words),
  );

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-2" data-testid="hub-trash">
      <p className="px-2 text-xs text-muted-foreground">
        Sources you moved to the trash stay restorable. Documents trashed with their file
        come back together with the file.
      </p>
      {error ? (
        <div className="flex flex-wrap items-center gap-2 rounded-md border border-destructive/30 bg-destructive/5 px-2.5 py-2 text-xs">
          <span className="min-w-0 flex-1 text-destructive">
            {error}
            <ErrorAlchemyMenu error={error} size="xs" />
          </span>
          <button type="button" onClick={() => void load()} className="inline-flex items-center gap-1 rounded px-1.5 py-0.5 hover:bg-accent">
            <RotateCw className="h-3 w-3" /> Try again
          </button>
        </div>
      ) : null}
      {rows === null ? (
        <div className="space-y-2 px-2" role="status" aria-label="Reading your trash">
          {[0, 1, 2].map((i) => (
            <Skeleton key={i} className="h-12 w-full" />
          ))}
        </div>
      ) : !error && groups.length === 0 ? (
        <p className="px-2 py-6 text-sm text-muted-foreground">
          {words ? `Nothing in the trash matches "${filterText?.trim()}".` : "The trash is empty."}
        </p>
      ) : (
        <ul className="min-h-0 flex-1 space-y-1.5 overflow-y-auto px-1">
          {groups.map((group) => {
            const row = group.head;
            const busy = busyId === row.id;
            const family = row.deleted_via === "file_cascade";
            return (
              <li key={group.key} className="flex items-center gap-2 rounded-md border border-border bg-card px-2.5 py-2" data-trash-row={row.id}>
                <FileText className="h-4 w-4 shrink-0 text-muted-foreground" />
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm">{row.name ?? row.file_name ?? row.id}</div>
                  <div className="flex flex-wrap items-center gap-1.5 text-[11px] text-muted-foreground">
                    <span>Trashed {new Date(row.deleted_at).toLocaleString()}</span>
                    <span>·</span>
                    {group.versions > 1 ? (
                      <>
                        <span>{group.versions} versions</span>
                        <span>·</span>
                      </>
                    ) : null}
                    <span>{piecesWords(group.hiddenChunks)}</span>
                    {family ? (
                      <Badge variant="outline" className="h-4 px-1 text-[10px]">
                        with file
                      </Badge>
                    ) : null}
                  </div>
                </div>
                <Button size="sm" variant="outline" className="h-7 gap-1 px-2 text-xs" disabled={busy} onClick={() => void restore(row)}>
                  {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <ArchiveRestore className="h-3.5 w-3.5" />}
                  {family ? "Restore file" : "Restore"}
                </Button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
