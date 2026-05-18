/**
 * messages slice — DB-faithful storage of conversation messages.
 *
 * One canonical shape: `MessageRecord`, a 1:1 mirror of `cx_message.Row` plus
 * two client-only fields (`_clientStatus`, `_streamRequestId`). Records are
 * keyed in `byId` by the server-assigned `cx_message.id`; `orderedIds` is
 * the ordered spine of the transcript, sorted by `position`.
 *
 * Write paths:
 *   1. Hydration — `loadConversation` → `hydrateMessages`.
 *   2. Live stream — optimistic user submit via `addOptimisticUserMessage`
 *      (client-generated id) → `record_reserved cx_message` renames it to
 *      the server id via `promoteMessageId`. The assistant reservation is
 *      created fresh by `reserveMessage`. Content arrives via
 *      `updateMessageRecord` as the stream produces it and settles at
 *      completion.
 *   3. Edit / fork — CRUD thunks patch `byId` via `updateMessageRecord`
 *      and mirror DB state on success.
 *
 * There is no separate display shape and no legacy `turns[]` array. Any
 * component that needs a view projection reads `selectConversationMessages`
 * and derives display text from `MessageRecord.content` (which is the
 * `MessagePart[]` the server stores — the python-generated discriminated
 * union; narrow at the selector boundary via `parseMessageContent`).
 */

import { createSlice, type PayloadAction } from "@reduxjs/toolkit";
import { destroyInstance } from "../conversations/conversations.slice";
import type { Json } from "@/types/database.types";
import type { MessagePart } from "@/types/python-generated/stream-events";
import type { ApiEndpointMode } from "@/features/agents/types/instance.types";

// =============================================================================
// MessageRecord — mirrors `public.cx_message.Row` one-to-one
// =============================================================================

export interface MessageRecord {
  id: string;
  conversationId: string;
  agentId: string | null;
  role: "system" | "user" | "assistant";
  /**
   * Stored as `Json` to match the Supabase row shape verbatim. At runtime this
   * is a `MessagePart[]` — narrow it via `parseMessageContent(record.content)`
   * (or use `extractContentBlocks` from the selectors).
   */
  content: Json;
  contentHistory: Json | null;
  userContent: Json | null;
  position: number;
  source: string;
  /**
   * Server status on cx_message. Observed values: "reserved", "streaming",
   * "active", "edited", "deleted".
   */
  status: string;
  isVisibleToModel: boolean;
  isVisibleToUser: boolean;
  metadata: Json;
  createdAt: string;
  deletedAt: string | null;

  // ── Client-only (never serialized back on CRUD writes) ───────────────────
  /** Client rollup — pending (optimistic), streaming, complete, or error. */
  _clientStatus?: "pending" | "streaming" | "complete" | "error";
  /** While a turn is live, points at `activeRequests.byRequestId[_streamRequestId]`. */
  _streamRequestId?: string;
}

// =============================================================================
// Entry / State
// =============================================================================

export interface MessagesEntry {
  conversationId: string;
  /** Routing hint cached from `createInstance` — informs turn-2+ endpoint selection. */
  apiEndpointMode: ApiEndpointMode;
  /** DB-faithful records keyed by `cx_message.id` (or a client temp id pre-reservation). */
  byId: Record<string, MessageRecord>;
  /** Ordered transcript spine — ids in `position` order. */
  orderedIds: string[];
  /** Server-assigned conversation label. */
  title: string | null;
  description: string | null;
  keywords: string[] | null;

  // ── Pagination cursor for "load older" ───────────────────────────────────
  /**
   * Lowest `position` currently present in `orderedIds`. Used as the
   * `p_before_position` cursor on the next `get_cx_conversation_bundle`
   * call. `null` until the first hydrate completes or when the conversation
   * is empty.
   */
  oldestPosition: number | null;
  /**
   * Server-reported flag from the bundle's `pagination.has_more`. When
   * `false`, the scroll sentinel stops dispatching `loadOlderMessages`.
   */
  hasMoreOlder: boolean;
  /** Re-entry guard for the older-page fetch. */
  isLoadingOlder: boolean;
}

export interface MessagesState {
  byConversationId: Record<string, MessagesEntry>;
}

// =============================================================================
// Slice
// =============================================================================

const initialState: MessagesState = {
  byConversationId: {},
};

function getOrCreate(
  state: MessagesState,
  conversationId: string,
  apiEndpointMode: ApiEndpointMode = "agent",
): MessagesEntry {
  let entry = state.byConversationId[conversationId];
  if (!entry) {
    entry = {
      conversationId,
      apiEndpointMode,
      byId: {},
      orderedIds: [],
      title: null,
      description: null,
      keywords: null,
      oldestPosition: null,
      hasMoreOlder: false,
      isLoadingOlder: false,
    };
    state.byConversationId[conversationId] = entry;
  }
  return entry;
}

const messagesSlice = createSlice({
  name: "messages",
  initialState,
  reducers: {
    /** Initialize (or touch) the entry for a conversation. */
    initInstanceMessages(
      state,
      action: PayloadAction<{
        conversationId: string;
        apiEndpointMode?: ApiEndpointMode;
      }>,
    ) {
      const { conversationId, apiEndpointMode = "agent" } = action.payload;
      const entry = getOrCreate(state, conversationId, apiEndpointMode);
      // If the entry already exists, keep its byId but refresh the mode
      // (callers rely on create-instance being idempotent).
      entry.apiEndpointMode = apiEndpointMode;
    },

    /**
     * Optimistic user submit. Writes a `MessageRecord` to `byId` under the
     * caller-provided `clientTempId` so the UI can render the user's message
     * instantly. When `record_reserved cx_message` lands during the stream,
     * `promoteMessageId` replaces the temp id with the real `cx_message.id`.
     */
    addOptimisticUserMessage(
      state,
      action: PayloadAction<{
        conversationId: string;
        clientTempId: string;
        /** `MessagePart[]` — the same shape `cx_message.content` uses. */
        content: MessagePart[];
        position: number;
        agentId?: string | null;
      }>,
    ) {
      const {
        conversationId,
        clientTempId,
        content,
        position,
        agentId = null,
      } = action.payload;
      const entry = getOrCreate(state, conversationId);
      if (entry.byId[clientTempId]) return; // idempotent
      const now = new Date().toISOString();
      entry.byId[clientTempId] = {
        id: clientTempId,
        conversationId,
        agentId,
        role: "user",
        content: content as unknown as Json,
        contentHistory: null,
        userContent: null,
        position,
        source: "client",
        status: "reserved",
        isVisibleToModel: true,
        isVisibleToUser: true,
        metadata: {} as Json,
        createdAt: now,
        deletedAt: null,
        _clientStatus: "pending",
      };
      entry.orderedIds.push(clientTempId);
    },

    /**
     * Rename a message id. Used to swap a client temp id for the server id
     * once `record_reserved cx_message` lands for a user message. Preserves
     * content + metadata; updates `position` if provided.
     */
    promoteMessageId(
      state,
      action: PayloadAction<{
        conversationId: string;
        oldId: string;
        newId: string;
        position?: number;
      }>,
    ) {
      const { conversationId, oldId, newId, position } = action.payload;
      const entry = state.byConversationId[conversationId];
      if (!entry?.byId[oldId]) return;
      if (oldId === newId) return;
      const record = entry.byId[oldId];
      delete entry.byId[oldId];
      entry.byId[newId] = {
        ...record,
        id: newId,
        ...(typeof position === "number" && { position }),
        status: "active",
        _clientStatus: "complete",
      };
      entry.orderedIds = entry.orderedIds.map((id) =>
        id === oldId ? newId : id,
      );
    },

    /**
     * Reserve a placeholder for a server-assigned message id. Fired on a
     * `record_reserved cx_message` stream event that does NOT already
     * correspond to an optimistic user entry (i.e. the assistant reservation).
     */
    reserveMessage(
      state,
      action: PayloadAction<{
        conversationId: string;
        messageId: string;
        role?: MessageRecord["role"];
        agentId?: string | null;
        position?: number;
        /**
         * The in-flight request that produced this message. When set, the
         * renderer (AgentAssistantMessage → MarkdownStream) keeps reading
         * from `activeRequests.byRequestId[requestId]` for the lifetime of
         * the conversation instance — including AFTER the stream completes —
         * so the end-of-stream content commit on `messages.byId.content`
         * never triggers a render-source swap. Set this whenever the
         * reservation comes from a live stream; leave it undefined for
         * DB-hydrated history (which renders from byId.content).
         */
        requestId?: string;
      }>,
    ) {
      const {
        conversationId,
        messageId,
        role = "assistant",
        agentId = null,
        position = 0,
        requestId,
      } = action.payload;
      const entry = getOrCreate(state, conversationId);
      if (entry.byId[messageId]) return;
      const now = new Date().toISOString();
      entry.byId[messageId] = {
        id: messageId,
        conversationId,
        agentId,
        role,
        content: [] as unknown as Json,
        contentHistory: null,
        userContent: null,
        position,
        source: "",
        status: "reserved",
        isVisibleToModel: true,
        isVisibleToUser: true,
        metadata: {} as Json,
        createdAt: now,
        deletedAt: null,
        _clientStatus: "pending",
        ...(requestId ? { _streamRequestId: requestId } : {}),
      };
      entry.orderedIds.push(messageId);
    },

    /** Patch one or more fields on a MessageRecord by id. */
    updateMessageRecord(
      state,
      action: PayloadAction<{
        conversationId: string;
        messageId: string;
        patch: Partial<MessageRecord>;
      }>,
    ) {
      const { conversationId, messageId, patch } = action.payload;
      const entry = state.byConversationId[conversationId];
      if (!entry?.byId[messageId]) return;
      Object.assign(entry.byId[messageId], patch);
    },

    /**
     * Replace (or seed) the records for a conversation from the DB bundle.
     * Called by `loadConversation` after `get_cx_conversation_bundle`.
     *
     * `pagination` seeds the older-page cursor so the scroll sentinel knows
     * (a) where to resume from and (b) whether older history exists at all.
     */
    hydrateMessages(
      state,
      action: PayloadAction<{
        conversationId: string;
        messages: MessageRecord[];
        pagination?: {
          oldestPosition: number | null;
          hasMoreOlder: boolean;
        };
      }>,
    ) {
      const { conversationId, messages, pagination } = action.payload;
      const entry = getOrCreate(state, conversationId);
      const sorted = [...messages].sort((a, b) => a.position - b.position);
      entry.byId = {};
      entry.orderedIds = [];
      for (const msg of sorted) {
        entry.byId[msg.id] = {
          ...msg,
          _clientStatus: "complete",
        };
        entry.orderedIds.push(msg.id);
      }
      if (pagination) {
        entry.oldestPosition = pagination.oldestPosition;
        entry.hasMoreOlder = pagination.hasMoreOlder;
      } else {
        entry.oldestPosition = sorted[0]?.position ?? null;
        entry.hasMoreOlder = false;
      }
      entry.isLoadingOlder = false;
    },

    /**
     * Prepend an older page of messages to the transcript. **Strictly
     * additive** — existing records in `byId` are never overwritten and
     * existing entries in `orderedIds` keep their references. This is the
     * critical invariant: components subscribed to per-message selectors
     * (`selectMessageById`, `selectMessageContent`, etc.) for already-loaded
     * messages MUST NOT re-render when the user pages older history in.
     *
     * Duplicate IDs in the incoming page are silently dropped so we never
     * clobber a streaming bubble that happens to share an id (defensive —
     * the RPC's `position < cursor` clause makes this unreachable in
     * practice).
     */
    prependMessages(
      state,
      action: PayloadAction<{
        conversationId: string;
        messages: MessageRecord[];
        pagination: {
          oldestPosition: number | null;
          hasMoreOlder: boolean;
        };
      }>,
    ) {
      const { conversationId, messages, pagination } = action.payload;
      const entry = state.byConversationId[conversationId];
      if (!entry) return;

      const sorted = [...messages].sort((a, b) => a.position - b.position);
      const newIds: string[] = [];
      for (const msg of sorted) {
        if (entry.byId[msg.id]) continue; // never overwrite
        entry.byId[msg.id] = {
          ...msg,
          _clientStatus: "complete",
        };
        newIds.push(msg.id);
      }
      if (newIds.length > 0) {
        // Prepend the new IDs in position order. We deliberately rebuild
        // orderedIds in a single assignment so React sees one structural
        // change rather than N. Existing IDs keep their array index relative
        // to one another; only their absolute index shifts, which keyed
        // reconciliation handles without remounting child components.
        const existing = entry.orderedIds.filter((id) => !newIds.includes(id));
        entry.orderedIds = [...newIds, ...existing];
      }
      entry.oldestPosition = pagination.oldestPosition;
      entry.hasMoreOlder = pagination.hasMoreOlder;
      entry.isLoadingOlder = false;
    },

    /** Toggle the older-page re-entry guard. */
    setOlderLoading(
      state,
      action: PayloadAction<{
        conversationId: string;
        loading: boolean;
      }>,
    ) {
      const { conversationId, loading } = action.payload;
      const entry = state.byConversationId[conversationId];
      if (!entry) return;
      entry.isLoadingOlder = loading;
    },

    /** Remove a message from the transcript (e.g. after soft-delete). */
    removeMessage(
      state,
      action: PayloadAction<{
        conversationId: string;
        messageId: string;
      }>,
    ) {
      const { conversationId, messageId } = action.payload;
      const entry = state.byConversationId[conversationId];
      if (!entry) return;
      delete entry.byId[messageId];
      entry.orderedIds = entry.orderedIds.filter((id) => id !== messageId);
    },

    /** Server-provided title/description/keywords for the conversation. */
    setConversationLabel(
      state,
      action: PayloadAction<{
        conversationId: string;
        title: string;
        description: string | null;
        keywords: string[] | null;
      }>,
    ) {
      const { conversationId, title, description, keywords } = action.payload;
      const entry = state.byConversationId[conversationId];
      if (!entry) return;
      entry.title = title;
      entry.description = description;
      entry.keywords = keywords;
    },

    /** Clear the transcript (e.g. auto-clear on a new run). */
    clearMessages(state, action: PayloadAction<string>) {
      const entry = state.byConversationId[action.payload];
      if (!entry) return;
      entry.byId = {};
      entry.orderedIds = [];
      entry.title = null;
      entry.description = null;
      entry.keywords = null;
      entry.oldestPosition = null;
      entry.hasMoreOlder = false;
      entry.isLoadingOlder = false;
    },
  },

  extraReducers: (builder) => {
    builder.addCase(destroyInstance, (state, action) => {
      delete state.byConversationId[action.payload];
    });
  },
});

export const {
  initInstanceMessages,
  addOptimisticUserMessage,
  promoteMessageId,
  reserveMessage,
  updateMessageRecord,
  hydrateMessages,
  prependMessages,
  setOlderLoading,
  removeMessage,
  setConversationLabel,
  clearMessages,
} = messagesSlice.actions;

export default messagesSlice.reducer;
