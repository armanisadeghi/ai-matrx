/**
 * features/marketing/content-plan/lib/drift.ts
 *
 * PLAN-VS-REALITY DRIFT — the pure model behind every drift badge, count and
 * repair door in the workspace. No React, no network: given the plan nodes,
 * the paired CMS site's pages, and the crawl reconciler's report, it returns
 * ONE ranked list of drift items, each one a door with (where the platform
 * has one) a real one-click fix.
 *
 * Three classes the user must be able to see at a glance:
 *   ghost     — a planned page that is not live (three distinct reasons)
 *   orphan    — a live page the plan does not know about
 *   conflict  — a linked pair whose routes diverged (the plan says one URL,
 *               the site serves another)
 *
 * HONESTY RULES (same discipline as setup/readiness.ts + setup/bridge.ts):
 * - A ghost is never called "not live" on crawl evidence we do not have. With
 *   no crawl data for the site, `not_crawled` is never emitted — absence of a
 *   crawl is not evidence of absence of a page.
 * - A page whose route the server did not send is skipped, never guessed into
 *   a conflict. Skips are counted in `unreadable` and shown, never swallowed.
 * - Every item states a VERDICT ("plan says /a, the site serves /b"), never a
 *   timestamp (THE DOOR LAW corollary).
 */

import type { CmsPageMapEntry } from "../setup/bridge";
import type { RealityReport } from "../hooks/usePlanReality";
import type { PlanNodeRow } from "../types";

/** Mirror of the server's `_normalize_path` (reconciler.py) so client-side
 * comparisons can never disagree with the server's own matching. */
export function normalizeRoute(value: string | null | undefined): string | null {
  if (!value) return null;
  let raw = value.trim();
  if (!raw) return null;
  if (raw.includes("://")) {
    try {
      raw = new URL(raw).pathname || "/";
    } catch {
      return null;
    }
  }
  const cut = raw.search(/[?#]/);
  if (cut >= 0) raw = raw.slice(0, cut);
  if (!raw.startsWith("/")) raw = `/${raw}`;
  if (raw.length > 1) raw = raw.replace(/\/+$/, "");
  return (raw || "/").toLowerCase();
}

export type DriftKind = "ghost" | "orphan" | "conflict";

/** Why a planned page is not live — each reason has a different repair. */
export type GhostReason =
  | "not_built" // no CMS page behind the node at all      → realize
  | "not_published" // CMS page exists, still a draft      → publish
  | "not_crawled"; // published, but the crawl never saw it → (diagnose)

export type DriftSeverity = "high" | "medium" | "low";

interface DriftItemBase {
  /** Stable per item — React key AND assist dedupe input. */
  key: string;
  kind: DriftKind;
  severity: DriftSeverity;
  /** The headline the user reads. */
  title: string;
  /** The verdict: what differs, in plain words. Never a timestamp. */
  verdict: string;
}

export interface GhostDrift extends DriftItemBase {
  kind: "ghost";
  reason: GhostReason;
  nodeId: string;
  nodeLabel: string;
  route: string;
  /** The CMS page behind it, when there is one. */
  pageId: string | null;
  previewUrl: string | null;
  liveUrl: string | null;
}

export interface OrphanDrift extends DriftItemBase {
  kind: "orphan";
  route: string;
  /** The real address to open — always present for a crawled orphan. */
  url: string | null;
  /** CMS page id when this live URL IS an unlinked page on the paired site —
   * that is exactly what makes it one-click adoptable. */
  cmsPageId: string | null;
  /** web.page id from the crawl, when the crawler is where we saw it. */
  webPageId: string | null;
  adoptable: boolean;
}

export interface ConflictDrift extends DriftItemBase {
  kind: "conflict";
  nodeId: string;
  nodeLabel: string;
  nodeRoute: string;
  pageId: string;
  pageRoute: string;
  liveUrl: string | null;
  isPublished: boolean;
}

export type DriftItem = GhostDrift | OrphanDrift | ConflictDrift;

export interface PlanDriftModel {
  items: DriftItem[];
  /** node_id → its drift (ghost or conflict) for O(1) row badges. */
  byNodeId: Map<string, GhostDrift | ConflictDrift>;
  counts: {
    total: number;
    ghosts: number;
    orphans: number;
    conflicts: number;
  };
  /** True once the crawl reconciler has anything to say about this site. */
  hasCrawlData: boolean;
  /** True when the plan site has a paired CMS site (no pairing = no drift
   * verdict is possible, and that is a normal state, never a finding). */
  isPaired: boolean;
  /** Rows we could not read — surfaced in the UI, never silently dropped. */
  unreadable: string[];
}

const EMPTY_MODEL: PlanDriftModel = {
  items: [],
  byNodeId: new Map(),
  counts: { total: 0, ghosts: 0, orphans: 0, conflicts: 0 },
  hasCrawlData: false,
  isPaired: false,
  unreadable: [],
};

const SEVERITY_ORDER: Record<DriftSeverity, number> = {
  high: 0,
  medium: 1,
  low: 2,
};

/** The CMS page's public path — `route` is the DB-derived identity; a home
 * page with no route serves "/" (mirrors cms_reconciler.cms_page_route). */
function cmsPageRoute(page: CmsPageMapEntry): string | null {
  const normalized = normalizeRoute(page.route);
  if (normalized) return normalized;
  return page.isHomePage ? "/" : null;
}

export function computePlanDrift(input: {
  nodes: readonly PlanNodeRow[];
  /** All pages on the paired CMS site; null = unpaired (or not loaded). */
  cmsPages: readonly CmsPageMapEntry[] | null;
  pagesByNodeId: ReadonlyMap<string, CmsPageMapEntry>;
  /** The crawl reconciler's report; null = not loaded yet. */
  reality: RealityReport | null;
}): PlanDriftModel {
  const { nodes, cmsPages, pagesByNodeId, reality } = input;
  const isPaired = cmsPages !== null;
  if (!isPaired && !reality) return EMPTY_MODEL;

  const unreadable: string[] = [];
  const items: DriftItem[] = [];

  // The crawl's verdict: which nodes it actually saw live, and which live
  // URLs it saw that the plan has no node for.
  const crawlMatchedNodeIds = new Set<string>();
  for (const match of reality?.matched ?? []) {
    crawlMatchedNodeIds.add(match.node_id);
  }
  const crawlOrphans = reality?.orphans ?? [];
  // Crawl evidence exists only once the reconciler has SEEN something on the
  // real site. Zero matches AND zero orphans means "never crawled", and we
  // refuse to convert that silence into "your pages are not live".
  const hasCrawlData =
    crawlMatchedNodeIds.size > 0 || crawlOrphans.length > 0;

  // ── ghosts + conflicts (per plan node) ────────────────────────────────────
  for (const node of nodes) {
    if (node.deleted_at) continue;
    const nodeRoute = normalizeRoute(node.route);
    const page = pagesByNodeId.get(node.id) ?? null;

    if (page) {
      const pageRoute = cmsPageRoute(page);
      if (!pageRoute) {
        unreadable.push(
          `The CMS page linked to “${node.label}” reported no route — it was skipped, not guessed.`,
        );
      } else if (nodeRoute && pageRoute !== nodeRoute) {
        const conflict: ConflictDrift = {
          key: `conflict:${node.id}:${page.pageId}`,
          kind: "conflict",
          severity: "high",
          title: node.label,
          verdict: `The plan says ${nodeRoute}; the site serves ${pageRoute}.`,
          nodeId: node.id,
          nodeLabel: node.label,
          nodeRoute,
          pageId: page.pageId,
          pageRoute,
          liveUrl: page.liveUrl,
          isPublished: page.isPublished,
        };
        items.push(conflict);
        continue; // A diverged pair is a conflict, not also a ghost.
      }
    }

    const reason: GhostReason | null = !page
      ? "not_built"
      : !page.isPublished
        ? "not_published"
        : hasCrawlData && !crawlMatchedNodeIds.has(node.id)
          ? "not_crawled"
          : null;
    if (!reason) continue;

    items.push({
      key: `ghost:${node.id}`,
      kind: "ghost",
      severity: reason === "not_crawled" ? "medium" : "high",
      title: node.label,
      verdict:
        reason === "not_built"
          ? "Planned, but no page exists on the site yet."
          : reason === "not_published"
            ? "The page exists as a draft — it is not published, so nobody can reach it."
            : "Published, but the last crawl did not find it at this URL.",
      reason,
      nodeId: node.id,
      nodeLabel: node.label,
      route: nodeRoute ?? node.route ?? "",
      pageId: page?.pageId ?? null,
      previewUrl: page?.previewUrl ?? null,
      liveUrl: page?.liveUrl ?? null,
    } satisfies GhostDrift);
  }

  // ── orphans (live pages the plan does not know) ───────────────────────────
  // Two independent witnesses, merged by route: the crawler (a real URL out
  // there) and the paired CMS site (a page with no plan node). An orphan
  // backed by a CMS page is one-click adoptable; a purely crawled URL is not
  // — and we say so rather than offering a button that cannot work.
  const orphansByRoute = new Map<string, OrphanDrift>();

  const unlinkedPages = (cmsPages ?? []).filter((page) => !page.planNodeId);
  for (const page of unlinkedPages) {
    const route = cmsPageRoute(page);
    if (!route) {
      unreadable.push(
        `An unlinked CMS page (“${page.title || page.pageId}”) reported no route — it was skipped.`,
      );
      continue;
    }
    orphansByRoute.set(route, {
      key: `orphan:${route}`,
      kind: "orphan",
      severity: "medium",
      title: page.title || route,
      verdict: `Live on the site at ${route}, with no page planned for it.`,
      route,
      url: page.liveUrl ?? page.previewUrl,
      cmsPageId: page.pageId,
      webPageId: null,
      adoptable: true,
    });
  }

  for (const record of crawlOrphans) {
    const route = normalizeRoute(record.path || record.url || null);
    if (!route) {
      unreadable.push(
        "A crawled page came back with no path or URL — it was skipped.",
      );
      continue;
    }
    const existing = orphansByRoute.get(route);
    if (existing) {
      // Same address, two witnesses — keep the adoptable CMS identity and
      // upgrade the door to the real crawled URL.
      existing.url = record.url || existing.url;
      existing.webPageId = record.page_id || null;
      continue;
    }
    orphansByRoute.set(route, {
      key: `orphan:${route}`,
      kind: "orphan",
      severity: "medium",
      title: route,
      verdict: `Crawled live at ${route}, with no page planned for it.`,
      route,
      url: record.url || null,
      cmsPageId: null,
      webPageId: record.page_id || null,
      adoptable: false,
    });
  }
  items.push(...orphansByRoute.values());

  items.sort((a, b) => {
    const bySeverity = SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity];
    if (bySeverity !== 0) return bySeverity;
    return a.title.localeCompare(b.title);
  });

  const byNodeId = new Map<string, GhostDrift | ConflictDrift>();
  for (const item of items) {
    if (item.kind === "orphan") continue;
    byNodeId.set(item.nodeId, item);
  }

  return {
    items,
    byNodeId,
    counts: {
      total: items.length,
      ghosts: items.filter((item) => item.kind === "ghost").length,
      orphans: orphansByRoute.size,
      conflicts: items.filter((item) => item.kind === "conflict").length,
    },
    hasCrawlData,
    isPaired,
    unreadable,
  };
}

// ── shared presentation vocabulary (one wording, every surface) ─────────────

export interface DriftBadgeMeta {
  /** 1-2 words for a dense row badge. */
  label: string;
  /** Full sentence for the tooltip / aria-label. */
  title: string;
  tone: "danger" | "warning" | "info";
}

export function driftBadgeMeta(item: GhostDrift | ConflictDrift): DriftBadgeMeta {
  if (item.kind === "conflict") {
    return {
      label: "route conflict",
      title: `Route conflict — ${item.verdict}`,
      tone: "danger",
    };
  }
  if (item.reason === "not_built") {
    return { label: "not built", title: item.verdict, tone: "danger" };
  }
  if (item.reason === "not_published") {
    return { label: "draft only", title: item.verdict, tone: "warning" };
  }
  return { label: "not crawled", title: item.verdict, tone: "info" };
}

/** Table column value — a finite, filterable set (MatrxDataTable needs real
 * options with counts). "In sync" is the good state, never an empty cell. */
export type DriftCell =
  | "Route conflict"
  | "Not built"
  | "Draft only"
  | "Not crawled"
  | "In sync";

export const DRIFT_CELL_VALUES: readonly DriftCell[] = [
  "Route conflict",
  "Not built",
  "Draft only",
  "Not crawled",
  "In sync",
];

export function driftCell(item: GhostDrift | ConflictDrift | undefined): DriftCell {
  if (!item) return "In sync";
  if (item.kind === "conflict") return "Route conflict";
  if (item.reason === "not_built") return "Not built";
  if (item.reason === "not_published") return "Draft only";
  return "Not crawled";
}
