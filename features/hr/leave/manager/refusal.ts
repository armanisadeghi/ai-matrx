/**
 * features/hr/leave/manager/refusal.ts — the one place this lane splits a REFUSAL from a
 * FAILURE before handing either to `HrPageState`.
 *
 * 🚨 THEY ARE DIFFERENT STATES AND THEY MUST NOT LOOK ALIKE.
 * `HrPageState` evaluates `error` BEFORE `granted`, so passing an `HrDenied` as the error puts
 * "A leave ledger is only ever visible to the person and to those who hold their working
 * record" under a **Try again** button — inviting somebody to retry a thing that will refuse
 * them every time, forever. §4.2's no-access state renders the persona's nearest legitimate
 * surface instead, with ONE sentence and no retry.
 *
 * The sentence is still the SERVER'S. `HrPageState`'s `noAccessSentence` carries the door's own
 * `detail` through, so nothing is replaced with generic copy — a refusal must state what was
 * actually checked, and the door already did.
 *
 * 🚨 AND THE SENTENCE MUST NOT DISTINGUISH "not reachable" FROM "does not exist". The HR doors
 * deliberately refuse to tell those apart; this helper passes their wording straight through
 * and adds nothing, which is how that property survives the trip to the screen.
 */

import type { HrDenied, HrFailed } from "@/features/hr/types";

export interface HrPageRefusalProps {
  /** Only a genuine breakage. A refusal is never an error. */
  error: HrFailed | null;
  /** `false` on a refusal; `undefined` when there is nothing to gate. */
  granted: boolean | undefined;
  /** The door's own sentence, or `undefined` to let the shell use its generic one. */
  noAccessSentence: string | undefined;
}

export function hrPageRefusalProps(
  result: HrDenied | HrFailed | null,
): HrPageRefusalProps {
  if (result === null) {
    return { error: null, granted: undefined, noAccessSentence: undefined };
  }
  if (result.kind === "denied") {
    return {
      error: null,
      granted: false,
      noAccessSentence: result.detail?.trim() || undefined,
    };
  }
  return { error: result, granted: undefined, noAccessSentence: undefined };
}
