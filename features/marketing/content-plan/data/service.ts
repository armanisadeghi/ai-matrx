/**
 * features/marketing/content-plan/data/service.ts
 *
 * Direct browser Supabase access for the `plan` schema (Content Planning).
 * ALL plan CRUD goes here — the UI, the pillar map, and any future entrance
 * (agent envelope apply, generators) delegate to these functions; nothing
 * else touches `supabase.schema("plan")`. Reads/writes go DIRECT to Supabase
 * under RLS (CLAUDE.md data-flow rule) — aidream is only for AI work.
 *
 * THE TRIGGER CONTRACT (common-docs/systems/content-planning/FEATURE.md §1):
 * `route` / `depth` / `pillar_label` / `cluster_label` are computed by
 * `plan._node_shape` and cascaded by `_z_node_cascade`. They are NEVER sent
 * in a write; after any node write the site's node list is refetched so the
 * recomputed subtree comes back from the DB. DB errors (brandless site,
 * cycle, slug shape, duplicate route, org mismatch) are the contract —
 * they surface to the caller verbatim, never swallowed or worked around.
 */
import { supabase } from "@/utils/supabase/client";
import { requireAuthenticatedSupabaseSession } from "@/utils/supabase/webDb";
import {
  assertData,
  assertFound,
  assertMutated,
} from "@/features/marketing/data/service";

import type {
  PlanEntityInsert,
  PlanEntityRow,
  PlanEntityUpdate,
  PlanNodeInsert,
  PlanNodeRow,
  PlanNodeUpdate,
  PlanProfileRow,
} from "../types";

async function planDb() {
  await requireAuthenticatedSupabaseSession(supabase);
  return supabase.schema("plan");
}

async function seoDb() {
  await requireAuthenticatedSupabaseSession(supabase);
  return supabase.schema("seo");
}

// Whole-row selects: `select("*")` keeps the PostgREST literal-type
// inference exact against the generated Row type (a concatenated column
// string erases the literal and degrades every result to GenericStringError).
// Plan rows are small; there is no partial-payload discipline to protect.

// ─── plan.node ───────────────────────────────────────────────────────────

/** Every live node of a site — the whole tree in one read (plans are ≤ a few
 * thousand rows; allgreen-scale is ~400). Ordered by route for stable trees. */
export async function listPlanNodes(
  siteId: string,
  signal?: AbortSignal,
): Promise<PlanNodeRow[]> {
  const rows: PlanNodeRow[] = [];
  const abortSignal = signal ?? new AbortController().signal;
  const db = await planDb();
  for (let page = 0; page < 10; page += 1) {
    const from = page * 1000;
    const response = await db
      .from("node")
      .select("*")
      .eq("site_id", siteId)
      .is("deleted_at", null)
      .order("route", { ascending: true, nullsFirst: false })
      .order("id", { ascending: true })
      .range(from, from + 999)
      .abortSignal(abortSignal);
    const batch = assertData(response.data, response.error);
    rows.push(...batch);
    if (batch.length < 1000) break;
    if (page === 9) {
      // Loud recovery, never a silent truncation: a >10k-node plan needs a
      // deliberate paging strategy, not a quietly incomplete tree.
      throw new Error(
        "This plan has more than 10,000 nodes — refusing to load a silently truncated tree.",
      );
    }
  }
  return rows;
}

export async function getPlanNode(
  id: string,
  signal?: AbortSignal,
): Promise<PlanNodeRow> {
  const response = await (await planDb())
    .from("node")
    .select("*")
    .eq("id", id)
    .is("deleted_at", null)
    .abortSignal(signal ?? new AbortController().signal)
    .maybeSingle();
  return assertFound(response.data, response.error, "plan node");
}

/**
 * Create a node. `organization_id` is stamped from the site by the DB guard;
 * derived cache comes back computed. Trigger errors (brandless site, slug
 * shape, duplicate route/slug, cross-site parent) propagate verbatim.
 */
export async function createPlanNode(
  input: PlanNodeInsert,
): Promise<PlanNodeRow> {
  const response = await (await planDb())
    .from("node")
    .insert(input)
    .select("*")
    .single();
  return assertData(response.data, response.error);
}

/**
 * Patch a node. NEVER accepts trigger-owned columns (`PlanNodeUpdate` omits
 * them at the type level). Returns the fresh row, but callers must still
 * refetch the site list — `_z_node_cascade` may have recomputed descendants.
 */
export async function updatePlanNode(
  id: string,
  patch: PlanNodeUpdate,
): Promise<PlanNodeRow> {
  const response = await (await planDb())
    .from("node")
    .update(patch)
    .eq("id", id)
    .is("deleted_at", null)
    .select("*");
  const rows = assertData(response.data, response.error);
  assertMutated(rows, null, "update this plan node");
  return rows[0];
}

/** Reparent = ONE write of parent_id; the DB recomputes the whole subtree. */
export async function reparentPlanNode(
  id: string,
  parentId: string | null,
): Promise<PlanNodeRow> {
  return updatePlanNode(id, { parent_id: parentId });
}

/**
 * Soft-delete a node. Refuses while live children exist (platform CRUD
 * doctrine: a parent delete names the fix instead of stranding children —
 * and a stranded child's next write would be rejected by the DB anyway).
 */
export async function softDeletePlanNode(id: string): Promise<void> {
  const db = await planDb();
  const children = await db
    .from("node")
    .select("id", { count: "exact", head: true })
    .eq("parent_id", id)
    .is("deleted_at", null);
  if (children.error) throw children.error;
  if ((children.count ?? 0) > 0) {
    throw new Error(
      `This node still has ${children.count} live child node(s). Move or delete them first.`,
    );
  }
  const response = await db
    .from("node")
    .update({ deleted_at: new Date().toISOString() })
    .eq("id", id)
    .is("deleted_at", null)
    .select("id");
  assertMutated(response.data, response.error, "delete this plan node");
}

// ─── Cross-site plan overview (the /marketing/content-plan list page) ────

export interface PlanSiteStats {
  siteId: string;
  totalNodes: number;
  /** status_id → live node count (unset status under the "" key). */
  byStatusId: Record<string, number>;
  keywordBound: number;
  lastUpdatedAt: string | null;
}

/**
 * Per-site plan aggregates across EVERY RLS-visible site, for the list page.
 * Deliberate scope: this mirrors the site picker's own org-browse surface
 * (`listSiteOptions` — a deliberate VIEW-LAW destination), aggregated from
 * `plan.node` under the same RLS. Minimal columns, paginated; totals are
 * counted client-side because plans are small (≤ a few thousand rows total
 * pre-launch) and PostgREST grouping would cost an RPC we don't need yet.
 */
export async function listPlanSiteStats(
  signal?: AbortSignal,
): Promise<Map<string, PlanSiteStats>> {
  type StatRow = Pick<
    PlanNodeRow,
    "site_id" | "status_id" | "primary_keyword_id" | "updated_at"
  >;
  const rows: StatRow[] = [];
  const abortSignal = signal ?? new AbortController().signal;
  const db = await planDb();
  for (let page = 0; page < 30; page += 1) {
    const from = page * 1000;
    const response = await db
      .from("node")
      .select("site_id, status_id, primary_keyword_id, updated_at")
      .is("deleted_at", null)
      .order("id", { ascending: true })
      .range(from, from + 999)
      .abortSignal(abortSignal)
      .returns<StatRow[]>();
    const batch = assertData(response.data, response.error);
    rows.push(...batch);
    if (batch.length < 1000) break;
    if (page === 29) {
      // Loud recovery: >30k plan rows means the list page needs a real
      // aggregate RPC, not a silently incomplete overview.
      throw new Error(
        "More than 30,000 plan nodes visible — the overview needs a server-side aggregate before it can render honestly.",
      );
    }
  }
  const bySite = new Map<string, PlanSiteStats>();
  for (const row of rows) {
    let stats = bySite.get(row.site_id);
    if (!stats) {
      stats = {
        siteId: row.site_id,
        totalNodes: 0,
        byStatusId: {},
        keywordBound: 0,
        lastUpdatedAt: null,
      };
      bySite.set(row.site_id, stats);
    }
    stats.totalNodes += 1;
    const statusKey = row.status_id ?? "";
    stats.byStatusId[statusKey] = (stats.byStatusId[statusKey] ?? 0) + 1;
    if (row.primary_keyword_id) stats.keywordBound += 1;
    if (
      row.updated_at &&
      (stats.lastUpdatedAt === null || row.updated_at > stats.lastUpdatedAt)
    ) {
      stats.lastUpdatedAt = row.updated_at;
    }
  }
  return bySite;
}

// ─── plan.entity ─────────────────────────────────────────────────────────

export async function listPlanEntities(
  siteId: string,
  signal?: AbortSignal,
): Promise<PlanEntityRow[]> {
  const response = await (await planDb())
    .from("entity")
    .select("*")
    .eq("site_id", siteId)
    .is("deleted_at", null)
    .order("label", { ascending: true })
    .order("id", { ascending: true })
    .abortSignal(signal ?? new AbortController().signal);
  return assertData(response.data, response.error);
}

export async function createPlanEntity(
  input: PlanEntityInsert,
): Promise<PlanEntityRow> {
  const response = await (await planDb())
    .from("entity")
    .insert(input)
    .select("*")
    .single();
  return assertData(response.data, response.error);
}

export async function updatePlanEntity(
  id: string,
  patch: PlanEntityUpdate,
): Promise<PlanEntityRow> {
  const response = await (await planDb())
    .from("entity")
    .update(patch)
    .eq("id", id)
    .is("deleted_at", null)
    .select("*");
  const rows = assertData(response.data, response.error);
  assertMutated(rows, null, "update this plan entity");
  return rows[0];
}

export async function softDeletePlanEntity(id: string): Promise<void> {
  const response = await (await planDb())
    .from("entity")
    .update({ deleted_at: new Date().toISOString() })
    .eq("id", id)
    .is("deleted_at", null)
    .select("id");
  assertMutated(response.data, response.error, "delete this plan entity");
}

// ─── plan.profile ────────────────────────────────────────────────────────

/** The org's vertical profiles (config, not content). There is currently NO
 * hard site→vertical binding in the DB (open item in the system-of-record
 * doc); callers pick a profile explicitly, defaulting when the org has one. */
export async function listPlanProfiles(
  organizationId: string,
  signal?: AbortSignal,
): Promise<PlanProfileRow[]> {
  const response = await (await planDb())
    .from("profile")
    .select("*")
    .eq("organization_id", organizationId)
    .is("deleted_at", null)
    .order("vertical", { ascending: true })
    .abortSignal(signal ?? new AbortController().signal);
  return assertData(response.data, response.error);
}

/**
 * EVERY `plan.profile` row the caller can see, across orgs. Deliberately NOT
 * org-filtered: the platform archetype library lives on the system org
 * (`system_orgs.global_readable`), so an org-scoped read can never find it and
 * the whole builtin vocabulary would silently vanish for normal orgs. RLS stays
 * the ceiling — this is a config vocabulary read, not a content list.
 */
export async function listAllPlanProfiles(
  signal?: AbortSignal,
): Promise<PlanProfileRow[]> {
  const response = await (await planDb())
    .from("profile")
    .select("*")
    .is("deleted_at", null)
    .order("vertical", { ascending: true })
    .limit(500)
    .abortSignal(signal ?? new AbortController().signal);
  return assertData(response.data, response.error);
}

// ─── seo reads (the plan READS keyword value, never re-decides it) ───────

export interface SiteKeywordValueRow {
  keyword_id: string;
  workflow_status: string | null;
  content_role: string | null;
  priority_score: number | null;
}

/** Per-site keyword value rows for a set of keywords (or all for the site). */
export async function listSiteKeywordValues(
  siteId: string,
  keywordIds?: string[],
  signal?: AbortSignal,
): Promise<SiteKeywordValueRow[]> {
  let query = (await seoDb())
    .from("site_keyword_value")
    .select("keyword_id, workflow_status, content_role, priority_score")
    .eq("site_id", siteId)
    .is("deleted_at", null);
  if (keywordIds && keywordIds.length > 0) {
    query = query.in("keyword_id", keywordIds);
  }
  const response = await query
    .limit(2000)
    .abortSignal(signal ?? new AbortController().signal);
  return assertData(response.data, response.error);
}

export interface KeywordLabelRow {
  id: string;
  phrase: string;
}

/** Resolve keyword ids → phrases (labels on nodes / chips). */
export async function listKeywordLabels(
  ids: string[],
  signal?: AbortSignal,
): Promise<KeywordLabelRow[]> {
  if (ids.length === 0) return [];
  const response = await (await seoDb())
    .from("keyword")
    .select("id, phrase")
    .in("id", ids)
    .abortSignal(signal ?? new AbortController().signal);
  return assertData(response.data, response.error);
}

export interface SeoTopicOption {
  id: string;
  name: string;
  slug: string | null;
  parent_id: string | null;
}

/** Org-visible topics for the topic tagger (seo.topic is org-scoped). */
export async function listSeoTopics(
  search?: string,
  signal?: AbortSignal,
): Promise<SeoTopicOption[]> {
  let query = (await seoDb())
    .from("topic")
    .select("id, name, slug, parent_id")
    .is("deleted_at", null)
    .order("name", { ascending: true })
    .limit(200);
  const cleaned = (search ?? "").trim();
  if (cleaned) query = query.ilike("name", `%${cleaned}%`);
  const response = await query.abortSignal(
    signal ?? new AbortController().signal,
  );
  return assertData(response.data, response.error);
}
