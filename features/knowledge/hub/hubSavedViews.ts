/**
 * features/knowledge/hub/hubSavedViews.ts — hub saved views (KNOWLEDGE-HUB §4,
 * §8 H5), the pure half: the platform-owned presets, the live-count read, and
 * "has this view been changed since it was saved?".
 *
 * Champion: Linear custom views — save any filtered list, share it with the
 * team, pin it to the sidebar with a live count, and "Save changes" when the
 * filters drift from what was saved.
 *
 * Storage is `platform.saved_view` through the one saved-views service
 * (`components/official/table-saved-views-service.ts`); no second store.
 */

import {
  KNOWLEDGE_SECTION_KEYS,
  type KnowledgeQuery,
  type KnowledgeSearchEngine,
  type KnowledgeSearchRunner,
} from "@/features/knowledge/api/knowledgeSearch";
import {
  hubStateToParams,
  normalizeQuery,
  type HubLayout,
  type HubSavedViewDefinition,
  type HubState,
} from "@/features/knowledge/hub/hubState";

export const HUB_SAVED_VIEW_SURFACE = "knowledge/hub";

/** `within` id meaning "any container of this type" (`library:*`, §6). */
export const WITHIN_ANY = "*";

// ─── Presets (§6: each specialized page becomes a preset view) ──────────────

export interface HubPreset {
  key: string;
  name: string;
  query: KnowledgeQuery;
  layout: HubLayout;
}

/**
 * Shipped as SHARED, platform-owned rows (the system organization, visibility
 * `internal`, globally readable), seeded by the app when missing. The page
 * each replaces stays until its parity checklist passes (§6).
 */
export const HUB_PRESETS: readonly HubPreset[] = [
  { key: "everything", name: "Everything", query: { mode: "find" }, layout: "list" },
  { key: "transcripts", name: "Transcripts", query: { mode: "find", source_kinds: ["transcript"] }, layout: "list" },
  {
    key: "research_sources",
    name: "Research sources",
    query: { mode: "find", types: ["processed_document"], origin: ["research"] },
    layout: "list",
  },
  {
    key: "libraries",
    name: "Libraries",
    query: { mode: "find", within: [{ type: "media_source_library", id: WITHIN_ANY }] },
    layout: "list",
  },
  {
    key: "crawled_pages",
    name: "Crawled pages",
    query: { mode: "find", types: ["processed_document"], origin: ["crawl"] },
    layout: "list",
  },
  { key: "files", name: "Files", query: { mode: "find", types: ["file"] }, layout: "list" },
];

export function presetDefinition(p: HubPreset): HubSavedViewDefinition {
  return { query: normalizeQuery(p.query), layout: p.layout, preset: p.key };
}

/**
 * Container types a query asks for as "any of this type". The search service
 * cannot filter that way yet (its items lane reads only concrete container
 * ids), so a surface must say so instead of showing unfiltered results.
 */
export function anyContainerTypes(query: KnowledgeQuery): string[] {
  return (query.within ?? []).filter((r) => r.id === WITHIN_ANY).map((r) => r.type);
}

/**
 * `type:*` → every container of that type the person can see (the service
 * takes a list of container ids). `pending` until that list has loaded;
 * `empty` when the person has none (nothing can match — never "everything").
 */
export function expandAnyContainers(
  query: KnowledgeQuery,
  idsByType: Record<string, string[] | undefined>,
): { status: "ready" | "pending" | "empty"; query: KnowledgeQuery } {
  const any = anyContainerTypes(query);
  if (!any.length) return { status: "ready", query };
  const within: NonNullable<KnowledgeQuery["within"]> = [];
  for (const r of query.within ?? []) {
    if (r.id !== WITHIN_ANY) {
      within.push(r);
      continue;
    }
    const ids = idsByType[r.type];
    if (!ids) return { status: "pending", query };
    for (const id of ids) within.push({ type: r.type, id });
  }
  if (!within.length) return { status: "empty", query };
  return { status: "ready", query: { ...query, within } };
}

/** Which presets are missing from what the caller can read. */
export function missingPresets(installedPresetKeys: Iterable<string>): HubPreset[] {
  const have = new Set(installedPresetKeys);
  return HUB_PRESETS.filter((p) => !have.has(p.key));
}

// ─── Dirty ("Save changes to this view") ────────────────────────────────────

export function viewIsDirty(
  def: HubSavedViewDefinition | null | undefined,
  current: { query: KnowledgeQuery; layout: HubLayout },
): boolean {
  if (!def) return false;
  return (
    JSON.stringify(normalizeQuery(def.query)) !== JSON.stringify(normalizeQuery(current.query)) ||
    def.layout !== current.layout
  );
}

/**
 * The address carries a saved view and nothing else (no filters, default
 * layout) — a view LINK, which should open the view's own filters.
 */
export function isViewLinkOnly(state: HubState): boolean {
  const params = hubStateToParams({ ...state, peek: null });
  return [...params.keys()].every((k) => k === "view" || k === "data");
}

// ─── Live counts ────────────────────────────────────────────────────────────

/**
 * The search service has NO count-only mode (its `limit` must be ≥ 1 and a
 * section's `count` is the size of the page it sent). So a count is the first
 * page: one as-you-type run (rerank skipped) at `COUNT_PAGE` per section,
 * summed across the item sections (Top hit repeats an item; Segments are
 * passages, not items). Past `COUNT_CAP` — or when any section has another
 * page — it shows "99+".
 */
export const COUNT_PAGE = 100;
export const COUNT_CAP = 99;

export type ViewCount =
  | { kind: "count"; count: number; capped: boolean }
  | { kind: "unsupported"; reason: string }
  | { kind: "error"; message: string };

/** The title stand-in honors only `text` and `types`; anything else it would silently ignore. */
export function titleStandInCanFilter(query: KnowledgeQuery): boolean {
  const q = normalizeQuery(query);
  return Object.keys(q).every((k) => k === "mode" || k === "text" || k === "types" || k === "sort");
}

export async function countViewQuery(
  query: KnowledgeQuery,
  runner: KnowledgeSearchRunner,
  signal?: AbortSignal,
): Promise<ViewCount> {
  const any = anyContainerTypes(query);
  if (any.length)
    return {
      kind: "unsupported",
      reason: "You have no libraries you can open yet.",
    };
  try {
    let engine: KnowledgeSearchEngine | null = null;
    const sections = await runner(
      { ...normalizeQuery(query), mode: "find", limit: COUNT_PAGE },
      { signal, asYouType: true, onEngine: (e) => (engine = e) },
    );
    if (engine === "title_stand_in" && !titleStandInCanFilter(query))
      return {
        kind: "unsupported",
        reason:
          "Full Knowledge search is not on the server yet, and the title search standing in for it cannot apply this view's filters — the count arrives with it.",
      };
    let count = 0;
    let more = false;
    let answered = 0;
    for (const s of sections) {
      if (s.key === "top_hit" || s.key === "segments") continue;
      if (!KNOWLEDGE_SECTION_KEYS.includes(s.key)) continue;
      if (s.error || typeof s.count !== "number") continue;
      answered += 1;
      count += s.count;
      if (s.next_cursor || s.count >= COUNT_PAGE) more = true;
    }
    if (answered === 0) {
      const failed = sections.find((s) => s.error)?.error?.message;
      return { kind: "error", message: failed ?? "The search did not answer." };
    }
    return { kind: "count", count: Math.min(count, COUNT_CAP), capped: more || count > COUNT_CAP };
  } catch (err) {
    if (signal?.aborted) throw err;
    return { kind: "error", message: err instanceof Error ? err.message : "The count could not be read." };
  }
}

export function countLabel(c: ViewCount | undefined): string | null {
  if (!c) return null;
  if (c.kind === "count") return c.capped ? `${COUNT_CAP}+` : String(c.count);
  return "—";
}
