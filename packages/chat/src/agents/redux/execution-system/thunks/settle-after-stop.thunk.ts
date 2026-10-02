/**
 * AFTER STOP, THE SCREEN FOLLOWS WHAT PERSISTED (PB-05 W-47, W-48).
 *
 * Stop is cooperative (TURN-BOUNDARY-INBOX.md § Interrupt flow): the local
 * read aborts NOW, while the server finishes the in-flight provider call and
 * persists everything it streamed. Before this thunk the screen froze where
 * the person pressed Stop ("Stop 2") and stayed there while the database held
 * Stops 1–10 and a tool call — a reload showed a different transcript. And a
 * Stop pressed before the stream's `X-Request-ID` arrived ("Initializing…")
 * sent no server cancel at all, so the run kept going unseen.
 *
 * This thunk, fired by `cancelExecution`:
 *   1. finds the stopped run on the runtime spine (by request id, or — when
 *      the stream never opened — the newest live run of the conversation) and
 *      sends the cancel the Stop could not;
 *   2. waits, bounded, for that run to reach a terminal status;
 *   3. re-reads the conversation and hands each stopped request's rows to
 *      the persisted content — unless the save is SHORTER than what was
 *      shown, in which case the screen keeps it and the gap is captured.
 * It never clobbers a newer run: if the person has sent again meanwhile, the
 * re-read is skipped (that run's own end re-reads).
 */

import { createAsyncThunk } from "@reduxjs/toolkit";
import type { ChatDispatch, ChatRootState } from "../../../../store/root-state";
import { cancelAgentRunRequest } from "@host/lib/api/matrx-transport";
import { fetchOperationsByLink } from "../../../runtime-reconnect/api";
import type {
  RuntimeOperationView,
  RuntimeOperationsByLinkResponse,
} from "../../../runtime-reconnect/types";
import { resolveBackendForConversation } from "./resolve-base-url";
import { loadConversation } from "./load-conversation.thunk";
import { hasAbortController } from "./abort-registry";
import { releaseStreamAnchors } from "../messages/messages.slice";
import { extractFlatText } from "../messages/messages.selectors";
import { selectAnswerText } from "../active-requests/active-requests.selectors";
import { captureError } from "../../../../host/diagnostics";

/** How long a Stop waits for the server to finish its in-flight call. */
export const STOP_SETTLE_WINDOW_MS = 90_000;
export const STOP_SETTLE_POLL_MS = 1_000;

export interface SettleAfterStopArgs {
  conversationId: string;
  /** The server id the Stop already cancelled; null when the stream never opened. */
  serverRequestId: string | null;
  /** Client request ids whose rows were streaming when Stop was pressed. */
  localRequestIds: string[];
  /** Test seam for the poll interval / window. */
  pollMs?: number;
  windowMs?: number;
}

export type SettleAfterStopOutcome =
  | "reloaded"
  | "reloaded_after_timeout"
  | "superseded_by_new_run"
  | "no_backend";

/**
 * Which spine operation the Stop is about. A known server id names it
 * exactly; otherwise the newest non-terminal run of the conversation is the
 * one that was "Initializing" when the person pressed Stop.
 */
export function pickStoppedOperation(
  byLink: RuntimeOperationsByLinkResponse | null,
  serverRequestId: string | null,
): RuntimeOperationView | null {
  const operations = byLink?.operations ?? [];
  if (serverRequestId) {
    return operations.find((o) => o.request_id === serverRequestId) ?? null;
  }
  return operations.find((o) => !o.is_terminal) ?? null;
}

const visibleChars = (text: string) => text.replace(/\s+/g, "");

/**
 * Statuses a request can hold only if it ended BEFORE the Stop. Such an answer
 * was never stopped and is never compared (PB-05 run 2, prod ac170b56…: an
 * earlier finished 40-stop answer was compared and reported "saved shorter").
 */
const FINISHED_BEFORE_STOP: ReadonlySet<string> = new Set([
  "complete",
  "error",
  "timeout",
]);

/** The conversation's requests that were still running when Stop was pressed. */
export function selectInFlightRequestIds(
  state: ChatRootState,
  conversationId: string,
): string[] {
  const ids = state.activeRequests?.byConversationId[conversationId] ?? [];
  return ids.filter((id) => {
    const status = state.activeRequests.byRequestId[id]?.status;
    return status !== undefined && !FINISHED_BEFORE_STOP.has(status) && status !== "cancelled";
  });
}

/**
 * Split the stopped requests into those whose persisted rows hold at least
 * the text the stream showed (safe to render from the database) and those
 * saved SHORTER than shown (keep the stream render; report the gap).
 */
export function classifyStoppedRequests(
  state: ChatRootState,
  conversationId: string,
  requestIds: string[],
): {
  release: string[];
  shorter: Array<{ requestId: string; shownChars: number; savedChars: number }>;
} {
  const entry = state.messages.byConversationId[conversationId];
  const release: string[] = [];
  const shorter: Array<{ requestId: string; shownChars: number; savedChars: number }> = [];
  for (const requestId of requestIds) {
    const status = state.activeRequests?.byRequestId[requestId]?.status;
    if (status && FINISHED_BEFORE_STOP.has(status)) {
      // Finished before the Stop: not the stopped answer — left as it is.
      continue;
    }
    const shownChars = visibleChars(selectAnswerText(requestId)(state)).length;
    const savedChars = visibleChars(
      (entry?.orderedIds ?? [])
        .map((id) => entry?.byId[id])
        .filter(
          (rec): rec is NonNullable<typeof rec> =>
            !!rec && rec.role === "assistant" && rec._streamRequestId === requestId,
        )
        .map((rec) => extractFlatText(rec))
        .join(""),
    ).length;
    if (savedChars >= shownChars) release.push(requestId);
    else shorter.push({ requestId, shownChars, savedChars });
  }
  return { release, shorter };
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export const settleAfterStop = createAsyncThunk<
  SettleAfterStopOutcome,
  SettleAfterStopArgs,
  { state: ChatRootState; dispatch: ChatDispatch }
>(
  "instances/settleAfterStop",
  async (
    {
      conversationId,
      serverRequestId,
      localRequestIds,
      pollMs = STOP_SETTLE_POLL_MS,
      windowMs = STOP_SETTLE_WINDOW_MS,
    },
    { getState, dispatch },
  ) => {
    const backend = resolveBackendForConversation(getState(), conversationId);
    if (!backend) return "no_backend";

    const deadline = Date.now() + windowMs;
    let cancelSentFor: string | null = serverRequestId;
    let settled = false;
    while (Date.now() < deadline) {
      let byLink: RuntimeOperationsByLinkResponse | null = null;
      try {
        byLink = await fetchOperationsByLink(backend, conversationId); // org-filter: server-call the conversation's own organization rides the backend headers; the read is by conversation id
      } catch (err) {
        console.warn("[settle-after-stop] spine read failed; retrying", {
          conversationId,
          err,
        });
      }
      const op = pickStoppedOperation(byLink, cancelSentFor);
      if (byLink && !op && !cancelSentFor) {
        // Nothing live and nothing named: the run never started server-side.
        settled = true;
        break;
      }
      if (op && !op.is_terminal && !cancelSentFor && op.request_id) {
        // The Stop came before X-Request-ID: deliver the cancel it could not.
        cancelSentFor = op.request_id;
        const result = await dispatch(cancelAgentRunRequest(op.request_id));
        if (result.error) {
          console.warn("[settle-after-stop] late server cancel failed", {
            conversationId,
            requestId: op.request_id,
            error: result.error,
          });
        }
      }
      if (op?.is_terminal) {
        settled = true;
        break;
      }
      await sleep(pollMs);
    }

    // The person may have sent again while we waited — that run owns the
    // screen now, and its own end re-reads the conversation.
    const status =
      getState().conversations?.byConversationId[conversationId]?.status;
    if (
      hasAbortController(conversationId) ||
      status === "running" ||
      status === "streaming"
    ) {
      return "superseded_by_new_run";
    }

    // Re-read with the anchors still in place (the screen keeps what it
    // shows), then hand each stopped request's rows to the database ONLY when
    // the saved text holds at least everything that was shown. A save that
    // is shorter than the screen is a server defect: the screen keeps the
    // text the person read, and the gap is captured — never silently erased.
    await dispatch(loadConversation({ conversationId }));
    const { release, shorter } = classifyStoppedRequests(
      getState(),
      conversationId,
      localRequestIds,
    );
    dispatch(releaseStreamAnchors({ conversationId, requestIds: release }));
    for (const gap of shorter) {
      captureError({
        source: "agent-stop-save-shorter",
        message: "A stopped answer was saved shorter than it was shown",
        conversationId,
        requestId: gap.requestId,
        raw: gap,
      });
    }
    return settled ? "reloaded" : "reloaded_after_timeout";
  },
);
