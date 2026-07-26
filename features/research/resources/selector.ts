/**
 * SELECTORS — turning a saved rule into the items it means, right now.
 *
 * A bundle stores rules, not row ids, so "the top 20 pages by authority" keeps
 * meaning that after the next pipeline run instead of freezing yesterday's
 * twenty. This module is the pure evaluator: manifest + selector → items, in
 * order, honouring limits. No I/O, no side effects — so the picker can preview
 * exactly what a run will use.
 *
 * Ordering matters as much as filtering: when a limit truncates, the order
 * decides what survives. `importance` (search-position breadth) and `authority`
 * (AI-judged trust) are DIFFERENT axes and are never conflated — see
 * features/research/FEATURE.md.
 */

import type {
  ResourceItem,
  ResourceKey,
  ResourceManifest,
  ResourceSelector,
  SelectorFilter,
  SelectorLimit,
  SelectorOrder,
} from "./types";
import { itemsOf } from "./manifest";

function flagString(item: ResourceItem, key: string): string | null {
  const v = item.flags[key];
  return typeof v === "string" ? v : null;
}
function flagBool(item: ResourceItem, key: string): boolean | null {
  const v = item.flags[key];
  return typeof v === "boolean" ? v : null;
}

/** Statuses that mean "this row succeeded" across the research tables. */
function isSuccess(item: ResourceItem): boolean {
  return item.status === null || item.status === "success";
}

function matches(item: ResourceItem, filter: SelectorFilter): boolean {
  if (filter.includedOnly && !item.included) return false;
  if (filter.goodScrapeOnly && flagBool(item, "good_scrape") === false) {
    return false;
  }
  if (filter.currentOnly && flagBool(item, "current") === false) return false;
  // `latest` marks the newest page-summary analysis per source; `current` marks
  // the live version of a synthesis/document. A kind has one or the other.
  if (filter.currentOnly && flagBool(item, "latest") === false) return false;
  if (filter.successOnly && !isSuccess(item)) return false;
  if (
    filter.minAuthority !== undefined &&
    (item.authority === null || item.authority < filter.minAuthority)
  ) {
    return false;
  }
  if (filter.tiers && filter.tiers.length > 0) {
    const tier = flagString(item, "tier");
    if (!tier || !filter.tiers.includes(tier)) return false;
  }
  if (filter.keywordIds && filter.keywordIds.length > 0) {
    if (!item.keywordIds.some((id) => filter.keywordIds?.includes(id))) {
      return false;
    }
  }
  if (filter.tagIds && filter.tagIds.length > 0) {
    if (!item.tagIds.some((id) => filter.tagIds?.includes(id))) return false;
  }
  if (filter.hostnames && filter.hostnames.length > 0) {
    const host = flagString(item, "hostname");
    if (!host || !filter.hostnames.includes(host)) return false;
  }
  return true;
}

function compare(order: SelectorOrder) {
  return (a: ResourceItem, b: ResourceItem): number => {
    switch (order) {
      case "authority":
        return (b.authority ?? -1) - (a.authority ?? -1);
      case "rank": {
        const ra = a.bestRank ?? Number.POSITIVE_INFINITY;
        const rb = b.bestRank ?? Number.POSITIVE_INFINITY;
        return ra - rb;
      }
      case "recent": {
        // Real recency: every manifest item carries its row's own timestamp.
        // Ordering that CLAIMS to be chronological must be chronological — an
        // undated row sorts last rather than pretending to be newest.
        const ta = a.createdAt ? Date.parse(a.createdAt) : Number.NEGATIVE_INFINITY;
        const tb = b.createdAt ? Date.parse(b.createdAt) : Number.NEGATIVE_INFINITY;
        if (tb !== ta) return tb - ta;
        return b.chars - a.chars;
      }
      case "importance":
      default:
        return (b.importance ?? -1) - (a.importance ?? -1);
    }
  };
}

export interface SelectionResult {
  kind: ResourceKey;
  items: ResourceItem[];
  /** Counts by why an item was left out. Empty when nothing was dropped. */
  dropped: { filtered: number; overItemLimit: number; overCharLimit: number };
}

/**
 * Evaluate one selector against the manifest.
 *
 * Explicit mode preserves the SAVED order of `ids` — a hand-picked sequence is
 * an authored decision, not something to re-sort.
 */
export function applySelector(
  manifest: ResourceManifest,
  selector: ResourceSelector,
): SelectionResult {
  const all = itemsOf(manifest, selector.kind);
  const dropped = { filtered: 0, overItemLimit: 0, overCharLimit: 0 };

  let pool: ResourceItem[];
  if (selector.mode === "explicit") {
    const wanted = selector.ids ?? [];
    const byId = new Map(all.map((i) => [i.id, i]));
    pool = wanted
      .map((id) => byId.get(id))
      .filter((i): i is ResourceItem => i !== undefined);
  } else {
    const filter = selector.mode === "filtered" ? (selector.filter ?? {}) : {};
    pool = all.filter((item) => {
      const ok = matches(item, filter);
      if (!ok) dropped.filtered += 1;
      return ok;
    });
    pool.sort(compare(selector.order ?? "importance"));
    if (selector.filter?.topN !== undefined && pool.length > selector.filter.topN) {
      dropped.overItemLimit += pool.length - selector.filter.topN;
      pool = pool.slice(0, selector.filter.topN);
    }
  }

  const maxItems = selector.limit?.maxItems;
  if (maxItems !== undefined && pool.length > maxItems) {
    dropped.overItemLimit += pool.length - maxItems;
    pool = pool.slice(0, maxItems);
  }

  const maxChars = selector.limit?.maxChars;
  if (maxChars !== undefined) {
    const kept: ResourceItem[] = [];
    let running = 0;
    for (const item of pool) {
      const cost = effectiveChars(item, selector.limit);
      if (running + cost > maxChars && kept.length > 0) {
        dropped.overCharLimit += pool.length - kept.length;
        break;
      }
      kept.push(item);
      running += cost;
    }
    pool = kept;
  }

  return { kind: selector.kind, items: pool, dropped };
}

/**
 * Characters this item will actually contribute, honouring a per-item cap.
 * ONE helper so the budget meter and the resolver cannot disagree about what a
 * capped page costs.
 */
export function effectiveChars(
  item: ResourceItem,
  limit: SelectorLimit | undefined,
): number {
  const cap = limit?.maxCharsPerItem;
  if (cap === undefined || cap <= 0) return item.chars;
  return Math.min(item.chars, cap);
}

/** Total characters of a selection, honouring a per-item cap. */
export function charsOf(
  items: ResourceItem[],
  limit?: SelectorLimit,
): number {
  return items.reduce((sum, i) => sum + effectiveChars(i, limit), 0);
}

/** Convenience: an "everything of this kind" selector. */
export function selectAll(kind: ResourceKey): ResourceSelector {
  return { kind, mode: "all" };
}

/** Convenience: the current/latest successful artifact of a kind, capped at 1. */
export function selectCurrent(kind: ResourceKey): ResourceSelector {
  return {
    kind,
    mode: "filtered",
    filter: { currentOnly: true, successOnly: true },
    order: "recent",
    limit: { maxItems: 1 },
  };
}
