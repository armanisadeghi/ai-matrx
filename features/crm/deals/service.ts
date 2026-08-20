// features/crm/deals/service.ts
//
// ALL deal reads/writes — direct browser → Supabase (`supabase.schema("crm")`),
// RLS as the authorization layer.
//
// WHY DIRECT WRITES ARE CORRECT HERE (and forbidden for `party`): the resolver
// governs party IDENTITY, where a bare insert manufactures duplicates. A deal
// is an org-scoped record with no identity-dedup hazard — the same class as
// `crm.outreach_list`. The load-bearing invariants (status derivation, stage
// history, the deal_won outcome event, lifecycle forward-derivation) live in
// DATABASE TRIGGERS, so this client cannot bypass them no matter what it
// writes. Never write `status`, `closed_at` or `stage_entered_at` — the DB
// derives them from the stage and will overwrite anything sent.
//
// THE VIEW LAW: the list is one blended declared work scope — deals I created
// OR deals in one of my organizations — like the outreach-list console. It is
// a sales floor's work console, not a browse surface.

import { supabase } from "@/utils/supabase/client";
import type { CrmQueryContext } from "../types";
import type {
  DealDetail,
  DealDateBucket,
  DealInsert,
  DealListQuery,
  DealListRow,
  DealRow,
  DealSortOpts,
  DealStageEventRow,
  DealUpdate,
} from "./types";
import { DEAL_SORT_KEYS } from "./types";

function pgError(error: { message?: string; code?: string }): Error {
  return new Error(
    error.message?.trim()
      ? `${error.message}${error.code ? ` (${error.code})` : ""}`
      : "Supabase returned an error with no message — usually a gateway/PostgREST " +
        "failure rather than a query error.",
  );
}

function crm() {
  return supabase.schema("crm");
}

/** The party embed, pinned to the FK column (self-join embeds MUST target the
 *  FK column — `party!<fk-name>` resolves REVERSE at runtime; see FEATURE.md). */
const PARTY_EMBED = "*, party:primary_party_id(id,display_name,party_kind)";

function bucketSince(bucket: DealDateBucket): string {
  const hours = { "1d": 24, "7d": 24 * 7, "30d": 24 * 30, "90d": 24 * 90 }[
    bucket
  ];
  return new Date(Date.now() - hours * 3600_000).toISOString();
}

function sanitizeSearch(value: string): string {
  // PostgREST `or=` strings treat commas/parens as syntax — strip them.
  return value.trim().replace(/[,()]/g, " ").replace(/\s+/g, " ").trim();
}

type DealPredicateBuilder<Q> = {
  is(column: string, value: null): Q;
  not(column: string, operator: string, value: unknown): Q;
  eq(column: string, value: unknown): Q;
  in(column: string, values: readonly unknown[]): Q;
  ilike(column: string, pattern: string): Q;
  gte(column: string, value: string): Q;
  lte(column: string, value: string): Q;
  or(filters: string): Q;
};

/**
 * The FULL deal-list predicate set (scope, view, pipeline, facets, column
 * filters, search) — shared by the table, the board, and any future filter
 * enrollment, so a preview and its consumer can never diverge.
 */
export function applyDealListPredicates<Q extends DealPredicateBuilder<Q>>(
  builder: Q,
  query: DealListQuery,
  ctx: CrmQueryContext,
): Q {
  let q =
    query.view === "trash"
      ? builder.not("deleted_at", "is", null)
      : builder.is("deleted_at", null);

  // Blended declared work scope: mine OR my orgs (THE VIEW LAW).
  q = ctx.orgIds.length
    ? q.or(
        `created_by.eq.${ctx.userId},organization_id.in.(${ctx.orgIds.join(",")})`,
      )
    : q.eq("created_by", ctx.userId);

  if (query.pipelineId) q = q.eq("pipeline_id", query.pipelineId);

  const f = query.filters;
  if (f.name) q = q.ilike("name", `%${f.name}%`);
  if (f.stage_id && f.stage_id.length > 0) q = q.in("stage_id", f.stage_id);
  if (f.assigned_to) q = q.eq("assigned_to", f.assigned_to);
  if (f.status && f.status !== "all") q = q.eq("status", f.status);
  // "Closing within N days" — includes already-overdue deals on purpose: an
  // expected close in the past is MORE urgent, not out of the window.
  if (f.expected_close_date) {
    const horizon = new Date(
      Date.now() +
        { "1d": 24, "7d": 24 * 7, "30d": 24 * 30, "90d": 24 * 90 }[
          f.expected_close_date
        ] *
          3600_000,
    )
      .toISOString()
      .slice(0, 10);
    q = q.not("expected_close_date", "is", null).lte(
      "expected_close_date",
      horizon,
    );
  }
  if (f.updated_at) q = q.gte("updated_at", bucketSince(f.updated_at));
  if (f.created_at) q = q.gte("created_at", bucketSince(f.created_at));

  const term = sanitizeSearch(query.search);
  if (term) {
    q = q.or(`name.ilike.%${term}%,description.ilike.%${term}%`);
  }
  return q;
}

/** One page of deals + the TRUE total, everything applied server-side. */
export async function fetchDealPage(
  query: DealListQuery,
  opts: DealSortOpts,
  ctx: CrmQueryContext,
): Promise<{ rows: DealListRow[]; total: number }> {
  let q = applyDealListPredicates(
    crm().from("deal").select(PARTY_EMBED, { count: "exact" }),
    query,
    ctx,
  );
  const sortKey = (DEAL_SORT_KEYS as readonly string[]).includes(opts.sort)
    ? opts.sort
    : "updated_at";
  q = q
    .order(sortKey, { ascending: opts.direction === "asc" })
    .order("id", { ascending: true });
  const from = (query.page - 1) * opts.pageSize;
  const { data, error, count } = await q
    .range(from, from + opts.pageSize - 1)
    .returns<DealListRow[]>();
  if (error) throw pgError(error);
  return { rows: data ?? [], total: count ?? 0 };
}

/** Kanban cap: a board renders whole columns, so the fetch is bounded loudly. */
export const BOARD_DEAL_CAP = 500;

/**
 * Every live deal on one pipeline for the board (open + closed — the Won/Lost
 * columns render real cards). Capped at BOARD_DEAL_CAP with the count returned
 * so the board can SAY it truncated instead of silently narrowing.
 */
export async function fetchBoardDeals(
  pipelineId: string,
  ctx: CrmQueryContext,
): Promise<{ rows: DealListRow[]; total: number }> {
  let q = crm()
    .from("deal")
    .select(PARTY_EMBED, { count: "exact" })
    .is("deleted_at", null)
    .eq("pipeline_id", pipelineId);
  q = ctx.orgIds.length
    ? q.or(
        `created_by.eq.${ctx.userId},organization_id.in.(${ctx.orgIds.join(",")})`,
      )
    : q.eq("created_by", ctx.userId);
  const { data, error, count } = await q
    .order("sort_order", { ascending: true, nullsFirst: false })
    .order("stage_entered_at", { ascending: false })
    .order("id", { ascending: true })
    .limit(BOARD_DEAL_CAP)
    .returns<DealListRow[]>();
  if (error) throw pgError(error);
  return { rows: data ?? [], total: count ?? 0 };
}

export async function fetchDeal(id: string): Promise<DealListRow> {
  const { data, error } = await crm()
    .from("deal")
    .select(PARTY_EMBED)
    .eq("id", id)
    .maybeSingle<DealListRow>();
  if (error) throw pgError(error);
  if (!data) {
    const gate = new Error("record unavailable");
    (gate as Error & { token?: string }).token = "crm_deal";
    throw gate;
  }
  return data;
}

/** Everything the record page needs, loaded in one parallel batch. */
export async function fetchDealDetail(id: string): Promise<DealDetail> {
  const deal = await fetchDeal(id);
  const [events, interactions] = await Promise.all([
    crm()
      .from("deal_stage_event")
      .select("*")
      .eq("deal_id", id)
      .is("deleted_at", null)
      .order("entered_at", { ascending: false })
      .order("created_at", { ascending: false })
      .limit(100),
    crm()
      .from("interaction")
      .select("*")
      .eq("deal_id", id)
      .is("deleted_at", null)
      .order("occurred_at", { ascending: false, nullsFirst: false })
      .order("created_at", { ascending: false })
      .limit(100),
  ]);
  if (events.error) throw pgError(events.error);
  if (interactions.error) throw pgError(interactions.error);
  return {
    deal,
    stageEvents: (events.data ?? []) as DealStageEventRow[],
    interactions: interactions.data ?? [],
  };
}

/** Deals on a party — the record-page card, and THE DOOR back from a person. */
export async function fetchDealsForParty(
  partyId: string,
): Promise<DealRow[]> {
  const { data, error } = await crm()
    .from("deal")
    .select("*")
    .eq("primary_party_id", partyId)
    .is("deleted_at", null)
    .order("updated_at", { ascending: false })
    .limit(50);
  if (error) throw pgError(error);
  // Open deals first, then most recently touched.
  const rank: Record<string, number> = { open: 0, won: 1, lost: 2 };
  return (data ?? []).sort(
    (a, b) =>
      (rank[a.status] ?? 3) - (rank[b.status] ?? 3) ||
      (a.updated_at < b.updated_at ? 1 : -1),
  );
}

export async function createDeal(input: {
  name: string;
  pipelineId: string;
  stageId: string;
  orgId: string;
  amount?: number | null;
  currency?: string;
  expectedCloseDate?: string | null;
  primaryPartyId?: string | null;
  assignedTo?: string | null;
  description?: string | null;
  source?: string;
}): Promise<DealRow> {
  const name = input.name.trim();
  if (!name) throw new Error("Name the deal");
  const row: DealInsert = {
    name,
    pipeline_id: input.pipelineId,
    stage_id: input.stageId,
    organization_id: input.orgId,
    amount: input.amount ?? null,
    currency: (input.currency ?? "USD").toUpperCase(),
    expected_close_date: input.expectedCloseDate ?? null,
    primary_party_id: input.primaryPartyId ?? null,
    assigned_to: input.assignedTo ?? null,
    description: input.description?.trim() || null,
    source: input.source ?? "manual",
  };
  const { data, error } = await crm()
    .from("deal")
    .insert(row)
    .select("*")
    .single();
  if (error) throw pgError(error);
  return data;
}

/** Patch scalar fields. Stage moves welcome — the DB derives the rest. */
export async function updateDeal(
  id: string,
  patch: DealUpdate,
): Promise<void> {
  const { error } = await crm().from("deal").update(patch).eq("id", id);
  if (error) throw pgError(error);
}

/**
 * The board drop: one write moving the deal to a stage (and optionally a
 * manual position within the column). The trigger stamps stage_entered_at,
 * derives status/closed_at, appends the stage event, and on a won transition
 * writes the outcome event + advances the party lifecycle — all server-side.
 */
export async function moveDealToStage(args: {
  dealId: string;
  stageId: string;
  sortOrder?: number | null;
}): Promise<void> {
  const patch: DealUpdate = { stage_id: args.stageId };
  if (args.sortOrder !== undefined) patch.sort_order = args.sortOrder;
  const { error } = await crm().from("deal").update(patch).eq("id", args.dealId);
  if (error) throw pgError(error);
}

export async function deleteDeal(id: string): Promise<void> {
  const { error } = await crm()
    .from("deal")
    .update({ deleted_at: new Date().toISOString() })
    .eq("id", id);
  if (error) throw pgError(error);
}

export async function restoreDeal(id: string): Promise<void> {
  const { error } = await crm()
    .from("deal")
    .update({ deleted_at: null })
    .eq("id", id);
  if (error) throw pgError(error);
}
