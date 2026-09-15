/**
 * Filing a launched run under its Home picks — WHEN a failure is worth retrying.
 *
 * 🚨 WHAT THE SERVER ACTUALLY SAYS, measured against production on 2026-09-15
 * as `test@test.com` (read-only: every call below was designed to fail, inside
 * a transaction that was rolled back):
 *
 *   the conversation row does not exist YET (the transient window)
 *     → SQLSTATE 42501, "assoc_add: editor access to both endpoints is
 *       required for an access-conveying edge"
 *   the conversation belongs to another account (permanent)
 *     → SQLSTATE 42501, "assoc_add: editor access to both endpoints is
 *       required for an access-conveying edge"
 *
 * BYTE-IDENTICAL. `public.assoc_add` raises 42501 for every access refusal it
 * makes (seven `raise … using errcode = '42501'` sites), and
 * `@ai-matrx/associations` maps 42501 to `forbidden_org` / "Permission
 * denied". So the failure carries NO information that separates "too early"
 * from "never".
 *
 * WHAT THE OLD RULE ACTUALLY DID, which is worse than it looked. It sniffed
 * the strings "access" / "not authorized" / "not found" out of the message the
 * service returns — and for the case it was written for that message is
 * "Permission denied", which contains none of them. So the race it existed to
 * survive was never retried once, while `not_found` ("Not found", a permanent
 * miss) and any unmapped pg sentence carrying the word "access" (the 23514
 * raises above) were retried four times for nothing. A rule read off prose
 * fails in both directions at the same time.
 *
 * THE FIX IS TO STOP ASKING THE ERROR AND ASK THE CAUSE. The transient window
 * is one specific thing: turn 1 creates the conversation row, and the edge is
 * written immediately after, so the row can still be unreadable to this
 * caller for a moment. That is observable — read the row. A refusal while the
 * row is not yet readable is the race and is worth another attempt; the SAME
 * refusal once the row IS readable is about the target or the pair, and no
 * number of retries will change it.
 *
 * Every other code the service can answer with (`invalid_argument`,
 * `not_found`, `unauthorized`, `conflict_in_use`, `version_conflict`,
 * `quota_exceeded`, `demanded_schema_violation`, `internal`) is permanent for
 * this loop by construction, and a thrown value with no code at all is not
 * evidence of a race either.
 */

import type { ServerRefusal } from "@/features/access-gate/service/serverRefusal";

/**
 * The ONE code `assoc_add`'s access refusals arrive as — the mapping lives in
 * `@ai-matrx/associations` (`42501` → `forbidden_org`). It is the only code
 * whose cause can be a timing race rather than a verdict.
 */
export const ASSOC_ACCESS_REFUSAL_CODE = "forbidden_org";

export type HomeAttachDecision = "retry" | "stop";

/**
 * Retry, or report?
 *
 * @param refusal what the server answered, read through the ONE refusal reader
 * @param conversationIsReadable whether the run's conversation row can be read
 *        by this caller yet — the transient cause, observed rather than guessed
 */
export function decideHomeAttachRetry(
  refusal: ServerRefusal | null,
  conversationIsReadable: boolean,
): HomeAttachDecision {
  // No code at all (a thrown TypeError, an aborted fetch): nothing here says
  // "too early", and a retry loop over an unknown failure is noise.
  if (!refusal?.code) return "stop";
  if (refusal.code !== ASSOC_ACCESS_REFUSAL_CODE) return "stop";
  // The refusal that CAN be a race — but only while the race is real.
  return conversationIsReadable ? "stop" : "retry";
}
