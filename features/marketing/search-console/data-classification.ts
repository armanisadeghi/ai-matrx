/**
 * Keyword-classification data access — the review read
 * (`seo.gsc_keyword_class_review`), THE one human write path
 * (`seo.gsc_set_keyword_class` — now provenance-aware: origin/rule/confirmed
 * ride `site_keyword_value.metadata.classification`), confirmation of
 * auto-applied rulings, CSV/workbook import (server dry-run diff first),
 * a full-export pager, and the AI batch call (aidream
 * `POST /seo/keywords/classify` → the `seo.keyword_classifier` slot writes
 * the universal `intent_class` layer; results surface as "AI intent"
 * provenance, never as site rulings).
 *
 * All RPCs live in `migrations/seo_keyword_class_rules.sql` (earlier:
 * `seo_keyword_classification_ui.sql`) and follow the mandatory SECURITY
 * DEFINER + access-assert pattern. The class→column mapping is server-side
 * ONLY — never derive or write valuation columns client-side.
 */

import { supabase } from "@/utils/supabase/client";
import { requireAuthenticatedSupabaseSession } from "@/utils/supabase/webDb";
import { callApi } from "@/lib/api/call-api";
import type { AppDispatch } from "@/lib/redux/store";
import type {
  GscClassReviewRow,
  GscClassSource,
  GscDateRange,
  GscSetKeywordClassRow,
  GscTrafficClass,
} from "@/features/marketing/search-console/types";
import type { ClassRuleMatchKind } from "@/features/marketing/search-console/lib/class-rules";

async function seoDb() {
  await requireAuthenticatedSupabaseSession(supabase);
  return supabase.schema("seo");
}

function assertData<T>(data: T | null, error: { message: string } | null): T {
  if (error) throw new Error(error.message);
  if (data === null) throw new Error("Supabase returned no data");
  return data;
}

export interface GscClassReviewQuery {
  trafficClasses: GscTrafficClass[] | null;
  sources: GscClassSource[] | null;
  search: string;
  sort: "impressions" | "clicks" | "ctr" | "query";
  sortDir: "asc" | "desc";
  page: number;
  pageSize: number;
  /** Pattern preview (rule matching) — server-side, never a client matcher. */
  pattern?: string | null;
  matchKind?: ClassRuleMatchKind | null;
  /** true = only confirmed rulings; false = only unconfirmed (auto-applied). */
  confirmed?: boolean | null;
}

export interface GscClassReviewPage {
  rows: GscClassReviewRow[];
  total: number;
}

function reviewParams(siteId: string, range: GscDateRange, query: GscClassReviewQuery) {
  return {
    p_site_id: siteId,
    p_start: range.start,
    p_end: range.end,
    p_classes: query.trafficClasses?.length ? query.trafficClasses : undefined,
    p_sources: query.sources?.length ? query.sources : undefined,
    p_search: query.search.trim() || undefined,
    p_sort: query.sort,
    p_sort_dir: query.sortDir,
    p_limit: query.pageSize,
    p_offset: (query.page - 1) * query.pageSize,
    p_pattern: query.pattern?.trim() || undefined,
    p_match: query.pattern?.trim() ? (query.matchKind ?? "contains") : undefined,
    p_confirmed: query.confirmed ?? undefined,
  };
}

export async function getGscClassReview(
  siteId: string,
  range: GscDateRange,
  query: GscClassReviewQuery,
  signal?: AbortSignal,
): Promise<GscClassReviewPage> {
  const response = await (await seoDb())
    .rpc("gsc_keyword_class_review", reviewParams(siteId, range, query))
    .abortSignal(signal ?? new AbortController().signal);
  const rows = assertData(response.data, response.error);
  return { rows, total: rows[0]?.total_count ?? 0 };
}

/**
 * Page through the review RPC until the filtered set is exhausted (export /
 * send-to-workbook). Hard cap keeps a runaway filter from pulling the world.
 */
export async function getGscClassReviewAll(
  siteId: string,
  range: GscDateRange,
  query: Omit<GscClassReviewQuery, "page" | "pageSize">,
  maxRows = 20000,
  onProgress?: (loaded: number, total: number) => void,
): Promise<GscClassReviewPage> {
  const pageSize = 1000;
  const rows: GscClassReviewRow[] = [];
  let total = 0;
  for (let page = 1; rows.length < maxRows; page += 1) {
    const result = await getGscClassReview(siteId, range, {
      ...query,
      page,
      pageSize,
    });
    rows.push(...result.rows);
    total = result.total;
    onProgress?.(rows.length, total);
    if (result.rows.length < pageSize || rows.length >= total) break;
  }
  return { rows: rows.slice(0, maxRows), total };
}

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
  const response = await (await seoDb()).rpc("gsc_set_keyword_class", {
    p_site_id: siteId,
    p_keyword_ids: keywordIds,
    p_class: ruling,
    p_notes: notes?.trim() || undefined,
    p_origin: options.origin ?? "manual",
    p_rule_id: options.ruleId ?? undefined,
    p_confirmed: options.confirmed ?? true,
  });
  return assertData(response.data, response.error);
}

/** Confirm auto-applied rulings (clears the unconfirmed flag). Returns the
 *  number of rows flipped. */
export async function confirmGscKeywordClass(
  siteId: string,
  keywordIds: string[],
): Promise<number> {
  const response = await (await seoDb()).rpc("gsc_confirm_keyword_class", {
    p_site_id: siteId,
    p_keyword_ids: keywordIds,
  });
  return assertData(response.data, response.error);
}

// ── Import (CSV / workbook round-trip) ─────────────────────────────────────

export interface GscClassImportRow {
  query: string;
  class: string;
  notes?: string | null;
}

export type GscClassImportResultRow =
  import("@/types/database.types").Database["seo"]["Functions"]["gsc_class_import"]["Returns"][number];

/**
 * Server-side import diff/apply. Dry run first, ALWAYS — the UI shows the
 * diff (changes / unknown keywords / invalid classes / missing mismatch
 * notes) before anything commits. Apply routes every change through
 * `gsc_set_keyword_class` server-side — one mapping, one home.
 */
export async function importGscKeywordClasses(
  siteId: string,
  rows: GscClassImportRow[],
  dryRun: boolean,
): Promise<GscClassImportResultRow[]> {
  const response = await (await seoDb()).rpc("gsc_class_import", {
    p_site_id: siteId,
    p_rows: rows.map((row) => ({
      query: row.query,
      class: row.class,
      notes: row.notes ?? null,
    })),
    p_dry_run: dryRun,
  });
  return assertData(response.data, response.error);
}

// ── AI batch classify ──────────────────────────────────────────────────────

export interface AiClassifyResult {
  eligible: number;
  batches: number;
  updated: number;
  skipped_error: number;
  missing_keyword_ids: string[];
}

const AI_CLASSIFY_CHUNK = 200; // server hard cap per call

/**
 * Run the universal AI classifier (`seo.keyword_classifier` agent slot) over
 * a list of keyword ids, chunked to the server's 200-id cap. Writes the
 * 13-column universal layer (incl. `intent_class`) — results surface in the
 * review table as "AI intent" provenance, overridable like any machine
 * signal. Server-gated to admins today.
 */
export async function classifyKeywordsWithAi(
  dispatch: AppDispatch,
  keywordIds: string[],
  onProgress?: (done: number, total: number) => void,
): Promise<AiClassifyResult> {
  const totals: AiClassifyResult = {
    eligible: 0,
    batches: 0,
    updated: 0,
    skipped_error: 0,
    missing_keyword_ids: [],
  };
  for (let i = 0; i < keywordIds.length; i += AI_CLASSIFY_CHUNK) {
    const chunk = keywordIds.slice(i, i + AI_CLASSIFY_CHUNK);
    const result = await dispatch(
      callApi({
        path: "/seo/keywords/classify",
        method: "POST",
        body: { keyword_ids: chunk, limit: chunk.length },
      }),
    );
    if (result.error || !result.data) {
      throw new Error(result.error?.message ?? "AI classification failed");
    }
    const data = result.data as AiClassifyResult;
    totals.eligible += data.eligible;
    totals.batches += data.batches;
    totals.updated += data.updated;
    totals.skipped_error += data.skipped_error;
    totals.missing_keyword_ids.push(...(data.missing_keyword_ids ?? []));
    onProgress?.(Math.min(i + chunk.length, keywordIds.length), keywordIds.length);
  }
  return totals;
}
