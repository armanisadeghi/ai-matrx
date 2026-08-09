"use client";

/**
 * Deterministic Assists producer for Search Console insights — the highest
 * value findings from the algorithm layer become one-click assists instead
 * of rows the user has to go dig for. Zero tokens to notice (the existing
 * `seo.gsc_perf_*` algorithm RPCs ARE the noticing); the accepted action is
 * real: launch the SEO page-analyzer agent pre-filled with the finding's
 * code-compressed context, or navigate to the classification workbench /
 * intake wizard.
 *
 * Producer rules honored (features/assists/FEATURE.md):
 * - dedupe key per (finding, site, entity); `filterUndecidedKeys` first so a
 *   dismissal is durable — re-noticing never resurrects the chip.
 * - capped per sweep (one assist per finding kind per site), expires set.
 * - cheapest-first: deterministic thresholds over server-side algorithms;
 *   no model call is involved in noticing.
 * - the sweep window is a FIXED 28 days ending at the site's freshest data
 *   day vs the previous 28 — never the user's URL range, so findings (and
 *   dedupe keys) don't churn with view state.
 *
 * System-of-record: /Users/armanisadeghi/code/common-docs/systems/assists/FEATURE.md
 */

import type { AppDispatch } from "@/lib/redux/store";
import { filterUndecidedKeys } from "@/features/assists/service";
import { emitAssistTracked } from "@/features/assists/redux/emitTracked";
import type { Assist, EmitAssistInput } from "@/features/assists/types";
import {
  getGscClassMovers,
  getGscClassSummary,
  getGscCtrGap,
} from "@/features/marketing/search-console/data-insights";
import { resolvePeriods } from "@/features/marketing/search-console/lib/url-state";
import { formatGscWindow } from "@/features/marketing/search-console/lib/format";
import { formatCtr, formatPosition } from "@/features/marketing/search-console/types";
import type {
  GscClassMoverRow,
  GscClassSummaryRow,
  GscCtrGapRow,
  GscResolvedPeriods,
} from "@/features/marketing/search-console/types";

const SOURCE_PREFIX = "seo.gsc_insight";

/**
 * `/marketing/search-console` resolves to the marketing hub surface today
 * (features/surfaces/utils/route-to-surface.ts) — there is no dedicated GSC
 * ui_surface yet. When one lands, change THIS constant and the chips follow.
 */
export const GSC_ASSIST_SURFACE = "matrx-user/marketing";

/** The agent-slot the launch actions resolve at click time (swappable from
 * the admin slots console, no deploy). Declared server-side in aidream
 * `services/seo/keyword_agents.py` and synced to `agent.slot_definition`. */
const PAGE_ANALYZER_SLOT = "seo.page_analyzer";

// Conservative thresholds — an assist that fires on noise trains the user
// to dismiss the whole dock ("loud, never nagging").
const MONEY_DECAY_MIN_PREV_CLICKS = 30;
const MONEY_DECAY_MIN_DROP_CLICKS = 10;
const MONEY_DECAY_MIN_DROP_SHARE = 0.25;
const CTR_GAP_MIN_IMPRESSIONS = 200;
const CTR_GAP_MIN_MISSED_CLICKS = 50;
const CLASSIFY_MIN_UNCLASSIFIED_CLICKS = 50;
const CLASSIFY_MIN_SHARE = 0.3;
const CLASSIFY_INTAKE_SHARE = 0.7;
const EXPIRES_MS = 14 * 24 * 60 * 60 * 1000;

/** Is this pending assist one of ours, addressed to this site? (Site scope
 * rides the dedupe key — the row's entity is the page, not the site.) */
export function isGscInsightAssist(assist: Assist, siteId: string): boolean {
  return (
    assist.sourceKey.startsWith(`${SOURCE_PREFIX}.`) &&
    (assist.dedupeKey?.includes(`:${siteId}`) ?? false)
  );
}

function shortPath(url: string): string {
  try {
    const u = new URL(url);
    return u.pathname === "/" ? u.hostname : u.pathname;
  } catch {
    return url;
  }
}

function pctDrop(delta: number, cmp: number): number {
  return cmp > 0 ? Math.abs(delta) / cmp : 0;
}

function composePageFindingIntent(args: {
  siteLabel: string;
  finding: string;
  pageUrl: string;
  periods: GscResolvedPeriods;
  lines: string[];
  ask: string;
}): string {
  const window = args.periods.compare
    ? `${formatGscWindow(args.periods.current)} vs ${formatGscWindow(args.periods.compare)}`
    : formatGscWindow(args.periods.current);
  return [
    `Search Console finding for ${args.siteLabel} — ${args.finding}.`,
    "",
    `Page: ${args.pageUrl}`,
    `Window: ${window}`,
    ...args.lines,
    "",
    args.ask,
  ].join("\n");
}

function moneyDecayCandidate(
  rows: GscClassMoverRow[],
  siteId: string,
  siteLabel: string,
  periods: GscResolvedPeriods,
  expiresAt: string,
): EmitAssistInput | null {
  const hit = rows.find(
    (r) =>
      r.cmp_clicks >= MONEY_DECAY_MIN_PREV_CLICKS &&
      r.delta_clicks <= -MONEY_DECAY_MIN_DROP_CLICKS &&
      pctDrop(r.delta_clicks, r.cmp_clicks) >= MONEY_DECAY_MIN_DROP_SHARE,
  );
  if (!hit) return null;
  const dropPct = Math.round(pctDrop(hit.delta_clicks, hit.cmp_clicks) * 100);
  return {
    sourceKey: `${SOURCE_PREFIX}.money_decay`,
    title: `Money page down ${dropPct}%: ${shortPath(hit.key)}`,
    body: `${hit.key} went from ${hit.cmp_clicks} to ${hit.clicks} money-class clicks over the last 28 days of data vs the prior 28. One click opens the SEO page analyzer with the finding ready.`,
    action: {
      kind: "launch_agent",
      slotKey: PAGE_ANALYZER_SLOT,
      agentName: "SEO Page Analyzer",
      draftText: composePageFindingIntent({
        siteLabel,
        finding: "a money-class page is losing clicks",
        pageUrl: hit.key,
        periods,
        lines: [
          `Traffic class: money (revenue-driving queries per the site's classification)`,
          `Clicks: ${hit.clicks} (was ${hit.cmp_clicks}, ${hit.delta_clicks} / -${dropPct}%)`,
          `Impressions: ${hit.impressions} (was ${hit.cmp_impressions}, ${hit.delta_impressions >= 0 ? "+" : ""}${hit.delta_impressions})`,
        ],
        ask: "Diagnose the likely cause (ranking loss, demand shift, cannibalization, SERP feature change) and propose concrete next actions for this page.",
      }),
    },
    entityType: "web_page",
    entityId: hit.page_id || undefined,
    surfaceName: GSC_ASSIST_SURFACE,
    dedupeKey: `${SOURCE_PREFIX}.money_decay:${siteId}:${hit.page_id || hit.key}`,
    expiresAt,
    priority: 20,
  };
}

function ctrGapCandidate(
  rows: GscCtrGapRow[],
  siteId: string,
  siteLabel: string,
  periods: GscResolvedPeriods,
  expiresAt: string,
): EmitAssistInput | null {
  const hit = rows.find((r) => r.missed_clicks >= CTR_GAP_MIN_MISSED_CLICKS);
  if (!hit) return null;
  const singlePeriod: GscResolvedPeriods = { current: periods.current, compare: null };
  return {
    sourceKey: `${SOURCE_PREFIX}.ctr_gap`,
    title: `~${Math.round(hit.missed_clicks)} missed clicks: ${shortPath(hit.key)}`,
    body: `${hit.key} ranks around position ${formatPosition(hit.avg_position)} but converts ${formatCtr(hit.ctr)} of impressions vs the ${formatCtr(hit.expected_ctr)} this site normally gets there — usually a title/snippet problem. One click opens the SEO page analyzer with the finding ready.`,
    action: {
      kind: "launch_agent",
      slotKey: PAGE_ANALYZER_SLOT,
      agentName: "SEO Page Analyzer",
      draftText: composePageFindingIntent({
        siteLabel,
        finding: "a page is underperforming its own site's CTR-by-position curve",
        pageUrl: hit.key,
        periods: singlePeriod,
        lines: [
          `Position: ${formatPosition(hit.avg_position)}`,
          `CTR: ${formatCtr(hit.ctr)} actual vs ${formatCtr(hit.expected_ctr)} expected at this position (site's own curve)`,
          `Impressions: ${hit.impressions}, clicks: ${hit.clicks}, estimated missed clicks: ${Math.round(hit.missed_clicks)}`,
        ],
        ask: "The ranking is fine; the snippet is not converting. Review the page's title and meta description against the queries it ranks for and propose rewrites that close the CTR gap.",
      }),
    },
    entityType: "web_page",
    entityId: hit.page_id || undefined,
    surfaceName: GSC_ASSIST_SURFACE,
    dedupeKey: `${SOURCE_PREFIX}.ctr_gap:${siteId}:${hit.page_id || hit.key}`,
    expiresAt,
    priority: 10,
  };
}

function classifyCandidate(
  rows: GscClassSummaryRow[],
  siteId: string,
  expiresAt: string,
): EmitAssistInput | null {
  const totalClicks = rows.reduce((sum, r) => sum + r.clicks, 0);
  const unclassified = rows.find((r) => r.traffic_class === "unclassified");
  if (!unclassified || totalClicks === 0) return null;
  const share = unclassified.clicks / totalClicks;
  if (
    share < CLASSIFY_MIN_SHARE ||
    unclassified.clicks < CLASSIFY_MIN_UNCLASSIFIED_CLICKS
  ) {
    return null;
  }
  const sharePct = Math.round(share * 100);
  // Mostly-unclassified site → the whole-site AI intake interview is the
  // right first move; otherwise the manual/AI classification workbench.
  const severe = share >= CLASSIFY_INTAKE_SHARE;
  return {
    sourceKey: `${SOURCE_PREFIX}.classify`,
    title: severe
      ? `Run the intake interview — ${sharePct}% of clicks are unclassified`
      : `Classify your traffic — ${sharePct}% of clicks are unclassified`,
    body: severe
      ? `${unclassified.clicks} of ${totalClicks} clicks in the last 28 days of data carry no traffic class, so quality decomposition is mostly blind. The AI intake interview reads the site's real GSC history and proposes class boundaries you approve.`
      : `${unclassified.clicks} of ${totalClicks} clicks in the last 28 days of data carry no traffic class. The classification workbench has pattern rules and a batch AI classifier to clear the backlog.`,
    action: {
      kind: "navigate",
      href: severe
        ? `/marketing/sites/${siteId}/intake`
        : `/marketing/sites/${siteId}/keywords?view=classification&f_traffic_class=select:unclassified`,
    },
    surfaceName: GSC_ASSIST_SURFACE,
    dedupeKey: `${SOURCE_PREFIX}.classify:${siteId}`,
    expiresAt,
    priority: 5,
  };
}

/**
 * One sweep for one site. Every read failure is loud-but-contained: a failed
 * RPC skips that finding kind (console.error), never the whole sweep.
 */
export async function produceGscInsightAssists(args: {
  siteId: string;
  /** Domain (preferred) or name — used in chip bodies and agent drafts. */
  siteLabel: string;
  /** Freshest stored data day (`resolveGscDataThrough`) — the sweep anchor. */
  dataThrough: string;
  userId: string;
  dispatch: AppDispatch;
}): Promise<void> {
  const { siteId, siteLabel, dataThrough, userId, dispatch } = args;
  const periods = resolvePeriods(
    { range: "28d", customFrom: null, customTo: null, compare: "prev" },
    new Date(),
    dataThrough,
  );
  const expiresAt = new Date(Date.now() + EXPIRES_MS).toISOString();

  const [movers, ctrGap, classSummary] = await Promise.allSettled([
    getGscClassMovers(siteId, periods, "page", "money", "loss"),
    getGscCtrGap(siteId, periods, "page", CTR_GAP_MIN_IMPRESSIONS),
    getGscClassSummary(siteId, periods),
  ]);

  const candidates: EmitAssistInput[] = [];
  if (movers.status === "fulfilled") {
    const c = moneyDecayCandidate(
      movers.value.rows,
      siteId,
      siteLabel,
      periods,
      expiresAt,
    );
    if (c) candidates.push(c);
  } else {
    console.error("[gsc-assists] class movers read failed:", movers.reason);
  }
  if (ctrGap.status === "fulfilled") {
    const c = ctrGapCandidate(
      ctrGap.value.rows,
      siteId,
      siteLabel,
      periods,
      expiresAt,
    );
    if (c) candidates.push(c);
  } else {
    console.error("[gsc-assists] CTR gap read failed:", ctrGap.reason);
  }
  if (classSummary.status === "fulfilled") {
    const c = classifyCandidate(classSummary.value, siteId, expiresAt);
    if (c) candidates.push(c);
  } else {
    console.error("[gsc-assists] class summary read failed:", classSummary.reason);
  }
  if (candidates.length === 0) return;

  // Durable dismissal: a key the user ever decided is never re-emitted.
  const emittable = new Set(
    await filterUndecidedKeys(candidates.map((c) => c.dedupeKey)),
  );
  for (const candidate of candidates) {
    if (!emittable.has(candidate.dedupeKey)) continue;
    await emitAssistTracked(userId, candidate, dispatch);
  }
}
