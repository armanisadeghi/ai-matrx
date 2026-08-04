/**
 * Watchlist reads — the `seo.gsc_perf_watch` RPC (anchored on the watched
 * id arrays, so zero-data watched items come back as real zero rows).
 * Watch state itself lives in `platform.user_entity_state` via
 * `lib/watch.ts`; this file only turns watched ids into metrics.
 */

import { supabase } from "@/utils/supabase/client";
import { requireAuthenticatedSupabaseSession } from "@/utils/supabase/webDb";
import type {
  GscResolvedPeriods,
  GscWatchRow,
} from "@/features/marketing/search-console/types";

export async function getGscWatch(
  siteId: string,
  periods: GscResolvedPeriods,
  pageIds: string[],
  keywordIds: string[],
  signal?: AbortSignal,
): Promise<GscWatchRow[]> {
  if (pageIds.length === 0 && keywordIds.length === 0) return [];
  await requireAuthenticatedSupabaseSession(supabase);
  const response = await supabase
    .schema("seo")
    .rpc("gsc_perf_watch", {
      p_site_id: siteId,
      p_start: periods.current.start,
      p_end: periods.current.end,
      ...(periods.compare
        ? {
            p_compare_start: periods.compare.start,
            p_compare_end: periods.compare.end,
          }
        : {}),
      p_page_ids: pageIds.slice(0, 200),
      p_keyword_ids: keywordIds.slice(0, 200),
    })
    .abortSignal(signal ?? new AbortController().signal);
  if (response.error) throw new Error(response.error.message);
  if (response.data === null) throw new Error("Supabase returned no data");
  return response.data;
}
