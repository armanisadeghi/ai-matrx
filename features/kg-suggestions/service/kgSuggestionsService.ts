// features/kg-suggestions/service/kgSuggestionsService.ts
//
// Direct-Supabase data layer for KG → scope suggestions. As of 2026-06-07 the
// aidream `/api/kg-suggestions` HTTP API is DELETED; aidream is a pure PRODUCER
// of suggestion rows. The frontend reads and decides DIRECTLY against Supabase
// (RLS-scoped tables + the `set_context_value` RPC), per the handoff:
//   aidream/docs/rag_and_ner/handoffs/scope_suggestions_direct_supabase.md
//
// Two ledgers (migration kg_013), both RLS-scoped to `auth.uid() = user_id`:
//   - scope_association_suggestions (Stage A) — doc → scope links
//   - scope_item_value_suggestions  (Stage B) — scope slot → value fills
//
// This module normalizes both raw shapes into the single `KgSuggestionRow`,
// and owns the four decisions:
//   - reject / defer → a direct row update (status + suppressed_until window)
//   - accept VALUE   → set_context_value RPC (via the scopes chokepoint) then
//                      mark the row accepted
//   - accept LINK    → tag the source to the scope (ctx_scope_assignments, via
//                      the scopes chokepoint) then mark the row accepted
// Heavy-hitter accept (create a brand-new scope) is driven by
// useHeavyHitterAccept — it needs UI input (name + scope type).

"use client";

import { supabase } from "@/utils/supabase/client";
import { buildSearchOr } from "@/utils/supabase-search";
import { requireUserId } from "@/utils/auth/getUserId";
import { scopesService } from "@/features/scopes/service/scopesService";
import {
  isScopesRpcErr,
  type EntityType,
} from "@/features/scopes/types";
import type { Database } from "@/types/database.types";
import {
  kgSourceKindToEntityType,
  type KgEnrichedSuggestionRow,
  type KgMatchKind,
  type KgSuggestionRow,
  type KgSuggestionStage,
  type KgSuggestionStatus,
  type KgSuggestionsFilter,
  type KgSuggestionsQuery,
} from "@/features/kg-suggestions/types";

type AssociationRow =
  Database["public"]["Tables"]["scope_association_suggestions"]["Row"];
type ValueRow =
  Database["public"]["Tables"]["scope_item_value_suggestions"]["Row"];
type SuggestionView = Database["public"]["Views"]["v_scope_suggestions"]["Row"];
type SuggestionStatsView =
  Database["public"]["Views"]["v_scope_suggestion_stats"]["Row"];

// Suppression windows the producer honours before re-proposing the same cell
// (backend defaults: 30 days reject, 7 days defer).
const REJECT_SUPPRESS_DAYS = 30;
const DEFER_SUPPRESS_DAYS = 7;
const DAY_MS = 864e5;

// ── Normalization ────────────────────────────────────────────────────────────

function mapAssociationRow(r: AssociationRow): KgSuggestionRow {
  return {
    id: r.id,
    stage: "association",
    organization_id: r.organization_id,
    source_kind: r.source_kind,
    source_id: r.source_id,
    entity: { id: r.kg_entity_id, kind: null, name: null },
    target: {
      scope_id: r.target_scope_id,
      scope_item_id: r.target_scope_item_id,
      slot_name: r.target_slot_name,
    },
    suggested_value: r.suggested_value,
    current_value_snapshot: null,
    match_kind: r.match_kind as KgMatchKind,
    confidence: r.confidence,
    status: r.status as KgSuggestionStatus,
    context_snippet: r.context_snippet,
    decision_note: r.decision_note,
    is_starred: r.is_starred,
    viewed_at: r.viewed_at,
    created_at: r.created_at,
    decided_at: r.decided_at,
    suppressed_until: r.suppressed_until,
  };
}

function mapValueRow(r: ValueRow): KgSuggestionRow {
  return {
    id: r.id,
    stage: "value",
    organization_id: r.organization_id,
    source_kind: r.source_kind,
    source_id: r.source_id,
    entity: { id: r.kg_entity_id, kind: null, name: null },
    target: {
      scope_id: r.target_scope_id,
      // Stage B carries the CONTEXT ITEM id + slot key — the same semantics the
      // enrichment + decision UI use for `scope_item_id` / `slot_name`.
      scope_item_id: r.target_context_item_id,
      slot_name: r.target_slot_key,
    },
    suggested_value: r.suggested_value,
    current_value_snapshot: r.current_value_snapshot,
    match_kind: r.match_kind as KgMatchKind,
    confidence: r.confidence,
    status: r.status as KgSuggestionStatus,
    context_snippet: r.context_snippet,
    decision_note: r.decision_note,
    is_starred: r.is_starred,
    viewed_at: r.viewed_at,
    created_at: r.created_at,
    decided_at: r.decided_at,
    suppressed_until: r.suppressed_until,
  };
}

// ── Read ─────────────────────────────────────────────────────────────────────

export interface KgSuggestionsListResult {
  rows: KgSuggestionRow[];
  total: number;
}

function statusFilterValue(
  filter: KgSuggestionsFilter,
): KgSuggestionStatus | "all" {
  return filter.status ?? "pending";
}

/**
 * Read pending (or any-status) suggestions for one of the three views. RLS
 * scopes every row to the caller; we never need an explicit user filter.
 *
 *  - global      → both ledgers
 *  - source      → both ledgers filtered by source_kind + source_id
 *  - scope-item  → ONLY the value ledger (Stage A has no slot), filtered by
 *                  target_context_item_id (the shared slot definition)
 */
export async function listKgSuggestions(
  filter: KgSuggestionsFilter,
  opts: { signal?: AbortSignal } = {},
): Promise<KgSuggestionsListResult> {
  requireUserId();
  const status = statusFilterValue(filter);

  // Per-slot panel: value ledger only.
  if ("scopeItemId" in filter) {
    let q = supabase
      .from("scope_item_value_suggestions")
      .select("*")
      .eq("target_context_item_id", filter.scopeItemId)
      .order("confidence", { ascending: false });
    if (status !== "all") q = q.eq("status", status);
    if (opts.signal) q = q.abortSignal(opts.signal);
    const { data, error } = await q;
    if (error) throw new Error(error.message);
    const rows = (data ?? []).map(mapValueRow);
    return { rows, total: rows.length };
  }

  // Both ledgers (global or per-source).
  const isSource = "sourceKind" in filter;

  let assocQ = supabase.from("scope_association_suggestions").select("*");
  let valueQ = supabase.from("scope_item_value_suggestions").select("*");
  if (status !== "all") {
    assocQ = assocQ.eq("status", status);
    valueQ = valueQ.eq("status", status);
  }
  if (isSource) {
    assocQ = assocQ
      .eq("source_kind", filter.sourceKind)
      .eq("source_id", filter.sourceId);
    valueQ = valueQ
      .eq("source_kind", filter.sourceKind)
      .eq("source_id", filter.sourceId);
  }
  assocQ = assocQ.order("confidence", { ascending: false });
  valueQ = valueQ.order("confidence", { ascending: false });
  if (opts.signal) {
    assocQ = assocQ.abortSignal(opts.signal);
    valueQ = valueQ.abortSignal(opts.signal);
  }

  const [assocRes, valueRes] = await Promise.all([assocQ, valueQ]);
  if (assocRes.error) throw new Error(assocRes.error.message);
  if (valueRes.error) throw new Error(valueRes.error.message);

  const rows = [
    ...(assocRes.data ?? []).map(mapAssociationRow),
    ...(valueRes.data ?? []).map(mapValueRow),
  ].sort((a, b) => b.created_at.localeCompare(a.created_at));

  return { rows, total: rows.length };
}

// ── Decide: reject / defer (direct update) ────────────────────────────────────

function tableFor(
  row: KgSuggestionRow,
): "scope_item_value_suggestions" | "scope_association_suggestions" {
  return row.stage === "value"
    ? "scope_item_value_suggestions"
    : "scope_association_suggestions";
}

async function markDecided(
  row: KgSuggestionRow,
  status: KgSuggestionStatus,
  opts: { suppressDays?: number; note?: string | null } = {},
): Promise<void> {
  const userId = requireUserId();
  const patch: {
    status: string;
    decided_at: string;
    decided_by: string;
    suppressed_until?: string;
    decision_note?: string | null;
  } = {
    status,
    decided_at: new Date().toISOString(),
    decided_by: userId,
  };
  if (opts.suppressDays != null) {
    patch.suppressed_until = new Date(
      Date.now() + opts.suppressDays * DAY_MS,
    ).toISOString();
  }
  // Only write the note when one is provided, so a plain decision doesn't clear
  // an existing note (e.g. accept after a deferred-with-note).
  if (opts.note !== undefined) {
    patch.decision_note = opts.note?.trim() ? opts.note.trim() : null;
  }
  const { error } = await supabase
    .from(tableFor(row))
    .update(patch)
    .eq("id", row.id);
  if (error) throw new Error(error.message);
}

export async function rejectKgSuggestion(
  row: KgSuggestionRow,
  note?: string | null,
): Promise<void> {
  await markDecided(row, "rejected", {
    suppressDays: REJECT_SUPPRESS_DAYS,
    note,
  });
}

export async function deferKgSuggestion(
  row: KgSuggestionRow,
  note?: string | null,
): Promise<void> {
  await markDecided(row, "deferred", {
    suppressDays: DEFER_SUPPRESS_DAYS,
    note,
  });
}

/** Mark a row accepted (no suppression window — it's resolved). */
export async function markKgSuggestionAccepted(
  row: KgSuggestionRow,
): Promise<void> {
  await markDecided(row, "accepted");
}

/**
 * Restore a decided (deferred/rejected/expired) row back to `pending` so it
 * re-surfaces across every surface. Clears the decision stamp + suppression
 * window. Used by the management table.
 */
export async function restoreKgSuggestion(row: KgSuggestionRow): Promise<void> {
  const { error } = await supabase
    .from(tableFor(row))
    .update({
      status: "pending",
      decided_at: null,
      decided_by: null,
      suppressed_until: null,
    })
    .eq("id", row.id);
  if (error) throw new Error(error.message);
}

/** Star / unstar a row for follow-up (manager). */
export async function setKgSuggestionStarred(
  row: KgSuggestionRow,
  starred: boolean,
): Promise<void> {
  const { error } = await supabase
    .from(tableFor(row))
    .update({ is_starred: starred })
    .eq("id", row.id);
  if (error) throw new Error(error.message);
}

/**
 * Stamp `viewed_at` on rows the user has now seen (only those still unseen).
 * Rows are grouped by stage so each hits the correct ledger. Best-effort — a
 * failure to record "seen" must never block the UI, so errors are swallowed.
 */
export async function markKgSuggestionsViewed(
  rows: Array<{
    id: string;
    stage: KgSuggestionStage;
    viewed_at: string | null;
  }>,
): Promise<void> {
  const now = new Date().toISOString();
  const valueIds = rows
    .filter((r) => r.stage === "value" && !r.viewed_at)
    .map((r) => r.id);
  const assocIds = rows
    .filter((r) => r.stage === "association" && !r.viewed_at)
    .map((r) => r.id);
  const ops: PromiseLike<unknown>[] = [];
  if (valueIds.length) {
    ops.push(
      supabase
        .from("scope_item_value_suggestions")
        .update({ viewed_at: now })
        .in("id", valueIds)
        .is("viewed_at", null),
    );
  }
  if (assocIds.length) {
    ops.push(
      supabase
        .from("scope_association_suggestions")
        .update({ viewed_at: now })
        .in("id", assocIds)
        .is("viewed_at", null),
    );
  }
  if (ops.length) {
    try {
      await Promise.all(ops);
    } catch {
      // best-effort — never block on "seen" tracking
    }
  }
}

// ── Decide: accept ─────────────────────────────────────────────────────────

/**
 * Accept a Stage-B value suggestion: write the cell through the sanctioned
 * `set_context_value` RPC (scopes chokepoint), then mark the row accepted.
 */
export async function acceptValueSuggestion(
  row: KgSuggestionRow,
): Promise<void> {
  if (!row.target.scope_id || !row.target.scope_item_id) {
    throw new Error("Suggestion is missing its target scope or field.");
  }
  if (row.suggested_value == null) {
    throw new Error("Suggestion has no value to write.");
  }
  const res = await scopesService.setContextValue({
    context_item_id: row.target.scope_item_id,
    scope_id: row.target.scope_id,
    value_text: row.suggested_value,
    source_type: "ai_enriched",
    change_summary: `Accepted suggestion ${row.id}`,
  });
  if (isScopesRpcErr(res)) throw new Error(res.error.message);
  await markKgSuggestionAccepted(row);
}

/**
 * Accept a Stage-A link suggestion: tag the source document to the target
 * scope (additively, via the ctx_scope_assignments chokepoint), then mark the
 * row accepted. The source is never re-tagged off its existing scopes.
 */
export async function acceptAssociationSuggestion(
  row: KgSuggestionRow,
): Promise<void> {
  const scopeId = row.target.scope_id;
  if (!scopeId) {
    throw new Error("Suggestion has no target scope to tag.");
  }
  const entityType = kgSourceKindToEntityType(row.source_kind);
  if (!entityType) {
    throw new Error(`A ${row.source_kind} can't be tagged to a scope yet.`);
  }
  const current = await scopesService.getEntityScopes(
    entityType as EntityType,
    row.source_id,
  );
  if (isScopesRpcErr(current)) throw new Error(current.error.message);
  const next = Array.from(new Set([...current.data.scope_ids, scopeId]));
  const written = await scopesService.setEntityScopes(
    entityType as EntityType,
    row.source_id,
    next,
  );
  if (isScopesRpcErr(written)) throw new Error(written.error.message);
  await markKgSuggestionAccepted(row);
}

// ── Management read (the enriched `v_scope_suggestions` view) ─────────────────

function mapViewRow(r: SuggestionView): KgEnrichedSuggestionRow {
  return {
    id: r.id as string,
    stage: r.stage as KgSuggestionStage,
    organization_id: r.organization_id,
    source_kind: r.source_kind as string,
    source_id: r.source_id as string,
    entity: { id: r.kg_entity_id, kind: null, name: null },
    target: {
      scope_id: r.target_scope_id,
      scope_item_id: r.target_item_id,
      slot_name: r.target_slot,
    },
    suggested_value: r.suggested_value,
    current_value_snapshot: r.current_value_snapshot,
    match_kind: r.match_kind as KgMatchKind,
    confidence: r.confidence as number,
    status: r.status as KgSuggestionStatus,
    context_snippet: r.context_snippet,
    decision_note: r.decision_note,
    is_starred: r.is_starred as boolean,
    viewed_at: r.viewed_at,
    created_at: r.created_at as string,
    decided_at: r.decided_at,
    suppressed_until: r.suppressed_until,
    orgName: r.org_name,
    orgSlug: r.org_slug,
    scopeTypeId: r.scope_type_id,
    scopeTypeLabel: r.scope_type_label,
    scopeTypeSlug: r.scope_type_slug,
    scopeTypeIcon: r.scope_type_icon,
    scopeName: r.scope_name,
    scopeSlug: r.scope_slug,
    itemLabel: r.item_label,
    itemKey: r.item_key,
  };
}

export interface KgEnrichedListResult {
  rows: KgEnrichedSuggestionRow[];
  total: number;
}

const DEFAULT_PAGE_SIZE = 50;

const SORT_COLUMN: Record<NonNullable<KgSuggestionsQuery["sortBy"]>, string> = {
  created_at: "created_at",
  confidence: "confidence",
  status: "status",
  scope_name: "scope_name",
  item_label: "item_label",
  org_name: "org_name",
};

/** Escape PostgREST `or()` reserved characters in a free-text search term. */
function sanitizeSearch(term: string): string {
  return term.replace(/[(),%]/g, " ").trim();
}

/**
 * The management table read: query the enriched view with server-side
 * filtering, sorting and pagination. RLS on the underlying ledgers scopes
 * every row to the caller (the view is `security_invoker`).
 */
export async function queryScopeSuggestions(
  q: KgSuggestionsQuery,
  opts: { signal?: AbortSignal; excludeHeavyHitter?: boolean } = {},
): Promise<KgEnrichedListResult> {
  requireUserId();

  let query = supabase
    .from("v_scope_suggestions")
    .select("*", { count: "exact" });

  if (q.statuses && q.statuses.length > 0) {
    query = query.in("status", q.statuses);
  }
  // Heavy-hitter rows (recurring entity → NEW scope) are pulled into their own
  // prominent section, so the main table excludes them.
  if (opts.excludeHeavyHitter) {
    query = query.not("match_kind", "eq", "heavy_hitter");
  }
  if (q.stage && q.stage !== "all") query = query.eq("stage", q.stage);
  if (q.orgId) query = query.eq("organization_id", q.orgId);
  if (q.scopeTypeId) query = query.eq("scope_type_id", q.scopeTypeId);
  if (q.scopeId) query = query.eq("target_scope_id", q.scopeId);
  if (q.itemId) query = query.eq("target_item_id", q.itemId);
  if (q.sourceKind) query = query.eq("source_kind", q.sourceKind);
  if (q.matchKind) query = query.eq("match_kind", q.matchKind);
  if (q.minConfidence != null) query = query.gte("confidence", q.minConfidence);
  if (q.maxConfidence != null) query = query.lt("confidence", q.maxConfidence);
  if (q.starredOnly) query = query.eq("is_starred", true);
  if (q.unseenOnly) query = query.is("viewed_at", null);

  if (q.search && q.search.trim()) {
    const t = sanitizeSearch(q.search);
    if (t) {
      query = query.or(
        buildSearchOr(t, ["item_label", "scope_name", "suggested_value"]),
      );
    }
  }

  const sortCol = SORT_COLUMN[q.sortBy ?? "created_at"];
  query = query.order(sortCol, { ascending: q.sortDir === "asc" });
  // Stable secondary sort so equal primaries paginate deterministically.
  if (sortCol !== "created_at") {
    query = query.order("created_at", { ascending: false });
  }

  const pageSize = q.pageSize ?? DEFAULT_PAGE_SIZE;
  const page = Math.max(0, q.page ?? 0);
  const from = page * pageSize;
  query = query.range(from, from + pageSize - 1);

  if (opts.signal) query = query.abortSignal(opts.signal);

  const { data, error, count } = await query;
  if (error) throw new Error(error.message);
  const rows = (data ?? []).map(mapViewRow);
  return { rows, total: count ?? rows.length };
}

// ── Stats (header summary) ───────────────────────────────────────────────────

export interface KgSuggestionStat {
  organization_id: string | null;
  status: KgSuggestionStatus;
  is_starred: boolean;
  n: number;
}

/** Read the per-(org, status, starred) counts for the manager header. */
export async function fetchScopeSuggestionStats(
  opts: {
    signal?: AbortSignal;
  } = {},
): Promise<KgSuggestionStat[]> {
  requireUserId();
  let query = supabase.from("v_scope_suggestion_stats").select("*");
  if (opts.signal) query = query.abortSignal(opts.signal);
  const { data, error } = await query;
  if (error) throw new Error(error.message);
  return (data ?? []).map((r: SuggestionStatsView) => ({
    organization_id: r.organization_id,
    status: r.status as KgSuggestionStatus,
    is_starred: r.is_starred as boolean,
    n: r.n as number,
  }));
}
