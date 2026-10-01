/**
 * THE ON-SCREEN WRITE GUARD, AS THE PERSON SEES IT.
 *
 * aidream's `matrx_ai/tools/on_screen_write_guard.py` refuses a direct write
 * to a record that is open on the person's screen (`record_on_screen`) or one
 * whose change they just declined (`person_declined_this_change`). The tool
 * error it returns is written FOR THE MODEL — it names the record id and the
 * tools to use instead — and it stays exactly that in the tool result.
 *
 * On screen the refusal is the intended path working, not a failure: the
 * change goes through the open record so the person confirms it. So the card
 * shows a quiet state line plus a one-sentence tooltip — never "failed", never
 * an id, never a tool name. The full model-facing message stays in the
 * Details overlay.
 *
 * The two `error_type` strings are the server's constants
 * (`ON_SCREEN_ERROR_TYPE`, `DECLINED_ERROR_TYPE`); keep them in lockstep.
 */

import type { ToolLifecycleEntry } from "@/features/agents/types/request.types";

export const ON_SCREEN_ERROR_TYPE = "record_on_screen";
export const DECLINED_ERROR_TYPE = "person_declined_this_change";

export interface GuardRouting {
  /** The state line (≤60 chars). */
  label: string;
  /** One sentence for the tooltip (≤140 chars). */
  tooltip: string;
  /** Which guard answered. */
  reason: "on_screen" | "declined";
}

/** The record's noun from the guard's sentence ("this note (…)"), else "record". */
function recordNoun(message: string | null | undefined): string {
  const match = /\bthis ([a-z][a-z _-]{0,30}?) \(/i.exec(message ?? "");
  const noun = match?.[1]?.replace(/[_-]+/g, " ").trim().toLowerCase();
  return noun || "record";
}

/** The person-facing presentation of a guard refusal, or null for any other error. */
export function guardRoutingOf(
  entry: Pick<ToolLifecycleEntry, "errorType" | "errorMessage"> | null | undefined,
): GuardRouting | null {
  const type = (entry?.errorType ?? "").trim().toLowerCase();
  if (type === ON_SCREEN_ERROR_TYPE) {
    const noun = recordNoun(entry?.errorMessage);
    return {
      reason: "on_screen",
      label: `Change routed to the open ${noun}`,
      tooltip: `This ${noun} is open on your screen, so the change comes to you to confirm.`,
    };
  }
  if (type === DECLINED_ERROR_TYPE) {
    const noun = recordNoun(entry?.errorMessage);
    return {
      reason: "declined",
      label: `Kept the ${noun} as you left it`,
      tooltip: `You declined this change, so the ${noun} was not touched.`,
    };
  }
  return null;
}
