/**
 * conversation-history — reusable multi-agent conversation history slice.
 *
 * This is a `scope`-keyed slice: any UI surface (the /code workspace, a
 * future document editor, a project dashboard, etc.) registers a `scopeId`
 * and gets an independent conversation list — filtered by a set of
 * `agentIds`, paginated, and groupable by date or agent.
 *
 * It sits alongside `conversation-list` rather than replacing it: that slice
 * owns per-agent RPC caches (used by the Runner) and the global user list;
 * this one owns scope-specific views that span multiple agents at once.
 */

import type { ConversationListItem } from "@/features/agents/redux/conversation-list/conversation-list.types";

/**
 * How the sidebar is grouped in a given scope. Mirrors
 * `ConversationHistoryGrouping` in userPreferencesSlice — we redeclare here
 * so the slice has no dep on preferences (consumers pass a default in).
 */
export type HistoryGrouping = "date" | "agent";

/**
 * Lifecycle of the network fetch for a given scope.
 * `idle` → `loading` → `succeeded` | `failed`. `loading-more` keeps existing
 * items visible while the next page is fetched.
 */
export type HistoryStatus =
  | "idle"
  | "loading"
  | "loading-more"
  | "succeeded"
  | "failed";

/**
 * Per-scope state. A scope is a string identifier chosen by the consumer
 * (e.g. `"code-workspace"`). Multiple sidebars with the same scopeId share
 * the same cache — handy for the same history sidebar mounted in a route
 * and a floating window simultaneously.
 */
export interface ConversationHistoryScopeState {
  /** Agent ids whose conversations should appear in this scope. Empty = all. */
  agentIds: string[];
  /**
   * `cx_conversation.source_feature` values to hide from this scope.
   * Empty = no filtering. Used by `/chat` to hide voice-agent transcripts
   * (`source_feature='voice-agent'`) from the text-chat history — they
   * render incorrectly in the chat conversation view and live on a future
   * dedicated voice-history surface.
   *
   * NOTE: this is the legacy DENY-list. The newer ALLOW-list below
   * (`includeSourceFeatures` / `includeSourceApps`) is the canonical filter
   * for "show only my surface's conversations". The two AND together when
   * both are present; most surfaces use exactly one.
   */
  excludeSourceFeatures: string[];
  /**
   * `cx_conversation.source_feature` ALLOW-list. When non-empty, only rows
   * whose `source_feature` is in this set are shown (OR-combined with the
   * app/empty allow-lists below). Empty = no feature allow-list.
   */
  includeSourceFeatures: string[];
  /**
   * `cx_conversation.source_app` ALLOW-list. Whole-app selections from the
   * filter tree land here. Empty = no app allow-list.
   */
  includeSourceApps: string[];
  /**
   * When true, conversations with an empty/null `source_feature` are
   * included (the "Generic / system" tree node). Independent of the
   * allow-lists above.
   */
  includeEmptySource: boolean;
  /**
   * `origin_class` ALLOW-list (server-derived trust axis: human, client_auto,
   * api, child_agent, workflow, scheduled, system, unknown). Empty = no
   * origin filter. ANDs with the source allow-lists above.
   */
  includeOriginClasses: string[];
  /**
   * Identity of the surface default this scope's source filter was seeded
   * from (`seedScopeSourceFilter`). A scope is seeded ONCE per default value:
   * on remount the host re-seeds with the same key and it no-ops, so a user's
   * filter-tree selection survives the panel closing and reopening. It re-seeds
   * only when the surface default itself changes (a preferences edit).
   */
  seededSourceKey: string | null;
  /** Typed-in filter (client-side filter over fetched items). */
  searchTerm: string;
  /** Active grouping. */
  grouping: HistoryGrouping;
  /** Page size for range-based pagination. */
  pageSize: number;
  /** How many items we've fetched so far (the next `range` offset). */
  offset: number;
  /** Items in display order (already sorted by `updated_at` desc). */
  items: ConversationListItem[];
  /** True while the most recent range returned a full page. */
  hasMore: boolean;
  status: HistoryStatus;
  error: string | null;
  /** Last `Date.now()` at which a fresh fetch completed. */
  lastFetchedAt: number | null;
}

/**
 * A distinct (source_app, source_feature) pairing with the user's
 * conversation count. Returned by `get_cx_conversation_source_facets` and
 * used to populate the filter tree with real values + counts. `null`
 * app/feature represent empty/uncategorized rows.
 */
export interface SourceFacet {
  sourceApp: string | null;
  sourceFeature: string | null;
  count: number;
}

export type SourceFacetsStatus = "idle" | "loading" | "succeeded" | "failed";

/**
 * Slice root state: scopeId → state. Using a plain record (not entity
 * adapter) keeps the shape simple — scope counts will stay small.
 *
 * `sourceFacets` is a single user-wide cache (not per-scope) of every
 * (source_app, source_feature) pairing the user has, with counts — it
 * powers the filter tree across all surfaces.
 */
export interface ConversationHistoryState {
  scopes: Record<string, ConversationHistoryScopeState>;
  sourceFacets: SourceFacet[];
  sourceFacetsStatus: SourceFacetsStatus;
  sourceFacetsError: string | null;
  sourceFacetsLastFetchedAt: number | null;
}

/** Default state shape for a new scope. */
export const defaultScopeState: ConversationHistoryScopeState = {
  agentIds: [],
  excludeSourceFeatures: [],
  includeSourceFeatures: [],
  includeSourceApps: [],
  includeEmptySource: false,
  includeOriginClasses: [],
  seededSourceKey: null,
  searchTerm: "",
  grouping: "date",
  pageSize: 30,
  offset: 0,
  items: [],
  hasMore: false,
  status: "idle",
  error: null,
  lastFetchedAt: null,
};

/** Fetched rows are considered stale after this window. */
export const CONVERSATION_HISTORY_TTL_MS = 60_000;

/** Source facets are cached longer — they change slowly. */
export const SOURCE_FACETS_TTL_MS = 5 * 60_000;
