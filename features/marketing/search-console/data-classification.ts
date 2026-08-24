/**
 * Keyword-classification data access — THE one human write path for a
 * keyword's `traffic_class` (`seo.gsc_set_keyword_class`, provenance-aware:
 * origin/rule/confirmed ride `site_keyword_value.metadata.classification`).
 *
 * Trimmed 2026-08-25 (KI-036): the dedicated classification UI that used to
 * live here (review read, brand-identity narrator, CSV/workbook import, the
 * AI batch classifier, the universal-facet backfill status) was deleted along
 * with `components/classification/` — every other export in this file had
 * ZERO remaining callers once that workspace was gone, so they were removed
 * rather than left as dead exports. `setGscKeywordClass` itself is still very
 * much alive: `keyword-research/components/SiteKeywordsWriteTargets.tsx` and
 * `value-system/suggestions/apply.ts` both call it directly, and the Keyword
 * Workbench sets `traffic_class` through it like any other dimension. No DB
 * objects were dropped — `seo.gsc_keyword_class_review`,
 * `seo.gsc_brand_identity`, `seo.gsc_class_import`, `seo.keyword_classifier`
 * and friends are untouched; only the frontend callers of the ones nothing
 * uses any more are gone. See `FEATURE.md` § Classification UI for the full
 * retirement note.
 *
 * The RPC lives in `migrations/seo_keyword_class_rules.sql` (earlier:
 * `seo_keyword_classification_ui.sql`) and follows the mandatory SECURITY
 * DEFINER + access-assert pattern. The class→column mapping is server-side
 * ONLY — never derive or write valuation columns client-side.
 */

import { supabase } from "@/utils/supabase/client";
import { requireAuthenticatedSupabaseSession } from "@/utils/supabase/webDb";
import type { GscSetKeywordClassRow, GscTrafficClass } from "@/features/marketing/search-console/types";
import { makeAssertData } from "@/utils/errors";

async function seoDb() {
  await requireAuthenticatedSupabaseSession(supabase);
  return supabase.schema("seo");
}

const assertData = makeAssertData("reach your Search Console keyword classification");

/** A human class ruling. `clear` removes the override so the machine rungs
 *  (brand match / AI intent) decide again. */
export type GscClassRuling = Exclude<GscTrafficClass, "unclassified"> | "clear";

export type GscRulingOrigin = "manual" | "rule" | "import" | "ai";

/**
 * Apply one ruling to one or many keywords. Notes are REQUIRED for mismatch
 * (server-enforced). `origin`/`ruleId`/`confirmed` stamp provenance —
 * confirmed=false marks an automatic application a human has not eyeballed
 * (renders flagged until confirmed). Returns the RESOLVED (class,
 * class_source) per keyword from the server.
 */
export async function setGscKeywordClass(
  siteId: string,
  keywordIds: string[],
  ruling: GscClassRuling,
  notes: string | null,
  options: {
    origin?: GscRulingOrigin;
    ruleId?: string | null;
    confirmed?: boolean;
  } = {},
): Promise<GscSetKeywordClassRow[]> {
  const response = await (
    await seoDb()
  ).rpc("gsc_set_keyword_class", {
    p_site_id: siteId,
    p_keyword_ids: keywordIds,
    p_class: ruling,
    p_notes: notes?.trim() || undefined,
    p_origin: options.origin ?? "manual",
    p_rule_id: options.ruleId ?? undefined,
    p_confirmed: options.confirmed ?? true,
  });
  return assertData(response.data, response.error, "save that keyword's class");
}
