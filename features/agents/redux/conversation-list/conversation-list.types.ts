/**
 * Unified list-item shape — superset of `AgentConversationListItem`
 * (agent-scoped RPC) and `CxConversationListItem` (sidebar direct read).
 * Fields that only one of the two sources populates are optional.
 */
export interface ConversationListItem {
  // Identity
  conversationId: string;

  // Core sidebar fields (present in both sources)
  title: string | null;
  updatedAt: string;
  messageCount: number;
  status: string;
  /**
   * User-pinned flag (`cx_conversation.is_favorite`). Present in every
   * conversation source — populated by `get_agent_conversations` RPC,
   * the global `cx_conversation` select, and the per-scope history
   * fetch. Default `false` for legacy/uncached rows.
   */
  isFavorite: boolean;
  /**
   * Per-conversation opt-out for the knowledge-graph auto-ingest worker
   * (`cx_conversation.exclude_from_kg`). Default `false`. Populated by
   * the global sidebar fetch + history-scope fetch; the agent-scoped
   * RPC does NOT yet project this column, so rows that arrived through
   * that path default to `false` until the toggle is flipped.
   */
  excludeFromKg: boolean;

  // Expanded / agent-scoped fields (optional — may be absent on sidebar rows)
  description?: string | null;
  createdAt?: string;
  agentId?: string | null;
  agentVersionNumber?: number;
  initialAgentVersionId?: string | null;
  lastModelId?: string | null;
  sourceApp?: string;
  sourceFeature?: string;
}

export type ConversationListLoadStatus =
  | "idle"
  | "loading"
  | "succeeded"
  | "failed";

/**
 * Per-agent-version cache entry. Replaces
 * `agentConversations.byCacheKey[key].conversations[]` but stores references
 * into the shared entity store instead of duplicating item bodies.
 */
export interface ConversationListAgentCacheEntry {
  status: ConversationListLoadStatus;
  error: string | null;
  fetchedAt: string | null;
  /** Ordered references into `ConversationListState.byConversationId`. */
  conversationIds: string[];
  /** The request identity this cache was populated from. */
  request: {
    agentId: string;
    versionFilter: number | null;
  };
}

export interface ConversationListState {
  // Shared entity store
  byConversationId: Record<string, ConversationListItem>;

  // Global sidebar view (replaces `cxConversations.items` + pagination)
  allConversationIds: string[];
  globalStatus: ConversationListLoadStatus;
  globalError: string | null;
  globalLastFetchedAt: number | null;
  globalHasMore: boolean;

  // Agent-scoped caches (replaces `agentConversations.byCacheKey`)
  agentCaches: Record<string, ConversationListAgentCacheEntry>;

  /**
   * In-flight optimistic operations (rename, delete). Stored as an array
   * (not Set) for serializability — the shared package requires JSON-safe state.
   */
  pendingOperations: string[];
}

// ── Tunables ─────────────────────────────────────────────────────────────────

export const CONVERSATION_LIST_TTL_MS = 5 * 60 * 1000; // 5 minutes
export const CONVERSATION_LIST_PAGE_SIZE = 25;

// ── Cache key helper ─────────────────────────────────────────────────────────

/**
 * Stable key for the per-agent cache inside `conversationList.agentCaches`.
 * The key folds in an optional version filter so "all versions" and
 * "one version" never overwrite each other.
 */
export function conversationListCacheKey(
  agentId: string,
  versionFilter: number | null,
): string {
  if (versionFilter === null) {
    return `${agentId}::all`;
  }
  return `${agentId}::v${versionFilter}`;
}

/** @deprecated Legacy name. Prefer `conversationListCacheKey`. */
export const agentConversationsCacheKey = conversationListCacheKey;
