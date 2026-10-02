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

import { selectConversationSurfaceOwnsOutput } from "@ai-matrx/chat/agents/redux/execution-system/conversations/conversations.selectors";
import type { RootState } from "@/lib/redux/store";
import { supabase } from "@/utils/supabase/client";
import { hasBrowserSession } from "@/lib/supabase/hasBrowserSession";

import type { CxContentBlock } from "@ai-matrx/chat/public-chat/types/cx-tables";
import { materializeBlocks, type PersistRewrite } from "./materializeBlocks";

export interface MaterializeParams {
  /** REAL cx_message.id (never a client-temp id). */
  messageId: string;
  conversationId: string;
  /** The committed assistant content array (cx_message.content shape). */
  content: CxContentBlock[];
  /**
   * The store, read for the conversation's `surfaceOwnsOutput` flag (carried
   * on its record from launch, restored from the row on load).
   */
  getState: () => RootState;
}

export interface MaterializeResult {
  materializedCount: number;
  /** The rewritten content to mirror into Redux, or null when unchanged/aborted. */
  rewrittenContent: CxContentBlock[] | null;
  /** See MaterializeBlocksResult.unpersistedRewrite. */
  unpersistedRewrite?: CxContentBlock[];
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
 * SQLSTATEs the database raises only AFTER rolling the whole statement back,
 * and whose cause is a moment, not the content: 57014 statement timeout,
 * 55P03 lock not available, 40001 serialization failure, 40P01 deadlock.
 * A retry of these can never double-apply (the failed call wrote nothing).
 *
 * Why 57014 is transient here (measured 2026-09-30): chat.message carries two
 * GIN indexes over the whole content (cx_message_content_trgm_idx, 666 MB, on
 * content::text; cx_message_search_tsv_idx). With fastupdate on, every
 * content write appends to a 4 MB pending list and the ONE writer whose
 * insert overflows it merges the whole list into the index inside its own
 * statement. On the nightly clone, 15 consecutive rewrites of ~100 KB
 * messages took 16–61 ms each except one at 1,767 ms (the merge); on live
 * under load that merge passed the 8 s `authenticated` statement_timeout
 * (message 2abb1798…, 09:14:30Z). The merge is paid once, by one writer, so
 * the next attempt lands in tens of milliseconds. Network errors carry no
 * SQLSTATE and are NOT retried — their outcome is unknown.
 * 2026-10-01: the 666 MB whole-content trigram index was replaced by
 * cx_message_text_trgm_idx (visible text only, 146 MB), which makes the merge
 * rarer and smaller; the retry stays because the two GIN pending lists remain.
 */
const TRANSIENT_SQLSTATES = new Set(["57014", "55P03", "40001", "40P01"]);
const REWRITE_RETRY_DELAYS_MS = [750, 2000];

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

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
    let attempt = 0;
    let { error } = await supabase.rpc("cx_message_set_content", {
      p_message_id: messageId,
      p_new_content: rewritten,
    });
    while (
      error &&
      TRANSIENT_SQLSTATES.has(error.code ?? "") &&
      attempt < REWRITE_RETRY_DELAYS_MS.length
    ) {
      console.warn(
        `[materialize] cx_message_set_content for ${messageId} failed with ${error.code} (${error.message}); ` +
          `the statement was rolled back, retrying in ${REWRITE_RETRY_DELAYS_MS[attempt]} ms ` +
          `(attempt ${attempt + 2} of ${REWRITE_RETRY_DELAYS_MS.length + 1}).`,
      );
      await sleep(REWRITE_RETRY_DELAYS_MS[attempt]);
      attempt++;
      ({ error } = await supabase.rpc("cx_message_set_content", {
        p_message_id: messageId,
        p_new_content: rewritten,
      }));
    }
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
  // A signed-out visitor (a guest running a public app at /p/<slug>) can
  // neither read `chat.message` nor rewrite it, so there is nothing to
  // materialize: artifacts keep rendering inline from the raw content. Asking
  // only produced "permission denied for table message" on every guest run
  // (page-pass /p/[slug], 2026-09-27).
  if (!(await hasBrowserSession())) {
    return { materializedCount: 0, rewrittenContent: null, errors: [] };
  }

  // A surface that writes this conversation's result itself (a segmented
  // background generation, a flashcard deck) owns it: materializing here would
  // create a second record per call. The flag rides the conversation record
  // (launch option `surfaceOwnsOutput`), so it survives reload and resume.
  if (
    selectConversationSurfaceOwnsOutput(
      params.getState(),
      params.conversationId,
    )
  ) {
    return { materializedCount: 0, rewrittenContent: null, errors: [] };
  }

  // The stream's reservation list is delivery metadata, not content
  // authority. In an under-announced or late-announced tool loop it can map
  // the final iteration's assembled blocks to an earlier assistant row. The
  // database row is already committed before materialization and owns the
  // canonical tool-pairing graph, so read that content before creating any
  // canvas rows. This prevents both a forbidden rewrite and, more importantly,
  // artifacts being attributed to the wrong source message.
  const { data, error } = await supabase
    .schema("chat")
    .from("message")
    .select("content")
    .eq("id", params.messageId)
    .maybeSingle();

  if (error) {
    return {
      materializedCount: 0,
      rewrittenContent: null,
      errors: [`canonical source read failed: ${error.message}`],
    };
  }

  // The terminal stream can beat the row becoming readable, and a failed persistence
  // lane can roll the reservation back entirely. Defer either zero-row state
  // to the on-load reconciler, which runs only against durable messages.
  if (data === null) {
    return {
      materializedCount: 0,
      rewrittenContent: null,
      errors: [],
    };
  }

  const canonicalContent = Array.isArray(data.content)
    ? (data.content as CxContentBlock[])
    : params.content;

  return materializeBlocks({
    source: {
      system: "cx_message",
      id: params.messageId,
      conversationId: params.conversationId,
    },
    content: canonicalContent,
    persistRewrite: cxMessageContentRewriter(params.messageId),
  });
}
