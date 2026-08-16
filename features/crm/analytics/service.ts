// features/crm/analytics/service.ts
//
// Outreach reporting reads (WP4 build step 6). Direct supabase-js, schema
// scoped — React → Supabase, no Next hop, per the workspace's two rules.
//
// READ-ONLY, ALWAYS. Nothing in this file writes anything: a report that can
// change the thing it measures is a report nobody can trust. Confirming or
// rejecting a win stays where it already is — `platform.decide_outcome_event`,
// via `features/crm/outcomes/service.ts`.
//
// Every count is a `head: true` COUNT, so a campaign with 40,000 members costs
// the same as one with 40. The only rows actually fetched are the outcome
// timestamps the trend needs, and those are capped.

import { supabase } from "@/utils/supabase/client";
import { requireAuthenticatedSupabaseSession } from "@/utils/supabase/webDb";
import { MEMBER_STATUSES } from "../outreach-lists/types";
import type { MemberStatus } from "../outreach-lists/types";
import {
  buildCampaignRollup,
  buildExits,
  buildFunnel,
  buildOutcomeTrend,
  buildOrgTotals,
  buildResponseRates,
  type CampaignRollupRow,
  type ExitReason,
  type FunnelStage,
  type OrgTotals,
  type OutcomePoint,
  type ResponseRates,
  type StatusCounts,
} from "./lib";

/** How far back the win trend looks. A quarter is the reporting unit clients use. */
export const TREND_DAYS = 90;
/** Hard ceiling on outcome rows read for one trend — the counts are separate. */
const MAX_TREND_ROWS = 2000;
/** Campaigns shown in the org report. Beyond this, say so rather than truncate silently. */
export const MAX_REPORTED_CAMPAIGNS = 100;

function pgError(error: { message?: string; code?: string }): Error {
  return new Error(
    error.message?.trim()
      ? `${error.message}${error.code ? ` (${error.code})` : ""}`
      : "Supabase returned an error with no message — usually a gateway/PostgREST " +
        "failure rather than a query error.",
  );
}

async function crm() {
  await requireAuthenticatedSupabaseSession(supabase);
  return supabase.schema("crm");
}

async function platform() {
  await requireAuthenticatedSupabaseSession(supabase);
  return supabase.schema("platform");
}

function sinceIso(days: number): string {
  return new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();
}

async function memberStatusCounts(listId: string): Promise<StatusCounts> {
  const db = await crm();
  const base = () =>
    db
      .from("outreach_list_member")
      .select("id", { count: "exact", head: true })
      .eq("outreach_list_id", listId)
      .is("deleted_at", null);

  const results = await Promise.all([
    base(),
    ...MEMBER_STATUSES.map((status) => base().eq("status", status)),
  ]);
  for (const result of results) if (result.error) throw pgError(result.error);

  const counts: StatusCounts = { total: results[0].count ?? 0 };
  MEMBER_STATUSES.forEach((status, index) => {
    const value = results[index + 1].count ?? 0;
    if (value > 0) counts[status as MemberStatus] = value;
  });
  return counts;
}

async function messageCounts(
  listId: string,
): Promise<{ sent: number; replied: number }> {
  const db = await crm();
  const base = () =>
    db
      .from("interaction")
      .select("id", { count: "exact", head: true })
      .eq("outreach_list_id", listId)
      .is("deleted_at", null);

  const [sent, replied] = await Promise.all([
    // A DRAFT is not a message. Only a completed outbound interaction was
    // actually delivered to someone, so only those may sit under a reply rate.
    base().eq("direction", "outbound").eq("status", "completed"),
    base().eq("direction", "inbound"),
  ]);
  if (sent.error) throw pgError(sent.error);
  if (replied.error) throw pgError(replied.error);
  return { sent: sent.count ?? 0, replied: replied.count ?? 0 };
}

async function confirmedWins(campaignId: string): Promise<number> {
  const db = await platform();
  const { count, error } = await db
    .from("outcome_event")
    .select("id", { count: "exact", head: true })
    .eq("campaign_id", campaignId)
    .eq("status", "confirmed");
  if (error) throw pgError(error);
  return count ?? 0;
}

export interface CampaignPerformance {
  campaignId: string;
  funnel: FunnelStage[];
  responses: ResponseRates;
  exits: ExitReason[];
  trend: OutcomePoint[];
  proposedWins: number;
  confirmedWins: number;
  /** True when the trend window hit its row ceiling — say so, never truncate silently. */
  trendTruncated: boolean;
}

/** Everything the campaign workspace's Performance view needs, in one pass. */
export async function fetchCampaignPerformance(
  campaignId: string,
): Promise<CampaignPerformance> {
  const db = await platform();
  const [counts, messages, wins, outcomes] = await Promise.all([
    memberStatusCounts(campaignId),
    messageCounts(campaignId),
    confirmedWins(campaignId),
    db
      .from("outcome_event")
      .select("matched_at,status")
      .eq("campaign_id", campaignId)
      .gte("matched_at", sinceIso(TREND_DAYS))
      .order("matched_at", { ascending: true })
      .limit(MAX_TREND_ROWS),
  ]);
  if (outcomes.error) throw pgError(outcomes.error);
  const rows = (outcomes.data ?? []) as Array<{
    matched_at: string | null;
    status: string;
  }>;

  return {
    campaignId,
    funnel: buildFunnel(counts, wins),
    responses: buildResponseRates(messages),
    exits: buildExits(counts),
    trend: buildOutcomeTrend(rows),
    confirmedWins: wins,
    proposedWins: rows.filter((row) => row.status === "proposed").length,
    trendTruncated: rows.length >= MAX_TREND_ROWS,
  };
}

export interface OrgOutreachReport {
  campaigns: CampaignRollupRow[];
  totals: OrgTotals;
  trend: OutcomePoint[];
  /** Campaigns beyond `MAX_REPORTED_CAMPAIGNS`, reported rather than hidden. */
  notShown: number;
}

/**
 * Every campaign in the org, rolled up.
 *
 * Counts are per campaign because that is the only way a row can be a DOOR —
 * a single grouped query would produce numbers nobody could click into. The
 * campaign list is capped and any remainder is reported.
 */
export async function fetchOrgOutreachReport(
  organizationId: string,
): Promise<OrgOutreachReport> {
  const db = await crm();
  const platformDb = await platform();

  const [lists, total, outcomes] = await Promise.all([
    db
      .from("outreach_list")
      .select("id,name,status")
      .eq("organization_id", organizationId)
      .is("deleted_at", null)
      .order("created_at", { ascending: false })
      .limit(MAX_REPORTED_CAMPAIGNS),
    db
      .from("outreach_list")
      .select("id", { count: "exact", head: true })
      .eq("organization_id", organizationId)
      .is("deleted_at", null),
    platformDb
      .from("outcome_event")
      .select("matched_at,status")
      .eq("organization_id", organizationId)
      .gte("matched_at", sinceIso(TREND_DAYS))
      .order("matched_at", { ascending: true })
      .limit(MAX_TREND_ROWS),
  ]);
  if (lists.error) throw pgError(lists.error);
  if (total.error) throw pgError(total.error);
  if (outcomes.error) throw pgError(outcomes.error);

  const rows = (lists.data ?? []) as Array<{
    id: string;
    name: string | null;
    status: string | null;
  }>;
  const campaigns = await Promise.all(
    rows.map(async (row) => {
      const [counts, wins] = await Promise.all([
        memberStatusCounts(row.id),
        confirmedWins(row.id),
      ]);
      return buildCampaignRollup({
        campaignId: row.id,
        name: row.name ?? "Untitled campaign",
        status: row.status ?? "unknown",
        counts,
        wins,
      });
    }),
  );

  return {
    campaigns,
    totals: buildOrgTotals(campaigns),
    trend: buildOutcomeTrend(
      (outcomes.data ?? []) as Array<{ matched_at: string | null; status: string }>,
    ),
    notShown: Math.max(0, (total.count ?? 0) - rows.length),
  };
}
