/**
 * THE OFFERINGS CATALOG TREE — pure math over the brand's offerings.
 *
 * The brand owns its offerings (brand-offerings cutover D1) and their hierarchy
 * is catalog-only (D3): a parent says "Hard Drive Shredding is part of Data
 * Destruction", never which site sells it. Which site offers it is a separate,
 * explicit fact (D2), carried on each node as `available`.
 *
 * 🚨 The worth math MIRRORS `seo.keyword_value_map` and must keep mirroring it
 * (D9): a keyword placed on an offering starts at the site baseline plus the
 * `worth_points` of the NEAREST offering, self first then upward, that carries
 * this site's own worth ruling; that same ruling's `lead_quality =
 * negative_value` or `offering_match in (not_offered, actively_avoided)` forces
 * Negative. No ruling anywhere on the lineage adds nothing. This file never
 * derives a band or a score — bands come from the resolver. It exists so the
 * screen can say WHICH offering a node takes its worth from.
 *
 * Data: `./data.ts` (`listBrandOfferingCatalog`, `getOfferingStats`).
 */

import { filterAndSortRows } from "@ai-matrx/design-system/data-table/filter-engine";
import type {
  MatrxColumnDef,
  MatrxDataTableHierarchyMove,
  MatrxDataTableQueryState,
} from "@ai-matrx/design-system/data-table/types";
import type { CatalogOffering, OfferingStatRow } from "./data";

/** The two rulings that force every keyword under an offering to Negative. */
export function isNegativeRuling(
  leadQuality: string | null,
  offeringMatch: string | null,
): boolean {
  return (
    leadQuality === "negative_value" ||
    offeringMatch === "not_offered" ||
    offeringMatch === "actively_avoided"
  );
}

export interface BandTally {
  keywords: number;
  clicks: number;
  impressions: number;
  bands: Record<string, number>;
}

export interface CatalogNode {
  offering: CatalogOffering;
  children: CatalogNode[];
  depth: number;
  /** The nearest offering, self first then upward, carrying this site's worth ruling. */
  worthFrom: CatalogOffering | null;
  /** Points a keyword placed here adds to the baseline; null = no ruling on the lineage. */
  effectivePoints: number | null;
  /** The ruling that decides this node forces its keywords to Negative. */
  negative: boolean;
  /** Keywords whose primary placement is exactly this offering. */
  own: BandTally;
  /** This offering plus everything beneath it. */
  subtree: BandTally;
}

export interface CatalogTree {
  roots: CatalogNode[];
  byId: Map<string, CatalogNode>;
  /** Offerings whose parent is not in this brand's live catalog; drawn as roots. */
  orphaned: string[];
}

function emptyTally(): BandTally {
  return { keywords: 0, clicks: 0, impressions: 0, bands: {} };
}

function addTally(target: BandTally, source: BandTally): void {
  target.keywords += source.keywords;
  target.clicks += source.clicks;
  target.impressions += source.impressions;
  for (const [band, count] of Object.entries(source.bands)) {
    target.bands[band] = (target.bands[band] ?? 0) + count;
  }
}

/** (offering × band) rows from `seo.gsc_offering_stats` → one tally per offering. */
export function tallyByOffering(rows: OfferingStatRow[]): Map<string, BandTally> {
  const map = new Map<string, BandTally>();
  for (const row of rows) {
    let tally = map.get(row.offeringId);
    if (!tally) {
      tally = emptyTally();
      map.set(row.offeringId, tally);
    }
    tally.keywords += row.keywords;
    tally.clicks += row.clicks;
    tally.impressions += row.impressions;
    tally.bands[row.valueBand] = (tally.bands[row.valueBand] ?? 0) + row.keywords;
  }
  return map;
}

export function buildCatalogTree(
  offerings: CatalogOffering[],
  stats: Map<string, BandTally>,
): CatalogTree {
  const byId = new Map<string, CatalogNode>();
  for (const offering of offerings) {
    byId.set(offering.id, {
      offering,
      children: [],
      depth: 0,
      worthFrom: null,
      effectivePoints: null,
      negative: false,
      own: stats.get(offering.id) ?? emptyTally(),
      subtree: emptyTally(),
    });
  }

  const roots: CatalogNode[] = [];
  const orphaned: string[] = [];
  for (const node of byId.values()) {
    const parentId = node.offering.parentId;
    if (!parentId) {
      roots.push(node);
      continue;
    }
    const parent = byId.get(parentId);
    if (!parent || parent === node) {
      orphaned.push(node.offering.id);
      roots.push(node);
      continue;
    }
    parent.children.push(node);
  }

  const walk = (node: CatalogNode, ancestors: CatalogNode[], seen: Set<string>): void => {
    if (seen.has(node.offering.id)) return;
    seen.add(node.offering.id);
    node.depth = ancestors.length;
    // Nearest-first: self, then the closest ancestor upward (resolver ORDER BY depth).
    const lineage = [node, ...[...ancestors].reverse()];
    const ruled = lineage.find((entry) => entry.offering.worthPoints !== null) ?? null;
    node.worthFrom = ruled ? ruled.offering : null;
    node.effectivePoints = ruled ? ruled.offering.worthPoints : null;
    node.negative = ruled
      ? isNegativeRuling(ruled.offering.leadQuality, ruled.offering.offeringMatch)
      : false;
    for (const child of node.children) walk(child, [...ancestors, node], seen);
  };
  const seen = new Set<string>();
  for (const root of roots) walk(root, [], seen);

  const roll = (node: CatalogNode, guard: Set<string>): BandTally => {
    const total = emptyTally();
    addTally(total, node.own);
    for (const child of node.children) {
      if (guard.has(child.offering.id)) continue;
      guard.add(child.offering.id);
      addTally(total, roll(child, guard));
    }
    node.subtree = total;
    return total;
  };
  for (const root of roots) roll(root, new Set([root.offering.id]));

  return { roots, byId, orphaned };
}

/** Root → … → node. */
export function lineageOf(tree: CatalogTree, offeringId: string): CatalogOffering[] {
  const chain: CatalogOffering[] = [];
  let current = tree.byId.get(offeringId);
  let guard = 0;
  while (current && guard < 64) {
    chain.unshift(current.offering);
    const parentId: string | null = current.offering.parentId;
    current = parentId ? tree.byId.get(parentId) : undefined;
    guard += 1;
  }
  return chain;
}

/** An offering and everything beneath it: never a valid parent for it. */
export function forbiddenParents(tree: CatalogTree, offeringId: string): Set<string> {
  const out = new Set<string>([offeringId]);
  const node = tree.byId.get(offeringId);
  if (!node) return out;
  const visit = (current: CatalogNode) => {
    for (const child of current.children) {
      if (out.has(child.offering.id)) continue;
      out.add(child.offering.id);
      visit(child);
    }
  };
  visit(node);
  return out;
}

/**
 * A durable link names either the brand offering (`?offering=<id>`) or, from
 * before the cutover, a product/service topic (`?topic=<id>`), whose id is its
 * offering template's id. Both land on the brand's own offering.
 */
export function resolveOfferingLink(
  offerings: CatalogOffering[],
  id: string | null,
): CatalogOffering | null {
  if (!id) return null;
  return (
    offerings.find((offering) => offering.id === id) ??
    offerings.find((offering) => offering.templateId === id) ??
    null
  );
}

// ── Table rows ──────────────────────────────────────────────────────────────

export interface CatalogRow {
  id: string;
  parentId: string | null;
  depth: number;
  name: string;
  description: string;
  kind: "product" | "service";
  available: boolean;
  source: "template" | "changed" | "own";
  sourceLabel: string;
  otherSites: number;
  /** This site's own ruling on exactly this offering; null = none here. */
  worthPoints: number | null;
  /** What keywords placed here actually add. */
  effectivePoints: number | null;
  worthSource: string;
  offeringMatch: string | null;
  leadQuality: string | null;
  negative: boolean;
  keywordsHere: number;
  keywordsBranch: number;
  clicks: number;
  impressions: number;
  bands: Record<string, number>;
  sort: number;
}

export function catalogRows(tree: CatalogTree): CatalogRow[] {
  return [...tree.byId.values()].map((node) => {
    const o = node.offering;
    const source: CatalogRow["source"] = o.templateId
      ? o.changedFromTemplate
        ? "changed"
        : "template"
      : "own";
    return {
      id: o.id,
      parentId: o.parentId,
      depth: node.depth,
      name: o.name,
      description: o.description ?? "",
      kind: o.kind,
      available: o.available,
      source,
      sourceLabel:
        source === "template"
          ? "From a suggestion"
          : source === "changed"
            ? "Changed from a suggestion"
            : "Your own",
      otherSites: o.otherSiteCount,
      worthPoints: o.worthPoints,
      effectivePoints: node.effectivePoints,
      worthSource:
        o.worthPoints !== null
          ? "Set here"
          : node.worthFrom
            ? `From ${node.worthFrom.name}`
            : "No ruling — baseline only",
      offeringMatch: node.worthFrom?.offeringMatch ?? null,
      leadQuality: node.worthFrom?.leadQuality ?? null,
      negative: node.negative,
      keywordsHere: node.own.keywords,
      keywordsBranch: node.subtree.keywords,
      clicks: node.subtree.clicks,
      impressions: node.subtree.impressions,
      bands: node.subtree.bands,
      sort: o.sort,
    };
  });
}

function compareManualOrder(left: CatalogRow, right: CatalogRow): number {
  if (left.sort !== right.sort) return left.sort - right.sort;
  if (left.keywordsBranch !== right.keywordsBranch) {
    return right.keywordsBranch - left.keywordsBranch;
  }
  return left.name.localeCompare(right.name);
}

/** The complete destination sibling order `web.move_site_offering` expects. */
export function destinationSiblingOrder(
  rows: CatalogRow[],
  movedId: string,
  move: MatrxDataTableHierarchyMove,
): string[] {
  const siblings = rows
    .filter((row) => row.parentId === move.parentId && row.id !== movedId)
    .sort(compareManualOrder);
  const beforeIndex = move.beforeId
    ? siblings.findIndex((row) => row.id === move.beforeId)
    : -1;
  // "after" with no successor means the target was the last sibling — append.
  const insertionIndex =
    beforeIndex >= 0 ? beforeIndex : move.position === "after" ? siblings.length : 0;
  const siblingIds = siblings.map((row) => row.id);
  siblingIds.splice(insertionIndex, 0, movedId);
  return siblingIds;
}

/**
 * MatrxDataTable owns every table behavior; this keeps the one thing a flat
 * engine cannot: filtering keeps lineage, and sorting reorders siblings only,
 * so a child never appears to become a root.
 */
export function processCatalogRows(
  rows: CatalogRow[],
  state: MatrxDataTableQueryState,
  columns: MatrxColumnDef<CatalogRow>[],
  collapsed: ReadonlySet<string>,
): CatalogRow[] {
  const matched = filterAndSortRows(
    rows,
    columns,
    state.columnFilters,
    null,
    state.search,
    state.anyOf ? { columnIds: ["name", "kind"], query: state.anyOf } : undefined,
    state.layeredFilters,
    state.searchMatchMode,
    (row) => row.description,
  );
  const filtering =
    state.search.trim().length > 0 ||
    state.anyOf.trim().length > 0 ||
    Object.values(state.columnFilters).some(Boolean) ||
    (state.layeredFilters?.length ?? 0) > 0;
  const byId = new Map(rows.map((row) => [row.id, row]));
  const children = new Map<string | null, CatalogRow[]>();
  for (const row of rows) {
    const parentId = row.parentId && byId.has(row.parentId) ? row.parentId : null;
    children.set(parentId, [...(children.get(parentId) ?? []), row]);
  }

  const keep = new Set(filtering ? matched.map((row) => row.id) : rows.map((row) => row.id));
  if (filtering) {
    for (const row of matched) {
      let parentId = row.parentId;
      let guard = 0;
      while (parentId && guard < 64) {
        keep.add(parentId);
        parentId = byId.get(parentId)?.parentId ?? null;
        guard += 1;
      }
    }
    if (state.search.trim()) {
      const includeDescendants = (id: string, depth: number) => {
        if (depth > 64) return;
        for (const child of children.get(id) ?? []) {
          keep.add(child.id);
          includeDescendants(child.id, depth + 1);
        }
      };
      matched.forEach((row) => includeDescendants(row.id, 0));
    }
  }

  const ordered: CatalogRow[] = [];
  const emitted = new Set<string>();
  const visit = (siblings: CatalogRow[]) => {
    const sorted = state.sort
      ? filterAndSortRows(siblings, columns, {}, state.sort, "")
      : [...siblings].sort(compareManualOrder);
    for (const row of sorted) {
      if (!keep.has(row.id) || emitted.has(row.id)) continue;
      emitted.add(row.id);
      ordered.push(row);
      if (!filtering && collapsed.has(row.id)) continue;
      visit(children.get(row.id) ?? []);
    }
  };
  visit(children.get(null) ?? []);
  return ordered;
}
