/**
 * attachWorkflowRun — rejoin a durable workflow run that nobody is following.
 *
 * ## Why this exists
 *
 * `adoptForeignStream` + `followWorkflowRunStream` cover the run you STARTED:
 * the start response hands you a request row and a run id in the same breath.
 * But a workflow run is durable server work — it outlives the tab that started
 * it. After a refresh (or on a second device, or from a run row in a list) the
 * run is still executing and there is no inline stream left to adopt, so the
 * surface has no `requestId` to follow under and the live view dies. A run that
 * dies on page refresh is the same defect as a spinner (CLAUDE.md § THE
 * FLOATING LAW), so this is the missing half of the pair.
 *
 * It mints a fresh `activeRequests` row for the run and follows the run's SSE
 * feed into it. The feed replays from seq 0 (Last-Event-ID cursor starts unset),
 * so the node lifecycle the surface missed while away arrives on `onEvent` and
 * the stage view rebuilds itself — no bespoke catch-up read.
 *
 * The row is new on purpose: `activeRequests` rows are per-viewer stream
 * accumulators, not identities of the run. The run's identity is its `run_id`.
 */

import type { AppThunk } from "@/lib/redux/store";
import { createRequest } from "../active-requests/active-requests.slice";
import { generateConversationId, generateRequestId } from "../utils/ids";
import {
  followWorkflowRunStream,
  type WorkflowRunWireEvent,
} from "./follow-workflow-run-stream";

export interface AttachWorkflowRunOptions {
  /** The durable run to rejoin. */
  runId: string;
  /** Caller teardown — abort to stop following. */
  signal: AbortSignal;
  /** Fires with the freshly minted ids, before any event is processed. */
  onAttached?: (ids: { requestId: string; conversationId: string }) => void;
  /** Every workflow event (replayed lifecycle first, then live). Must not throw. */
  onEvent?: (event: WorkflowRunWireEvent) => void;
}

export function attachWorkflowRun(
  opts: AttachWorkflowRunOptions,
): AppThunk<Promise<void>> {
  return async (dispatch) => {
    const requestId = generateRequestId();
    const conversationId = generateConversationId();
    dispatch(createRequest({ requestId, conversationId }));
    opts.onAttached?.({ requestId, conversationId });
    await dispatch(
      followWorkflowRunStream({
        runId: opts.runId,
        requestId,
        conversationId,
        signal: opts.signal,
        onEvent: opts.onEvent,
      }),
    );
  };
}
