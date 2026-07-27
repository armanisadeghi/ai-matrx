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

export const LINK_ROW_CAP = 500;
export const BACKLINK_ROW_CAP = 300;

// Static select strings (a computed/union string defeats the PostgREST
// query-string type parser — same rule as inspection-queries.ts).
const OUTBOUND_LINK_SELECT =
  "id, site_id, snapshot_id, source_page_id, target_page_id, target_url, is_internal, rel, anchor_text, http_status, position, created_at, target_page:page!link_edge_target_page_id_fkey(url)";
const INBOUND_LINK_SELECT =
  "id, site_id, snapshot_id, source_page_id, target_page_id, target_url, is_internal, rel, anchor_text, http_status, position, created_at, source_page:page!link_edge_source_page_id_fkey(url)";

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
  target_page: { url: string } | null;
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
  source_page: { url: string } | null;
};

/**
 * Links FROM this page — every stored edge whose source is this canonical
 * page, newest first across snapshots (rollup dedupes repeat captures).
 */
export async function listOutboundLinkEdges(
  siteId: string,
  pageId: string,
  signal?: AbortSignal,
): Promise<OutboundLinkEdge[]> {
  const response = await (
    await authenticatedWebDb(supabase)
  )
    .from("link_edge")
    .select(OUTBOUND_LINK_SELECT)
    .eq("site_id", siteId)
    .eq("source_page_id", pageId)
    .is("deleted_at", null)
    .order("created_at", { ascending: false })
    .order("id", { ascending: false })
    .limit(LINK_ROW_CAP)
    .abortSignal(signal ?? new AbortController().signal);
  return assertData(response.data, response.error);
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

export function usePageOutboundLinks(siteId: string, pageId: string) {
  return useQuery({
    queryKey: [...marketingKeys.page(siteId, pageId), "links-out"] as const,
    queryFn: ({ signal }) => listOutboundLinkEdges(siteId, pageId, signal),
    enabled: Boolean(siteId && pageId),
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
