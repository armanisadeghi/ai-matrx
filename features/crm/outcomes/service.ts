// features/crm/outcomes/service.ts
//
// Reads and the ONE write path for attribution outcomes (platform.outcome_event).
// Reads: direct supabase-js, schema-scoped, server-paged (React → Supabase, no
// Next hop). Write: ONLY platform.decide_outcome_event — the SECURITY DEFINER
// RPC that stamps who decided and completes a reputation-case subject on
// confirm. Never update the row directly; only the aidream attribution pass
// inserts here (IC-5: WP4 writes, everyone else reads).

import { supabase } from "@/utils/supabase/client";
import { requireAuthenticatedSupabaseSession } from "@/utils/supabase/webDb";
import type { OutcomeEventRow, OutcomeStatus } from "./lib";

function pgError(error: { message?: string; code?: string }): Error {
  return new Error(
    error.message?.trim()
      ? `${error.message}${error.code ? ` (${error.code})` : ""}`
      : "Supabase returned an error with no message — usually a gateway/PostgREST " +
        "failure rather than a query error.",
  );
}

async function platformDb() {
  await requireAuthenticatedSupabaseSession(supabase);
  return supabase.schema("platform");
}

export interface OutcomeListPage {
  rows: OutcomeEventRow[];
  total: number;
}

export async function listOutcomeEvents(input: {
  campaignId: string;
  status?: OutcomeStatus | "all";
  page: number;
  pageSize: number;
}): Promise<OutcomeListPage> {
  const db = await platformDb();
  let query = db
    .from("outcome_event")
    .select("*", { count: "exact" })
    .eq("campaign_id", input.campaignId);
  if (input.status && input.status !== "all") {
    query = query.eq("status", input.status);
  }
  const from = (input.page - 1) * input.pageSize;
  const { data, error, count } = await query
    .order("matched_at", { ascending: false })
    .order("id", { ascending: true })
    .range(from, from + input.pageSize - 1);
  if (error) throw pgError(error);
  return { rows: (data ?? []) as OutcomeEventRow[], total: count ?? 0 };
}

export interface OutcomeCounts {
  confirmed: number;
  proposed: number;
  rejected: number;
}

export async function countOutcomeEvents(campaignId: string): Promise<OutcomeCounts> {
  const db = await platformDb();
  const head = (status: OutcomeStatus) =>
    db
      .from("outcome_event")
      .select("*", { count: "exact", head: true })
      .eq("campaign_id", campaignId)
      .eq("status", status);
  const [confirmed, proposed, rejected] = await Promise.all([
    head("confirmed"),
    head("proposed"),
    head("rejected"),
  ]);
  for (const response of [confirmed, proposed, rejected]) {
    if (response.error) throw pgError(response.error);
  }
  return {
    confirmed: confirmed.count ?? 0,
    proposed: proposed.count ?? 0,
    rejected: rejected.count ?? 0,
  };
}

/** Confirm or reject an outcome — the frontend's ONLY write on this table. */
export async function decideOutcomeEvent(input: {
  outcomeId: string;
  status: "confirmed" | "rejected";
  note?: string;
}): Promise<OutcomeEventRow> {
  const db = await platformDb();
  const { data, error } = await db.rpc("decide_outcome_event", {
    p_outcome_id: input.outcomeId,
    p_status: input.status,
    p_note: input.note ?? undefined,
  });
  if (error) throw pgError(error);
  if (!data) throw new Error("The decision returned no updated record.");
  return data as OutcomeEventRow;
}
