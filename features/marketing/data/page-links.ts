"use client";

/**
 * page-links — bounded reads + client-side rollups for one canonical page's
 * link picture: internal link edges (`web.link_edge`, inbound + outbound) and
 * external backlink observations (`seo.backlink_observation` +
 * `seo.backlink_snapshot` page-level summary).
 *
 * Reads are deliberately capped (LINK_ROW_CAP / BACKLINK_ROW_CAP) and ordered
 * deterministically (created_at desc, id desc) so a truncated fetch reflects
 * the newest evidence. Aggregation happens client-side over the FULL fetched
 * set — copy payloads receive the same rows/rollups the cards render from.
 */

import { useQuery } from "@tanstack/react-query";
import { marketingKeys } from "@/features/marketing/data/hooks";
import { assertData } from "@/features/marketing/data/service";
import type {
  BacklinkObservationRow,
  BacklinkSnapshotRow,
} from "@/features/marketing/data/backlinks-types";
import { supabase } from "@/utils/supabase/client";
import {
  authenticatedWebDb,
  requireAuthenticatedSupabaseSession,
} from "@/utils/supabase/webDb";
import { isJsonRecord } from "@/features/marketing/types";
import type { Json } from "@/types/database.types";

export const LINK_ROW_CAP = 500;
export const BACKLINK_ROW_CAP = 300;

// Static select strings (a computed/union string defeats the PostgREST
// query-string type parser — same rule as inspection-queries.ts).
const OUTBOUND_LINK_SELECT =
  "id, site_id, snapshot_id, source_page_id, target_page_id, target_url, is_internal, rel, anchor_text, http_status, position, created_at, target_page:page!link_edge_target_page_id_fkey(id, url, desired_values)";
const INBOUND_LINK_SELECT =
  "id, site_id, snapshot_id, source_page_id, target_page_id, target_url, is_internal, rel, anchor_text, http_status, position, created_at, source_page:page!link_edge_source_page_id_fkey(url, latest_snapshot_id)";

export type OutboundLinkEdge = {
  id: string;
  site_id: string;
  snapshot_id: string;
  source_page_id: string;
  target_page_id: string | null;
  target_url: string;
  is_internal: boolean;
  rel: string | null;
  anchor_text: string | null;
  http_status: number | null;
  position: number | null;
  created_at: string;
  target_page: {
    id: string;
    url: string;
    desired_values: Json;
  } | null;
};

export type InboundLinkEdge = {
  id: string;
  site_id: string;
  snapshot_id: string;
  source_page_id: string;
  target_page_id: string | null;
  target_url: string;
  is_internal: boolean;
  rel: string | null;
  anchor_text: string | null;
  http_status: number | null;
  position: number | null;
  created_at: string;
  source_page: { url: string; latest_snapshot_id: string | null } | null;
};

/**
 * Links FROM this page — every stored edge whose source is this canonical
 * page, newest first across snapshots (rollup dedupes repeat captures).
 */
export async function listOutboundLinkEdges(
  siteId: string,
  pageId: string,
  latestSnapshotId: string | null | undefined,
  signal?: AbortSignal,
): Promise<OutboundLinkEdge[]> {
  const db = await authenticatedWebDb(supabase);
  let query = db
    .from("link_edge")
    .select(OUTBOUND_LINK_SELECT)
    .eq("site_id", siteId)
    .eq("source_page_id", pageId)
    .is("deleted_at", null)
    .order("created_at", { ascending: false })
    .order("id", { ascending: false })
    .limit(LINK_ROW_CAP);
  if (latestSnapshotId) {
    query = query.eq("snapshot_id", latestSnapshotId);
  }
  const response = await query.abortSignal(
    signal ?? new AbortController().signal,
  );
  const rows = assertData(response.data, response.error);

  // Some crawler runs have not backfilled target_page_id yet. Resolve those
  // exact same-site target URLs here so source pages still receive the target
  // page's accepted-anchor policy. This remains a direct RLS-filtered read.
  const unresolvedUrls = [
    ...new Set(
      rows
        .filter((row) => row.is_internal && row.target_page === null)
        .map((row) => row.target_url),
    ),
  ];
  const resolvedByUrl = new Map<
    string,
    { id: string; url: string; desired_values: Json }
  >();
  for (let index = 0; index < unresolvedUrls.length; index += 100) {
    const pageResponse = await db
      .from("page")
      .select("id, url, desired_values")
      .eq("site_id", siteId)
      .in("url", unresolvedUrls.slice(index, index + 100))
      .is("deleted_at", null)
      .abortSignal(signal ?? new AbortController().signal);
    for (const page of assertData(pageResponse.data, pageResponse.error)) {
      resolvedByUrl.set(page.url, page);
    }
  }

  return rows.map((row) => {
    const targetPage =
      row.target_page ?? resolvedByUrl.get(row.target_url) ?? null;
    return {
      ...row,
      target_page_id: row.target_page_id ?? targetPage?.id ?? null,
      target_page: targetPage,
    };
  });
}

/**
 * Links TO this page from other pages of the same site. Two bounded eq reads
 * merged by id — `target_page_id` (resolved edges) plus exact `target_url`
 * match (fallback: target_page_id is largely unbackfilled until the
 * link-resolution pass runs). Two queries instead of one `.or()` so URL
 * values never hit PostgREST or-syntax quoting.
 */
export async function listInboundLinkEdges(
  siteId: string,
  pageId: string,
  pageUrl: string,
  signal?: AbortSignal,
): Promise<InboundLinkEdge[]> {
  const db = await authenticatedWebDb(supabase);
  const abortSignal = signal ?? new AbortController().signal;
  const base = () =>
    db
      .from("link_edge")
      .select(INBOUND_LINK_SELECT)
      .eq("site_id", siteId)
      .is("deleted_at", null)
      .order("created_at", { ascending: false })
      .order("id", { ascending: false })
      .limit(LINK_ROW_CAP);
  const [byPageId, byUrl] = await Promise.all([
    base().eq("target_page_id", pageId).abortSignal(abortSignal),
    base().eq("target_url", pageUrl).abortSignal(abortSignal),
  ]);
  const resolved = assertData(byPageId.data, byPageId.error);
  const urlMatched = assertData(byUrl.data, byUrl.error);
  const seen = new Set<string>();
  const merged: InboundLinkEdge[] = [];
  for (const row of [...resolved, ...urlMatched]) {
    if (seen.has(row.id)) continue;
    // A page linking to itself is navigation noise, not an inbound link.
    if (row.source_page_id === pageId) continue;
    // A canonical page's current link picture comes only from its latest
    // accepted snapshot. Historical edges must not inflate compliance.
    if (
      !row.source_page?.latest_snapshot_id ||
      row.snapshot_id !== row.source_page.latest_snapshot_id
    ) {
      continue;
    }
    seen.add(row.id);
    merged.push(row);
  }
  merged.sort((a, b) =>
    a.created_at === b.created_at
      ? b.id.localeCompare(a.id)
      : b.created_at.localeCompare(a.created_at),
  );
  return merged;
}

/** One partner URL's rollup — the display unit for both link directions. */
export interface LinkPartnerRollup {
  /** Partner URL: the source page URL (inbound) or target URL (outbound). */
  url: string;
  /** Canonical page id when the edge (or its source) resolves to one. */
  pageId: string | null;
  isInternal: boolean;
  edgeCount: number;
  /** Unique anchor texts, most recent first, capped at 3. */
  anchors: string[];
  hasNofollow: boolean;
  /** Any observed http_status >= 400 on the edge. */
  isBroken: boolean;
  worstHttpStatus: number | null;
}

export type AnchorComplianceStatus =
  | "acceptable"
  | "unacceptable"
  | "untracked";

/** One current link edge, projected into the anchor-text reporting model. */
export interface AnchorLinkOccurrence {
  edgeId: string;
  anchorText: string | null;
  partnerUrl: string;
  partnerPageId: string | null;
  /**
   * The target page's accepted anchors. An empty list means that page has not
   * configured an anchor policy, so the occurrence is reported as untracked.
   */
  acceptedAnchors: string[];
}

export interface AnchorPartnerRollup {
  url: string;
  pageId: string | null;
  linkCount: number;
  acceptableLinks: number;
  unacceptableLinks: number;
  untrackedLinks: number;
  acceptedAnchors: string[];
}

export interface AnchorTextRollup {
  key: string;
  anchorText: string | null;
  label: string;
  linkCount: number;
  pageCount: number;
  acceptableLinks: number;
  unacceptableLinks: number;
  untrackedLinks: number;
  pages: AnchorPartnerRollup[];
}

export interface AnchorComplianceSummary {
  totalLinks: number;
  trackedLinks: number;
  acceptableLinks: number;
  unacceptableLinks: number;
  untrackedLinks: number;
  acceptablePercent: number | null;
  unacceptablePercent: number | null;
}

export interface AnchorTextReport {
  groups: AnchorTextRollup[];
  summary: AnchorComplianceSummary;
}

/**
 * Normalize an anchor for exact policy matching: trim, collapse whitespace,
 * and compare case-insensitively. The authored spelling remains unchanged for
 * display.
 */
export function normalizeAnchorText(value: string | null | undefined): string {
  return (value ?? "").trim().replace(/\s+/g, " ").toLocaleLowerCase();
}

/** Trim, collapse whitespace, remove blanks, and dedupe case-insensitively. */
export function sanitizeAcceptedAnchorTexts(values: string[]): string[] {
  const unique = new Map<string, string>();
  for (const value of values) {
    const display = value.trim().replace(/\s+/g, " ");
    const normalized = normalizeAnchorText(display);
    if (normalized && !unique.has(normalized)) unique.set(normalized, display);
  }
  return [...unique.values()];
}

/** Safely read the accepted-anchor slice from a page's desired_values JSON. */
export function acceptedAnchorTextsFromDesiredValues(value: Json): string[] {
  if (!isJsonRecord(value)) return [];
  const raw = value.accepted_anchor_texts;
  if (!Array.isArray(raw)) return [];
  return sanitizeAcceptedAnchorTexts(
    raw.filter((item): item is string => typeof item === "string"),
  );
}

export function anchorComplianceStatus(
  anchorText: string | null,
  acceptedAnchors: string[],
): AnchorComplianceStatus {
  if (acceptedAnchors.length === 0) return "untracked";
  const normalized = normalizeAnchorText(anchorText);
  return acceptedAnchors.some(
    (accepted) => normalizeAnchorText(accepted) === normalized,
  )
    ? "acceptable"
    : "unacceptable";
}

function addCompliance(
  target: {
    acceptableLinks: number;
    unacceptableLinks: number;
    untrackedLinks: number;
  },
  status: AnchorComplianceStatus,
): void {
  if (status === "acceptable") target.acceptableLinks += 1;
  else if (status === "unacceptable") target.unacceptableLinks += 1;
  else target.untrackedLinks += 1;
}

/**
 * Build the shared folding-tree model and percentage report for either link
 * direction. Callers only project direction-specific partner data.
 */
export function buildAnchorTextReport(
  occurrences: AnchorLinkOccurrence[],
): AnchorTextReport {
  const byAnchor = new Map<
    string,
    Omit<AnchorTextRollup, "pages" | "pageCount"> & {
      pagesByUrl: Map<string, AnchorPartnerRollup>;
    }
  >();
  const summary: AnchorComplianceSummary = {
    totalLinks: occurrences.length,
    trackedLinks: 0,
    acceptableLinks: 0,
    unacceptableLinks: 0,
    untrackedLinks: 0,
    acceptablePercent: null,
    unacceptablePercent: null,
  };

  for (const occurrence of occurrences) {
    const key = normalizeAnchorText(occurrence.anchorText);
    const display = occurrence.anchorText?.trim().replace(/\s+/g, " ") || null;
    const status = anchorComplianceStatus(
      occurrence.anchorText,
      occurrence.acceptedAnchors,
    );
    addCompliance(summary, status);
    if (status !== "untracked") summary.trackedLinks += 1;

    let group = byAnchor.get(key);
    if (!group) {
      group = {
        key,
        anchorText: display,
        label: display ?? "(No anchor text)",
        linkCount: 0,
        acceptableLinks: 0,
        unacceptableLinks: 0,
        untrackedLinks: 0,
        pagesByUrl: new Map(),
      };
      byAnchor.set(key, group);
    }
    group.linkCount += 1;
    addCompliance(group, status);

    let partner = group.pagesByUrl.get(occurrence.partnerUrl);
    if (!partner) {
      partner = {
        url: occurrence.partnerUrl,
        pageId: occurrence.partnerPageId,
        linkCount: 0,
        acceptableLinks: 0,
        unacceptableLinks: 0,
        untrackedLinks: 0,
        acceptedAnchors: [],
      };
      group.pagesByUrl.set(occurrence.partnerUrl, partner);
    }
    partner.linkCount += 1;
    partner.pageId ??= occurrence.partnerPageId;
    addCompliance(partner, status);
    partner.acceptedAnchors = sanitizeAcceptedAnchorTexts([
      ...partner.acceptedAnchors,
      ...occurrence.acceptedAnchors,
    ]);
  }

  if (summary.trackedLinks > 0) {
    summary.acceptablePercent =
      (summary.acceptableLinks / summary.trackedLinks) * 100;
    summary.unacceptablePercent =
      (summary.unacceptableLinks / summary.trackedLinks) * 100;
  }

  const groups = [...byAnchor.values()]
    .map(
      ({ pagesByUrl, ...group }): AnchorTextRollup => ({
        ...group,
        pageCount: pagesByUrl.size,
        pages: [...pagesByUrl.values()].sort(
          (a, b) =>
            b.unacceptableLinks - a.unacceptableLinks ||
            b.linkCount - a.linkCount ||
            a.url.localeCompare(b.url),
        ),
      }),
    )
    .sort(
      (a, b) =>
        b.unacceptableLinks - a.unacceptableLinks ||
        b.linkCount - a.linkCount ||
        a.label.localeCompare(b.label),
    );

  return { groups, summary };
}

/** Current inbound edges, evaluated against this destination page's policy. */
export function buildInboundAnchorTextReport(
  rows: InboundLinkEdge[],
  acceptedAnchors: string[],
): AnchorTextReport {
  return buildAnchorTextReport(
    rows.map((row) => ({
      edgeId: row.id,
      anchorText: row.anchor_text,
      partnerUrl: row.source_page?.url ?? row.source_page_id,
      partnerPageId: row.source_page_id,
      acceptedAnchors,
    })),
  );
}

/** Current outbound edges, evaluated against each internal target's policy. */
export function buildOutboundAnchorTextReport(
  rows: OutboundLinkEdge[],
): AnchorTextReport {
  return buildAnchorTextReport(
    rows.map((row) => ({
      edgeId: row.id,
      anchorText: row.anchor_text,
      partnerUrl: row.target_page?.url ?? row.target_url,
      partnerPageId: row.target_page_id,
      acceptedAnchors:
        row.is_internal && row.target_page
          ? acceptedAnchorTextsFromDesiredValues(row.target_page.desired_values)
          : [],
    })),
  );
}

/** Collapse an anchor-grouped report back to per-page compliance for URL view. */
export function anchorComplianceByPartner(
  report: AnchorTextReport,
): Map<string, AnchorPartnerRollup> {
  const byUrl = new Map<string, AnchorPartnerRollup>();
  for (const group of report.groups) {
    for (const page of group.pages) {
      const existing = byUrl.get(page.url);
      if (!existing) {
        byUrl.set(page.url, { ...page });
        continue;
      }
      existing.linkCount += page.linkCount;
      existing.acceptableLinks += page.acceptableLinks;
      existing.unacceptableLinks += page.unacceptableLinks;
      existing.untrackedLinks += page.untrackedLinks;
      existing.pageId ??= page.pageId;
      existing.acceptedAnchors = sanitizeAcceptedAnchorTexts([
        ...existing.acceptedAnchors,
        ...page.acceptedAnchors,
      ]);
    }
  }
  return byUrl;
}

function isNofollowRel(rel: string | null): boolean {
  return rel !== null && rel.toLowerCase().includes("nofollow");
}

function rollupEdges(
  edges: Array<{
    url: string;
    pageId: string | null;
    isInternal: boolean;
    rel: string | null;
    anchor: string | null;
    httpStatus: number | null;
  }>,
): LinkPartnerRollup[] {
  const byUrl = new Map<string, LinkPartnerRollup>();
  for (const edge of edges) {
    const existing = byUrl.get(edge.url);
    const broken = edge.httpStatus !== null && edge.httpStatus >= 400;
    if (!existing) {
      byUrl.set(edge.url, {
        url: edge.url,
        pageId: edge.pageId,
        isInternal: edge.isInternal,
        edgeCount: 1,
        anchors: edge.anchor ? [edge.anchor] : [],
        hasNofollow: isNofollowRel(edge.rel),
        isBroken: broken,
        worstHttpStatus: edge.httpStatus,
      });
      continue;
    }
    existing.edgeCount += 1;
    existing.pageId ??= edge.pageId;
    if (
      edge.anchor &&
      existing.anchors.length < 3 &&
      !existing.anchors.includes(edge.anchor)
    ) {
      existing.anchors.push(edge.anchor);
    }
    existing.hasNofollow = existing.hasNofollow || isNofollowRel(edge.rel);
    existing.isBroken = existing.isBroken || broken;
    if (
      edge.httpStatus !== null &&
      (existing.worstHttpStatus === null ||
        edge.httpStatus > existing.worstHttpStatus)
    ) {
      existing.worstHttpStatus = edge.httpStatus;
    }
  }
  return [...byUrl.values()].sort(
    (a, b) => b.edgeCount - a.edgeCount || a.url.localeCompare(b.url),
  );
}

/** Group outbound edges by target URL (rows arrive newest first). */
export function rollupOutboundLinks(
  rows: OutboundLinkEdge[],
): LinkPartnerRollup[] {
  return rollupEdges(
    rows.map((row) => ({
      url: row.target_page?.url ?? row.target_url,
      pageId: row.target_page_id,
      isInternal: row.is_internal,
      rel: row.rel,
      anchor: row.anchor_text,
      httpStatus: row.http_status,
    })),
  );
}

/** Group inbound edges by the linking page's URL (rows arrive newest first). */
export function rollupInboundLinks(
  rows: InboundLinkEdge[],
): LinkPartnerRollup[] {
  return rollupEdges(
    rows.map((row) => ({
      url: row.source_page?.url ?? row.source_page_id,
      pageId: row.source_page_id,
      isInternal: true,
      rel: row.rel,
      anchor: row.anchor_text,
      httpStatus: row.http_status,
    })),
  );
}

export interface PageBacklinksData {
  /** Latest page-level provider summary, when one has been collected. */
  snapshot: BacklinkSnapshotRow | null;
  /** Newest observations first, deduped by provider dedup_key. Bounded. */
  observations: BacklinkObservationRow[];
  truncated: boolean;
}

async function seoDb() {
  await requireAuthenticatedSupabaseSession(supabase);
  return supabase.schema("seo");
}

/** External backlinks resolved to this canonical page (`page_id` stamped). */
export async function getPageBacklinks(
  siteId: string,
  pageId: string,
  signal?: AbortSignal,
): Promise<PageBacklinksData> {
  const db = await seoDb();
  const abortSignal = signal ?? new AbortController().signal;
  const [snapshotResponse, observationResponse] = await Promise.all([
    db
      .from("backlink_snapshot")
      .select("*")
      .eq("site_id", siteId)
      .eq("page_id", pageId)
      .order("observed_at", { ascending: false })
      .order("id", { ascending: false })
      .limit(1)
      .abortSignal(abortSignal)
      .maybeSingle(),
    db
      .from("backlink_observation")
      .select("*")
      .eq("site_id", siteId)
      .eq("page_id", pageId)
      .order("created_at", { ascending: false })
      .order("id", { ascending: false })
      .limit(BACKLINK_ROW_CAP)
      .abortSignal(abortSignal),
  ]);
  if (snapshotResponse.error) throw snapshotResponse.error;
  const raw = assertData(observationResponse.data, observationResponse.error);
  // Repeat collection runs re-observe the same link — keep the newest row per
  // provider dedup_key so counts describe links, not runs.
  const seen = new Set<string>();
  const observations: BacklinkObservationRow[] = [];
  for (const row of raw) {
    if (seen.has(row.dedup_key)) continue;
    seen.add(row.dedup_key);
    observations.push(row);
  }
  return {
    snapshot: snapshotResponse.data,
    observations,
    truncated: raw.length >= BACKLINK_ROW_CAP,
  };
}

/** One referring domain's rollup over the fetched observations. */
export interface ReferringDomainRollup {
  domain: string;
  backlinks: number;
  liveBacklinks: number;
  dofollowBacklinks: number;
  domainRank: number | null;
  spamScore: number | null;
  /** Unique anchor texts, most recent first, capped at 3. */
  anchors: string[];
}

export function rollupReferringDomains(
  observations: BacklinkObservationRow[],
): ReferringDomainRollup[] {
  const byDomain = new Map<string, ReferringDomainRollup>();
  for (const row of observations) {
    const domain = row.source_domain ?? hostnameOf(row.source_url);
    const existing = byDomain.get(domain);
    if (!existing) {
      byDomain.set(domain, {
        domain,
        backlinks: 1,
        liveBacklinks: row.state === "live" ? 1 : 0,
        dofollowBacklinks: row.is_dofollow === true ? 1 : 0,
        domainRank: row.domain_rank,
        spamScore: row.spam_score,
        anchors: row.anchor_text ? [row.anchor_text] : [],
      });
      continue;
    }
    existing.backlinks += 1;
    if (row.state === "live") existing.liveBacklinks += 1;
    if (row.is_dofollow === true) existing.dofollowBacklinks += 1;
    existing.domainRank = maxNullable(existing.domainRank, row.domain_rank);
    existing.spamScore = maxNullable(existing.spamScore, row.spam_score);
    if (
      row.anchor_text &&
      existing.anchors.length < 3 &&
      !existing.anchors.includes(row.anchor_text)
    ) {
      existing.anchors.push(row.anchor_text);
    }
  }
  return [...byDomain.values()].sort(
    (a, b) =>
      (b.domainRank ?? -1) - (a.domainRank ?? -1) ||
      b.backlinks - a.backlinks ||
      a.domain.localeCompare(b.domain),
  );
}

function hostnameOf(url: string): string {
  try {
    return new URL(url).hostname;
  } catch {
    // Provider rows occasionally carry schemeless URLs — keep them grouped
    // under the raw string rather than crashing the rollup.
    return url;
  }
}

function maxNullable(a: number | null, b: number | null): number | null {
  if (a === null) return b;
  if (b === null) return a;
  return Math.max(a, b);
}

export function usePageOutboundLinks(
  siteId: string,
  pageId: string,
  latestSnapshotId?: string | null,
) {
  return useQuery({
    queryKey: [
      ...marketingKeys.page(siteId, pageId),
      "links-out",
      latestSnapshotId ?? null,
    ] as const,
    queryFn: ({ signal }) =>
      listOutboundLinkEdges(siteId, pageId, latestSnapshotId, signal),
    enabled: Boolean(siteId && pageId && latestSnapshotId),
  });
}

export function usePageInboundLinks(
  siteId: string,
  pageId: string,
  pageUrl: string,
) {
  return useQuery({
    queryKey: [...marketingKeys.page(siteId, pageId), "links-in"] as const,
    queryFn: ({ signal }) =>
      listInboundLinkEdges(siteId, pageId, pageUrl, signal),
    enabled: Boolean(siteId && pageId && pageUrl),
  });
}

export function usePageBacklinks(siteId: string, pageId: string) {
  return useQuery({
    queryKey: [...marketingKeys.page(siteId, pageId), "backlinks"] as const,
    queryFn: ({ signal }) => getPageBacklinks(siteId, pageId, signal),
    enabled: Boolean(siteId && pageId),
  });
}
