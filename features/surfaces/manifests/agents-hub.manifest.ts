/**
 * Surface manifest — Agents Hub (`matrx-user/agents`).
 *
 * The user browses their own and shared agents, searches (names/tags or deep
 * prompt search), filters by category / tag / favorites / archived, sorts, and
 * steps into an agent (view / build / run / versions) or creates a new one.
 *
 * WHERE THIS ACTUALLY MOUNTS — read before verifying anything here.
 * `surfaceFromPathname` maps the whole `/agents` prefix to this surface, but
 * the ONLY component that mounts `SurfaceRuntimeProvider` for it is
 * `AgentsGrid` (`features/agents/components/agent-listings/AgentsGrid.tsx`),
 * and `AgentsGrid` renders on **`/agents/classic`** alone. `/agents/all` —
 * where `/agents` redirects an authenticated user — has been the
 * `lib/entity-list` browse shell (`features/agents/browse/AgentBrowsePage`)
 * since that migration, and it mounts NO runtime. So on `/agents/all` the
 * header popover still names this surface (route mapping), while the live
 * values and the write tool come from the mounted stack and are therefore
 * absent. Verified live 2026-08-12. Adopting the emitter on `AgentBrowsePage`
 * is a `surface-authoring` job, not a write-target one; until then, verify on
 * `/agents/classic`.
 *
 * A list surface guarantees a different kind of context than a record
 * surface: no single entity is "open" here. What IS always present is the
 * catalog view state — the filtered agent list, the counts, and every active
 * filter — because the gallery's consumer state always exists with defaults
 * (an empty list is still a list). Values that depend on a transient panel
 * (the sneak-peek modal, a version-ID search match) are honestly optional.
 */

import type {
  SurfaceManifest,
  SurfaceScopePayload,
  SurfaceValue,
  SurfaceValueGroup,
  SurfaceWriteTarget,
} from "@/features/surfaces/types";
import { SORT_OPTIONS } from "@/features/agents/components/agent-listings/core/types";
import { AGENT_NONE_SENTINEL } from "@/features/agents/redux/agent-consumers/slice";
import { mergeBaselineValues, pickBaseline } from "./_baseline.manifest";

export const AGENTS_HUB_SURFACE_NAME = "matrx-user/agents";

const groups: SurfaceValueGroup[] = [
  {
    key: "catalog",
    label: "Catalog",
    sortOrder: 100,
    description:
      "The agents currently visible in the gallery and their ownership split.",
  },
  {
    key: "filters",
    label: "Filters & search",
    sortOrder: 200,
    description:
      "The active search query, filters, sort, and the facet vocabularies available to filter by.",
  },
  {
    key: "focus",
    label: "Focus",
    sortOrder: 300,
    description:
      "Transient focus on one agent — the sneak-peek panel or a version-ID search match.",
  },
];

const surfaceSpecific: SurfaceValue[] = [
  // ── Catalog ───────────────────────────────────────────────────────────
  {
    name: "visible_agents",
    label: "Visible agents",
    description:
      "The agents currently shown in the gallery after all filters and search: one entry per agent with id, name, and category. Empty array when nothing matches or the list is still loading.",
    valueType: "array",
    alwaysAvailable: true,
    typicalCharCount: 4000,
    sortOrder: 300,
    group: "catalog",
  },
  {
    name: "visible_agent_count",
    label: "Visible agent count",
    description:
      "Number of agents in visible_agents — the current filtered result count across the active ownership tab. Zero when nothing matches or the list is still loading.",
    valueType: "number",
    alwaysAvailable: true,
    typicalCharCount: 3,
    sortOrder: 310,
    group: "catalog",
  },
  {
    name: "owned_agent_count",
    label: "My agents count",
    description:
      "Number of the user's OWN agents matching the current filters/search. Zero when none match or the list is still loading.",
    valueType: "number",
    alwaysAvailable: true,
    typicalCharCount: 3,
    sortOrder: 320,
    group: "catalog",
  },
  {
    name: "shared_agent_count",
    label: "Shared agents count",
    description:
      "Number of agents SHARED WITH the user matching the current filters/search. Zero when none match or nothing has been shared.",
    valueType: "number",
    alwaysAvailable: true,
    typicalCharCount: 3,
    sortOrder: 330,
    group: "catalog",
  },
  {
    name: "shared_agents_total",
    label: "Total shared agents",
    description:
      "Total number of agents shared with the user regardless of filters — drives whether the Mine/Shared/All tabs appear at all. Zero when nothing has been shared.",
    valueType: "number",
    alwaysAvailable: true,
    typicalCharCount: 3,
    sortOrder: 340,
    group: "catalog",
  },
  {
    name: "list_loading",
    label: "List loading",
    description:
      "True while the initial agents list fetch is still in flight — every catalog value is empty/zero until this flips false.",
    valueType: "boolean",
    alwaysAvailable: true,
    typicalCharCount: 5,
    sortOrder: 350,
    group: "catalog",
  },

  // ── Filters & search ──────────────────────────────────────────────────
  {
    name: "search_query",
    label: "Search query",
    description:
      "The user's current search text in the gallery search bar. Empty string when not searching.",
    valueType: "string",
    alwaysAvailable: true,
    typicalCharCount: 20,
    sortOrder: 300,
    group: "filters",
  },
  {
    name: "deep_search",
    label: "Deep prompt search",
    description:
      "True when the search also looks INSIDE agent prompts (server-side deep search) rather than names and tags only.",
    valueType: "boolean",
    alwaysAvailable: true,
    typicalCharCount: 5,
    sortOrder: 310,
    group: "filters",
  },
  {
    name: "ownership_tab",
    label: "Ownership tab",
    description:
      '"mine", "shared", "all", or "system" — which ownership slice of the catalog the user is viewing. Defaults to "all"; "system" (built-in agents) is not offered on this gallery today.',
    valueType: "string",
    alwaysAvailable: true,
    typicalCharCount: 6,
    sortOrder: 320,
    group: "filters",
  },
  {
    name: "sort_by",
    label: "Sort order",
    description:
      'Active sort option: "updated-desc" (default), "created-desc", "name-asc", "name-desc", or "category-asc".',
    valueType: "string",
    alwaysAvailable: true,
    typicalCharCount: 12,
    sortOrder: 330,
    group: "filters",
  },
  {
    name: "included_categories",
    label: "Category filter",
    description:
      "Categories the user is filtering to. Empty array when no category filter is active.",
    valueType: "array",
    alwaysAvailable: true,
    typicalCharCount: 60,
    sortOrder: 340,
    group: "filters",
  },
  {
    name: "included_tags",
    label: "Tag filter",
    description:
      "Tags the user is filtering to. Empty array when no tag filter is active.",
    valueType: "array",
    alwaysAvailable: true,
    typicalCharCount: 60,
    sortOrder: 350,
    group: "filters",
  },
  {
    name: "favorites_filter",
    label: "Favorites filter",
    description:
      '"all" (default), "yes" (favorites only), or "no" (non-favorites only).',
    valueType: "string",
    alwaysAvailable: true,
    typicalCharCount: 4,
    sortOrder: 360,
    group: "filters",
  },
  {
    name: "archived_filter",
    label: "Archived filter",
    description:
      '"active" (default — archived hidden), "archived" (archived only), or "both".',
    valueType: "string",
    alwaysAvailable: true,
    typicalCharCount: 8,
    sortOrder: 370,
    group: "filters",
  },
  {
    name: "favorites_first",
    label: "Favorites first",
    description:
      "True when favorite agents are pinned to the top of the list regardless of sort.",
    valueType: "boolean",
    alwaysAvailable: true,
    typicalCharCount: 5,
    sortOrder: 380,
    group: "filters",
  },
  {
    name: "has_active_filters",
    label: "Filters active",
    description:
      "True when any filter or search narrows the list beyond the defaults — a quick signal that visible_agents is a subset of the user's library.",
    valueType: "boolean",
    alwaysAvailable: true,
    typicalCharCount: 5,
    sortOrder: 390,
    group: "filters",
  },
  {
    name: "filters",
    label: "Filter state",
    description:
      "The composite filter state as one object: { ownership_tab, sort_by, search_query, deep_search, included_categories, included_tags, favorites_filter, archived_filter, favorites_first }. Mirrors the individual filter values as one group value (completeness law).",
    valueType: "object",
    alwaysAvailable: true,
    typicalCharCount: 400,
    sortOrder: 400,
    group: "filters",
  },
  {
    name: "available_categories",
    label: "Available categories",
    description:
      "Every category present across the user's loaded agents — the vocabulary the category filter offers. Empty array while the list is loading or when no agent has a category.",
    valueType: "array",
    alwaysAvailable: true,
    typicalCharCount: 200,
    sortOrder: 410,
    group: "filters",
  },
  {
    name: "available_tags",
    label: "Available tags",
    description:
      "Every tag present across the user's loaded agents — the vocabulary the tag filter offers. Empty array while the list is loading or when no agent has tags.",
    valueType: "array",
    alwaysAvailable: true,
    typicalCharCount: 300,
    sortOrder: 420,
    group: "filters",
  },

  // ── Focus ─────────────────────────────────────────────────────────────
  {
    name: "peeked_agent_id",
    label: "Peeked agent ID",
    description:
      "UUID of the agent open in the sneak-peek panel (click-to-preview). Empty when no sneak-peek panel is open — the common case on a list page.",
    valueType: "string",
    alwaysAvailable: false,
    typicalCharCount: 36,
    sortOrder: 300,
    group: "focus",
  },
  {
    name: "peeked_agent_name",
    label: "Peeked agent name",
    description:
      "Name of the agent open in the sneak-peek panel. Empty when no sneak-peek panel is open.",
    valueType: "string",
    alwaysAvailable: false,
    typicalCharCount: 40,
    sortOrder: 310,
    group: "focus",
  },
  {
    name: "version_lookup",
    label: "Version-ID match",
    description:
      "When the search query is a UUID that resolved to an agent VERSION, the match: { version_id, agent_id, agent_name, version_number }. Empty when the query is not a UUID or resolved to nothing.",
    valueType: "object",
    alwaysAvailable: false,
    typicalCharCount: 150,
    sortOrder: 320,
    group: "focus",
  },
];

/**
 * ONE composite target, not nine micro-targets.
 *
 * Every field below is part of a single user thought — "show only my archived
 * research agents, most recent first" is four fields in one breath — and the
 * `filters` read value is already exactly this object, so the evidence loop is
 * read `filters`, write `catalog_filters`. Bundling them buys three things a
 * per-field split cannot:
 *
 *  1. ONE confirm dialog for a multi-field narrowing instead of up to nine.
 *  2. Atomic validation. One bad category rejects the WHOLE call, so a filter
 *     can never half-apply — the state the scout demanded for the arrays, got
 *     for free across every field.
 *  3. Immunity to both write-ordering and stale-closure hazards by
 *     construction: one call, one store read, one dispatch. There is no
 *     replace/append pair here and no second target to race.
 *
 * The trade, stated plainly because the user lives with it: they accept or
 * decline the object whole.
 */
const writeTargets: SurfaceWriteTarget[] = [
  {
    name: "catalog_filters",
    label: "Catalog filters",
    description:
      "Narrows or re-sorts the agent gallery the user is looking at — the same controls behind the Filter panel, the search box, and the ownership tabs. " +
      "Value is an OBJECT containing ONLY the keys you want to change; every key is optional and each one you send REPLACES that filter outright. " +
      'Keys: `search_query` (string; matches agent names and tags, or prompt text too when `deep_search` is on; "" clears it), ' +
      "`deep_search` (boolean; true also searches INSIDE agent prompts, server-side), " +
      '`ownership_tab` ("mine" | "shared" | "all" — which slice of the library; "shared" is rejected when nothing is shared with the user, because the tab is not rendered then), ' +
      "`sort_by` (" +
      SORT_OPTIONS.map((o) => `"${o.value}"`).join(" | ") +
      "), " +
      "`included_categories` and `included_tags` (arrays; the WHOLE set — include everything you want active, pass [] to clear, and an empty set means no filter rather than no results), " +
      '`favorites_filter` ("all" | "yes" | "no"), ' +
      '`archived_filter` ("active" | "archived" | "both"), ' +
      "`favorites_first` (boolean; pins favorites to the top). " +
      "Every category and tag you send must appear in the `available_categories` / `available_tags` you were given (plus " +
      `"${AGENT_NONE_SENTINEL}"` +
      " for the Uncategorized/Untagged chip) — an invented or misspelled one REJECTS the entire call and changes nothing, so no filter half-applies. " +
      "This ONLY changes what is on screen: nothing is saved, and `archived_filter` means SHOW archived agents — it does not archive anything. " +
      "Send all your changes in ONE call; a second call replaces the keys it names, in an order you do not control. " +
      "Note that `visible_agents` and every count go STALE the moment this lands — they describe the list from before your write, so re-read them rather than telling the user what is now on screen.",
    valueType: "object",
    updatesValue: "filters",
    mode: "ui",
    applyPolicy: "ask",
    group: "filters",
    sortOrder: 430,
  },
];

export const agentsHubManifest: SurfaceManifest = {
  surfaceName: AGENTS_HUB_SURFACE_NAME,
  readiness: "verified",
  readinessNote:
    "Values and the catalog_filters write target are live-verified against a real agent run — but ONLY on /agents/classic, the single route that renders AgentsGrid. /agents/all (where /agents redirects) is the lib/entity-list browse shell and mounts no runtime, so it resolves this surface by route while offering neither live values nor the write tool. Adopting the emitter on AgentBrowsePage is open (surface-authoring).",
  label: "Agents Hub",
  urlPattern: "/agents",
  intro: `<surface_intro>
You are on the Agents Hub — the gallery where the user browses, searches, and filters their AI agent library before stepping into one agent (view / build / run / versions) or creating a new one. No single agent is "open" here; the context is the catalog view itself.
Read visible_agents for what the user is currently looking at (already narrowed by every active filter), and the filters group to understand HOW it was narrowed — ownership_tab splits the user's OWN agents from agents SHARED WITH them, and has_active_filters tells you whether the view is a subset of the full library. available_categories / available_tags are the vocabularies the library actually uses.
The focus group is transient: peeked_agent_id/name appear only while a sneak-peek preview panel is open, and version_lookup only when the user searched a raw version UUID. When list_loading is true, every catalog value is empty — say so rather than concluding the user has no agents.
YOU CAN SHAPE THIS VIEW, NOT ACT ON THE AGENTS IN IT. One target is writable — catalog_filters — and it carries every filter, the search box, the ownership tab and the sort as ONE object, so put all your changes in a single call. Finding the agents someone described is the real work here: narrow with included_categories / included_tags (only values from available_categories / available_tags), or search prompt text with search_query + deep_search. Everything that CHANGES an agent — favoriting, archiving, deleting, duplicating, publishing, sharing — is deliberately not writable, so hand the narrowed list back and let the user press the button. archived_filter shows archived agents; it never archives one.
After a filter lands, visible_agents and every count describe the PREVIOUS view — they were captured when this run started. Do not report what is now on screen from that stale snapshot.
</surface_intro>`,
  groups,
  values: mergeBaselineValues(
    pickBaseline("selection", "context"),
    surfaceSpecific,
  ),
  writeTargets,
};

/** One agent entry as emitted in the `visible_agents` surface value. */
export interface AgentsHubVisibleAgent {
  id: string;
  name: string;
  category: string | null;
}

/**
 * Type-safe payload helper — the "a UI cannot lie" enforcement.
 * Required keys ↔ every `alwaysAvailable: true` value above (the gallery's
 * consumer state always exists with defaults, so the emitter writes them
 * unconditionally — an empty list is still a list).
 */
export function createAgentsHubScope(values: {
  // alwaysAvailable: true → required
  visible_agents: AgentsHubVisibleAgent[];
  visible_agent_count: number;
  owned_agent_count: number;
  shared_agent_count: number;
  shared_agents_total: number;
  list_loading: boolean;
  search_query: string;
  deep_search: boolean;
  ownership_tab: "mine" | "shared" | "all" | "system";
  sort_by: string;
  included_categories: string[];
  included_tags: string[];
  favorites_filter: "all" | "yes" | "no";
  archived_filter: "active" | "archived" | "both";
  favorites_first: boolean;
  has_active_filters: boolean;
  filters: Record<string, unknown>;
  available_categories: string[];
  available_tags: string[];
  // alwaysAvailable: false → optional
  peeked_agent_id?: string;
  peeked_agent_name?: string;
  version_lookup?: {
    version_id: string;
    agent_id: string;
    agent_name: string | null;
    version_number: number;
  };
  selection?: string;
  context?: Record<string, unknown>;
}): SurfaceScopePayload {
  return values as SurfaceScopePayload;
}
