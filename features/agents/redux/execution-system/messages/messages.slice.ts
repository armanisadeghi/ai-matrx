/**
 * messages slice — DB-faithful storage of conversation messages.
 *
 * One canonical shape: `MessageRecord`, a 1:1 mirror of `cx_message.Row` plus
 * client-only status and live stream segment fields. Records are
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
import { createInstanceFull } from "../create-instance-full";
import type { Json } from "@/types/database.types";
import type { MessageRole } from "@/features/agents/types/agent-message-types";
import type { MessagePart } from "@/types/python-generated/stream-events";
import type { ApiEndpointMode } from "@/features/agents/types/instance.types";
import { recordTranscriptEvent, shortId } from "./transcript-journal";

// =============================================================================
// Per-turn structured columns on cx_message (all jsonb, nullable)
//
// These mirror the typed shapes the backend persists alongside the message.
// They are narrow TS views over `Json` columns — the slice stores the parsed
// object verbatim (the bundle mapper copies them through untouched).
// =============================================================================

/** One tool offered to the model that turn (user messages only). */
export interface ToolOnCall {
  id: string | null;
  name: string;
  kind: "registered" | "inline" | "agent";
}

/** One item in the structured context attached that turn. */
export interface ModelContextItem {
  key: string;
  type: string;
  label: string;
  inlined: boolean;
  mutable: boolean;
  slot_matched: boolean;
  size_hint: string;
  value?: unknown;
  source_kind?: string;
}

/**
 * One user-ATTACHED context block for that turn (table, note, workbook,
 * webpage, file). Distinct from `ModelContextItem` (ambient/slot context) —
 * these are the resources the user explicitly attached. All fields optional
 * except `type`; `input_items` itself is null on historical rows.
 */
export interface ModelContextInputItem {
  /** "input_table" | "input_notes" | "input_workbook" | "input_webpage" |
   *  "input_document" | "document" | "image" | "audio" | "video" | ... */
  type: string;
  /** e.g. table name, webpage title (may be absent for notes/workbook/files). */
  label?: string | null;
  /** table_id, or url for a webpage. */
  id?: string;
  /** note_ids / workbook_ids / document_ids. */
  ids?: string[];
  /** for media/document. */
  file_id?: string | null;
  mime_type?: string | null;
  editable?: boolean;
  count?: number;
}

/**
 * The structured context attached to a turn (user messages only). Supersedes
 * the old, never-populated `metadata.context_manifest`.
 */
export interface ModelContext {
  scope: {
    organization_id: string | null;
    project_id: string | null;
    task_id: string | null;
  };
  items: ModelContextItem[];
  /** User-attached context blocks (table/note/workbook/webpage/file) for the
   *  turn. Null on historical rows written before this column existed. */
  input_items?: ModelContextInputItem[] | null;
  agent_block: string | null;
  rendered: string | null;
  total_chars: number;
}

/**
 * Structured error for a turn. PRESENCE means the turn failed — it replaces the
 * legacy `metadata.failed` / `metadata.error` signal.
 */
export interface MessageError {
  type: string;
  message: string;
}

// =============================================================================
// MessageRecord — mirrors `public.cx_message.Row` one-to-one
// =============================================================================

export interface MessageRecord {
  id: string;
  conversationId: string;
  agentId: string | null;
  role: MessageRole;
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

  // ── Per-turn structured columns (jsonb, nullable) ────────────────────────
  /** Tools offered to the model that turn (user messages only). */
  toolsOnCall?: ToolOnCall[] | null;
  /** Structured context attached that turn (user messages only). */
  modelContext?: ModelContext | null;
  /** Structured error — PRESENCE means the turn failed. */
  error?: MessageError | null;
  /** Voice-turn metadata for realtime/voice messages. */
  voice?: Json | null;

  // ── Client-only (never serialized back on CRUD writes) ───────────────────
  /** Client rollup — pending (optimistic), streaming, complete, or error. */
  _clientStatus?: "pending" | "streaming" | "complete" | "error";
  /** While a turn is live, points at `activeRequests.byRequestId[_streamRequestId]`. */
  _streamRequestId?: string;
  /** Inclusive source timeline index owned by this live assistant segment. */
  _streamSlotStart?: number;
  /** Exclusive source timeline index; set when an inbox injection closes this segment. */
  _streamSlotEnd?: number;
}

/**
 * Transcript ordering. Primary key is `position`; `createdAt` breaks ties.
 *
 * The tie-break is load-bearing: a failed turn and its successful retry SHARE
 * a `position` (the backend has no unique `(conversation_id, position)`
 * constraint), so position alone leaves their order undefined. Ordering by
 * `(position, created_at)` renders the failed attempt just before the retry
 * that replaced it. See
 * `aidream/api/docs/CONVERSATION_FAILURE_AND_RETRY_FE_GUIDE.md`.
 */
function byPositionThenCreatedAt(a: MessageRecord, b: MessageRecord): number {
  if (a.position !== b.position) return a.position - b.position;
  if (a.createdAt < b.createdAt) return -1;
  if (a.createdAt > b.createdAt) return 1;
  return 0;
}

/**
 * Keep the live transcript spine in the same order as a hydrated one.
 *
 * Stream events are transport-ordered, not transcript-ordered: an assistant
 * reservation can arrive before a later `injection_consumed` event whose user
 * row has the preceding server position. Appending both records made the
 * injected bubble render below the assistant's later tool/output blocks until
 * a reload re-sorted the DB records.
 */
function insertOrderedMessageId(entry: MessagesEntry, messageId: string): void {
  const record = entry.byId[messageId];
  if (!record) return;
  const insertionIndex = entry.orderedIds.findIndex((existingId) => {
    const existing = entry.byId[existingId];
    return existing ? byPositionThenCreatedAt(record, existing) < 0 : false;
  });
  if (insertionIndex === -1) {
    entry.orderedIds.push(messageId);
  } else {
    entry.orderedIds.splice(insertionIndex, 0, messageId);
  }
}

function reorderMessageId(entry: MessagesEntry, messageId: string): void {
  entry.orderedIds = entry.orderedIds.filter((id) => id !== messageId);
  insertOrderedMessageId(entry, messageId);
}

/**
 * The position a NEW row appended to this conversation will most likely get
 * from the server — `max(position) + 1` over every loaded row.
 *
 * 🚨 Never `orderedIds.length`. The server assigns `position = number of
 * messages in the conversation`; the client's spine is a WINDOW (the run and
 * chat routes hydrate only the last 12 rows), so its length is smaller than
 * the true count as soon as a conversation outgrows that window. Guessing
 * from the length put the optimistic user row at position 12 in a
 * 40-message conversation, `insertOrderedMessageId` sorted it ABOVE the
 * oldest loaded row, and the just-sent message rendered at the top of the
 * history — invisible from the bottom of the page — until (and only if) the
 * server's `record_reserved` promoted it to its real position. That was the
 * "my message doesn't show" defect (2026-09-18).
 */
export function nextTranscriptPosition(
  entry: Pick<MessagesEntry, "byId" | "orderedIds"> | undefined,
): number {
  if (!entry || entry.orderedIds.length === 0) return 0;
  let max = -1;
  for (const id of entry.orderedIds) {
    const rec = entry.byId[id];
    if (rec && typeof rec.position === "number" && rec.position > max) {
      max = rec.position;
    }
  }
  return max + 1;
}

/** A row this client minted and the server has not yet acknowledged. */
function isPendingClientRow(record: MessageRecord | undefined): boolean {
  return (
    !!record && record.source === "client" && record._clientStatus === "pending"
  );
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
  /**
   * Optional transcript render window, counted in display groups rather than
   * raw rows by the UI. `null` preserves legacy behavior: render every loaded
   * message. Chat cold-load sets this to 2, then grows it as older context is
   * revealed above the current viewport.
   */
  visibleGroupLimit: number | null;
  /**
   * Why this transcript is empty when it is empty for a BAD reason.
   *
   * A hydrate that could not read the conversation (RLS denied the bundle, the
   * RPC failed, the row the surface was sent to does not exist) used to land
   * as a fulfilled load with zero messages, and the room rendered as a normal
   * brand-new chat — a screen that lies (law 4). When this is set, the
   * transcript says the read failed and offers a retry; a genuinely empty
   * conversation leaves it `null`. Cleared by any successful `hydrateMessages`.
   */
  hydrationFailure: string | null;
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

/**
 * A submitted turn needs an optimistic transcript row when any user-visible
 * request facet exists. Keeping this gate beside the canonical message store
 * prevents text-only assumptions from diverging across execution paths.
 */
export function shouldCreateOptimisticUserMessage(args: {
  isRetry?: boolean;
  hasText: boolean;
  hasAttachments: boolean;
  hasVariables: boolean;
  hasContext: boolean;
}): boolean {
  return (
    !args.isRetry &&
    (args.hasText ||
      args.hasAttachments ||
      args.hasVariables ||
      args.hasContext)
  );
}

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
      visibleGroupLimit: null,
      hydrationFailure: null,
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
        /**
         * Per-turn metadata captured at submit. Critically holds the
         * `context_snapshot` — the EXACT context entries this turn carried — so
         * the user bubble can later show its true context instead of the live
         * conversation-level context (which drifts as scope/working-doc change).
         */
        metadata?: Json;
      }>,
    ) {
      const {
        conversationId,
        clientTempId,
        content,
        position,
        agentId = null,
        metadata,
      } = action.payload;
      const entry = getOrCreate(state, conversationId);
      if (entry.byId[clientTempId]) {
        recordTranscriptEvent(conversationId, "optimistic_user_duplicate_ignored", {
          id: shortId(clientTempId),
        });
        return; // idempotent
      }
      const now = new Date().toISOString();
      const textLength = content.reduce(
        (sum, part) =>
          part.type === "text" && typeof part.text === "string"
            ? sum + part.text.length
            : sum,
        0,
      );
      recordTranscriptEvent(conversationId, "optimistic_user_added", {
        id: shortId(clientTempId),
        position,
        textLength,
        parts: content.length,
        loadedRows: entry.orderedIds.length,
        oldestLoadedPosition: entry.oldestPosition,
        expectedNextPosition: nextTranscriptPosition(entry),
      });
      entry.byId[clientTempId] = {
        id: clientTempId,
        conversationId,
        agentId,
        role: "user",
        content,
        contentHistory: null,
        userContent: null,
        position,
        source: "client",
        status: "reserved",
        isVisibleToModel: true,
        isVisibleToUser: true,
        metadata: (metadata ?? {}) as Json,
        createdAt: now,
        deletedAt: null,
        _clientStatus: "pending",
      };
      insertOrderedMessageId(entry, clientTempId);
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
      if (!entry?.byId[oldId]) {
        recordTranscriptEvent(conversationId, "promote_missing_old_id", {
          oldId: shortId(oldId),
          newId: shortId(newId),
          position: position ?? null,
          newIdAlreadyPresent: !!entry?.byId[newId],
        });
        return;
      }
      if (oldId === newId) return;
      const record = entry.byId[oldId];
      if (entry.byId[newId]) {
        recordTranscriptEvent(conversationId, "promote_merged_into_existing", {
          oldId: shortId(oldId),
          newId: shortId(newId),
          position: position ?? null,
          oldPosition: record.position,
          existingPosition: entry.byId[newId].position,
        });
        // Target id already exists — a mid-stream loadConversation can seed
        // byId[newId] from the DB before this promote lands (the row
        // persists before the stream event). Renaming onto it would map
        // BOTH orderedIds slots to newId (duplicate React keys). MERGE:
        // keep the DB-hydrated record, carry over the live stream anchor so
        // the renderer keeps reading the active request, drop the old id.
        const existing = entry.byId[newId];
        if (!existing._streamRequestId && record._streamRequestId) {
          existing._streamRequestId = record._streamRequestId;
        }
        delete entry.byId[oldId];
        entry.orderedIds = entry.orderedIds.filter((id) => id !== oldId);
        return;
      }
      recordTranscriptEvent(conversationId, "promote", {
        oldId: shortId(oldId),
        newId: shortId(newId),
        role: record.role,
        fromPosition: record.position,
        toPosition: typeof position === "number" ? position : record.position,
      });
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
      reorderMessageId(entry, newId);
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
        /** Segment of the live request timeline this assistant row owns. */
        streamSlotStart?: number;
      }>,
    ) {
      const {
        conversationId,
        messageId,
        role = "assistant",
        agentId = null,
        position = 0,
        requestId,
        streamSlotStart,
      } = action.payload;
      const entry = getOrCreate(state, conversationId);
      if (entry.byId[messageId]) {
        recordTranscriptEvent(conversationId, "message_reserved_duplicate_ignored", {
          id: shortId(messageId),
          role,
          position,
        });
        return;
      }
      recordTranscriptEvent(conversationId, "message_reserved", {
        id: shortId(messageId),
        role,
        position,
        requestId: shortId(requestId),
        pendingClientRows: entry.orderedIds.filter((id) =>
          isPendingClientRow(entry.byId[id]),
        ).length,
      });
      const now = new Date().toISOString();
      entry.byId[messageId] = {
        id: messageId,
        conversationId,
        agentId,
        role,
        content: [],
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
        ...(typeof streamSlotStart === "number"
          ? { _streamSlotStart: streamSlotStart }
          : {}),
      };
      insertOrderedMessageId(entry, messageId);
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
      const sorted = [...messages].sort(byPositionThenCreatedAt);
      const previous = entry.byId;
      const previousCount = entry.orderedIds.length;
      // 🚨 A hydrate is a DB snapshot, and the DB does not yet hold what this
      // client minted a moment ago. An optimistic user row still waiting for
      // its `record_reserved` promotion (the person just pressed Send; the
      // reconnect / resume / cold-load paths all re-read the bundle) used to
      // be wiped by the wholesale `byId = {}` below — the sent message vanished
      // from the screen while the answer streamed under it. Pending client
      // rows are carried across; the promotion (or the next hydrate, once the
      // server holds the row) still retires them by id.
      const carriedPendingIds = entry.orderedIds.filter(
        (id) => isPendingClientRow(previous[id]) && !messages.some((m) => m.id === id),
      );
      entry.byId = {};
      entry.orderedIds = [];
      for (const msg of sorted) {
        const live = previous[msg.id];
        entry.byId[msg.id] = {
          ...msg,
          _clientStatus: "complete",
          // The live stream anchors are client-only truth the DB cannot
          // return; dropping them mid-stream swaps the renderer's source and
          // re-renders the whole response column for nothing.
          ...(live?._streamRequestId
            ? { _streamRequestId: live._streamRequestId }
            : {}),
          ...(typeof live?._streamSlotStart === "number"
            ? { _streamSlotStart: live._streamSlotStart }
            : {}),
          ...(typeof live?._streamSlotEnd === "number"
            ? { _streamSlotEnd: live._streamSlotEnd }
            : {}),
        };
        entry.orderedIds.push(msg.id);
      }
      for (const id of carriedPendingIds) {
        entry.byId[id] = previous[id];
        insertOrderedMessageId(entry, id);
      }
      recordTranscriptEvent(conversationId, "hydrate", {
        rows: sorted.length,
        previousRows: previousCount,
        carriedPendingRows: carriedPendingIds.map(shortId),
        droppedRows: entry.orderedIds.length < previousCount
          ? previousCount - entry.orderedIds.length
          : 0,
        oldestPosition: pagination
          ? pagination.oldestPosition
          : (sorted[0]?.position ?? null),
        hasMoreOlder: pagination ? pagination.hasMoreOlder : false,
      });
      if (pagination) {
        entry.oldestPosition = pagination.oldestPosition;
        entry.hasMoreOlder = pagination.hasMoreOlder;
      } else {
        entry.oldestPosition = sorted[0]?.position ?? null;
        entry.hasMoreOlder = false;
      }
      entry.isLoadingOlder = false;
      // The read worked — whatever failed before is no longer true.
      entry.hydrationFailure = null;
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

      const sorted = [...messages].sort(byPositionThenCreatedAt);
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
      recordTranscriptEvent(conversationId, "prepend", {
        rows: newIds.length,
        oldestPosition: pagination.oldestPosition,
        hasMoreOlder: pagination.hasMoreOlder,
      });
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

    /** Set/clear the display-group render window for a conversation. */
    setVisibleGroupLimit(
      state,
      action: PayloadAction<{
        conversationId: string;
        limit: number | null;
      }>,
    ) {
      const { conversationId, limit } = action.payload;
      const entry = getOrCreate(state, conversationId);
      entry.visibleGroupLimit =
        typeof limit === "number" ? Math.max(1, Math.floor(limit)) : null;
      recordTranscriptEvent(conversationId, "visible_group_limit", {
        limit: entry.visibleGroupLimit,
        via: "set",
      });
    },

    /** Grow the display-group render window without clobbering unlimited mode. */
    revealOlderGroups(
      state,
      action: PayloadAction<{
        conversationId: string;
        count: number;
      }>,
    ) {
      const { conversationId, count } = action.payload;
      const entry = state.byConversationId[conversationId];
      if (!entry || entry.visibleGroupLimit === null) return;
      entry.visibleGroupLimit = Math.max(
        1,
        entry.visibleGroupLimit + Math.max(1, Math.floor(count)),
      );
      recordTranscriptEvent(conversationId, "visible_group_limit", {
        limit: entry.visibleGroupLimit,
        via: "reveal",
      });
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
      const removed = entry.byId[messageId];
      recordTranscriptEvent(conversationId, "remove", {
        id: shortId(messageId),
        role: removed?.role ?? null,
        position: removed?.position ?? null,
        existed: !!removed,
      });
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

    /**
     * Record (or clear) the reason this conversation's transcript could not be
     * read. Set by `loadConversation` on a failed or empty-but-expected read;
     * the transcript renders an honest "couldn't load — try again" state
     * instead of an empty room. NEVER set for a conversation that is legitimately
     * empty (one minted locally and not yet submitted).
     */
    setMessagesHydrationFailure(
      state,
      action: PayloadAction<{
        conversationId: string;
        failure: string | null;
      }>,
    ) {
      const { conversationId, failure } = action.payload;
      const entry = getOrCreate(state, conversationId);
      entry.hydrationFailure = failure;
    },

    /** Clear the transcript (e.g. auto-clear on a new run). */
    clearMessages(state, action: PayloadAction<string>) {
      const entry = state.byConversationId[action.payload];
      if (!entry) return;
      recordTranscriptEvent(action.payload, "clear", {
        rows: entry.orderedIds.length,
      });
      entry.byId = {};
      entry.orderedIds = [];
      entry.title = null;
      entry.description = null;
      entry.keywords = null;
      entry.oldestPosition = null;
      entry.hasMoreOlder = false;
      entry.isLoadingOlder = false;
      entry.visibleGroupLimit = null;
    },
  },

  extraReducers: (builder) => {
    builder.addCase(createInstanceFull, (state, action) => {
      const { conversationId, messages } = action.payload;
      const mode = messages?.apiEndpointMode ?? "agent";
      const entry = getOrCreate(state, conversationId, mode);
      entry.apiEndpointMode = mode;
    });

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
  setVisibleGroupLimit,
  revealOlderGroups,
  removeMessage,
  setConversationLabel,
  setMessagesHydrationFailure,
  clearMessages,
} = messagesSlice.actions;

export default messagesSlice.reducer;
