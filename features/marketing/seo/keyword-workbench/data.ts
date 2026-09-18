/**
 * THE KEYWORD WORKBENCH — data layer.
 *
 * Every call here is a C13/C14 RPC on the `seo` schema, read directly under
 * the caller's JWT (CLAUDE.md two-lane rule). This module adds NO write path
 * of its own: `seo.gsc_set_keyword_stamps` is THE one human write for a stamp
 * (single row, right-click quick-assign, and a 4,000-keyword bulk all land
 * there), and `seo.gsc_quick_add_value` is THE one way typed text becomes a
 * real value. A second door here would be a second set of rules.
 *
 * SoR: common-docs/systems/marketing/seo/seo-keywords/value-system.md
 *      common-docs/projects/keyword-intelligence-convergence/PLAN.md (C13/C14)
 */

import { supabase } from "@/utils/supabase/client";
import { requireAuthenticatedSupabaseSession } from "@/utils/supabase/webDb";
import { extractErrorMessage, makeAssertData } from "@/utils/errors";
import { readAllRows } from "@ai-matrx/data/db";
import type { Json } from "@/types/database.types";
import type {
  GscFilters,
  GscResolvedPeriods,
} from "@/features/marketing/search-console/types";
import { cleanGscFilters } from "@/features/marketing/search-console/data";

async function seoDb() {
  await requireAuthenticatedSupabaseSession(supabase);
  return supabase.schema("seo");
}

const assertData = makeAssertData("reach your keyword workbench");

/**
 * The assignment RPCs answer refusals in plain sentences written for the
 * person reading them ("… is a shared dimension every business uses, so its
 * choices are platform-governed. Create your own dimension for this."). Strip
 * the machine code, keep the sentence — replacing it with "something went
 * wrong" is how a user learns nothing and leaves.
 */
const GOVERNED =
  /^(seo_[a-z_]+|gsc_[a-z_]+):\s*/;

function assertGoverned<T>(data: T | null, error: unknown, action: string): T {
  if (error) {
    const message = extractErrorMessage(error).split(" · ")[0];
    const governed = message.match(GOVERNED);
    if (governed) {
      throw new Error(message.slice(governed[0].length), { cause: error });
    }
  }
  return assertData(data, error, action) as T;
}

/* ------------------------------------------------------------------ stamps */

/** One dimension's answer for one keyword, as the dynamic columns read it. */
export interface KeywordStamp {
  dimension: string;
  dimensionLabel: string;
  value: string;
  valueLabel: string;
  valueId: string;
  source: string;
  pinned: boolean;
  notes: string | null;
}

/** keyword_id → dimension slug → the stamp (single-cardinality: last wins). */
export type KeywordStampMap = Map<string, Map<string, KeywordStamp>>;

/**
 * THE SCOPE RULE. Ask for the rows you are showing — never the site. The RPC
 * refuses more than 2,000 ids, so the caller slices to the page it renders.
 */
export async function getKeywordStamps(
  siteId: string,
  keywordIds: string[],
  dimensionSlugs: string[],
  signal?: AbortSignal,
): Promise<KeywordStampMap> {
  const map: KeywordStampMap = new Map();
  if (keywordIds.length === 0 || dimensionSlugs.length === 0) return map;
  const db = await seoDb();
  const abort = signal ?? new AbortController().signal;
  const ids = Array.from(new Set(keywordIds));
  // One row per keyword PER DIMENSION — ~7.4 stamps per keyword live, so a
  // 200-row page is ~1,480 rows and PostgREST's 1,000-row cap was silently
  // dropping the tail. Read to completion, never a confidently truncated map.
  // (keyword_id, dimension) is a total order only while every dimension is
  // single-cardinality (23 of 23 live, 2026-09-12); value_id breaks the tie
  // for a multi-cardinality dimension so paging never repeats or skips a row.
  const rows = await readAllRows(
    ({ from, to }) =>
      db
        .rpc(
          "gsc_keyword_stamps_for",
          {
            p_site_id: siteId,
            p_keyword_ids: ids,
            p_dimension_slugs: dimensionSlugs,
          },
          { count: "exact" },
        )
        .order("keyword_id", { ascending: true })
        .order("dimension", { ascending: true })
        .order("value_id", { ascending: true })
        .range(from, to)
        .abortSignal(abort)
        .then((res) => {
          if (res.error) assertGoverned(null, res.error, "read your columns");
          return res;
        }),
    { label: "seo.gsc_keyword_stamps_for" },
  );
  for (const row of rows) {
    let byDimension = map.get(row.keyword_id);
    if (!byDimension) {
      byDimension = new Map();
      map.set(row.keyword_id, byDimension);
    }
    byDimension.set(row.dimension, {
      dimension: row.dimension,
      dimensionLabel: row.dimension_label,
      value: row.value,
      valueLabel: row.value_label,
      valueId: row.value_id,
      source: row.source,
      pinned: row.pinned,
      notes: row.notes,
    });
  }
  return map;
}

/* ------------------------------------------------------- the P23 quick add */

/**
 * There is none here — deliberately. Turning typed text into a real value is
 * `quickAddDimensionValue` in `features/marketing/seo/value-system/quick-add.ts`,
 * the keyword system's ONE creation path, and the picker shape around it is
 * `CreatablePicker`. A second copy of either here would be a second set of
 * rules about what a person is allowed to invent.
 */

/* ------------------------------------------------------------- the one write */

export interface SetStampsResult {
  written: number;
  replaced: number;
  cleared: number;
  notesSaved: boolean;
}

/**
 * P24 — the expert's WHY rides along with the assignment and is stored ON the
 * stamp, because that sentence is the training material an AI later learns
 * the pattern from. A bulk assignment carries one shared reason.
 *
 * THE ONE STAMP WRITE for every surface — ruling session, quick answers, the
 * right-click menu, the bulk bar. A second copy of this lived in
 * `value-system/quick-add.ts` until 2026-08-24 with a thinner return shape;
 * it was deleted, not aliased. Argument handling verified against
 * `pg_get_functiondef(seo.gsc_set_keyword_stamps)`: `p_notes text DEFAULT
 * NULL` and `p_clear boolean DEFAULT false`, so omitting a key is identical
 * to passing the falsy value, and the RPC's own `NULLIF(btrim(p_notes),'')`
 * makes an empty reason and no reason the same thing.
 */
export async function setKeywordStamps(input: {
  siteId: string;
  keywordIds: string[];
  valueId: string;
  notes?: string | null;
  clear?: boolean;
}): Promise<SetStampsResult> {
  const response = await (await seoDb()).rpc("gsc_set_keyword_stamps", {
    p_site_id: input.siteId,
    p_keyword_ids: input.keywordIds,
    p_value_id: input.valueId,
    ...(input.notes ? { p_notes: input.notes } : {}),
    ...(input.clear ? { p_clear: true } : {}),
  });
  const raw = assertGoverned(
    response.data,
    response.error,
    input.clear ? "clear that assignment" : "save that assignment",
  );
  const row = (raw ?? {}) as Record<string, Json>;
  const num = (key: string) =>
    typeof row[key] === "number" ? (row[key] as number) : 0;
  return {
    written: num("written"),
    replaced: num("replaced"),
    cleared: num("cleared"),
    notesSaved: row.notes_saved === true,
  };
}

/* -------------------------------------------------- select all matching (C14) */

export interface MatchingKeywordIds {
  keywordIds: string[];
  returned: number;
  /** True when the server stopped at the cap — say so, never imply totality. */
  capped: boolean;
  limit: number;
}

/**
 * Every keyword the CURRENT filter set produces — not the page on screen.
 * "Select all matching" that quietly means "select these 50" is the bug this
 * replaces.
 */
export async function getMatchingKeywordIds(
  siteId: string,
  periods: GscResolvedPeriods,
  filters: GscFilters,
  search: string,
  signal?: AbortSignal,
): Promise<MatchingKeywordIds> {
  const response = await (await seoDb())
    .rpc("gsc_breakdown_keyword_ids", {
      p_site_id: siteId,
      p_start: periods.current.start,
      p_end: periods.current.end,
      p_filters: cleanGscFilters(filters),
      ...(search.trim() ? { p_search: search.trim() } : {}),
    })
    .abortSignal(signal ?? new AbortController().signal);
  const raw = assertData(
    response.data,
    response.error,
    "work out everything your filters match",
  );
  const row = (raw ?? {}) as Record<string, Json>;
  const ids = Array.isArray(row.keyword_ids)
    ? row.keyword_ids.filter((id): id is string => typeof id === "string")
    : [];
  return {
    keywordIds: ids,
    returned: typeof row.returned === "number" ? row.returned : ids.length,
    capped: row.capped === true,
    limit: typeof row.limit === "number" ? row.limit : ids.length,
  };
}

/* ------------------------------------------------- the OFFERING placement */

/**
 * THE OFFERING COLUMN. Arman, 2026-08-24: "when I look at all green electronics
 * recycling, the first thing I wanna know is what service they map to… I wanna
 * know what maps to e-waste recycling, what maps to ITAD, and what maps to
 * data destruction."
 *
 * A placement is THIS site's own (`seo.site_keyword_offering`) on an offering
 * its brand owns and the site has selected (brand-offerings cutover D1, D2, D4).
 * Same contract as a stamp: read the window you render, write through ONE RPC,
 * carry the reason. THE CONTRACT: `features/marketing/FEATURE.md` § Canonical
 * offering writers.
 */
export interface KeywordOfferingPlacement {
  offeringId: string;
  offeringName: string;
  kind: string;
  rootId: string | null;
  rootName: string | null;
  rootKind: string | null;
  /** Root › … › parent — the ancestors, never the offering itself. */
  lineage: string | null;
  /** 'human' | 'agent' — whose ruling this is. */
  assignedBy: string | null;
  confidence: number | null;
  notes: string | null;
  /** True when THIS offering carries the site's own worth. */
  hasOwnWorth: boolean;
  /** The ancestor offering the worth is inherited FROM, when it is inherited. */
  worthFromId: string | null;
  worthFromName: string | null;
}

/** keyword_id → its primary placement. Unplaced keywords are simply absent. */
export type KeywordOfferingMap = Map<string, KeywordOfferingPlacement>;

/** The query-key root every placement write invalidates (append the site id). */
export const KEYWORD_OFFERINGS_KEY = ["marketing", "seo", "keyword-offerings"] as const;

/**
 * THE SCOPE RULE: the RPC refuses more than 2,000 ids, so the caller asks for
 * the page it renders. `seo.gsc_keyword_offerings_for` reads only this site's
 * placements, so there is no inherited rung to name.
 */
export async function getKeywordOfferings(
  siteId: string,
  keywordIds: string[],
  signal?: AbortSignal,
): Promise<KeywordOfferingMap> {
  const map: KeywordOfferingMap = new Map();
  if (keywordIds.length === 0) return map;
  const db = await seoDb();
  const abort = signal ?? new AbortController().signal;
  // One id, one row: a duplicate id would break the paged read's total order.
  const ids = Array.from(new Set(keywordIds));
  // THE 1,000-ROW CAP: a map treated as complete is read through `readAllRows`.
  const rows = await readAllRows(
    ({ from, to }) =>
      db
        .rpc(
          "gsc_keyword_offerings_for",
          { p_site_id: siteId, p_keyword_ids: ids },
          { count: "exact" },
        )
        .order("keyword_id", { ascending: true })
        .range(from, to)
        .abortSignal(abort)
        .then((res) => {
          if (res.error) assertGoverned(null, res.error, "read which offering these keywords map to");
          return res;
        }),
    { label: "seo.gsc_keyword_offerings_for", maxRows: 2000 },
  );
  for (const row of rows) {
    map.set(row.keyword_id, {
      offeringId: row.offering_id,
      offeringName: row.offering_name,
      kind: row.offering_kind,
      rootId: row.root_id,
      rootName: row.root_name,
      rootKind: row.root_kind,
      lineage: row.lineage,
      assignedBy: row.assigned_by,
      confidence: row.confidence,
      notes: row.notes,
      hasOwnWorth: row.has_own_worth,
      worthFromId: row.worth_from_id,
      worthFromName: row.worth_from_name,
    });
  }
  return map;
}

export interface SetOfferingResult {
  /** What the resolver says each keyword is worth AFTER the placement. */
  keywordId: string;
  valueBand: string;
  valueSource: string;
  valueScore: number | null;
}

function toOfferingResults(
  rows: Array<{ keyword_id: string; value_band: string; value_source: string; value_score: number | null }> | null,
): SetOfferingResult[] {
  return (rows ?? []).map((row) => ({
    keywordId: row.keyword_id,
    valueBand: row.value_band,
    valueSource: row.value_source,
    valueScore: row.value_score == null ? null : Number(row.value_score),
  }));
}

/**
 * THE ONE PLACEMENT WRITE — `seo.gsc_set_keyword_offering`. A cell, the checked
 * rows, every keyword the filters match, the ruling session and the approval
 * queue all land here, and the reason (P24) rides along on the placement.
 *
 * `offeringId: null` takes the keywords off every offering. The database refuses
 * an offering this site has not selected and an organization that does not own
 * the site. The response is the band each keyword lands in after the change,
 * straight from the resolver, so a caller never re-derives a score.
 */
export async function setKeywordOffering(input: {
  organizationId: string;
  siteId: string;
  keywordIds: string[];
  offeringId: string | null;
  notes?: string | null;
}): Promise<SetOfferingResult[]> {
  const response = await (await seoDb()).rpc("gsc_set_keyword_offering", {
    p_organization_id: input.organizationId,
    p_site_id: input.siteId,
    p_keyword_ids: input.keywordIds,
    ...(input.offeringId ? { p_offering_id: input.offeringId } : {}),
    ...(input.notes?.trim() ? { p_notes: input.notes.trim() } : {}),
  });
  const rows = assertGoverned(
    response.data,
    response.error,
    input.offeringId ? "place these keywords on that offering" : "take these keywords off every offering",
  );
  return toOfferingResults(rows);
}

/**
 * Confirm the AI's placement as THIS site's own ruling, with the person's
 * reason (P24). Writes only this site's placement; the assigner never revisits
 * a confirmed keyword (P12).
 */
export async function confirmKeywordOfferings(input: {
  organizationId: string;
  siteId: string;
  keywordIds: string[];
  notes?: string | null;
}): Promise<SetOfferingResult[]> {
  const response = await (await seoDb()).rpc("gsc_confirm_keyword_offering", {
    p_organization_id: input.organizationId,
    p_site_id: input.siteId,
    p_keyword_ids: input.keywordIds,
    ...(input.notes?.trim() ? { p_notes: input.notes.trim() } : {}),
  });
  const rows = assertGoverned(response.data, response.error, "confirm those placements");
  return toOfferingResults(rows);
}

export interface OfferingProposalRow {
  keywordId: string;
  phrase: string;
  offeringId: string;
  offeringName: string;
  confidence: number | null;
  clicks: number;
  impressions: number;
  valueBand: string;
  /** The whole set, not the page. */
  totalCount: number;
}

/** The AI's unsure placements on this site's own offerings, highest demand first. */
export async function listOfferingProposals(
  siteId: string,
  start: string,
  end: string,
  limit: number,
  signal?: AbortSignal,
): Promise<OfferingProposalRow[]> {
  const response = await (await seoDb())
    .rpc("gsc_offering_proposed_keywords", {
      p_site_id: siteId,
      p_start: start,
      p_end: end,
      p_limit: limit,
    })
    .abortSignal(signal ?? new AbortController().signal);
  const rows = assertGoverned(response.data, response.error, "read the placements waiting on you");
  return (rows ?? []).map((row) => ({
    keywordId: row.keyword_id,
    phrase: row.phrase,
    offeringId: row.offering_id,
    offeringName: row.offering_name,
    confidence: row.confidence,
    clicks: Number(row.clicks ?? 0),
    impressions: Number(row.impressions ?? 0),
    valueBand: row.value_band,
    totalCount: Number(row.total_count ?? 0),
  }));
}

export interface OfferingDriftRow {
  keywordId: string;
  phrase: string;
  oldOfferingId: string | null;
  oldOfferingName: string | null;
  newOfferingId: string;
  newOfferingName: string;
  confidence: number | null;
  changedAt: string;
}

/**
 * The AI moved a placement on this site from one offering to another and nobody
 * here has ruled on it. Bounded by the site's own AI placements (D313 — the old
 * inherited-rung read never finished on a large site).
 */
export async function getOfferingPlacementDrift(
  siteId: string,
  limit: number,
  signal?: AbortSignal,
): Promise<OfferingDriftRow[]> {
  const response = await (await seoDb())
    .rpc("gsc_offering_placement_drift", { p_site_id: siteId, p_limit: limit })
    .abortSignal(signal ?? new AbortController().signal);
  const rows = assertGoverned(response.data, response.error, "read the placements the AI moved");
  return (rows ?? []).map((row) => ({
    keywordId: row.keyword_id,
    phrase: row.phrase,
    oldOfferingId: row.old_offering_id,
    oldOfferingName: row.old_offering_name,
    newOfferingId: row.new_offering_id,
    newOfferingName: row.new_offering_name,
    confidence: row.confidence,
    changedAt: row.changed_at,
  }));
}
