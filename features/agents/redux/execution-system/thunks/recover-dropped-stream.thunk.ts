/**
 * recoverDroppedStream — silent self-heal after a client-side stream death.
 *
 * The contract this exploits: aidream streams run with
 * `detach_on_disconnect=True`, so when the CLIENT's connection dies (heartbeat
 * timeout, network blip, tab sleep) the server keeps running the turn to
 * completion and persists everything. The dropped stream is a DISPLAY
 * problem, not a data problem — so instead of leaving the user staring at a
 * dead-stream error for a turn that finished fine, this thunk:
 *
 *   1. Polls `cx_user_request` (newest row for the conversation) with capped
 *      exponential backoff until it reaches a terminal status, for up to
 *      `maxWaitMs` (default 5 min).
 *   2. On `completed` → rehydrates the conversation via `loadConversation`
 *      (the canonical full-fidelity reload), flips the request/instance
 *      status off "error", and toasts that the response was recovered.
 *   3. On `failed` / `cancelled` → rehydrates too (the DB error message is
 *      more truthful than "no server activity"), leaves error state alone.
 *   4. Gives up quietly if the user has already moved on (new request in
 *      flight on this conversation) or the deadline passes.
 *
 * Loud-recovery doctrine: every successful recovery logs a console.warn —
 * a recovery firing means a real defect (the dropped stream) got past the
 * proactive layer, and we want it visible in diagnostics, never silent.
 *
 * Invoked fire-and-forget from runAiStream's heartbeat-timeout error path.
 */

import { createAsyncThunk } from "@reduxjs/toolkit";
import { toast } from "sonner";
import type { AppDispatch } from "@/lib/redux/store";
import type { RootState } from "@/lib/redux/store";
import { supabase } from "@/utils/supabase/client";
import { loadConversation } from "./load-conversation.thunk";
import { setRequestStatus } from "../active-requests/active-requests.slice";
import { setInstanceStatus } from "../conversations/conversations.slice";
import { selectLatestRequestId } from "../selectors/aggregate.selectors";

interface RecoverDroppedStreamArgs {
  conversationId: string;
  /** The request whose stream died — recovery aborts if a newer one starts. */
  requestId: string;
  /** Max total wait for the server to finish the detached turn. Default 5 min. */
  maxWaitMs?: number;
}

interface RecoverDroppedStreamResult {
  recovered: boolean;
  serverStatus: string | null;
}

const TERMINAL_STATUSES = new Set(["completed", "failed", "cancelled"]);

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export const recoverDroppedStream = createAsyncThunk<
  RecoverDroppedStreamResult,
  RecoverDroppedStreamArgs,
  { dispatch: AppDispatch; state: RootState }
>(
  "execution/recoverDroppedStream",
  async (
    { conversationId, requestId, maxWaitMs = 5 * 60_000 },
    { dispatch, getState },
  ) => {
    const deadline = Date.now() + maxWaitMs;
    let delayMs = 4_000;

    while (Date.now() < deadline) {
      await sleep(delayMs);
      delayMs = Math.min(Math.round(delayMs * 1.5), 15_000);

      // The user moved on — a newer request is live on this conversation.
      // Recovery would clobber its state; stand down.
      const latest = selectLatestRequestId(conversationId)(getState());
      if (latest && latest !== requestId) {
        return { recovered: false, serverStatus: null };
      }

      // `cx_user_request` no longer carries `conversation_id`. We find the
      // newest user_request that ran in this conversation through the
      // `cx_request` m2m (the latest cx_request row for the conversation), then
      // read its parent user_request's status via the FK join.
      const { data, error } = await supabase
        .from("cx_request")
        .select("created_at, cx_user_request:user_request_id(id, status)")
        .eq("conversation_id", conversationId)
        .is("deleted_at", null)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (error || !data) continue;
      const parentUserRequest = (
        data as {
          cx_user_request?: { id: string; status: string | null } | null;
        }
      ).cx_user_request;
      const serverStatus = parentUserRequest?.status ?? null;
      if (!serverStatus || !TERMINAL_STATUSES.has(serverStatus)) continue;

      // Terminal — the detached run finished. Rehydrate from the DB so the
      // transcript shows exactly what the server persisted.
      try {
        await dispatch(loadConversation({ conversationId })).unwrap();
      } catch {
        // Reload failed (auth/network). Leave the error state untouched —
        // the user still has the partial content + Retry affordance.
        return { recovered: false, serverStatus };
      }

      if (serverStatus === "completed") {
        // The turn succeeded server-side; the "error" was purely the dropped
        // stream. Clear it so the transcript reads as the success it is.
        dispatch(setRequestStatus({ requestId, status: "complete" }));
        dispatch(setInstanceStatus({ conversationId, status: "complete" }));
        console.warn(
          "[recoverDroppedStream] stream died but the server completed the turn — recovered from DB.",
          { conversationId, requestId },
        );
        toast.success("Connection recovered", {
          description:
            "The stream dropped mid-response, but the server finished the turn. The full response has been loaded.",
        });
        return { recovered: true, serverStatus };
      }

      // failed / cancelled — keep the error surface, but the reload above
      // already swapped in the server's persisted (more truthful) record.
      console.warn(
        `[recoverDroppedStream] stream died and the server reports '${serverStatus}' — rehydrated the persisted record.`,
        { conversationId, requestId },
      );
      return { recovered: false, serverStatus };
    }

    return { recovered: false, serverStatus: null };
  },
);
