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
   */
  excludeSourceFeatures: string[];
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
 * Slice root state: scopeId → state. Using a plain record (not entity
 * adapter) keeps the shape simple — scope counts will stay small.
 */
export interface ConversationHistoryState {
  scopes: Record<string, ConversationHistoryScopeState>;
}

/** Default state shape for a new scope. */
export const defaultScopeState: ConversationHistoryScopeState = {
  agentIds: [],
  excludeSourceFeatures: [],
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
