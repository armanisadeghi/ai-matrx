/**
 * Swipe file — pure rules: membership edges + posts + ads -> merged items, and
 * the filter / grouping / counting the grid, rail and chips run on. No I/O
 * (`__tests__/swipe.test.ts`).
 */

import { toAdCardModel } from "./ads";
import type {
  AdCardModel,
  PostCardModel,
  SwipeEdge,
  SwipeItem,
  SwipeItemType,
  SwipeCollectionRow,
} from "./types";

export const ALL_SAVED = "all";

/** The note/tags document on a membership edge's `metadata`, read defensively. */
export function parseEdgeMetadata(metadata: unknown): { note: string; tags: string[] } {
  const m = metadata && typeof metadata === "object" && !Array.isArray(metadata) ? (metadata as Record<string, unknown>) : {};
  const note = typeof m.note === "string" ? m.note : "";
  const tags = Array.isArray(m.tags)
    ? [...new Set(m.tags.filter((t): t is string => typeof t === "string").map((t) => t.trim()).filter(Boolean))]
    : [];
  return { note, tags };
}

export function isSwipeItemType(value: string): value is SwipeItemType {
  return value === "social_post" || value === "social_ad";
}

export interface RawEdge {
  id: string;
  source_id: string;
  target_type: string;
  target_id: string;
  metadata: unknown;
  created_at: string;
}

export function toSwipeEdge(raw: RawEdge): SwipeEdge | null {
  if (!isSwipeItemType(raw.target_type)) return null;
  const { note, tags } = parseEdgeMetadata(raw.metadata);
  return {
    edgeId: raw.id,
    collectionId: raw.source_id,
    itemType: raw.target_type,
    itemId: raw.target_id,
    note,
    tags,
    savedAt: raw.created_at,
  };
}

/**
 * One SwipeItem per saved thing, however many collections hold it. An edge whose
 * post/ad row is unreadable is dropped from the grid (the count below says so
 * through `missing`), never shown as an empty card.
 */
export function buildSwipeItems(args: {
  edges: readonly SwipeEdge[];
  posts: ReadonlyMap<string, PostCardModel>;
  ads: ReadonlyMap<string, AdCardModel>;
}): { items: SwipeItem[]; missing: number } {
  const byKey = new Map<string, SwipeItem>();
  let missing = 0;
  for (const edge of args.edges) {
    const key = `${edge.itemType}:${edge.itemId}`;
    const existing = byKey.get(key);
    if (existing) {
      existing.edges.push(edge);
      continue;
    }
    if (edge.itemType === "social_post") {
      const post = args.posts.get(edge.itemId);
      if (!post) {
        missing += 1;
        continue;
      }
      byKey.set(key, {
        key, itemType: "social_post", itemId: edge.itemId, platform: post.platform, format: post.format,
        title: post.hookLine, post, ad: null, edges: [edge],
      });
    } else {
      const ad = args.ads.get(edge.itemId);
      if (!ad) {
        missing += 1;
        continue;
      }
      byKey.set(key, {
        key, itemType: "social_ad", itemId: edge.itemId, platform: ad.library, format: ad.format,
        title: ad.headline || ad.body.split(/\r?\n/)[0] || ad.advertiser, post: null, ad, edges: [edge],
      });
    }
  }
  return { items: [...byKey.values()], missing };
}

/** The edges that count for a scope: one collection's, or all of them. */
export function edgesInScope(item: SwipeItem, scope: string): SwipeEdge[] {
  return scope === ALL_SAVED ? item.edges : item.edges.filter((e) => e.collectionId === scope);
}

export function itemTags(item: SwipeItem, scope: string): string[] {
  return [...new Set(edgesInScope(item, scope).flatMap((e) => e.tags))].sort((a, b) => a.localeCompare(b));
}

export function itemNote(item: SwipeItem, scope: string): string {
  return edgesInScope(item, scope).find((e) => e.note.trim())?.note ?? "";
}

/** Newest save in scope — the "date saved". */
export function itemSavedAt(item: SwipeItem, scope: string): string | null {
  const times = edgesInScope(item, scope).map((e) => Date.parse(e.savedAt)).filter(Number.isFinite);
  return times.length ? new Date(Math.max(...times)).toISOString() : null;
}

export type SwipeTypeFilter = "all" | "posts" | "ads";
export type SwipeDateRange = "any" | "7d" | "30d" | "90d";

export interface SwipeFilters {
  scope: string;
  search: string;
  type: SwipeTypeFilter;
  platform: string;
  format: string;
  tag: string;
  saved: SwipeDateRange;
}

export const DEFAULT_SWIPE_FILTERS: SwipeFilters = {
  scope: ALL_SAVED, search: "", type: "all", platform: "all", format: "all", tag: "all", saved: "any",
};

const RANGE_DAYS: Record<Exclude<SwipeDateRange, "any">, number> = { "7d": 7, "30d": 30, "90d": 90 };

export function filterSwipeItems(items: readonly SwipeItem[], f: SwipeFilters, now = Date.now()): SwipeItem[] {
  const q = f.search.trim().toLowerCase();
  const cutoff = f.saved === "any" ? null : now - RANGE_DAYS[f.saved] * 86_400_000;
  const out = items.filter((item) => {
    if (f.scope !== ALL_SAVED && !item.edges.some((e) => e.collectionId === f.scope)) return false;
    if (f.type === "posts" && item.itemType !== "social_post") return false;
    if (f.type === "ads" && item.itemType !== "social_ad") return false;
    if (f.platform !== "all" && item.platform !== f.platform) return false;
    if (f.format !== "all" && item.format !== f.format) return false;
    const tags = itemTags(item, f.scope);
    if (f.tag !== "all" && !tags.includes(f.tag)) return false;
    if (cutoff !== null) {
      const saved = itemSavedAt(item, f.scope);
      if (!saved || Date.parse(saved) < cutoff) return false;
    }
    if (q) {
      const hay = [
        item.title, item.post?.handle ?? "", item.ad?.advertiser ?? "", item.ad?.body ?? "",
        itemNote(item, f.scope), ...tags,
      ].join(" ").toLowerCase();
      if (!hay.includes(q)) return false;
    }
    return true;
  });
  // Newest save first; ties keep a stable order by key.
  return out.sort((a, b) => {
    const diff = (Date.parse(itemSavedAt(b, f.scope) ?? "") || 0) - (Date.parse(itemSavedAt(a, f.scope) ?? "") || 0);
    return diff !== 0 ? diff : a.key.localeCompare(b.key);
  });
}

/** Items per collection (the rail's counts) plus `all`. */
export function collectionCounts(items: readonly SwipeItem[]): Map<string, number> {
  const counts = new Map<string, number>();
  counts.set(ALL_SAVED, items.length);
  for (const item of items) {
    for (const id of new Set(item.edges.map((e) => e.collectionId))) counts.set(id, (counts.get(id) ?? 0) + 1);
  }
  return counts;
}

export interface FacetCount {
  value: string;
  count: number;
}

function facet(values: readonly string[]): FacetCount[] {
  const counts = new Map<string, number>();
  for (const v of values) if (v) counts.set(v, (counts.get(v) ?? 0) + 1);
  return [...counts].map(([value, count]) => ({ value, count })).sort((a, b) => b.count - a.count || a.value.localeCompare(b.value));
}

/** Filter-option facets over the items already scoped to a collection. */
export function swipeFacets(items: readonly SwipeItem[], scope: string): {
  platforms: FacetCount[]; formats: FacetCount[]; tags: FacetCount[];
} {
  const scoped = scope === ALL_SAVED ? items : items.filter((i) => i.edges.some((e) => e.collectionId === scope));
  return {
    platforms: facet(scoped.map((i) => i.platform)),
    formats: facet(scoped.map((i) => i.format)),
    tags: facet(scoped.flatMap((i) => itemTags(i, scope))),
  };
}

/** Archive vs live: the archived-items law — archived collections show only when asked. */
export function visibleCollections(rows: readonly SwipeCollectionRow[], showArchived: boolean): SwipeCollectionRow[] {
  return rows.filter((r) => (r.deleted_at === null) !== showArchived);
}

export type SwipeBrandScope = "brand" | "all";

/**
 * Which collections the Swipe tab lists. Collections belong to the organization
 * and optionally serve one brand (`brand_id`): "brand" shows only the ones linked
 * to this brand, "all" shows every collection (including unlinked ones). A brand
 * with no linked collection is told how many others exist, never shown theirs.
 */
export function collectionsForBrandScope(
  rows: readonly SwipeCollectionRow[],
  brandId: string,
  scope: SwipeBrandScope,
): SwipeCollectionRow[] {
  return scope === "all" ? [...rows] : rows.filter((r) => r.brand_id === brandId);
}

/** Collections that are live but not linked to this brand (unlinked or another brand's). */
export function otherCollectionCount(rows: readonly SwipeCollectionRow[], brandId: string): number {
  return rows.filter((r) => r.deleted_at === null && r.brand_id !== brandId).length;
}

/** Build the ad map the swipe builder wants out of raw rows. */
export function adMapOf(rows: readonly Parameters<typeof toAdCardModel>[0][]): Map<string, AdCardModel> {
  return new Map(rows.map((r) => [r.id, toAdCardModel(r)]));
}

/** Tags typed as "a, b  c" -> clean unique list (commas/newlines separate; `#` stripped). */
export function parseTagInput(text: string): string[] {
  return [...new Set(text.split(/[,\n]/).map((t) => t.trim().replace(/^#+/, "").trim()).filter(Boolean))].map((t) => t.slice(0, 40));
}

/** The collection a save from a brand's page lands in when nobody picked one: never another brand's. */
export const NEW_COLLECTION_CHOICE = "__new__";

/** "<Brand> swipe file": the default collection created on a brand's first save. */
export function defaultSwipeCollectionName(brandName: string | null | undefined): string {
  const name = (brandName ?? "").trim();
  return name ? `${name} swipe file` : "Swipe file";
}

/**
 * What a save dialog preselects. An explicit scope (a collection the person is looking at) wins when it is
 * live; otherwise the brand's own first collection; otherwise "new", which the dialog names after the brand.
 * The organization's other collections (another brand's, unlinked) are never a silent default.
 */
export function defaultCollectionChoice(
  rows: readonly SwipeCollectionRow[],
  brandId: string,
  preferredId: string | null,
): string {
  const live = visibleCollections(rows, false);
  if (preferredId && live.some((c) => c.id === preferredId)) return preferredId;
  return live.find((c) => c.brand_id === brandId)?.id ?? NEW_COLLECTION_CHOICE;
}

/** The collections a save dialog offers: the brand's, plus the one already in view if it belongs elsewhere. */
export function saveCollectionOptions(
  rows: readonly SwipeCollectionRow[],
  brandId: string,
  preferredId: string | null,
): SwipeCollectionRow[] {
  return visibleCollections(rows, false).filter((c) => c.brand_id === brandId || c.id === preferredId);
}
