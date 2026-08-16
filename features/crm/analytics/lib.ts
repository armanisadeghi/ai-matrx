// features/crm/analytics/lib.ts
//
// The pure core of outreach reporting (WP4 build step 6) — no Supabase, no
// React, no fetching. Everything here is a function of counts, so the numbers
// on the campaign workspace and the numbers on the org report are computed by
// the SAME code and cannot disagree.
//
// 🚨 NULL MEANS UNMEASURED, NEVER ZERO. Every rate here returns `null` when its
// denominator is zero. A campaign that has sent nothing does not have a 0%
// reply rate — it has no reply rate, and the surface must say so. A 0% shown
// where "not started" is the truth is the single most expensive lie a report
// can tell: it reads as failure and gets a working campaign cancelled.
//
// 🚨 ABSENCE IS NEVER LOSS. Nothing here derives a negative from missing data.
// A stage with no rows is a stage nobody has reached yet.

import type { MemberStatus } from "../outreach-lists/types";

/**
 * The funnel, in the order a member actually moves through it.
 *
 * This is NOT the member-status list re-sorted: several statuses are exits, not
 * stages (`bounced`, `suppressed`, `not_interested`), and two are the same
 * stage reached by different channels (`connected` is a call answered,
 * `replied` is an email answered — both mean "a human engaged"). Mapping them
 * once, here, is what stops the campaign page and the org report from drawing
 * two different funnels from one table.
 */
export const FUNNEL_STAGES = [
  {
    key: "enrolled",
    label: "Enrolled",
    description: "In the campaign, whatever has happened since.",
  },
  {
    key: "contacted",
    label: "Contacted",
    description: "We reached out at least once.",
  },
  {
    key: "engaged",
    label: "Engaged",
    description: "A human answered — a reply, or a call connected.",
  },
  {
    key: "won",
    label: "Won",
    description: "A confirmed outcome: a link, a story, or a meeting.",
  },
] as const;

export type FunnelStageKey = (typeof FUNNEL_STAGES)[number]["key"];

/** Statuses that mean the member was contacted at least once. */
export const CONTACTED_STATUSES: readonly MemberStatus[] = [
  "sent",
  "delivered",
  "opened",
  "clicked",
  "replied",
  "bounced",
  "connected",
  "voicemail",
  "no_answer",
  "not_interested",
  "meeting_booked",
  "done",
];

/** Statuses that mean a real person engaged back. */
export const ENGAGED_STATUSES: readonly MemberStatus[] = [
  "replied",
  "connected",
  "meeting_booked",
];

/** Statuses that ended the member's journey without engagement. */
export const LOST_STATUSES: readonly MemberStatus[] = [
  "bounced",
  "not_interested",
  "suppressed",
];

export type StatusCounts = Partial<Record<MemberStatus, number>> & {
  total: number;
};

export interface FunnelStage {
  key: FunnelStageKey;
  label: string;
  description: string;
  count: number;
  /** Share of the stage above, 0-100. `null` when that stage is empty. */
  conversionPct: number | null;
  /** Share of everyone enrolled, 0-100. `null` when nothing is enrolled. */
  ofEnrolledPct: number | null;
  /** One sentence a non-technical expert can act on. */
  verdict: string;
}

function sumStatuses(
  counts: StatusCounts,
  statuses: readonly MemberStatus[],
): number {
  return statuses.reduce((total, status) => total + (counts[status] ?? 0), 0);
}

/** A percentage, or `null` when the denominator is zero (never 0%). */
export function rate(numerator: number, denominator: number): number | null {
  if (!denominator) return null;
  return Math.round((numerator / denominator) * 1000) / 10;
}

export function formatRate(value: number | null, whenUnmeasured = "—"): string {
  return value === null ? whenUnmeasured : `${value}%`;
}

/**
 * The opportunity flow for one campaign (or a whole org's campaigns).
 *
 * `wins` comes from `platform.outcome_event` (IC-5), NOT from member status:
 * a confirmed win is a fact about the world that WP4 proved, while a member
 * status is a fact about our own pipeline. Reading wins from the outcome ledger
 * is what makes "won" defensible to a client.
 */
export function buildFunnel(
  counts: StatusCounts,
  wins: number,
): FunnelStage[] {
  const enrolled = counts.total;
  const contacted = sumStatuses(counts, CONTACTED_STATUSES);
  const engaged = sumStatuses(counts, ENGAGED_STATUSES);
  const values: Record<FunnelStageKey, number> = {
    enrolled,
    contacted,
    engaged,
    won: wins,
  };
  const order: FunnelStageKey[] = ["enrolled", "contacted", "engaged", "won"];

  return FUNNEL_STAGES.map((stage, index) => {
    const count = values[stage.key];
    const previous = index === 0 ? null : values[order[index - 1]];
    const conversionPct = previous === null ? null : rate(count, previous);
    return {
      key: stage.key,
      label: stage.label,
      description: stage.description,
      count,
      conversionPct,
      ofEnrolledPct: rate(count, enrolled),
      verdict: stageVerdict(stage.key, count, previous, conversionPct),
    };
  });
}

function stageVerdict(
  key: FunnelStageKey,
  count: number,
  previous: number | null,
  conversionPct: number | null,
): string {
  if (key === "enrolled") {
    return count === 0
      ? "Nobody is enrolled yet — add people to start."
      : `${count.toLocaleString()} in this campaign.`;
  }
  if (previous === 0) {
    // The honest sentence. NOT "0% converted".
    const above = key === "contacted" ? "enrolled" : "reached the stage above";
    return `Nothing has ${above} yet, so there is nothing to measure here.`;
  }
  if (count === 0) {
    return "Nobody has reached this stage yet.";
  }
  return `${count.toLocaleString()} of ${previous?.toLocaleString()} (${formatRate(conversionPct)}).`;
}

export interface ResponseRates {
  sent: number;
  replied: number;
  /** 0-100, or null when nothing has been sent. */
  replyRate: number | null;
  verdict: string;
}

/**
 * The reply rate, from the interaction log and NOTHING else.
 *
 * Both halves come from `crm.interaction` rows on this campaign — outbound
 * messages we completed, inbound messages that came back — so the numerator and
 * the denominator are the same table counted twice. A rate whose two halves
 * come from two stores is a rate that will eventually be impossible to defend.
 *
 * Opens and clicks are deliberately absent (D7): Apple MPP makes roughly half
 * of all opens machine noise, and the sequence engine never branches on them.
 * Reporting a number we know is wrong invites decisions based on it.
 *
 * Bounces are reported separately, in `buildExits`, because their honest
 * denominator is members — not messages.
 */
export function buildResponseRates(input: {
  sent: number;
  replied: number;
}): ResponseRates {
  const replyRate = rate(input.replied, input.sent);
  return {
    ...input,
    replyRate,
    verdict:
      input.sent === 0
        ? "No messages have been sent yet, so there is no reply rate to report."
        : `${input.replied.toLocaleString()} of ${input.sent.toLocaleString()} messages got a reply (${formatRate(replyRate)}).`,
  };
}

export interface ExitReason {
  status: MemberStatus;
  label: string;
  count: number;
  /** Share of everyone contacted, 0-100. `null` when nobody was contacted. */
  ofContactedPct: number | null;
  verdict: string;
}

const EXIT_LABELS: Record<string, { label: string; verdict: string }> = {
  bounced: {
    label: "Bounced",
    verdict: "the address did not exist — these hurt your sending reputation",
  },
  not_interested: {
    label: "Not interested",
    verdict: "a real answer, and a clean end",
  },
  suppressed: {
    label: "Suppressed",
    verdict: "opted out or blocked — never contacted again",
  },
};

/** Where members left the funnel, with the denominator stated. */
export function buildExits(counts: StatusCounts): ExitReason[] {
  const contacted = sumStatuses(counts, CONTACTED_STATUSES);
  return LOST_STATUSES.map((status) => {
    const count = counts[status] ?? 0;
    const copy = EXIT_LABELS[status] ?? { label: status, verdict: "" };
    const ofContactedPct = rate(count, contacted);
    return {
      status,
      label: copy.label,
      count,
      ofContactedPct,
      verdict:
        contacted === 0
          ? "Nobody has been contacted yet."
          : `${count.toLocaleString()} of ${contacted.toLocaleString()} contacted (${formatRate(ofContactedPct)}) — ${copy.verdict}.`,
    };
  });
}

export interface OutcomePoint {
  /** ISO date of the bucket start. */
  bucket: string;
  confirmed: number;
  proposed: number;
}

/** Monday of the week a timestamp falls in, as an ISO date. */
export function weekBucket(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso.slice(0, 10);
  const day = (date.getUTCDay() + 6) % 7; // Monday = 0
  const monday = new Date(
    Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate() - day),
  );
  return monday.toISOString().slice(0, 10);
}

/**
 * Confirmed and proposed wins over time.
 *
 * Proposed rows are shown BESIDE confirmed ones rather than folded in: on the
 * low bar (D-W4-7) we always take the credit, but a client-facing number must
 * be able to separate "we proved this" from "we believe this and nobody has
 * looked yet". Rejected rows are excluded entirely — a human said it was not
 * ours, and re-counting it anywhere would make the rejection meaningless.
 */
export function buildOutcomeTrend(
  rows: ReadonlyArray<{ matched_at: string | null; status: string }>,
): OutcomePoint[] {
  const buckets = new Map<string, OutcomePoint>();
  for (const row of rows) {
    if (!row.matched_at) continue;
    if (row.status !== "confirmed" && row.status !== "proposed") continue;
    const bucket = weekBucket(row.matched_at);
    const point = buckets.get(bucket) ?? { bucket, confirmed: 0, proposed: 0 };
    if (row.status === "confirmed") point.confirmed += 1;
    else point.proposed += 1;
    buckets.set(bucket, point);
  }
  return [...buckets.values()].sort((a, b) => a.bucket.localeCompare(b.bucket));
}

export interface CampaignRollupRow {
  campaignId: string;
  name: string;
  status: string;
  enrolled: number;
  contacted: number;
  engaged: number;
  wins: number;
  /** 0-100, or null when nothing has been contacted. */
  engagementPct: number | null;
  winPct: number | null;
}

export function buildCampaignRollup(input: {
  campaignId: string;
  name: string;
  status: string;
  counts: StatusCounts;
  wins: number;
}): CampaignRollupRow {
  const contacted = sumStatuses(input.counts, CONTACTED_STATUSES);
  const engaged = sumStatuses(input.counts, ENGAGED_STATUSES);
  return {
    campaignId: input.campaignId,
    name: input.name,
    status: input.status,
    enrolled: input.counts.total,
    contacted,
    engaged,
    wins: input.wins,
    engagementPct: rate(engaged, contacted),
    winPct: rate(input.wins, contacted),
  };
}

export interface OrgTotals {
  campaigns: number;
  enrolled: number;
  contacted: number;
  engaged: number;
  wins: number;
  engagementPct: number | null;
  winPct: number | null;
  headline: string;
}

export function buildOrgTotals(rows: readonly CampaignRollupRow[]): OrgTotals {
  const totals = rows.reduce(
    (acc, row) => ({
      enrolled: acc.enrolled + row.enrolled,
      contacted: acc.contacted + row.contacted,
      engaged: acc.engaged + row.engaged,
      wins: acc.wins + row.wins,
    }),
    { enrolled: 0, contacted: 0, engaged: 0, wins: 0 },
  );
  const engagementPct = rate(totals.engaged, totals.contacted);
  const winPct = rate(totals.wins, totals.contacted);
  return {
    campaigns: rows.length,
    ...totals,
    engagementPct,
    winPct,
    headline:
      totals.contacted === 0
        ? rows.length === 0
          ? "No campaigns yet."
          : "Nothing has been sent yet — these campaigns have not started."
        : `${totals.wins.toLocaleString()} confirmed win(s) from ${totals.contacted.toLocaleString()} people contacted across ${rows.length} campaign(s).`,
  };
}
