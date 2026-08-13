"use client";

/**
 * Deterministic Assists producer for the Backlinks workspace.
 *
 * The workspace has already paid to load the profile, trend, top dimensions,
 * and first page of backlink rows. This producer only interprets that state;
 * noticing costs zero tokens and performs no extra backlink-provider reads.
 * Accepted agent actions open the swappable backlink-assistant slot with a
 * complete, reviewable brief. The bounded review-backlog action navigates
 * back to this workspace with an explicit route intent that starts the same
 * `analyzeNext` flow as the visible "Review next" button.
 */

import type { AppDispatch } from "@/lib/redux/store";
import { filterUndecidedKeys } from "@/features/assists/service";
import { emitAssistTracked } from "@/features/assists/redux/emitTracked";
import type { Assist, EmitAssistInput } from "@/features/assists/types";
import type {
  BacklinkDimensionRow,
  BacklinkObservationRow,
  BacklinkSnapshotRow,
  BacklinkTrendPoint,
  BacklinkWorkspaceData,
} from "@/features/marketing/data/backlinks-types";
import {
  analyzeAnchorProfile,
  type AnchorProfileRow,
} from "@/features/marketing/components/backlinks/lib/anchors";
import {
  parseDimensionExtras,
  parseObservationExtras,
} from "@/features/marketing/components/backlinks/lib/extras";
import { providerExtras } from "@/features/marketing/components/backlinks/lib/enrichment";

const SOURCE_PREFIX = "seo.backlink_assist";
export const BACKLINKS_ASSIST_SURFACE = "matrx-user/marketing-backlinks";

/** Floating client-run slot, seeded by
 * `migrations/agent_slots_backlink_assistant_seed.sql`. */
export const BACKLINK_ASSISTANT_SLOT = "seo.backlink_assistant";

const EXPIRES_MS = 14 * 24 * 60 * 60 * 1000;
const RISK_REVIEW_MIN = 3;
const REVIEW_BACKLOG_MIN = 5;
const REVIEW_BATCH_SIZE = 5;
const COMPETITOR_INTERSECTIONS_MIN = 5;

export interface BacklinksAssistSweepState {
  siteId: string;
  siteLabel: string;
  sitePath: string;
  brandNames: string[];
  summary: BacklinkSnapshotRow | null;
  detailSnapshot: BacklinkSnapshotRow | null;
  trend: BacklinkTrendPoint[];
  rows: BacklinkObservationRow[];
  anchors: BacklinkDimensionRow[];
  targetPages: BacklinkDimensionRow[];
  competitors: BacklinkDimensionRow[];
  enrichment: BacklinkWorkspaceData["enrichment"];
  /** The route-triggered batch is withheld when the canonical analysis
   * controller has no configured server target. */
  reviewEnabled: boolean;
}

export function isBacklinksAssist(assist: Assist, siteId: string): boolean {
  return (
    assist.sourceKey.startsWith(`${SOURCE_PREFIX}.`) &&
    (assist.dedupeKey?.includes(`:${siteId}:`) ?? false)
  );
}

function shortUrl(value: string): string {
  try {
    const url = new URL(value);
    return url.pathname === "/" ? url.hostname : url.pathname;
  } catch {
    return value;
  }
}

function markdownLink(label: string, href: string): string {
  const safeLabel = label.replaceAll("[", "\\[").replaceAll("]", "\\]");
  const safeHref = encodeURI(href)
    .replaceAll("(", "%28")
    .replaceAll(")", "%29")
    .replaceAll("<", "%3C")
    .replaceAll(">", "%3E");
  return `[${safeLabel}](${safeHref})`;
}

function plural(count: number, singular: string, pluralForm = `${singular}s`) {
  return count === 1 ? singular : pluralForm;
}

function agentAction(draftText: string) {
  return {
    kind: "launch_agent" as const,
    slotKey: BACKLINK_ASSISTANT_SLOT,
    agentName: "Backlink Assistant",
    draftText,
  };
}

function eventKey(state: BacklinksAssistSweepState): string {
  return (
    state.detailSnapshot?.id ??
    state.summary?.id ??
    state.trend[state.trend.length - 1]?.observed_at ??
    "loaded-profile"
  );
}

function siteLink(state: BacklinksAssistSweepState): string {
  return markdownLink(state.siteLabel, `/marketing/sites/${state.siteId}`);
}

function lostLinkCandidate(
  state: BacklinksAssistSweepState,
  expiresAt: string,
): EmitAssistInput | null {
  const latestTrend = state.trend[state.trend.length - 1];
  const lostRows = state.rows.filter((row) => row.state === "lost").slice(0, 8);
  const count = Math.max(latestTrend?.lost_backlinks ?? 0, lostRows.length);
  if (count <= 0) return null;

  const samples = lostRows.map(
    (row) =>
      `- ${markdownLink(row.source_domain ?? shortUrl(row.source_url), row.source_url)} used to link to ${markdownLink(shortUrl(row.target_url), row.target_url)}${row.anchor_text ? ` with “${row.anchor_text}”` : ""}.`,
  );
  const sampleCopy =
    samples.length > 0
      ? samples.join("\n")
      : `The individual lost rows are outside the loaded top-${state.rows.length || 0} sample; resolve them from the Lost links view before writing to anyone.`;
  return {
    sourceKey: `${SOURCE_PREFIX}.lost_reclaim`,
    title: `${count.toLocaleString()} ${plural(count, "link")} disappeared — prepare a reclaim note`,
    body: `The latest stored change for ${siteLink(state)} includes ${count.toLocaleString()} lost ${plural(count, "link")}. These sites linked before, so a specific repair or reclaim request is warmer than cold outreach.\n\n${sampleCopy}`,
    action: agentAction(
      [
        `Backlink reclaim brief for ${state.siteLabel}.`,
        "",
        `The latest stored change reports ${count} lost backlink${count === 1 ? "" : "s"}.`,
        sampleCopy,
        "",
        "Draft a prioritized reclaim plan and concise, individualized outreach. First distinguish a genuinely removed link from a moved page, redirect, temporary outage, or changed mention. Do not invent contact details, relationship history, or promises. Return the evidence to verify, the best recipient role, the suggested message, and when to leave the site alone.",
      ].join("\n"),
    ),
    entityType: "web_site",
    entityId: state.siteId,
    surfaceName: BACKLINKS_ASSIST_SURFACE,
    dedupeKey: `${SOURCE_PREFIX}.lost_reclaim:${state.siteId}:${latestTrend?.observed_at ?? eventKey(state)}`,
    expiresAt,
    priority: 25,
  };
}

interface BrokenTarget {
  url: string;
  count: number;
  statusCode: number | null;
}

function brokenTargets(state: BacklinksAssistSweepState): BrokenTarget[] {
  const byUrl = new Map<string, BrokenTarget>();
  for (const row of state.targetPages) {
    const extras = parseDimensionExtras(row.extras);
    const broken = extras.brokenBacklinks ?? 0;
    const statusBroken = (extras.statusCode ?? 0) >= 400;
    if (broken <= 0 && !statusBroken) continue;
    const url = row.url ?? row.dimension_key;
    byUrl.set(url, {
      url,
      count: Math.max(broken, statusBroken ? (row.backlinks ?? 1) : 0),
      statusCode: extras.statusCode,
    });
  }
  for (const row of state.rows) {
    const extras = parseObservationExtras(
      providerExtras(row.provider_evidence),
    );
    if (!extras.isBroken && (extras.urlToStatusCode ?? 0) < 400) continue;
    const current = byUrl.get(row.target_url);
    byUrl.set(row.target_url, {
      url: row.target_url,
      count: (current?.count ?? 0) + 1,
      statusCode: extras.urlToStatusCode ?? current?.statusCode ?? null,
    });
  }
  return [...byUrl.values()].sort(
    (left, right) =>
      right.count - left.count || left.url.localeCompare(right.url),
  );
}

function brokenTargetCandidate(
  state: BacklinksAssistSweepState,
  expiresAt: string,
): EmitAssistInput | null {
  const broken = brokenTargets(state);
  if (broken.length === 0) return null;
  const affectedLinks = broken.reduce(
    (total, target) => total + target.count,
    0,
  );
  const list = broken
    .slice(0, 8)
    .map(
      (target) =>
        `- ${markdownLink(shortUrl(target.url), target.url)} — ${target.count.toLocaleString()} ${plural(target.count, "link")}${target.statusCode ? `, HTTP ${target.statusCode}` : ""}`,
    )
    .join("\n");
  return {
    sourceKey: `${SOURCE_PREFIX}.broken_target`,
    title: `Repair ${affectedLinks.toLocaleString()} broken backlink ${plural(affectedLinks, "destination")}`,
    body: `${broken.length.toLocaleString()} ${plural(broken.length, "page")} on ${siteLink(state)} no longer ${plural(broken.length, "works", "work")} for ${affectedLinks.toLocaleString()} stored ${plural(affectedLinks, "backlink")}. The assistant will propose a redirect map for review; it will not change the site.\n\n${list}`,
    action: agentAction(
      [
        `Broken backlink-target repair brief for ${state.siteLabel}.`,
        "",
        list,
        "",
        "Propose a redirect map that preserves intent and earned authority. For every broken URL, choose the closest live replacement only when it is genuinely equivalent; otherwise recommend restoring the page or serving an honest gone response. Include validation checks and explicitly flag every uncertain mapping. Draft only — do not apply redirects.",
      ].join("\n"),
    ),
    entityType: "web_site",
    entityId: state.siteId,
    surfaceName: BACKLINKS_ASSIST_SURFACE,
    dedupeKey: `${SOURCE_PREFIX}.broken_target:${state.siteId}:${eventKey(state)}`,
    expiresAt,
    priority: 40,
  };
}

function anchorRiskCandidate(
  state: BacklinksAssistSweepState,
  expiresAt: string,
): EmitAssistInput | null {
  const profileRows: AnchorProfileRow[] = state.anchors.map((row) => ({
    anchor: row.label ?? row.dimension_key,
    backlinks: row.backlinks ?? 0,
  }));
  const profile = analyzeAnchorProfile(profileRows, {
    domain: state.siteLabel,
    brandNames: state.brandNames,
  });
  const critical = profile.warnings.filter(
    (warning) => warning.severity === "critical",
  );
  if (critical.length === 0) return null;
  const warningList = critical
    .map((warning) => `- ${warning.message}`)
    .join("\n");
  return {
    sourceKey: `${SOURCE_PREFIX}.anchor_risk`,
    title: `Your link wording has ${critical.length} critical ${plural(critical.length, "pattern")}`,
    body: `The same deterministic anchor-profile analysis shown in this workspace found a pattern worth correcting in future links. Nothing will be changed automatically.\n\n${warningList}`,
    action: agentAction(
      [
        `Anchor-risk planning brief for ${state.siteLabel}.`,
        "",
        warningList,
        "",
        "Build a conservative correction plan. Prioritize brand-name and web-address wording in future outreach, and only suggest edits to placements the owner can genuinely control. Do not ask publishers to rewrite natural editorial links at scale, do not recommend buying links, and do not propose an automatic disavow.",
      ].join("\n"),
    ),
    entityType: "web_site",
    entityId: state.siteId,
    surfaceName: BACKLINKS_ASSIST_SURFACE,
    dedupeKey: `${SOURCE_PREFIX}.anchor_risk:${state.siteId}:${eventKey(state)}`,
    expiresAt,
    priority: 35,
  };
}

function riskReviewCandidate(
  state: BacklinksAssistSweepState,
  expiresAt: string,
): EmitAssistInput | null {
  const risky = state.rows.filter(
    (row) =>
      row.assessment_risk_verdict === "high_risk" ||
      row.assessment_risk_verdict === "review",
  );
  if (risky.length < RISK_REVIEW_MIN) return null;
  const list = risky
    .slice(0, 12)
    .map(
      (row) =>
        `- ${markdownLink(row.source_domain ?? shortUrl(row.source_url), row.source_url)} → ${markdownLink(shortUrl(row.target_url), row.target_url)} — ${row.assessment_risk_verdict === "high_risk" ? "high-risk signals" : "needs review"}${row.assessment_action ? `; suggested action: ${row.assessment_action.replaceAll("_", " ")}` : ""}`,
    )
    .join("\n");
  return {
    sourceKey: `${SOURCE_PREFIX}.risk_review`,
    title: `Prioritize ${risky.length} flagged links for human review`,
    body: `Among the ${state.rows.length} strongest loaded rows, ${risky.length} have risk signals or an uncertain verdict. The assistant will organize the evidence into a review list — **never an automatic disavow list**.\n\n${list}`,
    action: agentAction(
      [
        `Human backlink-risk review brief for ${state.siteLabel}.`,
        "",
        list,
        "",
        "Prioritize this list for a human reviewer. Separate evidence from inference, explain what to inspect on each source page, and recommend keep / investigate / contact / consider-disavow only as review states. Never produce an automatic disavow file and never treat a provider spam score as a verdict.",
      ].join("\n"),
    ),
    entityType: "web_site",
    entityId: state.siteId,
    surfaceName: BACKLINKS_ASSIST_SURFACE,
    dedupeKey: `${SOURCE_PREFIX}.risk_review:${state.siteId}:${eventKey(state)}`,
    expiresAt,
    priority: 30,
  };
}

function reviewBacklogCandidate(
  state: BacklinksAssistSweepState,
  expiresAt: string,
): EmitAssistInput | null {
  if (!state.reviewEnabled || state.enrichment.awaiting < REVIEW_BACKLOG_MIN) {
    return null;
  }
  const requestKey = `${eventKey(state)}-${state.enrichment.awaiting}`;
  const href = `${state.sitePath}/backlinks?tab=links&reviewBatch=${REVIEW_BATCH_SIZE}&reviewRequest=${encodeURIComponent(requestKey)}`;
  return {
    sourceKey: `${SOURCE_PREFIX}.review_backlog`,
    title: `${state.enrichment.awaiting.toLocaleString()} linking pages are waiting for review`,
    body: `Start a bounded batch of **up to ${REVIEW_BATCH_SIZE} pages**. Each page may use one source-page capture and one AI assessment; this does **not** purchase another backlink-profile refresh. Progress appears under the toolbar, and failed pages stay available for another try.`,
    action: {
      kind: "navigate",
      href,
      label: `Review ${REVIEW_BATCH_SIZE} pages`,
      confirm: `Opens this site's waiting list and starts the same bounded ${REVIEW_BATCH_SIZE}-page review as the toolbar button. Each page may use one capture and one AI assessment; no backlink-profile refresh runs.`,
      receipt: `Opened the waiting list and started a review of up to ${REVIEW_BATCH_SIZE} pages.`,
    },
    entityType: "web_site",
    entityId: state.siteId,
    surfaceName: BACKLINKS_ASSIST_SURFACE,
    dedupeKey: `${SOURCE_PREFIX}.review_backlog:${state.siteId}:${requestKey}`,
    expiresAt,
    priority: 20,
  };
}

function competitorGapCandidate(
  state: BacklinksAssistSweepState,
  expiresAt: string,
): EmitAssistInput | null {
  const ranked = state.competitors
    .map((row) => ({
      row,
      intersections: parseDimensionExtras(row.extras).intersections ?? 0,
    }))
    .filter((item) => item.intersections >= COMPETITOR_INTERSECTIONS_MIN)
    .sort(
      (left, right) =>
        right.intersections - left.intersections ||
        left.row.dimension_key.localeCompare(right.row.dimension_key),
    );
  const hit = ranked[0];
  if (!hit) return null;
  const competitor = hit.row.label ?? hit.row.dimension_key;
  const competitorHref = hit.row.url ?? `https://${hit.row.dimension_key}`;
  return {
    sourceKey: `${SOURCE_PREFIX}.competitor_gap`,
    title: `Find the backlink gap around ${competitor}`,
    body: `${markdownLink(competitor, competitorHref)} has ${hit.intersections.toLocaleString()} backlink-profile intersections with ${siteLink(state)}. That overlap makes it the strongest loaded peer to investigate. **${hit.intersections.toLocaleString()} is shared-profile evidence, not the number of missing links**; the assistant will identify and verify the actual gap before suggesting outreach.`,
    action: agentAction(
      [
        `Competitor backlink-gap brief for ${state.siteLabel}.`,
        "",
        `Competitor: ${competitor}`,
        `Competitor URL: ${competitorHref}`,
        `Stored backlink-profile intersections: ${hit.intersections} (overlap signal only — NOT the gap count).`,
        "",
        `Identify domains and pages that link to ${competitor} but not ${state.siteLabel}. Verify every prospect against the current site before counting it as a gap. Rank prospects by topical fit, editorial likelihood, authority, and realistic contact path; then draft specific outreach angles. Do not invent a missing-link count from the intersections value and do not recommend bulk spam outreach.`,
      ].join("\n"),
    ),
    entityType: "web_site",
    entityId: state.siteId,
    surfaceName: BACKLINKS_ASSIST_SURFACE,
    dedupeKey: `${SOURCE_PREFIX}.competitor_gap:${state.siteId}:${hit.row.id}`,
    expiresAt,
    priority: 15,
  };
}

/** Pure candidate builder — exported so thresholds and evidence wording are
 * verified without writing to the assists ledger. */
export function buildBacklinksAssistCandidates(
  state: BacklinksAssistSweepState,
  now = new Date(),
): EmitAssistInput[] {
  const expiresAt = new Date(now.getTime() + EXPIRES_MS).toISOString();
  return [
    lostLinkCandidate(state, expiresAt),
    brokenTargetCandidate(state, expiresAt),
    anchorRiskCandidate(state, expiresAt),
    riskReviewCandidate(state, expiresAt),
    reviewBacklogCandidate(state, expiresAt),
    competitorGapCandidate(state, expiresAt),
  ].filter((candidate): candidate is EmitAssistInput => candidate !== null);
}

/** One zero-token sweep for one site. Dismissals are durable and the sweep is
 * capped at one candidate per finding family (six maximum). */
export async function produceBacklinksAssists(args: {
  state: BacklinksAssistSweepState;
  userId: string;
  dispatch: AppDispatch;
}): Promise<void> {
  const candidates = buildBacklinksAssistCandidates(args.state);
  if (candidates.length === 0) return;
  const emittable = new Set(
    await filterUndecidedKeys(
      candidates.map((candidate) => candidate.dedupeKey),
    ),
  );
  for (const candidate of candidates) {
    if (!emittable.has(candidate.dedupeKey)) continue;
    await emitAssistTracked(args.userId, candidate, args.dispatch);
  }
}
