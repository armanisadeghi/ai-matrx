/**
 * materializeMessageArtifacts — the CHAT wrapper over the any-surface
 * primitive (`materializeBlocks`).
 *
 * Everything that used to live here (planning, canvas upserts, non-blocking
 * adapter + discovery writes, all-or-nothing rewrite assembly) moved VERBATIM
 * into `materializeBlocks.ts`, generalized to `(source_system, source_id)`
 * identity. This wrapper pins the chat specifics and keeps the historical
 * signature so its three call sites (process-stream stream-end commit,
 * reconcileArtifacts, load-conversation) are untouched:
 *   - source system `cx_message` (upserts go through the exact historical
 *     cx_canvas_upsert RPC),
 *   - persistRewrite = `cx_message_set_content` (SECURITY DEFINER,
 *     owner-checked, status-preserving — NOT cx_message_edit, which marks the
 *     message 'edited'; materialization is a system rewrite, not a user edit.
 *     Archives the original into content_history so it's fully reversible).
 */

import { supabase } from "@/utils/supabase/client";
import type { Json } from "@/types/database.types";
import type { CxContentBlock } from "@/features/public-chat/types/cx-tables";
import { materializeBlocks, type PersistRewrite } from "./materializeBlocks";

export interface MaterializeParams {
  /** REAL cx_message.id (never a client-temp id). */
  messageId: string;
  conversationId: string;
  /** The committed assistant content array (cx_message.content shape). */
  content: CxContentBlock[];
}

export interface MaterializeResult {
  materializedCount: number;
  /** The rewritten content to mirror into Redux, or null when unchanged/aborted. */
  rewrittenContent: CxContentBlock[] | null;
  errors: string[];
}

/**
 * DB tool-graph guard (aidream migration 0151): cx_message_set_content RAISEs
 * this whenever the new content's tool_call call_id multiset differs from the
 * row's existing one. Materialization may rewrite text/artifact blocks only —
 * a rejection means the client tried to write another iteration's tool_calls
 * onto this row (the corruption class the guard exists to stop). The rewrite
 * is permanently invalid for this content, so retrying is pointless: leave
 * the raw content in place (inline artifact rendering keeps working — the
 * canvas_items rows persisted fine) and never re-attempt this session.
 */
const TOOL_GRAPH_GUARD = "tool_call_graph_change_forbidden";
const graphGuardRejectedMessageIds = new Set<string>();

/**
 * The chat rewrite writer, exported so reconcile delegation reuses the exact
 * same RPC call per message.
 */
export function cxMessageContentRewriter(messageId: string): PersistRewrite {
  return async (rewritten) => {
    if (graphGuardRejectedMessageIds.has(messageId)) {
      return {
        ok: false,
        error: `${TOOL_GRAPH_GUARD}: rewrite for ${messageId} already rejected by the DB tool-graph guard this session — not retrying`,
      };
    }
    const { error } = await supabase.rpc("cx_message_set_content", {
      p_message_id: messageId,
      p_new_content: rewritten as unknown as Json,
    });
    if (!error) return { ok: true };
    if (error.message?.includes(TOOL_GRAPH_GUARD)) {
      graphGuardRejectedMessageIds.add(messageId);
      console.error(
        `[materialize] cx_message_set_content REJECTED by the DB tool-graph guard for message ${messageId} — the rewrite would have changed the row's tool_call set. ` +
          `The server-persisted tool graph is kept, artifacts stay inline-rendered from raw content, and this message will not be retried this session. ` +
          `This indicates the client assembled another iteration's tool_calls onto this row (see the process-stream single-reservation partition).`,
      );
      return { ok: false, error: error.message };
    }
    return { ok: false, error: error.message };
  };
}

export async function materializeMessageArtifacts(
  params: MaterializeParams,
): Promise<MaterializeResult> {
  return materializeBlocks({
    source: {
      system: "cx_message",
      id: params.messageId,
      conversationId: params.conversationId,
    },
    content: params.content,
    persistRewrite: cxMessageContentRewriter(params.messageId),
  });
}
