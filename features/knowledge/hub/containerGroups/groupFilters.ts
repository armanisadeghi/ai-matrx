/**
 * features/knowledge/hub/containerGroups/groupFilters.ts — the pure half of
 * the hub's container groups (`/knowledge?view=group:<token>`, KNOWLEDGE-HUB
 * §6, H6b): what each group's `g.*` filters mean, where each row's record page
 * is, and the words-and-chips narrowing the retired list pages did.
 *
 *   data_store           Data stores — every store I can open, with its member
 *                        count; `g.q` narrows by words. Row → the store's
 *                        record page (members, publish, access, edit, delete).
 *   media_source_library Libraries (a whole channel / feed, catalogued) —
 *                        `g.lane` (mine · orgs · shared · public, the list's
 *                        four visibility lanes), `g.adapter` (the Acquisition
 *                        console's deep link), `g.q`; `g.from` + `g.rulebook_id`
 *                        carry the Rulebook handoff. Row → `/libraries/<id>`.
 *   library_catalog      The Matrx Library catalog — `g.type` (data_store ·
 *                        seo_starter_pack · rulebook), `g.all=1` (everything,
 *                        not only what my organization has), `g.q`. Row → the
 *                        item's record page (subscribe / adopt / use on site).
 *
 * No React, no network — the view and the tests call the same functions.
 */

import type { HubGroupToken } from "@/features/knowledge/hub/hubState";

export const HUB_GROUP_LABEL: Record<HubGroupToken, string> = {
  data_store: "Data stores",
  media_source_library: "Libraries",
  library_catalog: "Library catalog",
};

// ─── record pages (what a group row opens) ──────────────────────────────────

export function dataStoreRecordHref(id: string): string {
  return `/knowledge/data-stores?store_id=${encodeURIComponent(id)}`;
}

export function libraryRecordHref(id: string): string {
  return `/libraries/${encodeURIComponent(id)}`;
}

export function catalogRecordHref(id: string, entityType: string): string {
  return `/knowledge/library-catalog?id=${encodeURIComponent(id)}&type=${encodeURIComponent(entityType)}`;
}

/** Where "New data store" goes: the record page with its create form open. */
export const NEW_DATA_STORE_HREF = "/knowledge/data-stores?new=1";

// ─── words ──────────────────────────────────────────────────────────────────

export function groupWords(group: Record<string, string>): string {
  return (group.q ?? "").trim();
}

function has(hay: string | null | undefined, needle: string): boolean {
  return Boolean(hay) && (hay as string).toLowerCase().includes(needle);
}

// ─── Data stores ────────────────────────────────────────────────────────────

export interface DataStoreLike {
  id: string;
  name: string;
  description?: string | null;
  kind?: string | null;
  shortCode?: string | null;
}

export function filterDataStores<T extends DataStoreLike>(stores: T[], group: Record<string, string>): T[] {
  const q = groupWords(group).toLowerCase();
  if (!q) return stores;
  return stores.filter(
    (s) => has(s.name, q) || has(s.description, q) || has(s.kind, q) || has(s.shortCode, q),
  );
}

// ─── Libraries ──────────────────────────────────────────────────────────────

export const LIBRARY_LANES = ["mine", "orgs", "shared", "public"] as const;
export type LibraryLane = (typeof LIBRARY_LANES)[number];

export const LIBRARY_LANE_LABEL: Record<LibraryLane, string> = {
  mine: "Mine",
  orgs: "My organizations",
  shared: "Shared with me",
  public: "Public",
};

/** The server's `visibility` for each lane (the retired list's own mapping). */
export const LIBRARY_LANE_VISIBILITY: Record<LibraryLane, "personal" | "internal" | "link" | "public"> = {
  mine: "personal",
  orgs: "internal",
  shared: "link",
  public: "public",
};

export function libraryLane(group: Record<string, string>): LibraryLane {
  const v = group.lane;
  return (LIBRARY_LANES as readonly string[]).includes(v) ? (v as LibraryLane) : "mine";
}

export function libraryAdapters(group: Record<string, string>): string[] {
  return (group.adapter ?? "")
    .split(",")
    .map((x) => x.trim())
    .filter(Boolean);
}

export const ADAPTER_WORDS: Record<string, string> = {
  youtube: "YouTube",
  podcast_rss: "Podcast",
  blog_feed: "Blog / feed",
  slide_deck: "Slide decks",
  drive_folder: "Google Drive",
  onedrive_drive: "OneDrive",
  outlook_mail: "Outlook mail",
  outlook_calendar: "Outlook calendar",
};

/** One `GET /media/libraries` request (the `listLibraries` query) for the group's filters. */
export interface LibraryListRequest {
  visibility: ("personal" | "internal" | "link" | "public")[];
  adapter?: string[];
  q?: string;
  limit: number;
  offset: number;
}

/**
 * The group's filters on the wire — lane → `visibility`, adapter, words — so
 * the Acquisition console's deep link narrows what the server returns, never
 * only what the screen shows (D343).
 */
export function libraryListRequest(
  group: Record<string, string>,
  page: { limit: number; offset: number },
  lane: LibraryLane = libraryLane(group),
): LibraryListRequest {
  const adapters = libraryAdapters(group);
  const q = groupWords(group);
  return {
    visibility: [LIBRARY_LANE_VISIBILITY[lane]],
    ...(adapters.length ? { adapter: adapters } : {}),
    ...(q ? { q } : {}),
    limit: page.limit,
    offset: page.offset,
  };
}

/**
 * One count request per lane: only the lane changes, the words and adapter
 * ride along, so a lane's number is what that lane would list (D10 — never a
 * total derived from an unfiltered call, never a default 0).
 */
export function laneCountRequests(group: Record<string, string>): { lane: LibraryLane; request: LibraryListRequest }[] {
  return LIBRARY_LANES.map((lane) => ({ lane, request: libraryListRequest(group, { limit: 1, offset: 0 }, lane) }));
}

/** The Rulebook a person came from ("Bring a whole channel"), when the id is real. */
export function rulebookHandoff(group: Record<string, string>): { backHref: string | null } | null {
  if (group.from !== "rulebook") return null;
  const id = group.rulebook_id ?? "";
  const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id);
  return { backHref: uuid ? `/masterwork/${id}/sources` : null };
}

// ─── Library catalog ────────────────────────────────────────────────────────

export const CATALOG_TYPES = ["data_store", "seo_starter_pack", "rulebook"] as const;
export type CatalogType = (typeof CATALOG_TYPES)[number];
export type CatalogTypeFilter = "all" | CatalogType;

export function catalogType(group: Record<string, string>): CatalogTypeFilter {
  const v = group.type;
  return (CATALOG_TYPES as readonly string[]).includes(v) ? (v as CatalogType) : "all";
}

/** Default: only what my organization has (THE OPEN LIBRARY: one click shows everything). */
export function catalogEntitledOnly(group: Record<string, string>): boolean {
  return group.all !== "1";
}

export interface CatalogItemLike {
  entityType: string;
  name: string;
  description: string | null;
  slug: string | null;
  entitledVia: string | null;
  entitledIndustryName: string | null;
}

/** The retired catalog list's own predicate, over the group's filters. */
export function filterCatalog<T extends CatalogItemLike>(
  items: T[],
  group: Record<string, string>,
  typeLabel: (entityType: string) => string,
): T[] {
  const q = groupWords(group).toLowerCase();
  const type = catalogType(group);
  const entitledOnly = catalogEntitledOnly(group);
  return items.filter((it) => {
    if (type !== "all" && it.entityType !== type) return false;
    if (entitledOnly && it.entitledVia == null) return false;
    if (!q) return true;
    return (
      has(it.name, q) ||
      has(it.description, q) ||
      has(it.slug, q) ||
      has(it.entitledIndustryName, q) ||
      has(typeLabel(it.entityType), q)
    );
  });
}

/** `catalog_filters` (the agent write target the catalog page carried) → the group's filters. */
export function catalogFiltersToGroup(
  current: Record<string, string>,
  value: unknown,
): Record<string, string> {
  let raw = value;
  if (typeof raw === "string") {
    try {
      raw = JSON.parse(raw);
    } catch {
      throw new Error(
        'catalog_filters expects an object of filter keys, e.g. {"search_query": "legal", "entitled_only": true} — received a string that is not valid JSON.',
      );
    }
  }
  if (!raw || typeof raw !== "object" || Array.isArray(raw))
    throw new Error(`catalog_filters expects an object of filter keys — received ${Array.isArray(raw) ? "an array" : typeof raw}.`);
  const input = raw as Record<string, unknown>;
  const valid = ["search_query", "entitled_only", "type_filter"];
  const bad = Object.keys(input).filter((k) => !valid.includes(k));
  if (bad.length)
    throw new Error(
      `catalog_filters received unknown key(s): ${bad.join(", ")}. Nothing was changed. Valid keys are: ${valid.join(", ")}. This target only shapes the VIEW — it cannot give the organization a resource, take one away, or change what it is entitled to.`,
    );
  if (!Object.keys(input).length)
    throw new Error(`catalog_filters needs at least one of: ${valid.join(", ")}. An empty object would change nothing.`);
  const next = { ...current };
  if ("search_query" in input) {
    if (typeof input.search_query !== "string")
      throw new Error(`catalog_filters.search_query expects a plain string (pass "" to clear the search) — received ${typeof input.search_query}.`);
    if (input.search_query.trim()) next.q = input.search_query;
    else delete next.q;
  }
  if ("entitled_only" in input) {
    const c = input.entitled_only;
    if (c === true || c === "true") delete next.all;
    else if (c === false || c === "false") next.all = "1";
    else throw new Error(`catalog_filters.entitled_only expects a boolean (true or false) — received ${JSON.stringify(c)}.`);
  }
  if ("type_filter" in input) {
    const c = input.type_filter;
    if (c === "all") delete next.type;
    else if (typeof c === "string" && (CATALOG_TYPES as readonly string[]).includes(c)) next.type = c;
    else
      throw new Error(`catalog_filters.type_filter expects one of: all, ${CATALOG_TYPES.join(", ")} — received ${JSON.stringify(c)}.`);
  }
  return next;
}
