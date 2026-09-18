// features/marketing/seo/topical-map/views/pages/usePagesQuery.ts
//
// THE READ behind the pages workspace: one `seo.list_page_intents` call, with
// exactly the four narrowings that function takes.
//
// 🚨 IT REPLACES NOTHING. `usePageIntents` (hooks.ts) is the one hook over the
// one wrapper, and this is a thin adapter that turns the workspace's filter bag
// plus its page number into that hook's options — CONTRACTS §0 ("replace a
// branch of the workspace, never a read, a selector or a hook").
//
// WHAT THE SERVER TAKES, VERIFIED AGAINST THE WRAPPER (`data.ts`
// `listPageIntents`) AND THE FUNCTION'S PARAMETERS: `p_map_id`, `p_site_id`,
// `p_topic_slug`, `p_disposition`, `p_state`, `p_limit`, `p_offset`. THAT IS
// ALL. There is no region parameter and the returned items carry no region, so
// `regionSlug` is NOT sent and is NOT silently dropped either — the Region
// control on the filter bar says in one sentence that the list cannot be
// narrowed by region yet. Text, traffic and source are narrowed client-side
// over the loaded page by `./pageRows.ts`, which makes the table say so.
//
// `page` is one-based, matching the table's own pagination UI, and the offset
// is derived here rather than in the component so the "page 1 of the current
// filters" invariant lives in one place.

"use client";

import { usePageIntents } from "../../hooks";
import type { MapPageFilters } from "../../redux/types";

/**
 * One page of `seo.list_page_intents`, narrowed by the filters the server
 * takes.
 *
 * `page` is carried explicitly (the lane's brief lists `pageSize` only) because
 * an offset cannot be derived without it and the workspace owns both numbers in
 * its own state — page resets to 1 on any filter change, which is the
 * component's job, not this hook's.
 */
export function usePagesQuery(
  mapId: string,
  filters: MapPageFilters,
  siteId: string | null,
  page: number,
  pageSize: number,
) {
  return usePageIntents(mapId, {
    siteId,
    topicSlug: filters.topicSlug,
    disposition: filters.disposition,
    state: filters.state,
    // The function clamps `limit` to 1..1000 itself; every offered page size is
    // well inside that, so nothing is clamped behind the person's back.
    limit: pageSize,
    offset: Math.max(0, (page - 1) * pageSize),
  });
}
