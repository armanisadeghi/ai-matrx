/**
 * Keyword placement backfill — the ledger-backed status read.
 *
 * Everything else that lived here served the legacy `seo.topic` offering tree,
 * which the Offerings screen replaced (brand-offerings cutover step 6;
 * `features/marketing/seo/value-system/offerings/`). What remains is the ONE
 * server-state read the placement strip and the run console render. It is
 * still read from `seo.topic_placement_status` and moves to the canonical
 * placement model with the remaining readers (cutover §7a).
 *
 * SoR: common-docs/systems/marketing/seo/seo-keywords/value-system.md
 */

import { supabase } from "@/utils/supabase/client";
import { requireAuthenticatedSupabaseSession } from "@/utils/supabase/webDb";
import { makeAssertData } from "@/utils/errors";
import type { TopicPlacementStatus } from "./types";

async function seoDb() {
  await requireAuthenticatedSupabaseSession(supabase);
  return supabase.schema("seo");
}

const assertData = makeAssertData("read the placement status");

/**
 * The ONE server-state read the placement strip renders
 * (`seo.topic_placement_status`). It is SERVER state on purpose: a closed tab
 * returns to the true number, which a browser loop could never promise.
 */
export async function getTopicPlacementStatus(
  siteId: string,
  minImpressions: number,
  signal?: AbortSignal,
): Promise<TopicPlacementStatus> {
  const response = await (await seoDb())
    .rpc("topic_placement_status", {
      p_site_id: siteId,
      p_min_impressions: minImpressions,
    })
    .abortSignal(signal ?? new AbortController().signal);
  const rows = assertData(response.data, response.error, "read the placement status");
  const row = Array.isArray(rows) ? rows[0] : rows;
  return row as TopicPlacementStatus;
}
