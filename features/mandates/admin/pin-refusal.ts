/**
 * THE DEAD SELECT — the rule that replaced it, extracted so it can be held by
 * a test.
 *
 * WHAT HAPPENED (found live by Arman, 2026-08-31). He picked an agent in the
 * mandate pin editor and NOTHING HAPPENED. The editor treated the console's own
 * copy of the system-agent catalogue — a Redux-derived map that is EMPTY until
 * `fetchAgentsListFull()` lands, and that drops any agent it does not hold — as
 * a VETO on the selection:
 *
 *     const selectableAgentId =
 *       agentId && builtinAgentsById.has(agentId) ? agentId : null;
 *
 * An id the catalogue did not hold was nulled out, the trigger reverted to
 * "Select a system agent", and Save answered "Choose a system agent before
 * saving this mandate" — blaming the admin for a list that had not finished
 * loading. Every part of that is silent: no state changed on screen, and the
 * one message that did appear named the wrong cause.
 *
 * THE RULE. The dropdown is the authority on WHAT WAS PICKED; the catalogue
 * only DESCRIBES it. A pick is always reflected on screen, and a pick that
 * cannot be saved is refused IN WORDS, on the page, with its remedy named —
 * and the two states that cannot both be true (still loading vs genuinely not
 * a system agent) are never collapsed into one sentence.
 */

export interface PinRefusalInput {
  /** What the dropdown reported. Null = nothing picked yet. */
  agentId: string | null;
  /** Display name, when anything knows it. */
  pickedName: string | null;
  /** Has the system-agent catalogue arrived? (An empty map is the NORMAL
   * pre-load state, never evidence about the pick.) */
  catalogueLoaded: boolean;
  /** Does the loaded catalogue hold this pick? */
  pickedIsSystem: boolean;
}

/**
 * Why this pick cannot be saved, in words — or null when it can.
 *
 * Never returns a refusal for "nothing picked": that is not a refusal, it is
 * an empty form, and Save says so on its own.
 */
export function mandatePinRefusal({
  agentId,
  pickedName,
  catalogueLoaded,
  pickedIsSystem,
}: PinRefusalInput): string | null {
  if (!agentId) return null;
  if (pickedIsSystem) return null;
  if (!catalogueLoaded) {
    return "The system-agent catalogue has not loaded yet, so this pick cannot be checked. It resolves on its own in a moment — try Save again then.";
  }
  return `${pickedName ?? "That agent"} is not a system agent. A mandate's default runs for EVERY user, so its pin must be a system agent — use "Duplicate & customize" above to make a system twin of it, or pick a system agent here.`;
}
