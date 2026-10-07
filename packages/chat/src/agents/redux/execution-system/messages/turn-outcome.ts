/**
 * ONE verdict for how a turn ended, read the same way live and after reload.
 *
 *  - "failed"     no usable answer, a safety/other stop, or the server saved it failed
 *  - "incomplete" the answer was delivered and stands, but the provider stopped
 *                 early (recitation stop, length limit): content + a short notice
 *  - "complete"   a normal finish
 *
 * Live reads the request status + stream warnings; reload reads the saved row
 * (`isFailedRecord` / `incompleteAnswerReason`). A guard test drives both over
 * the same cases so they cannot drift (incomplete-answer-live-equals-reload).
 */

import type { WarningPayload } from "@ai-matrx/agents/generated/stream-events";
import {
  earlyStopMessage,
  incompleteAnswerReason,
  isFailedRecord,
} from "./messages.selectors";
import type { MessageRecord } from "./messages.slice";
import { isAnswerKeptWarning } from "../active-requests/answer-kept-warning";

export { isAnswerKeptWarning };

export type TurnOutcome = "complete" | "incomplete" | "failed";

export function liveTurnOutcome(
  request:
    | {
        status: string;
        warnings?: readonly WarningPayload[];
      }
    | undefined,
): TurnOutcome {
  if (!request) return "complete";
  if (request.status === "error") return "failed";
  return (request.warnings ?? []).some(isAnswerKeptWarning)
    ? "incomplete"
    : "complete";
}

export function reloadTurnOutcome(
  record: MessageRecord | undefined,
): TurnOutcome {
  if (isFailedRecord(record)) return "failed";
  return incompleteAnswerReason(record) ? "incomplete" : "complete";
}

/** The short label on an incomplete answer. A label, not prose. */
export function incompleteLabel(reason: string | null): string {
  return reason === "max_tokens" ||
    reason === "length" ||
    reason === "max_output_tokens" ||
    reason === "truncated_response"
    ? "Cut off at its length limit"
    : "Ending may be cut off";
}

/** The reason-specific sentence kept under Details, for a reloaded turn. */
export function incompleteDetail(reason: string): string {
  return earlyStopMessage(reason);
}
