/**
 * Paginated fetch of `chat.tool_call` rows for one conversation.
 * Used by the tool-call window's "All Messages" scope when Redux only
 * holds a partial cache (recent page / live stream).
 */

import { supabase } from "@/utils/supabase/client";
import type { CxToolCallRecord } from "@/features/agents/redux/execution-system/observability/observability.slice";
import {
  toolCallRowToRecord,
  type CxToolCallRow,
} from "@/features/agents/redux/execution-system/thunks/conversation-bundle";

export const CONVERSATION_TOOL_CALL_PAGE_SIZE = 50;

export interface FetchConversationToolCallsResult {
  records: CxToolCallRecord[];
  /** True when the page was full — older rows may still exist. */
  hasMore: boolean;
  /** Oldest `started_at` in this page (cursor for the next older page). */
  oldestStartedAt: string | null;
  /** Total matching rows for the query bounds (Supabase exact count). */
  totalCount: number | null;
}

/**
 * Fetch a page of tool calls for a conversation, newest-first from the
 * cursor (or the latest when `beforeStartedAt` is omitted), then return
 * them oldest→newest for display order.
 */
export async function fetchConversationToolCallsPage(
  conversationId: string,
  opts?: {
    limit?: number;
    /** Exclusive upper bound on `started_at` — load rows older than this. */
    beforeStartedAt?: string | null;
    /** Inclusive lower bound on `started_at` — bound the page to a window. */
    sinceStartedAt?: string | null;
  },
): Promise<FetchConversationToolCallsResult> {
  const limit = opts?.limit ?? CONVERSATION_TOOL_CALL_PAGE_SIZE;

  let query = supabase
    .schema("chat")
    .from("tool_call")
    .select("*", { count: "exact" })
    .eq("conversation_id", conversationId)
    .is("deleted_at", null)
    .order("started_at", { ascending: false })
    .limit(limit);

  if (opts?.beforeStartedAt) {
    query = query.lt("started_at", opts.beforeStartedAt);
  }
  if (opts?.sinceStartedAt) {
    query = query.gte("started_at", opts.sinceStartedAt);
  }

  const { data, error, count } = await query;
  if (error) {
    console.error("[fetchConversationToolCallsPage] failed", {
      conversationId,
      message: error.message,
      code: error.code,
    });
    throw error;
  }

  const rows = (data ?? []) as CxToolCallRow[];
  const records = rows.map(toolCallRowToRecord);
  // Display order is oldest → newest
  records.reverse();

  return {
    records,
    hasMore: rows.length >= limit,
    oldestStartedAt: records.length > 0 ? records[0].startedAt : null,
    totalCount: count ?? null,
  };
}
