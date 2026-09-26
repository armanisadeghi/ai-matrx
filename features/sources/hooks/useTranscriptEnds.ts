"use client";

/**
 * features/sources/hooks/useTranscriptEnds.ts
 *
 * A transcript Source's length is a fact it holds: the last segment's end
 * (`processed_document_pages.locator.t1_ms` on page `total_pages - 1`). Read
 * direct from Supabase under RLS, one small batched query per 25 transcripts,
 * only for transcript rows. A row whose read fails or has no `t1_ms` simply
 * has no entry — the cell then shows the segment count alone, never a guess.
 */

import { useEffect, useState } from "react";
import { supabase } from "@/utils/supabase/client";
import {
  transcriptSegmentCount,
  type SourceListRow,
} from "@/features/sources/sourceRows";

const BATCH = 25;

export function useTranscriptEnds(
  rows: readonly Pick<SourceListRow, "id" | "source_kind" | "total_pages">[],
): Map<string, number> {
  const wanted = rows
    .map((r) => ({ id: r.id, segments: transcriptSegmentCount(r) }))
    .filter((r): r is { id: string; segments: number } => r.segments !== null);
  const key = wanted.map((w) => `${w.id}:${w.segments}`).join(",");
  const [ends, setEnds] = useState<Map<string, number>>(new Map());

  useEffect(() => {
    if (!key) return undefined;
    let cancelled = false;
    const items = key.split(",").map((pair) => {
      const [id, segments] = pair.split(":");
      return { id, lastIndex: Number(segments) - 1 };
    });
    void (async () => {
      const found = new Map<string, number>();
      for (let i = 0; i < items.length; i += BATCH) {
        const batch = items.slice(i, i + BATCH);
        const { data, error } = await supabase
          .schema("docproc")
          .from("processed_document_pages")
          .select("processed_document_id,locator")
          .or(
            batch
              .map(
                (b) =>
                  `and(processed_document_id.eq.${b.id},page_index.eq.${b.lastIndex})`,
              )
              .join(","),
          );
        if (cancelled) return;
        if (error) continue;
        for (const row of (data ?? []) as {
          processed_document_id: string;
          locator: unknown;
        }[]) {
          const t1 =
            row.locator && typeof row.locator === "object"
              ? (row.locator as Record<string, unknown>).t1_ms
              : null;
          if (typeof t1 === "number" && t1 > 0)
            found.set(row.processed_document_id, t1);
        }
      }
      if (!cancelled) setEnds(found);
    })();
    return () => {
      cancelled = true;
    };
  }, [key]);

  return ends;
}
