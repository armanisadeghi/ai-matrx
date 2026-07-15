"use client";

/**
 * When a cloud file is renamed outside the studio toolbar (e.g. F2 /
 * RenameDialog from the files-route menu on a sidebar row), mirror the
 * new name onto every linked `processed_documents` row.
 */

import { useEffect, useRef } from "react";
import { useAppSelector } from "@/lib/redux/hooks";
import { selectAllFilesMap } from "@/features/files/redux/selectors";
import { supabase } from "@/utils/supabase/client";
import { docprocDb } from "@/utils/supabase/docprocDb";
import type { StudioDocSummary } from "./usePdfStudioDocs";

export function useSyncStudioDocNames(
  docs: StudioDocSummary[],
  refresh: () => void,
): void {
  const filesById = useAppSelector(selectAllFilesMap);
  const syncingRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    let cancelled = false;

    for (const doc of docs) {
      if (doc.sourceKind !== "cld_file" || !doc.sourceId) continue;
      const file = filesById[doc.sourceId];
      if (!file || file.fileName === doc.name) continue;
      if (syncingRef.current.has(doc.id)) continue;

      syncingRef.current.add(doc.id);
      void docprocDb(supabase)
        .from("processed_documents")
        .update({ name: file.fileName })
        .eq("id", doc.id)
        .then(({ error }) => {
          syncingRef.current.delete(doc.id);
          if (cancelled || error) return;
          refresh();
        });
    }

    return () => {
      cancelled = true;
    };
  }, [docs, filesById, refresh]);
}
