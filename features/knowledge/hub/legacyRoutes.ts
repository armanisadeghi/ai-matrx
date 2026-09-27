/**
 * features/knowledge/hub/legacyRoutes.ts — where a retired Knowledge page's
 * address lands in the hub, filters intact (KNOWLEDGE-HUB §6, H6a; Linear:
 * nothing a retired page did is lost, and an old link keeps its filters).
 *
 *   /knowledge/library  (and /rag/library)   → the Sources kind view
 *       ?show=saved → + state kept · ?show=all → every capture
 *       ?q= / ?search= → the search words
 *   /knowledge/search   (and /rag/search)    → the hub's search
 *       ?q= → q · ?store_id= → within that data store
 *       ?tab=agent-sim|agent-chat|diagnostics → the admin Search Lab (those
 *       developer tabs live there now), every param kept
 *   /knowledge/visualization (and /rag/visualization) → /knowledge
 *
 * Pure: the route files call these and `redirect()`; the tests call them too.
 * `/rag/*` itself is a config redirect to `/knowledge/*` (next.config.js).
 */

import { DEFAULT_HUB_STATE, hubHref, type HubState } from "@/features/knowledge/hub/hubState";
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

export const SEARCH_LAB_ADMIN_PATH = "/administration/knowledge/search-lab";
const DEV_TABS = new Set(["agent-sim", "agent-chat", "diagnostics"]);

/** The Search Lab's address → the hub's search, or the admin lab for its developer tabs. */
export function searchLabToHref(params: LegacySearchParams): string {
  const tab = first(params, "tab");
  if (tab && DEV_TABS.has(tab)) {
    const qs = new URLSearchParams();
    for (const [k, v] of Object.entries(params)) {
      const s = Array.isArray(v) ? v[0] : v;
      if (typeof s === "string") qs.set(k, s);
    }
    return `${SEARCH_LAB_ADMIN_PATH}?${qs.toString()}`;
  }
  const text = first(params, "q");
  const store = first(params, "store_id");
  const query: KnowledgeQuery = {
    mode: "find",
    ...(text ? { text } : {}),
    ...(store ? { within: [{ type: "data_store", id: store }] } : {}),
  };
  return hubHref({ ...DEFAULT_HUB_STATE, query });
}

/** Where "Sources" lives now — every Source, in the hub. The link every retired "/knowledge/library" pointer uses. */
export const HUB_SOURCES_HREF = libraryToHubHref({});
