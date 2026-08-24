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
  const response = await (await seoDb())
    .rpc("gsc_keyword_stamps_for", {
      p_site_id: siteId,
      p_keyword_ids: keywordIds,
      p_dimension_slugs: dimensionSlugs,
    })
    .abortSignal(signal ?? new AbortController().signal);
  const rows = assertData(response.data, response.error, "read your columns");
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

/* ------------------------------------------------------------- saved views */

export interface SavedView {
  id: string;
  name: string;
  surface: string;
  state: Json;
  position: number | null;
  shared: boolean;
  createdBy: string | null;
  updatedAt: string;
}

type SavedViewRow = {
  id: string;
  name: string;
  surface: string;
  state: Json;
  sort_position: number | null;
  shared: boolean;
  created_by: string | null;
  updated_at: string;
};

function toSavedView(row: SavedViewRow): SavedView {
  return {
    id: row.id,
    name: row.name,
    surface: row.surface,
    state: row.state,
    position: row.sort_position,
    shared: row.shared,
    createdBy: row.created_by,
    updatedAt: row.updated_at,
  };
}

export async function listSavedViews(
  siteId: string,
  signal?: AbortSignal,
): Promise<SavedView[]> {
  const response = await (await seoDb())
    .rpc("gsc_saved_views", { p_site_id: siteId })
    .abortSignal(signal ?? new AbortController().signal);
  const rows = assertData(response.data, response.error, "load your saved views");
  return (rows as SavedViewRow[]).map(toSavedView);
}

export async function saveView(input: {
  siteId: string;
  name: string;
  state: Record<string, string>;
  id?: string | null;
  position?: number | null;
  shared?: boolean;
}): Promise<SavedView> {
  const response = await (await seoDb()).rpc("gsc_save_view", {
    p_site_id: input.siteId,
    p_name: input.name,
    p_state: input.state as unknown as Json,
    ...(input.id ? { p_id: input.id } : {}),
    ...(input.position != null ? { p_position: input.position } : {}),
    ...(input.shared != null ? { p_shared: input.shared } : {}),
  });
  const rows = assertGoverned(response.data, response.error, "save that view");
  const row = (rows as SavedViewRow[])[0];
  if (!row) throw new Error("The view saved but came back empty — reload the page.");
  return toSavedView(row);
}

export async function deleteSavedView(
  siteId: string,
  id: string,
): Promise<void> {
  const response = await (await seoDb()).rpc("gsc_delete_saved_view", {
    p_site_id: siteId,
    p_id: id,
  });
  assertGoverned(response.data, response.error, "delete that view");
}

/* ------------------------------------------------ the SERVICE (topic) stamp */

/**
 * THE SERVICE COLUMN. Arman, 2026-08-24: "when I look at all green electronics
 * recycling, the first thing I wanna know is what service they map to… I wanna
 * know what maps to e-waste recycling, what maps to ITAD, and what maps to
 * data destruction."
 *
 * The topic tree is the ONE declared hierarchical exception in the stamp model
 * (P19), so it has its own stamp table (`seo.keyword_topic`) rather than a
 * dimension + value pair. Everything else about it is the same contract as a
 * stamp: read the window you render, write through ONE RPC, carry the reason.
 */
export interface KeywordServicePlacement {
  topicId: string;
  topicName: string;
  nodeType: string;
  rootId: string | null;
  rootName: string | null;
  rootType: string | null;
  /** Root › … › parent — the ancestors, never the node itself. */
  lineage: string | null;
  /** 'human' | 'agent' | a model token — whose ruling this is. */
  assignedBy: string | null;
  confidence: number | null;
  notes: string | null;
  /** True when THIS topic carries the site's own worth ruling. */
  hasOwnWorth: boolean;
  /** The ancestor the worth is inherited FROM, when it is inherited. */
  worthFromId: string | null;
  worthFromName: string | null;
}

/** keyword_id → its primary placement. Unplaced keywords are simply absent. */
export type KeywordServiceMap = Map<string, KeywordServicePlacement>;

/**
 * THE SCOPE RULE, again: the RPC refuses more than 2,000 ids, so the caller
 * asks for the page it renders. Resolving 20,000 keywords' lineage to paint 50
 * rows is the mistake the stamp reader already refuses to make.
 */
export async function getKeywordServices(
  siteId: string,
  keywordIds: string[],
  signal?: AbortSignal,
): Promise<KeywordServiceMap> {
  const map: KeywordServiceMap = new Map();
  if (keywordIds.length === 0) return map;
  const response = await (await seoDb())
    .rpc("gsc_keyword_topics_for", {
      p_site_id: siteId,
      p_keyword_ids: keywordIds,
    })
    .abortSignal(signal ?? new AbortController().signal);
  const rows = assertData(
    response.data,
    response.error,
    "read which service these keywords map to",
  );
  for (const row of rows) {
    map.set(row.keyword_id, {
      topicId: row.topic_id,
      topicName: row.topic_name,
      nodeType: row.node_type,
      rootId: row.root_id,
      rootName: row.root_name,
      rootType: row.root_type,
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

export interface SetServiceResult {
  /** What the resolver says each keyword is worth AFTER the placement. */
  keywordId: string;
  valueBand: string;
  valueSource: string;
  valueScore: number | null;
}

/**
 * THE ONE PLACEMENT WRITE — `seo.gsc_set_keyword_topic`. One row from a cell,
 * the checked rows, or every keyword the filters match all land here, and the
 * reason (P24) rides along on the stamp.
 *
 * `topicId: null` takes the keyword off the tree. The payoff IS the response:
 * the RPC answers with the band each keyword lands in after the change,
 * straight from the resolver, so a caller never re-derives a score.
 *
 * NOTE — the topic-tree screen has its own thinner wrapper over this same RPC
 * (`value-system/topics/data.ts` → `setKeywordPrimaryTopic`, no reason field).
 * Two wrappers, ONE write path; collapse them into this one when that file is
 * next touched.
 */
export async function setKeywordService(input: {
  siteId: string;
  keywordIds: string[];
  topicId: string | null;
  notes?: string | null;
}): Promise<SetServiceResult[]> {
  const response = await (await seoDb()).rpc("gsc_set_keyword_topic", {
    p_site_id: input.siteId,
    p_keyword_ids: input.keywordIds,
    ...(input.topicId ? { p_topic_id: input.topicId } : {}),
    ...(input.notes?.trim() ? { p_notes: input.notes.trim() } : {}),
  });
  const rows = assertGoverned(
    response.data,
    response.error,
    input.topicId ? "place these keywords on that service" : "take these keywords off the tree",
  );
  return (rows ?? []).map((row) => ({
    keywordId: row.keyword_id,
    valueBand: row.value_band,
    valueSource: row.value_source,
    valueScore: row.value_score == null ? null : Number(row.value_score),
  }));
}
