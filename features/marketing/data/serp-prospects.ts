"use client";

/**
 * serp-prospects — every direct Supabase read/write of the SERP prospecting
 * tables (`seo.serp_opportunity` + `seo.serp_mention`), the second
 * prospecting method beside the competitor link gap that `page-links.ts`
 * owns. A sibling file on purpose: the two methods share one triage
 * vocabulary (review statuses, the unmeasured-score rule) but read different
 * evidence tables, and each evidence table gets exactly one owner.
 *
 * Mirrors the link-gap readers one-for-one:
 *   listSerpOpportunities  ↔ listLinkGapDomains   (paged + statusCounts)
 *   listSerpMentions       ↔ listLinkGapMatches    (row evidence)
 *   setSerpReviewStatus    ↔ setLinkGapReviewStatus (the ONE write path)
 *   listSerpPartyLinks     ↔ listLinkGapPartyLinks  (the CRM-fold edges)
 *
 * THE UNMEASURED RULE applies unchanged: `priority_score` is NULL when we
 * could not measure the domain, every sort passes `nullsFirst: false` in both
 * directions, and the tiebreaker is `mention_count` — this method's primary
 * signal ("ranks in N of your searches").
 */

import type { MatrxDataTableQueryState } from "@/components/official/matrx-data-table/types";
import { assertData } from "@/features/marketing/data/service";
import { supabase } from "@/utils/supabase/client";
import { requireAuthenticatedSupabaseSession } from "@/utils/supabase/webDb";
import type { Json } from "@/types/database.types";

async function seoDb() {
  await requireAuthenticatedSupabaseSession(supabase);
  return supabase.schema("seo");
}

/** One site Google already ranks for the user's searches — a triage row. */
export interface SerpOpportunityRow {
  id: string;
  site_id: string;
  normalized_domain: string;
  display_domain: string;
  mention_count: number;
  best_rank: number | null;
  variants: string[];
  domain_rank: number | null;
  spam_score: number | null;
  referring_domains: number | null;
  total_backlinks: number | null;
  observed_at: string | null;
  enriched_at: string | null;
  review_status: string;
  reviewed_at: string | null;
  reviewed_by: string | null;
  priority_score: number | null;
  priority_reason: string | null;
  metadata: Json;
}

/** One piece of evidence: a search this domain already ranks in. */
export interface SerpMentionRow {
  id: string;
  serp_opportunity_id: string;
  query: string;
  variant: string;
  seed_keyword: string | null;
  url: string;
  title: string | null;
  snippet: string | null;
  rank: number | null;
  result_type: string;
  observed_at: string;
}

export interface SerpOpportunityPage {
  rows: SerpOpportunityRow[];
  total: number;
  /** review_status → how many rows the site has, ignoring the current filter. */
  statusCounts: Record<string, number>;
}

const SERP_OPPORTUNITY_SELECT =
  "id, site_id, normalized_domain, display_domain, mention_count, best_rank, variants, domain_rank, spam_score, referring_domains, total_backlinks, observed_at, enriched_at, review_status, reviewed_at, reviewed_by, priority_score, priority_reason, metadata";

const SERP_MENTION_SELECT =
  "id, serp_opportunity_id, query, variant, seed_keyword, url, title, snippet, rank, result_type, observed_at";

/** Columns the triage table may sort on, server-side. */
const SERP_OPPORTUNITY_SORT_COLUMNS = new Set([
  "display_domain",
  "mention_count",
  "best_rank",
  "priority_score",
  "domain_rank",
  "spam_score",
  "total_backlinks",
  "review_status",
  "observed_at",
]);

function selectedFilterValues(filter: unknown): string[] {
  if (!filter || typeof filter !== "object") return [];
  const value = filter as { kind?: string; value?: string; values?: string[] };
  if (value.kind !== "select") return [];
  if (value.values?.length) return value.values;
  return value.value ? [value.value] : [];
}

/**
 * The site's SERP-prospect list, server-paged, with the unfiltered backlog
 * counts (a status filter must never make its own tab read zero).
 */
export async function listSerpOpportunities(
  siteId: string,
  state: MatrxDataTableQueryState,
  signal?: AbortSignal,
): Promise<SerpOpportunityPage> {
  const db = await seoDb();
  const abortSignal = signal ?? new AbortController().signal;
  const from = (state.page - 1) * state.pageSize;
  const to = from + state.pageSize - 1;
  let query = db
    .from("serp_opportunity")
    .select(SERP_OPPORTUNITY_SELECT, { count: "exact" })
    .eq("site_id", siteId);
  const search = state.search.trim().replace(/[(),"'\\]/g, " ");
  if (search) {
    query = query.or(
      `display_domain.ilike.%${search}%,normalized_domain.ilike.%${search}%,priority_reason.ilike.%${search}%`,
    );
  }
  const statuses = selectedFilterValues(state.columnFilters.review_status);
  if (statuses.length === 1) query = query.eq("review_status", statuses[0]);
  else if (statuses.length > 1) query = query.in("review_status", statuses);
  const mentionFilter = state.columnFilters.mention_count;
  if (mentionFilter?.kind === "number") {
    if (mentionFilter.min !== undefined) {
      query = query.gte("mention_count", mentionFilter.min);
    }
    if (mentionFilter.max !== undefined) {
      query = query.lte("mention_count", mentionFilter.max);
    }
  }
  const scoreFilter = state.columnFilters.priority_score;
  if (scoreFilter?.kind === "number") {
    if (scoreFilter.min !== undefined) {
      query = query.gte("priority_score", scoreFilter.min);
    }
    if (scoreFilter.max !== undefined) {
      query = query.lte("priority_score", scoreFilter.max);
    }
  }
  const spamFilter = state.columnFilters.spam_score;
  if (spamFilter?.kind === "number") {
    if (spamFilter.min !== undefined) {
      query = query.gte("spam_score", spamFilter.min);
    }
    if (spamFilter.max !== undefined) {
      query = query.lte("spam_score", spamFilter.max);
    }
  }
  const sortColumn =
    state.sort && SERP_OPPORTUNITY_SORT_COLUMNS.has(state.sort.id)
      ? state.sort.id
      : "priority_score";
  const ascending = state.sort ? state.sort.direction === "asc" : false;
  const [pageResponse, statusResponse] = await Promise.all([
    query
      .order(sortColumn, { ascending, nullsFirst: false })
      .order("mention_count", { ascending: false, nullsFirst: false })
      .order("normalized_domain", { ascending: true })
      .range(from, to)
      .abortSignal(abortSignal),
    db
      .from("serp_opportunity")
      .select("review_status")
      .eq("site_id", siteId)
      .limit(5000)
      .abortSignal(abortSignal),
  ]);
  const rows = assertData(pageResponse.data, pageResponse.error);
  const statusRows = assertData(statusResponse.data, statusResponse.error);
  const statusCounts: Record<string, number> = {};
  for (const row of statusRows) {
    const key = row.review_status ?? "pending";
    statusCounts[key] = (statusCounts[key] ?? 0) + 1;
  }
  return { rows, total: pageResponse.count ?? 0, statusCounts };
}

/** The evidence behind one prospect: the searches it already ranks in. */
export async function listSerpMentions(
  serpOpportunityId: string,
  signal?: AbortSignal,
): Promise<SerpMentionRow[]> {
  const db = await seoDb();
  const response = await db
    .from("serp_mention")
    .select(SERP_MENTION_SELECT)
    .eq("serp_opportunity_id", serpOpportunityId)
    .order("rank", { ascending: true, nullsFirst: false })
    .order("query", { ascending: true })
    .limit(200)
    .abortSignal(signal ?? new AbortController().signal);
  return assertData(response.data, response.error);
}

/**
 * Which prospects already became a CRM record — `{opportunity_id: party_id}`.
 * The server's fold writes a `party -> seo_serp_opportunity` association as
 * the provenance edge, so that edge is also the honest answer to "is there a
 * party for this row yet?".
 */
export async function listSerpPartyLinks(
  serpOpportunityIds: string[],
  signal?: AbortSignal,
): Promise<Record<string, string>> {
  if (!serpOpportunityIds.length) return {};
  const ids = Array.from(new Set(serpOpportunityIds));
  const response = await supabase
    .schema("platform")
    .from("associations")
    .select("source_id, target_id")
    .eq("source_type", "party")
    .eq("target_type", "seo_serp_opportunity")
    .in("target_id", ids)
    .is("deleted_at", null)
    .abortSignal(signal ?? new AbortController().signal);
  const rows = assertData(response.data, response.error);
  const byOpportunity: Record<string, string> = {};
  for (const row of rows) {
    if (row.target_id && row.source_id) {
      byOpportunity[row.target_id] = row.source_id;
    }
  }
  return byOpportunity;
}

/**
 * The human's ruling on a SERP prospect — the ONE write path, used by the
 * single-row actions and the bulk bar alike. `approved` is what makes a row
 * eligible to become a CRM record, so who ruled and when is recorded on the
 * row itself, never inferred later.
 */
export async function setSerpReviewStatus(
  serpOpportunityIds: string[],
  reviewStatus: string,
): Promise<number> {
  if (!serpOpportunityIds.length) return 0;
  const db = await seoDb();
  const auth = await supabase.auth.getUser();
  if (auth.error) throw auth.error;
  const userId = auth.data.user?.id;
  if (!userId) throw new Error("Sign in again before reviewing prospects.");
  const response = await db
    .from("serp_opportunity")
    .update({
      review_status: reviewStatus,
      reviewed_at: new Date().toISOString(),
      reviewed_by: userId,
    })
    .in("id", Array.from(new Set(serpOpportunityIds)))
    .select("id");
  const rows = assertData(response.data, response.error);
  return rows.length;
}
