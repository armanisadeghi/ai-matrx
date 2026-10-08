"use client";

/**
 * features/sources/hooks/useTranscriptEnds.ts
 *
 * A transcript Source's length is a fact it holds: the last segment's end
 * (`processed_document_pages.locator.t1_ms` on page `total_pages - 1`). Read
 * direct from Supabase under RLS, one small batched query per 25 transcripts,
 * only for transcript rows. A row whose read fails or has no `t1_ms` simply
 * has no entry — the cell then shows the segment count alone, never a guess.
 *
 * ONE DURATION (V6-B, 2026-10-01): /transcripts shows `transcripts.duration_seconds` — the
 * recording's stored length, else the last segment's end. The library said the last segment's
 * end even when a stored length existed, so the two screens disagreed for recordings. The stored
 * length (`metadata.duration`, seconds) of the transcript the Source was landed from
 * (`source_id`) wins here too; the segment end stays the fallback.
 */

import { useEffect, useState } from "react";
import { supabase } from "@/utils/supabase/client";
import {
  transcriptSegmentCount,
  type SourceListRow,
} from "@/features/sources/sourceRows";
import { isUuidShape } from "@ai-matrx/kit/uuid";

const BATCH = 25;

export function useTranscriptEnds(
  rows: readonly Pick<SourceListRow, "id" | "source_kind" | "total_pages" | "source_id">[],
): Map<string, number> {
  const wanted = rows
    .map((r) => ({ id: r.id, segments: transcriptSegmentCount(r), transcriptId: r.source_id }))
    .filter((r): r is { id: string; segments: number; transcriptId: string } => r.segments !== null);
  const key = wanted.map((w) => `${w.id}:${w.segments}:${w.transcriptId}`).join(",");
  const [ends, setEnds] = useState<Map<string, number>>(new Map());

  useEffect(() => {
    if (!key) return undefined;
    let cancelled = false;
    const items = key.split(",").map((pair) => {
      const [id, segments, transcriptId] = pair.split(":");
      return { id, lastIndex: Number(segments) - 1, transcriptId };
    });
    void (async () => {
      const found = new Map<string, number>();
      const stored = await readStoredLengthsMs(items.map((i) => i.transcriptId));
      if (cancelled) return;
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
      for (const item of items) {
        const ms = stored.get(item.transcriptId);
        if (ms) found.set(item.id, ms);
      }
      if (!cancelled) setEnds(found);
    })();
    return () => {
      cancelled = true;
    };
  }, [key]);

  return ends;
}

/**
 * The stored recording length (ms) of each transcript, where one is stored. A failed read
 * leaves the segment ends in place — the cell is never emptied by this read.
 */
export async function readStoredLengthsMs(transcriptIds: string[]): Promise<Map<string, number>> {
  const out = new Map<string, number>();
  const ids = [...new Set(transcriptIds.filter((id) => isUuidShape(id)))];
  // A JSON-path select literal sends the generated parser into TS2589; the column
  // list is a plain string and `.returns<>()` states the row shape at the boundary.
  const columns: string = "id,duration:metadata->duration";
  for (let i = 0; i < ids.length; i += 100) {
    const { data, error } = await supabase
      .schema("transcripts")
      .from("transcripts")
      .select(columns)
      .in("id", ids.slice(i, i + 100))
      .returns<{ id: string; duration: unknown }[]>();
    if (error) continue;
    for (const row of data ?? []) {
      const n = typeof row.duration === "number" ? row.duration : Number(row.duration);
      if (Number.isFinite(n) && n > 0) out.set(row.id, n * 1000);
    }
  }
  return out;
}
