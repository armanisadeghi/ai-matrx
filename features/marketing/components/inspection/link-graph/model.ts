// features/marketing/components/inspection/link-graph/model.ts
//
// Pure transform: raw `web.link_edge` rows → the aggregated, display-ready site
// link graph. Modeled on the best-in-class internal-link visualizers (Screaming
// Frog's crawl diagram, Sitebulb's crawl map): nodes are unique PAGES (not raw
// edge rows), sized by inbound links, colored by click depth from the homepage
// (or by HTTP status), with directed weighted edges.
//
// URL policy (deliberate, not incidental):
// - Fragments (`#…`) never create identity — same document.
// - Tracking params (utm_*, gclid, fbclid, msclkid, mc_eid) NEVER create
//   identity — they are marketing decoration, not pages.
// - Remaining query params are meaningful by default but GROUPED into their
//   base path node (with the distinct variants recorded + surfaced), because a
//   site map colored per `?page=2&sort=asc` permutation is unreadable. The
//   caller can flip `splitQueryVariants` to make each distinct (key-sorted)
//   query string its own node.
// - Non-http(s) targets (mailto:, tel:, javascript:) are excluded from the
//   graph — they are actions, not pages. They stay visible in the table view.
// - Self-loops (nav linking to the current page / #fragment links) are dropped.

import type { LinkGraphEdgeRow } from "@/features/marketing/data/inspection-types";

export type LinkNodeStatus = "ok" | "redirect" | "broken" | "unchecked";

export interface LinkGraphNode {
  /** Normalized URL identity (also the cytoscape element id). */
  id: string;
  /** Root-stripped display label ("/pricing", "/" for home, host+path for external). */
  label: string;
  /** Representative full URL (first observed for this identity). */
  fullUrl: string;
  external: boolean;
  isRoot: boolean;
  /** Known page id when this URL is a crawled source page (or resolved target). */
  pageId: string | null;
  /** Click depth from the homepage via internal links; null = not reachable. */
  depth: number | null;
  status: LinkNodeStatus;
  /** Worst HTTP status observed for this URL as a link target. */
  httpStatus: number | null;
  /** Distinct linking pages pointing here. */
  inlinks: number;
  /** Distinct pages this page links out to. */
  outlinks: number;
  /** Distinct query strings collapsed into this node (grouped mode). */
  queryVariants: string[];
}

export interface LinkGraphEdge {
  id: string;
  source: string;
  target: string;
  /** How many raw link occurrences were aggregated into this edge. */
  weight: number;
  /** Sample of distinct anchor texts (up to 3). */
  anchors: string[];
  nofollow: boolean;
  broken: boolean;
}

export interface LinkGraphStats {
  internalPages: number;
  externalTargets: number;
  brokenTargets: number;
  orphanPages: number;
  /** Self-loops / non-http(s) targets excluded by policy. */
  excludedLinks: number;
  uniqueEdges: number;
  rawRows: number;
}

export interface LinkGraphModel {
  nodes: LinkGraphNode[];
  edges: LinkGraphEdge[];
  stats: LinkGraphStats;
  /** Identity of the homepage node when present in the graph. */
  rootId: string | null;
  /** True when the node cap dropped low-degree nodes from the render set. */
  capped: boolean;
}

export interface LinkGraphOptions {
  /** Include external targets as (diamond) nodes. Default false — internal map. */
  includeExternal: boolean;
  /** Each distinct query string becomes its own node. Default false (grouped). */
  splitQueryVariants: boolean;
  /** Keep only the top-N nodes by degree (root always kept). */
  nodeCap: number;
}

const TRACKING_PARAM = /^(utm_|gclid$|fbclid$|msclkid$|mc_eid$)/i;

interface NormalizedUrl {
  /** Identity key (query included only in split mode). */
  key: string;
  /** Full canonical URL for this identity. */
  fullUrl: string;
  /** Key-sorted meaningful query string ("" when none). */
  query: string;
  origin: string;
  path: string;
}

/**
 * Normalize a URL for graph identity. Returns null for unparseable or
 * non-http(s) URLs (mailto:, tel:, javascript:, data: …).
 */
export function normalizeGraphUrl(
  raw: string,
  splitQueryVariants: boolean,
): NormalizedUrl | null {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return null;
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") return null;
  const origin = url.origin.toLowerCase();
  // Trailing-slash-insensitive path; "/" for the root.
  const path =
    url.pathname.length > 1 ? url.pathname.replace(/\/+$/, "") || "/" : "/";
  const params = Array.from(url.searchParams.entries()).filter(
    ([name]) => !TRACKING_PARAM.test(name),
  );
  params.sort(([a], [b]) => a.localeCompare(b));
  const query = params
    .map(([name, value]) => `${name}=${value}`)
    .join("&");
  const identityQuery = splitQueryVariants && query ? `?${query}` : "";
  return {
    key: `${origin}${path}${identityQuery}`,
    fullUrl: `${origin}${path}${query ? `?${query}` : ""}`,
    query,
    origin,
    path,
  };
}

/**
 * Root-stripped display for a URL: internal URLs render as their path (never
 * the repeated site base), external URLs as host + path. Used by the graph
 * labels AND the table cells so the two views agree.
 */
export function displayUrl(raw: string, rootUrl: string): string {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return raw;
  }
  let rootHost = "";
  try {
    rootHost = new URL(rootUrl).host.toLowerCase().replace(/^www\./, "");
  } catch {
    rootHost = "";
  }
  const host = url.host.toLowerCase().replace(/^www\./, "");
  const path = `${url.pathname}${url.search}${url.hash}`;
  if (rootHost && host === rootHost) return path || "/";
  return `${host}${path === "/" ? "" : path}`;
}

function nodeStatus(httpStatus: number | null): LinkNodeStatus {
  if (httpStatus === null) return "unchecked";
  if (httpStatus >= 400) return "broken";
  if (httpStatus >= 300) return "redirect";
  return "ok";
}

interface NodeAccumulator {
  id: string;
  fullUrl: string;
  external: boolean;
  pageId: string | null;
  httpStatus: number | null;
  /** True once observed as a crawled source page (implies it resolved OK). */
  isSource: boolean;
  queryVariants: Set<string>;
  inbound: Set<string>;
  outbound: Set<string>;
  path: string;
  origin: string;
}

interface EdgeAccumulator {
  source: string;
  target: string;
  weight: number;
  anchors: Set<string>;
  nofollow: boolean;
  broken: boolean;
}

/** Build the aggregated link graph from raw edge rows. */
export function buildLinkGraph(
  rows: LinkGraphEdgeRow[],
  rootUrl: string,
  options: LinkGraphOptions,
): LinkGraphModel {
  const nodes = new Map<string, NodeAccumulator>();
  const edges = new Map<string, EdgeAccumulator>();
  const root = normalizeGraphUrl(rootUrl, false);
  const rootOrigin = root?.origin ?? null;
  let excludedLinks = 0;

  const ensureNode = (
    normalized: NormalizedUrl,
    external: boolean,
  ): NodeAccumulator => {
    let node = nodes.get(normalized.key);
    if (!node) {
      node = {
        id: normalized.key,
        fullUrl: normalized.fullUrl,
        external,
        pageId: null,
        httpStatus: null,
        isSource: false,
        queryVariants: new Set(),
        inbound: new Set(),
        outbound: new Set(),
        path: normalized.path,
        origin: normalized.origin,
      };
      nodes.set(normalized.key, node);
    }
    if (normalized.query) node.queryVariants.add(normalized.query);
    return node;
  };

  for (const row of rows) {
    const sourceRaw = row.source_page?.url;
    if (!sourceRaw) continue;
    const source = normalizeGraphUrl(sourceRaw, options.splitQueryVariants);
    const target = normalizeGraphUrl(
      row.target_url,
      options.splitQueryVariants,
    );
    if (!source) continue;
    // Source pages are always internal crawled pages.
    const sourceNode = ensureNode(source, false);
    sourceNode.isSource = true;
    if (!sourceNode.pageId) sourceNode.pageId = row.source_page_id;

    if (!target) {
      excludedLinks += 1; // mailto: / tel: / javascript: — actions, not pages.
      continue;
    }
    if (target.key === source.key) {
      excludedLinks += 1; // self-loop (nav-to-self, #fragment links).
      continue;
    }
    const external = rootOrigin
      ? target.origin !== rootOrigin
      : !row.is_internal;
    const targetNode = ensureNode(target, external);
    if (!targetNode.pageId && row.target_page_id)
      targetNode.pageId = row.target_page_id;
    if (
      row.http_status !== null &&
      (targetNode.httpStatus === null || row.http_status > targetNode.httpStatus)
    ) {
      targetNode.httpStatus = row.http_status;
    }

    const edgeKey = `${source.key}→${target.key}`;
    let edge = edges.get(edgeKey);
    if (!edge) {
      edge = {
        source: source.key,
        target: target.key,
        weight: 0,
        anchors: new Set(),
        nofollow: true,
        broken: false,
      };
      edges.set(edgeKey, edge);
    }
    edge.weight += 1;
    if (row.anchor_text?.trim() && edge.anchors.size < 3)
      edge.anchors.add(row.anchor_text.trim());
    // An edge is nofollow only if EVERY observed occurrence carries it.
    if (!/\bnofollow\b/i.test(row.rel ?? "")) edge.nofollow = false;
    if (row.http_status !== null && row.http_status >= 400) edge.broken = true;

    sourceNode.outbound.add(target.key);
    targetNode.inbound.add(source.key);
  }

  // Dataset-wide stats BEFORE any display filtering, so the numbers describe
  // the site rather than the current toggle state.
  let brokenTargets = 0;
  let orphanPages = 0;
  let internalPages = 0;
  let externalTargets = 0;
  for (const node of nodes.values()) {
    const httpStatus = node.httpStatus ?? (node.isSource ? 200 : null);
    if (node.external) externalTargets += 1;
    else internalPages += 1;
    if (nodeStatus(httpStatus) === "broken") brokenTargets += 1;
    if (
      !node.external &&
      node.id !== (root?.key ?? "") &&
      node.inbound.size === 0
    ) {
      orphanPages += 1;
    }
  }

  // Optionally drop external targets (and their edges).
  if (!options.includeExternal) {
    for (const [key, node] of nodes) {
      if (node.external) nodes.delete(key);
    }
    for (const [key, edge] of edges) {
      if (!nodes.has(edge.target) || !nodes.has(edge.source)) edges.delete(key);
    }
  }

  // Click-depth BFS from the homepage along internal links.
  const rootId = root && nodes.has(root.key) ? root.key : null;
  const depths = new Map<string, number>();
  if (rootId) {
    depths.set(rootId, 0);
    const queue = [rootId];
    while (queue.length > 0) {
      const current = queue.shift() as string;
      const currentDepth = depths.get(current) as number;
      const node = nodes.get(current);
      if (!node) continue;
      for (const next of node.outbound) {
        const nextNode = nodes.get(next);
        if (!nextNode || nextNode.external || depths.has(next)) continue;
        depths.set(next, currentDepth + 1);
        queue.push(next);
      }
    }
  }

  // Node cap: keep the highest-degree nodes (the hubs), always keep the root.
  const ranked = Array.from(nodes.values()).sort(
    (a, b) =>
      b.inbound.size + b.outbound.size - (a.inbound.size + a.outbound.size),
  );
  const kept = new Set<string>();
  for (const node of ranked) {
    if (kept.size >= options.nodeCap) break;
    kept.add(node.id);
  }
  if (rootId) kept.add(rootId);
  const capped = kept.size < nodes.size;

  const outNodes: LinkGraphNode[] = [];
  for (const node of ranked) {
    const isRoot = node.id === rootId;
    // Crawled source pages resolved by definition; a target-only URL keeps its
    // observed check status.
    const httpStatus = node.httpStatus ?? (node.isSource ? 200 : null);
    const status = nodeStatus(httpStatus);
    if (!kept.has(node.id)) continue;
    outNodes.push({
      id: node.id,
      label: node.external
        ? displayUrl(node.fullUrl, rootUrl)
        : node.path +
          (options.splitQueryVariants && node.queryVariants.size > 0
            ? `?${Array.from(node.queryVariants)[0]}`
            : ""),
      fullUrl: node.fullUrl,
      external: node.external,
      isRoot,
      pageId: node.pageId,
      depth: node.external ? null : (depths.get(node.id) ?? null),
      status,
      httpStatus,
      inlinks: node.inbound.size,
      outlinks: node.outbound.size,
      queryVariants: Array.from(node.queryVariants).sort(),
    });
  }

  const outEdges: LinkGraphEdge[] = [];
  for (const edge of edges.values()) {
    if (!kept.has(edge.source) || !kept.has(edge.target)) continue;
    outEdges.push({
      id: `${edge.source}→${edge.target}`,
      source: edge.source,
      target: edge.target,
      weight: edge.weight,
      anchors: Array.from(edge.anchors),
      nofollow: edge.nofollow,
      broken: edge.broken,
    });
  }

  return {
    nodes: outNodes,
    edges: outEdges,
    stats: {
      internalPages,
      externalTargets,
      brokenTargets,
      orphanPages,
      excludedLinks,
      uniqueEdges: edges.size,
      rawRows: rows.length,
    },
    rootId,
    capped,
  };
}
