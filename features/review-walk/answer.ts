/**
 * features/review-walk/answer.ts — the words and the one test for what became
 * of a tool call the agent made. Pure module (no React) so the walk's views and
 * its tests share it.
 *
 * A call candidate containment stopped (`chat.tool_call.error_type =
 * "candidate_stopped"`, or `metadata.mandate_candidate_disposition.disposition
 * = "stopped"`) never ran and its result never reached the model — it is shown
 * as "Stopped before it ran", never as a failed tool result the agent worked
 * from. The server moves such calls out of the inputs (aidream
 * `services/review_descend/answer.py`); the turn view reads the row itself.
 */
import type { DescendAnswerPart } from "./types";

export type ToolOutcome = NonNullable<DescendAnswerPart["outcome"]>;

export const TOOL_OUTCOME_WORD: Record<ToolOutcome, string> = {
  ran: "ran",
  failed: "failed",
  stopped: "Stopped before it ran",
  no_record: "no record",
};

const CANDIDATE_STOPPED = "candidate_stopped";

export function isStoppedToolRow(
  row: { error_type?: string | null; metadata?: unknown } | null | undefined,
): boolean {
  if (!row) return false;
  if (row.error_type === CANDIDATE_STOPPED) return true;
  const meta = row.metadata;
  if (meta && typeof meta === "object" && !Array.isArray(meta)) {
    const d = (meta as Record<string, unknown>).mandate_candidate_disposition;
    if (d && typeof d === "object" && (d as Record<string, unknown>).disposition === "stopped") {
      return true;
    }
  }
  return false;
}
