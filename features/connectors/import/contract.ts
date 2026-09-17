/**
 * features/connectors/import/contract.ts
 *
 * 🚨 THE ONE ADAPTER BETWEEN THE `/google-import/*` PAYLOADS AND THE PANELS,
 * WITH A RUNTIME CHECK AT THE SEAM.
 *
 * The generated contract (`types/python-generated/api-types.ts`) does not carry
 * these paths yet — `pnpm sync-types` needs a session with DB env — so the
 * panels run on the `*Pending` stand-ins in `./types.ts`. That is survivable;
 * what is NOT survivable is a panel that renders a BLANK where the server sent a
 * state the stand-in never heard of. On 2026-09-17 the server (aidream
 * `services/google_import/**`) grew `unrecorded`, `choice_required`,
 * `explanation`, `match_state`, `candidates` and `unrecorded_fields`, and a
 * label table keyed on the old union would have rendered `undefined` for two of
 * the states a person most needs to read.
 *
 * So every value that steers COPY passes through here:
 *   * the action set is declared once, mirrored from the server's own
 *     `FieldAction` literal, and a guard test compares the two checkouts;
 *   * an action this build does not know is NOT dropped and NOT rendered blank —
 *     it comes back as `unknown` and the panel says plainly that the server
 *     described the field in a way this screen does not know yet, while still
 *     showing the server's own sentence, which is always true.
 *
 * Pure: no React, no network.
 */

import type {
  ContactFieldActionPending,
  ContactFieldPlanPending,
  ContactMatchStatePending,
} from "./types";

/**
 * Every action the server's `ContactFieldPlan.action` can hold, in the server's
 * own order (aidream `services/google_import/contacts.py`, `FieldAction`).
 * `./field-labels.test.ts` compares this list against that file when the sibling
 * checkout is present — a state the server adds cannot silently render blank.
 */
export const CONTACT_FIELD_ACTIONS = [
  "create",
  "fill",
  "unchanged",
  "kept_manual",
  "unrecorded",
  "choice_required",
  "added",
  "present",
  "excluded",
] as const satisfies readonly ContactFieldActionPending[];

/** Every match state the resolver can report for a Google contact. */
export const CONTACT_MATCH_STATES = [
  "new",
  "imported",
  "matched",
  "choice_required",
] as const satisfies readonly ContactMatchStatePending[];

/** What a caller gets for an action: one we know, or an honest `unknown`. */
export type KnownContactFieldAction = ContactFieldActionPending | "unknown";

export function narrowContactFieldAction(
  value: unknown,
): KnownContactFieldAction {
  return typeof value === "string" &&
    (CONTACT_FIELD_ACTIONS as readonly string[]).includes(value)
    ? (value as ContactFieldActionPending)
    : "unknown";
}

export function narrowContactMatchState(
  value: unknown,
): ContactMatchStatePending | "unknown" {
  return typeof value === "string" &&
    (CONTACT_MATCH_STATES as readonly string[]).includes(value)
    ? (value as ContactMatchStatePending)
    : "unknown";
}

/** What the panel says when the server used a word this build does not know. */
export const UNKNOWN_ACTION_SENTENCE =
  "This screen does not know that outcome yet — read the sentence above, and tell us if it does not make sense.";

/** How the panel treats one field row, decided once. */
export interface ContactFieldDecision {
  action: KnownContactFieldAction;
  /** The server's own sentence for this row, when it sent one. */
  explanation: string | null;
  /** Ticked by default? LOCAL WINS: a value edited here starts unticked. */
  includeByDefault: boolean;
  /** Can the person change their mind about this row at all? */
  choosable: boolean;
  /** True when the default keeps what the Person already says. */
  localWins: boolean;
}

/**
 * The one decision about a field row.
 *
 * `kept_manual` is the only state that starts unticked while remaining fully
 * choosable — local wins by DEFAULT, not by force (a disabled checkbox meant a
 * person who wanted Google's value could not take it, VERIFY-B1-B2 B2).
 * `unrecorded` is offered ticked: nothing says the local value was ever chosen by
 * anyone, so Google's is not presumed wrong. `excluded` and `choice_required`
 * cannot be acted on here at all — the first because the server took it out of
 * the import, the second because nothing about the field is decided until the
 * Person ambiguity is resolved on the records themselves.
 */
export function decideContactField(
  plan: Pick<ContactFieldPlanPending, "action" | "explanation">,
): ContactFieldDecision {
  const action = narrowContactFieldAction(plan.action);
  const explanation = plan.explanation?.trim() ? plan.explanation : null;
  if (action === "excluded" || action === "choice_required") {
    return {
      action,
      explanation,
      includeByDefault: false,
      choosable: false,
      localWins: false,
    };
  }
  if (action === "kept_manual") {
    return {
      action,
      explanation,
      includeByDefault: false,
      choosable: true,
      localWins: true,
    };
  }
  return {
    action,
    explanation,
    includeByDefault: true,
    choosable: true,
    localWins: false,
  };
}
