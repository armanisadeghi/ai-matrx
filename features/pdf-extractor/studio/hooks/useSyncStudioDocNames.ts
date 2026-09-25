"use client";

/**
 * When a cloud file is renamed outside the studio toolbar (e.g. F2 /
 * RenameDialog from the files-route menu on a sidebar row), mirror the
 * new name onto the linked `processed_documents` rows that carried the old one.
 *
 * It reacts to a RENAME — a file's name changing while this screen watches —
 * never to a standing difference. A document may be named differently from its
 * file on purpose (one file, several extraction runs: "notes.txt (agent extract
 * run 0bdbf4b0)"); rewriting every such row on each load is what sent 366
 * PATCHes for 117 documents in 75 s on 2026-09-25 and overwrote those names.
 *
 * Each rename is attempted once. A failed write (a timeout included) is not
 * re-sent on the next render — tryWriteOne already tells the person — and one
 * refresh follows the whole batch, not one per document.
 */

import { useEffect, useRef } from "react";
import { useAppSelector } from "@/lib/redux/hooks";
import { selectAllFilesMap } from "@/features/files/redux/selectors";
import { supabase } from "@/utils/supabase/client";
import { docprocDb } from "@/utils/supabase/docprocDb";
import { tryWriteOne } from "@/utils/supabase/writeOne";
import type { StudioDocSummary } from "./usePdfStudioDocs";

export function useSyncStudioDocNames(
  docs: StudioDocSummary[],
  refresh: () => void,
): void {
  const filesById = useAppSelector(selectAllFilesMap);
  /** The last file name this screen saw, per cloud file id. */
  const seenNameRef = useRef<Map<string, string>>(new Map());
  /** `${docId}\u0000${targetName}` already attempted — never sent twice. */
  const attemptedRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    const seen = seenNameRef.current;
    const renamed = new Map<string, { from: string; to: string }>();
    for (const doc of docs) {
      if (doc.sourceKind !== "cld_file" || !doc.sourceId) continue;
      const file = filesById[doc.sourceId];
      if (!file) continue;
      const before = seen.get(doc.sourceId);
      if (before === undefined) {
        seen.set(doc.sourceId, file.fileName);
      } else if (before !== file.fileName) {
        renamed.set(doc.sourceId, { from: before, to: file.fileName });
        seen.set(doc.sourceId, file.fileName);
      }
    }
    if (renamed.size === 0) return;

    const writes: Array<Promise<boolean>> = [];
    for (const doc of docs) {
      const change = doc.sourceId ? renamed.get(doc.sourceId) : undefined;
      if (!change || doc.name !== change.from) continue;
      const key = `${doc.id}\u0000${change.to}`;
      if (attemptedRef.current.has(key)) continue;
      attemptedRef.current.add(key);
      writes.push(
        tryWriteOne(
          docprocDb(supabase)
            .from("processed_documents")
            .update({ name: change.to })
            .eq("id", doc.id)
            .select("id"),
          { action: "rename", noun: "document" },
        ).then(({ error }) => !error),
      );
    }
    if (writes.length === 0) return;
    void Promise.all(writes).then((landed) => {
      if (landed.some(Boolean)) refresh();
    });
  }, [docs, filesById, refresh]);
}
