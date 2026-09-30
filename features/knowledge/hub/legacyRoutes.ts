/**
 * features/knowledge/hub/legacyRoutes.ts — builders for hub addresses that carry
 * an old page's filters over (KNOWLEDGE-HUB §6). NO page is retired into the hub
 * (Arman, 2026-09-29): every page below is live at its own address; these helpers
 * only build the `/knowledge/hub?…` link for the hub's twin view of it.
 *
 *   /knowledge/library  (and /rag/library)   → Sources page; hub twin = the Sources kind view
 *       ?show=saved → + state kept · ?show=all → every capture
 *       ?q= / ?search= → the search words
 *
 * /knowledge/search is the Search Lab — a kept user page by Arman's ruling
 * (2026-09-29: "the single most useful user UI for testing RAG"). `/rag/*` is live.
 * The admin lab (SEARCH_LAB_ADMIN_PATH) is the same component on the admin lane.
 * Only `/knowledge/visualization` (and `/rag/visualization`) still redirects, to
 * `/knowledge/flow` (the animation).
 *
 * H6b — the list pages whose job the hub also does as a container group
 * (`view=group:<token>`, containerGroups/groupFilters.ts):
 *   /knowledge/data-stores (no store_id / new) → group:data_store
 *       ?q= → g.q   (…?store_id=<id> is the store's record page; ?new=1 its create form)
 *   /knowledge/library-catalog (no id / store_id) → group:library_catalog
 *       ?q= → g.q · ?type= → g.type · ?all=1 → g.all
 *       (…?id=<id>&type=<t> is the item's record page)
 *   /libraries → group:media_source_library
 *       ?scope=mine|orgs[:<org>]|shared|public → g.lane · ?q= → g.q
 *       ?filters={"adapter":{"kind":"select","values":[…]}} → g.adapter
 *       ?from=rulebook&rulebook_id= → g.from + g.rulebook_id
 *       (/libraries/<id> is the library's record page)
 *
 * H6d — the Transcripts list (`/transcripts`, live) → view=transcripts (the preset):
 *       ?q= → q · ?scope=mine → by=me · ?scope=orgs:<org> → orgs=<org>
 *       ?scope=shared|public → g.scope · ?sort=title → sort=title (else recent)
 *       ?filters={kind,status,folder_name,visibility,tags: {values:[…]}} → g.kind,
 *       g.status, g.folder, g.visibility, g.tag
 *
 * Pure: the tests and the hub call these.
 */

import { DEFAULT_HUB_STATE, hubHref, type HubGroupToken, type HubState } from "@/features/knowledge/hub/hubState";
import type { KnowledgeQuery } from "@/features/knowledge/api/knowledgeSearch";

export type LegacySearchParams = Record<string, string | string[] | undefined>;

function first(p: LegacySearchParams, key: string): string | undefined {
  const v = p[key];
  const s = Array.isArray(v) ? v[0] : v;
  return typeof s === "string" && s.trim() ? s.trim() : undefined;
}

/** The Sources page's address → the hub's Sources view. */
export function libraryToHubHref(params: LegacySearchParams): string {
  const show = first(params, "show");
  const text = first(params, "q") ?? first(params, "search");
  const query: KnowledgeQuery = {
    mode: "find",
    types: ["processed_document"],
    ...(text ? { text } : {}),
    ...(show === "saved" ? { state: ["kept"] } : {}),
  };
  const state: HubState = {
    ...DEFAULT_HUB_STATE,
    view: { kind: "kind", key: "processed_document" },
    query,
  };
  return hubHref(state);
}

/** The Search Lab — a live user page (Arman, 2026-09-29). */
export const SEARCH_LAB_PATH = "/knowledge/search";
/** The same lab on the admin lane (super-admin inventory/diagnose twins + ACL bypass). */
export const SEARCH_LAB_ADMIN_PATH = "/administration/knowledge/search-lab";

/** The Search Lab with a search carried over: `?q=` and, when one data store is the scope, `?store_id=`. */
export function searchLabHref(query: Pick<KnowledgeQuery, "text" | "within">): string {
  const qs = new URLSearchParams();
  const text = query.text?.trim();
  if (text) qs.set("q", text);
  const stores = (query.within ?? []).flatMap((w) => (w.type === "data_store" && w.id ? [w.id] : []));
  if (stores.length === 1) qs.set("store_id", stores[0]);
  const out = qs.toString();
  return out ? `${SEARCH_LAB_PATH}?${out}` : SEARCH_LAB_PATH;
}

// ─── H6b: list pages → container groups ─────────────────────────────────────

function groupHref(token: HubGroupToken, group: Record<string, string | undefined>): string {
  const clean: Record<string, string> = {};
  for (const [k, v] of Object.entries(group)) if (typeof v === "string" && v.trim()) clean[k] = v.trim();
  return hubHref({ ...DEFAULT_HUB_STATE, view: { kind: "group", token }, group: clean });
}

/** Null = the address is a record page (a store is open, or its create form) and stays. */
export function dataStoresToHubHref(params: LegacySearchParams): string | null {
  if (first(params, "store_id") || first(params, "new")) return null;
  return groupHref("data_store", { q: first(params, "q") ?? first(params, "search") });
}

/** Null = an item is open (its record page) and the address stays. */
export function libraryCatalogToHubHref(params: LegacySearchParams): string | null {
  if (first(params, "id") || first(params, "store_id")) return null;
  const type = first(params, "type");
  return groupHref("library_catalog", {
    q: first(params, "q") ?? first(params, "search"),
    type: type && type !== "all" ? type : undefined,
    all: first(params, "all") === "1" ? "1" : undefined,
  });
}

/** The entity-list `filters` bag's adapter select (the Acquisition console's deep link). */
function adapterFromFilters(raw: string | undefined): string | undefined {
  if (!raw) return undefined;
  try {
    const bag = JSON.parse(raw) as Record<string, { kind?: string; values?: unknown; value?: unknown }>;
    const a = bag?.adapter;
    if (!a) return undefined;
    if (a.kind === "select" && Array.isArray(a.values))
      return a.values.filter((v): v is string => typeof v === "string" && Boolean(v)).join(",") || undefined;
    if (a.kind === "text" && typeof a.value === "string") return a.value || undefined;
  } catch {
    return undefined;
  }
  return undefined;
}

export function librariesToHubHref(params: LegacySearchParams): string {
  const scope = first(params, "scope")?.split(":")[0];
  return groupHref("media_source_library", {
    lane: scope && scope !== "mine" ? scope : undefined,
    q: first(params, "q") ?? first(params, "search"),
    adapter: adapterFromFilters(first(params, "filters")) ?? first(params, "adapter"),
    from: first(params, "from"),
    rulebook_id: first(params, "rulebook_id"),
  });
}

/** The hub's Sources view — every Source, in the hub. (The Sources page itself is live at /knowledge/library.) */
export const HUB_SOURCES_HREF = libraryToHubHref({});

/** The hub's container groups. */
export const HUB_DATA_STORES_HREF = groupHref("data_store", {});
export const HUB_LIBRARIES_HREF = groupHref("media_source_library", {});
export const HUB_LIBRARY_CATALOG_HREF = groupHref("library_catalog", {});

/**
 * A research topic's captured pages in the hub (`within` the topic, origin
 * research). The topic's Sources page stays its record page — triage, the
 * research sorts, authority ranking and export live there (H6b: not retired).
 */
export function researchTopicHubHref(topicId: string): string {
  return hubHref({
    ...DEFAULT_HUB_STATE,
    view: { kind: "container", type: "research_topic", id: topicId },
    query: { mode: "find", within: [{ type: "research_topic", id: topicId }], origin: ["research"] },
  });
}

// ─── H6d: the Transcripts list → the Transcripts preset view ────────────────

/** The entity-list filter keys → the hub's transcript facet keys. */
const TRANSCRIPT_FILTER_TO_FACET: Record<string, string> = {
  kind: "kind",
  status: "status",
  folder_name: "folder",
  visibility: "visibility",
  tags: "tag",
};

function transcriptFacetsFromFilters(raw: string | undefined): Record<string, string> {
  const out: Record<string, string> = {};
  if (!raw) return out;
  try {
    const bag = JSON.parse(raw) as Record<string, { values?: unknown }>;
    if (!bag || typeof bag !== "object" || Array.isArray(bag)) return out;
    for (const [key, facet] of Object.entries(TRANSCRIPT_FILTER_TO_FACET)) {
      const values = bag[key]?.values;
      if (!Array.isArray(values)) continue;
      const clean = values.filter((v): v is string => typeof v === "string" && Boolean(v.trim()));
      if (clean.length) out[facet] = clean.join(",");
    }
  } catch {
    return out;
  }
  return out;
}

/** `/transcripts?…` → `/knowledge/hub?view=transcripts&…`, its search, scope, sort and filters kept. */
export function transcriptsToHubHref(params: LegacySearchParams): string {
  const text = first(params, "q") ?? first(params, "search");
  const [scopeKind, scopeOrg] = (first(params, "scope") ?? "").split(":", 2);
  const sort = first(params, "sort");
  const query: KnowledgeQuery = {
    mode: "find",
    ...(text ? { text } : {}),
    ...(scopeKind === "orgs" && scopeOrg ? { organizations: [scopeOrg] } : {}),
    ...(sort === "title" ? { sort: "title" as const } : {}),
  };
  const group: Record<string, string> = transcriptFacetsFromFilters(first(params, "filters"));
  // The view's Scope facet IS the list's scope (the same `trx_list_scoped` p_scope).
  if (scopeKind === "mine" || scopeKind === "shared" || scopeKind === "public") group.scope = scopeKind;
  return hubHref({ ...DEFAULT_HUB_STATE, view: { kind: "preset", key: "transcripts" }, query, group });
}

/**
 * The reverse: the hub's Transcripts view → the old list (its review address) on the
 * same search, scope, sort and filters — Arman compares the two side by side
 * before the old page is replaced (2026-09-29), so each links to the other.
 */
/** The old list's review-only address (Arman, 2026-09-29) — deleted once he confirms the new view. */
export const OLD_TRANSCRIPTS_PATH = "/compare/old/transcripts";

export function hubToTranscriptsHref(state: Pick<HubState, "query" | "group">): string {
  const qs = new URLSearchParams();
  const text = state.query.text?.trim();
  if (text) qs.set("q", text);
  const scope = state.group.scope?.split(",")[0];
  if (scope === "mine" || scope === "shared" || scope === "public") qs.set("scope", scope);
  else if (state.query.organizations?.length === 1) qs.set("scope", `orgs:${state.query.organizations[0]}`);
  const filters: Record<string, { kind: "select"; values: string[] }> = {};
  for (const [key, facet] of Object.entries(TRANSCRIPT_FILTER_TO_FACET)) {
    const values = state.group[facet]?.split(",").map((v) => v.trim()).filter(Boolean);
    if (values?.length) filters[key] = { kind: "select", values };
  }
  if (Object.keys(filters).length) qs.set("filters", JSON.stringify(filters));
  if (state.query.sort === "title") qs.set("sort", "title");
  const out = qs.toString();
  return out ? `${OLD_TRANSCRIPTS_PATH}?${out}` : OLD_TRANSCRIPTS_PATH;
}

/** The hub's Transcripts view. (The list itself is live at /transcripts.) */
export const HUB_TRANSCRIPTS_HREF = transcriptsToHubHref({});
