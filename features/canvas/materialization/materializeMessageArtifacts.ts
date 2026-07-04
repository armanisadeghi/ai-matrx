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
 * The chat rewrite writer, exported so reconcile delegation reuses the exact
 * same RPC call per message.
 */
export function cxMessageContentRewriter(messageId: string): PersistRewrite {
  return async (rewritten) => {
    const { error } = await supabase.rpc("cx_message_set_content", {
      p_message_id: messageId,
      p_new_content: rewritten as unknown as Json,
    });
    return error ? { ok: false, error: error.message } : { ok: true };
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
