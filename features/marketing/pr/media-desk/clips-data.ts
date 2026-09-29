/**
 * The brand's clips gallery — ONE read, direct from Supabase under RLS.
 *
 * A finished clip is the result document of a `press.clip.make` command run on
 * `seo.collection_run` (aidream `services/media_desk`). There is no second store:
 * the ledger that proves the run happened is the gallery. Clips are read for
 * every site of the brand, newest first.
 */

import { useQuery } from "@tanstack/react-query";

import { supabase } from "@/utils/supabase/client";
import { requireAuthenticatedSupabaseSession } from "@/utils/supabase/webDb";

import type { MakeClipResult } from "./api";

export interface GalleryClip {
  runId: string;
  siteId: string | null;
  madeAt: string;
  result: MakeClipResult;
}

export const clipsGalleryKey = (siteIds: readonly string[]) =>
  ["marketing", "press", "clips", [...siteIds].sort().join(",")] as const;

/** Narrow a stored result document; anything else is not a finished clip. */
export function readFinishedClip(value: unknown): MakeClipResult | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const doc = value as Partial<MakeClipResult>;
  if (doc.result_kind !== "press.clip.make" || doc.status !== "finished") return null;
  if (!doc.clip || typeof doc.clip.pdf_file_id !== "string") return null;
  return doc as MakeClipResult;
}

export async function listClips(
  siteIds: readonly string[],
  signal?: AbortSignal,
): Promise<GalleryClip[]> {
  if (siteIds.length === 0) return [];
  await requireAuthenticatedSupabaseSession(supabase);
  const response = await supabase
    .schema("seo")
    .from("collection_run")
    .select("id, site_id, completed_at, requested_at, result")
    .eq("operation", "press.clip.make")
    .eq("status", "completed")
    .in("site_id", [...siteIds])
    .order("requested_at", { ascending: false })
    .limit(100)
    .abortSignal(signal ?? new AbortController().signal);
  if (response.error) throw response.error;
  const out: GalleryClip[] = [];
  for (const row of response.data ?? []) {
    const result = readFinishedClip(row.result);
    if (!result) continue;
    out.push({
      runId: row.id,
      siteId: row.site_id,
      madeAt: row.completed_at ?? row.requested_at,
      result,
    });
  }
  return out;
}

export function useClipsGallery(siteIds: readonly string[]) {
  return useQuery({
    queryKey: clipsGalleryKey(siteIds),
    queryFn: ({ signal }) => listClips(siteIds, signal),
    enabled: siteIds.length > 0,
  });
}
