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

// ── Outbound / external link report ─────────────────────────────────────────
// Domain-grouped rollup of every external link the site sends out (Screaming
// Frog's External tab / Ahrefs' Linked Domains). Unlike graph identity, an
// external target keeps its FULL query string (tracking params included) —
// the exact outbound URL is the datum; only fragments are dropped.

export interface ExternalTargetRollup {
  /** Normalized outbound URL (fragment stripped, host lowercased). */
  url: string;
  /** Raw link occurrences across retained snapshots. */
  links: number;
  /** Distinct internal pages linking here. */
  sourcePages: number;
  /** Representative source page ids/urls (first observed, up to 3). */
  sourceSamples: Array<{ pageId: string; url: string }>;
  /** Distinct anchor texts with occurrence counts, most-used first (top 5). */
  anchors: Array<[string, number]>;
  /** True when EVERY occurrence carries rel=nofollow. */
  nofollow: boolean;
  /** Worst observed HTTP status for this target (null = never checked). */
  httpStatus: number | null;
}

export interface ExternalDomainRollup {
  domain: string;
  links: number;
  sourcePages: number;
  nofollowLinks: number;
  targets: ExternalTargetRollup[];
}

export interface ExternalLinkReport {
  /** Domains sorted by link count desc; targets within sorted the same. */
  domains: ExternalDomainRollup[];
  totalLinks: number;
  totalTargets: number;
  nofollowLinks: number;
  /** Distinct internal pages that link out at all. */
  linkingPages: number;
  /** True when no external edge has ever had its HTTP status checked. */
  statusUnchecked: boolean;
}

/** Normalize an outbound target: drop fragment, lowercase host, keep query. */
function normalizeExternalUrl(raw: string): { url: string; domain: string } | null {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return null;
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") return null;
  const host = url.host.toLowerCase();
  return {
    url: `${url.protocol}//${host}${url.pathname}${url.search}`,
    domain: host.replace(/^www\./, ""),
  };
}

/** Build the outbound-links report from raw edge rows (external edges only). */
export function buildExternalLinkReport(
  rows: LinkGraphEdgeRow[],
): ExternalLinkReport {
  interface TargetAcc {
    url: string;
    links: number;
    pages: Set<string>;
    samples: Map<string, string>;
    anchors: Map<string, number>;
    nofollow: boolean;
    httpStatus: number | null;
  }
  const domains = new Map<string, Map<string, TargetAcc>>();
  const linkingPages = new Set<string>();
  let totalLinks = 0;
  let anyStatus = false;

  for (const row of rows) {
    if (row.is_internal) continue;
    const normalized = normalizeExternalUrl(row.target_url);
    if (!normalized) continue;
    let targets = domains.get(normalized.domain);
    if (!targets) {
      targets = new Map();
      domains.set(normalized.domain, targets);
    }
    let target = targets.get(normalized.url);
    if (!target) {
      target = {
        url: normalized.url,
        links: 0,
        pages: new Set(),
        samples: new Map(),
        anchors: new Map(),
        nofollow: true,
        httpStatus: null,
      };
      targets.set(normalized.url, target);
    }
    target.links += 1;
    totalLinks += 1;
    target.pages.add(row.source_page_id);
    linkingPages.add(row.source_page_id);
    if (row.source_page?.url && target.samples.size < 3)
      target.samples.set(row.source_page_id, row.source_page.url);
    const anchor = row.anchor_text?.trim();
    if (anchor) target.anchors.set(anchor, (target.anchors.get(anchor) ?? 0) + 1);
    if (!/\bnofollow\b/i.test(row.rel ?? "")) target.nofollow = false;
    if (row.http_status !== null) {
      anyStatus = true;
      if (target.httpStatus === null || row.http_status > target.httpStatus)
        target.httpStatus = row.http_status;
    }
  }

  const outDomains: ExternalDomainRollup[] = [];
  let totalTargets = 0;
  let nofollowLinks = 0;
  for (const [domain, targets] of domains) {
    const outTargets: ExternalTargetRollup[] = [];
    const domainPages = new Set<string>();
    let domainLinks = 0;
    let domainNofollow = 0;
    for (const target of targets.values()) {
      domainLinks += target.links;
      if (target.nofollow) domainNofollow += target.links;
      for (const page of target.pages) domainPages.add(page);
      outTargets.push({
        url: target.url,
        links: target.links,
        sourcePages: target.pages.size,
        sourceSamples: Array.from(target.samples, ([pageId, url]) => ({
          pageId,
          url,
        })),
        anchors: Array.from(target.anchors.entries())
          .sort((a, b) => b[1] - a[1])
          .slice(0, 5),
        nofollow: target.nofollow,
        httpStatus: target.httpStatus,
      });
    }
    outTargets.sort((a, b) => b.links - a.links);
    totalTargets += outTargets.length;
    nofollowLinks += domainNofollow;
    outDomains.push({
      domain,
      links: domainLinks,
      sourcePages: domainPages.size,
      nofollowLinks: domainNofollow,
      targets: outTargets,
    });
  }
  outDomains.sort((a, b) => b.links - a.links);

  return {
    domains: outDomains,
    totalLinks,
    totalTargets,
    nofollowLinks,
    linkingPages: linkingPages.size,
    statusUnchecked: totalLinks > 0 && !anyStatus,
  };
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

// ── Section (directory) aggregation ─────────────────────────────────────────
//
// A page-per-node graph is unreadable past ~50 pages: 200 nodes is a hairball,
// 3,000 is noise, and full-URL labels cover the canvas. Every serious site-
// structure tool (Sitebulb's directory tree, Ahrefs' site-structure report,
// Semrush's site audit crawl map) solves this the same way — aggregate by URL
// PATH SEGMENT and let the user drill down one level at a time.
//
// At focus path P the view shows: P's own index page, plus ONE node per direct
// child segment. A child holding many pages is a single FOLDER node sized by
// page count. Links wholly inside a child never become edges — they become
// that node's `internalLinks` stat — so only the between-section structure is
// drawn. That is the signal; the rest was always noise.

export type SectionKind = "index" | "page" | "folder" | "external";

export interface SectionGraphNode {
  /** Path prefix identity ("/", "/blogs", "/blogs/2024") or "ext:<domain>". */
  id: string;
  /** Segment label only — never a full URL ("blogs", "/" for the root index). */
  label: string;
  kind: SectionKind;
  path: string;
  /** Internal pages represented by this node (1 for a page/index node). */
  pageCount: number;
  /** Inbound links from OUTSIDE this section. */
  inlinks: number;
  /** Outbound links leaving this section. */
  outlinks: number;
  /** Links wholly inside this section — drawn as a stat, never as edges. */
  internalLinks: number;
  brokenPages: number;
  orphanPages: number;
  /** Shallowest click depth reached inside this section. */
  depth: number | null;
  /** Representative full URL (the index page when there is one). */
  representativeUrl: string;
  /** Page id when this node is exactly one page. */
  pageId: string | null;
  /** True when clicking should drill INTO this node. */
  drillable: boolean;
}

export interface SectionCrumb {
  path: string;
  label: string;
}

export interface SectionGraphModel {
  nodes: SectionGraphNode[];
  edges: LinkGraphEdge[];
  focusPath: string;
  breadcrumb: SectionCrumb[];
  /** Internal pages inside the current focus. */
  pagesInFocus: number;
  /** True when the focus holds few enough pages that page-level reads well. */
  pageLevelViable: boolean;
}

const PAGE_LEVEL_VIABLE_MAX = 60;

function pathOf(node: LinkGraphNode): string {
  try {
    return new URL(node.fullUrl).pathname.replace(/\/+$/, "") || "/";
  } catch {
    return "/";
  }
}

function childPath(focusPath: string, segment: string): string {
  return focusPath === "/" ? `/${segment}` : `${focusPath}/${segment}`;
}

/** Breadcrumb trail for a focus path ("/" → [/]; "/a/b" → [/, a, b]). */
export function sectionBreadcrumb(focusPath: string): SectionCrumb[] {
  const crumbs: SectionCrumb[] = [{ path: "/", label: "/" }];
  if (focusPath === "/") return crumbs;
  let current = "";
  for (const segment of focusPath.split("/").filter(Boolean)) {
    current = `${current}/${segment}`;
    crumbs.push({ path: current, label: segment });
  }
  return crumbs;
}

/**
 * Aggregate a page-level model into the directory view at `focusPath`.
 * External targets (when included) collapse to ONE node per domain.
 */
export function buildSectionGraph(
  model: LinkGraphModel,
  focusPath: string,
): SectionGraphModel {
  const prefix = focusPath === "/" ? "/" : `${focusPath}/`;

  interface Acc {
    id: string;
    label: string;
    kind: SectionKind;
    path: string;
    pages: LinkGraphNode[];
    indexNode: LinkGraphNode | null;
  }
  const buckets = new Map<string, Acc>();
  // Which bucket a page-level node id belongs to (edge remapping).
  const bucketOfNode = new Map<string, string>();

  for (const node of model.nodes) {
    if (node.external) {
      let domain = "";
      try {
        domain = new URL(node.fullUrl).host.toLowerCase().replace(/^www\./, "");
      } catch {
        continue;
      }
      const id = `ext:${domain}`;
      let bucket = buckets.get(id);
      if (!bucket) {
        bucket = {
          id,
          label: domain,
          kind: "external",
          path: id,
          pages: [],
          indexNode: null,
        };
        buckets.set(id, bucket);
      }
      bucket.pages.push(node);
      bucketOfNode.set(node.id, id);
      continue;
    }
    const path = pathOf(node);
    const inFocus = focusPath === "/" || path === focusPath || path.startsWith(prefix);
    if (!inFocus) continue;

    if (path === focusPath) {
      const id = focusPath;
      let bucket = buckets.get(id);
      if (!bucket) {
        bucket = {
          id,
          label: focusPath === "/" ? "/" : `${focusPath.split("/").pop()} (index)`,
          kind: "index",
          path: focusPath,
          pages: [],
          indexNode: node,
        };
        buckets.set(id, bucket);
      }
      bucket.indexNode = node;
      bucket.pages.push(node);
      bucketOfNode.set(node.id, id);
      continue;
    }

    const rest = path.slice(prefix.length);
    const segment = rest.split("/")[0];
    if (!segment) continue;
    const id = childPath(focusPath, segment);
    let bucket = buckets.get(id);
    if (!bucket) {
      bucket = {
        id,
        label: segment,
        kind: "page",
        path: id,
        pages: [],
        indexNode: null,
      };
      buckets.set(id, bucket);
    }
    bucket.pages.push(node);
    if (path === id) bucket.indexNode = node;
    bucketOfNode.set(node.id, id);
  }

  // A bucket is a FOLDER when it holds more than its own index page.
  for (const bucket of buckets.values()) {
    if (bucket.kind === "page" && bucket.pages.length > 1) bucket.kind = "folder";
  }

  // Aggregate edges between buckets; same-bucket links become a node stat.
  const internalLinks = new Map<string, number>();
  const inlinks = new Map<string, number>();
  const outlinks = new Map<string, number>();
  const aggregated = new Map<string, LinkGraphEdge>();
  for (const edge of model.edges) {
    const source = bucketOfNode.get(edge.source);
    const target = bucketOfNode.get(edge.target);
    if (!source || !target) continue;
    if (source === target) {
      internalLinks.set(source, (internalLinks.get(source) ?? 0) + edge.weight);
      continue;
    }
    outlinks.set(source, (outlinks.get(source) ?? 0) + edge.weight);
    inlinks.set(target, (inlinks.get(target) ?? 0) + edge.weight);
    const id = `${source}→${target}`;
    const existing = aggregated.get(id);
    if (existing) {
      existing.weight += edge.weight;
      existing.broken = existing.broken || edge.broken;
      existing.nofollow = existing.nofollow && edge.nofollow;
    } else {
      aggregated.set(id, {
        id,
        source,
        target,
        weight: edge.weight,
        anchors: edge.anchors.slice(0, 3),
        nofollow: edge.nofollow,
        broken: edge.broken,
      });
    }
  }

  const nodes: SectionGraphNode[] = [];
  let pagesInFocus = 0;
  for (const bucket of buckets.values()) {
    const pageCount = bucket.pages.length;
    if (bucket.kind !== "external") pagesInFocus += pageCount;
    const depths = bucket.pages
      .map((page) => page.depth)
      .filter((depth): depth is number => depth !== null);
    const representative = bucket.indexNode ?? bucket.pages[0];
    nodes.push({
      id: bucket.id,
      label:
        bucket.kind === "folder"
          ? `${bucket.label}\n${pageCount} pages`
          : bucket.label,
      kind: bucket.kind,
      path: bucket.path,
      pageCount,
      inlinks: inlinks.get(bucket.id) ?? 0,
      outlinks: outlinks.get(bucket.id) ?? 0,
      internalLinks: internalLinks.get(bucket.id) ?? 0,
      brokenPages: bucket.pages.filter((page) => page.status === "broken").length,
      orphanPages: bucket.pages.filter(
        (page) => !page.external && page.depth === null,
      ).length,
      depth: depths.length > 0 ? Math.min(...depths) : null,
      representativeUrl: representative?.fullUrl ?? bucket.path,
      pageId:
        bucket.kind === "page" || bucket.kind === "index"
          ? (representative?.pageId ?? null)
          : null,
      drillable: bucket.kind === "folder",
    });
  }
  nodes.sort((a, b) => b.pageCount - a.pageCount || b.inlinks - a.inlinks);

  return {
    nodes,
    edges: Array.from(aggregated.values()),
    focusPath,
    breadcrumb: sectionBreadcrumb(focusPath),
    pagesInFocus,
    pageLevelViable: pagesInFocus <= PAGE_LEVEL_VIABLE_MAX,
  };
}
