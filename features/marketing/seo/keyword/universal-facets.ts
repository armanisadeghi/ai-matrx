/**
 * THE universal (no-site) classification read for the keyword plane.
 *
 * The 13 facts a keyword carries with no site in context — intent, funnel
 * stage, audience, urgency, … — live in the fact store `seo.keyword_facet`
 * (`site_id IS NULL`), with their provenance. `seo.keyword_universal_facet`
 * is the canonical view over it: one row per keyword, the 13 dimensions as
 * columns, resolved with the SAME source precedence every other resolver
 * uses (pinned > human > import > matcher/rule/pack > classifier).
 *
 * WHY THIS FILE EXISTS. Those 13 facts used to be MIRRORED onto columns of
 * `seo.keyword` by the nightly classifier — two stores for one fact, which is
 * the drift this repo deletes on sight (KI-035). Every frontend reader now
 * goes through here, so when the mirror columns are dropped nothing changes
 * shape: the same field names, the same `string | null`, merged onto the same
 * rows. Never read `intent_class` (or any of its twelve siblings) off
 * `seo.keyword` again — the columns are frozen and on their way out.
 *
 * SoR: common-docs/systems/marketing/seo/seo-keywords/legacy-retirement-blast-radius.md
 */

import type { SupabaseClient } from "@supabase/supabase-js";

import type { Database } from "@/types/database.types";
import { readAllRows } from "@/lib/supabase/readAllRows";

type UniversalFacetViewRow =
  Database["seo"]["Views"]["keyword_universal_facet"]["Row"];

/** The 13 universal dimensions, exactly as the view names them. */
export const KEYWORD_UNIVERSAL_FACET_KEYS = [
  "intent_class",
  "fulfillment_mode",
  "audience_type",
  "funnel_stage",
  "transaction_direction",
  "local_intent",
  "urgency",
  "comparison_intent",
  "price_sensitivity",
  "query_form",
  "specificity",
  "brand_presence",
  "compliance_framing",
] as const satisfies readonly (keyof UniversalFacetViewRow)[];

export type KeywordUniversalFacetKey =
  (typeof KEYWORD_UNIVERSAL_FACET_KEYS)[number];

/** The 13 facts as they ride on a keyword row — the view minus its join key. */
export type KeywordUniversalFacets = {
  [K in KeywordUniversalFacetKey]: string | null;
};

const EMPTY_FACETS: KeywordUniversalFacets = Object.freeze(
  Object.fromEntries(
    KEYWORD_UNIVERSAL_FACET_KEYS.map((key) => [key, null]),
  ) as KeywordUniversalFacets,
);

/** PostgREST refuses very long `in.()` lists; ids go up in bounded batches. */
const ID_BATCH_SIZE = 400;

function chunk<T>(items: readonly T[], size: number): T[][] {
  const out: T[][] = [];
  for (let index = 0; index < items.length; index += size) {
    out.push(items.slice(index, index + size));
  }
  return out;
}

/**
 * The 13 universal facts for these keyword ids, keyed by id. Keywords with no
 * stamps simply have no row — the caller reads them as all-null, exactly as
 * an unclassified keyword always read.
 *
 * Read through `readAllRows`: this map decides what a row DISPLAYS, so a
 * silently truncated page would blank out real classifications rather than
 * showing a short list.
 */
export async function fetchUniversalFacets(
  db: SupabaseClient<Database>,
  keywordIds: readonly string[],
): Promise<Map<string, KeywordUniversalFacets>> {
  const ids = Array.from(new Set(keywordIds.filter(Boolean)));
  const byKeywordId = new Map<string, KeywordUniversalFacets>();
  if (ids.length === 0) return byKeywordId;

  for (const batch of chunk(ids, ID_BATCH_SIZE)) {
    const rows = await readAllRows<UniversalFacetViewRow>(
      ({ from, to }) =>
        db
          .schema("seo")
          .from("keyword_universal_facet")
          .select("*", { count: "exact" })
          .in("keyword_id", batch)
          .order("keyword_id", { ascending: true })
          .range(from, to),
      { label: "seo.keyword_universal_facet" },
    );
    for (const row of rows) {
      if (!row.keyword_id) continue;
      byKeywordId.set(row.keyword_id, {
        intent_class: row.intent_class,
        fulfillment_mode: row.fulfillment_mode,
        audience_type: row.audience_type,
        funnel_stage: row.funnel_stage,
        transaction_direction: row.transaction_direction,
        local_intent: row.local_intent,
        urgency: row.urgency,
        comparison_intent: row.comparison_intent,
        price_sensitivity: row.price_sensitivity,
        query_form: row.query_form,
        specificity: row.specificity,
        brand_presence: row.brand_presence,
        compliance_framing: row.compliance_framing,
      });
    }
  }
  return byKeywordId;
}

/**
 * Merge the universal facts onto keyword rows read from `seo.keyword`. The
 * fact store WINS over whatever the row carried — while the mirror columns
 * still exist they are frozen legacy, and the view is ahead of them (place
 * detection stamps `local_intent` the mirror never learned).
 */
export async function attachUniversalFacets<T extends { id: string }>(
  db: SupabaseClient<Database>,
  rows: readonly T[],
): Promise<(T & KeywordUniversalFacets)[]> {
  if (rows.length === 0) return [];
  const facets = await fetchUniversalFacets(
    db,
    rows.map((row) => row.id),
  );
  return rows.map((row) => ({
    ...row,
    ...(facets.get(row.id) ?? EMPTY_FACETS),
  }));
}
