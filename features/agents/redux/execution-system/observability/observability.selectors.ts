import { createSelector } from "@reduxjs/toolkit";
import type { RootState } from "@/lib/redux/store";
import type {
  CxUserRequestRecord,
  CxRequestRecord,
  CxToolCallRecord,
  ObservabilityUserRequestTimeline,
} from "./observability.slice";

const EMPTY_STRING_ARRAY: string[] = [];
const EMPTY_USER_REQUESTS: CxUserRequestRecord[] = [];
const EMPTY_REQUESTS: CxRequestRecord[] = [];
/** Stable empty ref — never inline `?? []` / `: []` at the call site. */
export const EMPTY_TOOL_CALLS: CxToolCallRecord[] = [];

// ---------------------------------------------------------------------------
// User requests
// ---------------------------------------------------------------------------

export const selectUserRequestIdsForConversation =
  (conversationId: string) =>
  (state: RootState): string[] =>
    state.observability.userRequestsByConversationId[conversationId] ??
    EMPTY_STRING_ARRAY;

export const selectUserRequestsForConversation = (conversationId: string) =>
  createSelector(
    (state: RootState) =>
      state.observability.userRequestsByConversationId[conversationId],
    (state: RootState) => state.observability.userRequests,
    (ids, byId): CxUserRequestRecord[] => {
      if (!ids || ids.length === 0) return EMPTY_USER_REQUESTS;
      const out: CxUserRequestRecord[] = [];
      for (const id of ids) {
        const rec = byId[id];
        if (rec) out.push(rec);
      }
      return out.length === 0 ? EMPTY_USER_REQUESTS : out;
    },
  );

export const selectUserRequestById =
  (userRequestId: string) =>
  (state: RootState): CxUserRequestRecord | undefined =>
    state.observability.userRequests[userRequestId];

// ---------------------------------------------------------------------------
// LLM requests (cx_request)
// ---------------------------------------------------------------------------

export const selectRequestsForUserRequest = (userRequestId: string) =>
  createSelector(
    (state: RootState) =>
      state.observability.requestsByUserRequestId[userRequestId],
    (state: RootState) => state.observability.requests,
    (ids, byId): CxRequestRecord[] => {
      if (!ids || ids.length === 0) return EMPTY_REQUESTS;
      const out: CxRequestRecord[] = [];
      for (const id of ids) {
        const rec = byId[id];
        if (rec) out.push(rec);
      }
      return out.length === 0 ? EMPTY_REQUESTS : out;
    },
  );

// ---------------------------------------------------------------------------
// Tool calls (cx_tool_call)
// ---------------------------------------------------------------------------

export const selectToolCallsForUserRequest = (userRequestId: string) =>
  createSelector(
    (state: RootState) =>
      state.observability.toolCallsByUserRequestId[userRequestId],
    (state: RootState) => state.observability.toolCalls,
    (ids, byId): CxToolCallRecord[] => {
      if (!ids || ids.length === 0) return EMPTY_TOOL_CALLS;
      const out: CxToolCallRecord[] = [];
      for (const id of ids) {
        const rec = byId[id];
        if (rec) out.push(rec);
      }
      return out.length === 0 ? EMPTY_TOOL_CALLS : out;
    },
  );

export const selectToolCallById =
  (id: string) =>
  (state: RootState): CxToolCallRecord | undefined =>
    state.observability.toolCalls[id];

/**
 * Look up a tool call by its wire-format callId (e.g. "gemini_-179343880511712762").
 * Uses the secondary index populated by hydrateObservability / upsertToolCall,
 * so this is O(1) — safe to call from render-critical paths.
 */
export const selectToolCallByCallId =
  (callId: string) =>
  (state: RootState): CxToolCallRecord | undefined => {
    const uuid = state.observability.toolCallsByCallId[callId];
    if (!uuid) return undefined;
    return state.observability.toolCalls[uuid];
  };

/**
 * Tool calls attached to a specific cx_message — used by destructive
 * actions (delete, retry) to warn the user about cascaded deletions.
 * Returns only non-soft-deleted rows.
 */
export const selectToolCallsForMessage = (messageId: string) =>
  createSelector(
    (state: RootState) => state.observability.toolCalls,
    (byId): CxToolCallRecord[] => {
      const out: CxToolCallRecord[] = [];
      for (const id in byId) {
        const rec = byId[id];
        if (rec.messageId === messageId && !rec.deletedAt) {
          out.push(rec);
        }
      }
      return out.length === 0 ? EMPTY_TOOL_CALLS : out;
    },
  );

/**
 * Every non-deleted tool call for a conversation, oldest → newest by
 * `startedAt`. Used by the tool-call window's "All Messages" scope.
 * Scans the by-id map (conversationId is on every row) — no secondary
 * index yet; conversations rarely hold enough tools for this to matter.
 *
 * Factory — callers must memoize the instance:
 * `useMemo(() => selectToolCallsForConversation(id), [id])`
 */
export const selectToolCallsForConversation = (conversationId: string) =>
  createSelector(
    (state: RootState) => state.observability.toolCalls,
    (byId): CxToolCallRecord[] => {
      if (!conversationId) return EMPTY_TOOL_CALLS;
      const out: CxToolCallRecord[] = [];
      for (const id in byId) {
        const rec = byId[id];
        if (rec.conversationId === conversationId && !rec.deletedAt) {
          out.push(rec);
        }
      }
      if (out.length === 0) return EMPTY_TOOL_CALLS;
      out.sort((a, b) => {
        if (a.startedAt < b.startedAt) return -1;
        if (a.startedAt > b.startedAt) return 1;
        return 0;
      });
      return out;
    },
  );

// ---------------------------------------------------------------------------
// Timelines
// ---------------------------------------------------------------------------

export const selectTimelineForUserRequest =
  (userRequestId: string) =>
  (state: RootState): ObservabilityUserRequestTimeline | undefined =>
    state.observability.timelines[userRequestId];
