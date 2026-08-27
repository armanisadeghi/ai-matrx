/**
 * features/hr/time/periods/workflowHealth.ts — the words for a row's attestation health.
 *
 * ═══════════════════════════════════════════════════════════════════════════════════════════════
 * 🚨 WHY THIS IS A SEPARATE, REACT-FREE MODULE.
 *
 * `hr.pay_period_employment.state = 'open'` means "undecided". It cannot say whether a timecard is
 * **waiting on a person** or whether its **flow is dead** — and both render as `open`. That is how a
 * stuck period looked "awaiting" for four review rounds while it could never be approved.
 *
 * The distinction is therefore a rule, not a rendering detail, and rules in this lane live where the
 * headless proof can assert them. (The same lesson `resolvePeriodRole` taught when an invented
 * capability token silently disabled every button: a rule inside a `.tsx` is a rule nobody can test
 * without a browser.)
 * ═══════════════════════════════════════════════════════════════════════════════════════════════
 *
 * NO CLIENT COMPUTES ANYTHING: every classification here is the server's; this only spells it.
 */

import type { PeriodWorkflowRow, RowHealth } from "./api/periodReads";

/** The label a person reads. Never the token. */
export const HEALTH_LABEL: Record<RowHealth, string> = {
  awaiting: "Awaiting decision",
  stuck: "Stuck",
  no_flow: "Not started",
  done: "Done",
};

/** One sentence about what this health MEANS for the period getting paid. */
export const HEALTH_MEANING: Record<RowHealth, string> = {
  awaiting:
    "Somebody has been asked and the flow is alive. This one is genuinely waiting on a person.",
  stuck:
    "The flow behind this timecard has failed. Waiting will not move it — it needs a human before this period can be approved.",
  no_flow:
    "No attestation has been started for this timecard. Nobody has been asked, so nobody is late.",
  done: "Decided. Nothing further is waiting on this row.",
};

/**
 * Failure classes in words.
 *
 * 🚨 `not_attested` is the engine's coming terminal for "the deadline passed and the employee never
 * attested". SPEC-TIME §7.1 is explicit that this is **never silently attested** — it closes as
 * not-attested and is FLAGGED TO THE MANAGER. Its wording is here already so that the moment the
 * engine starts emitting it, the surface says the right thing instead of printing a raw token.
 */
const FAILURE_WORDS: Record<string, string> = {
  approver_ineligible:
    "the person who should decide cannot — they are not eligible to act on this timecard",
  not_attested:
    "the attestation deadline passed without the employee attesting — this was never treated as agreed, and it is flagged for a manager",
  no_approver_resolved: "nobody could be resolved to decide this",
  approver_inactive: "the person who should decide is no longer active",
  subject_excluded: "the person who would decide is a party to this record and cannot act on it",
};

/**
 * 🚨 An unrecognised class is RENDERED, as itself, labelled as unrecognised. Swallowing it would
 * recreate the exact blindness this whole panel exists to remove — a failure nobody can see is the
 * same as a failure nobody recorded.
 */
export function failureWords(failureClass: string | null): string | null {
  if (!failureClass) return null;
  return (
    FAILURE_WORDS[failureClass] ??
    `the flow raised "${failureClass.replace(/_/g, " ")}", which this screen does not have wording for yet`
  );
}

/**
 * 🚨 The engine's not-attested terminal — flagged to a manager, never treated as agreement.
 * Checked on BOTH members because the engine is mid-build and has not settled which one carries it;
 * reading only one would mean the flag silently fails to appear.
 */
export function isManagerFlagged(
  row: Pick<PeriodWorkflowRow, "failureClass" | "instanceState">,
): boolean {
  return row.failureClass === "not_attested" || row.instanceState === "not_attested";
}

// ═══════════════════════════════════════════════════════════════════════════════════════════════
// U2 — the attestation OUTCOME, in words
// ═══════════════════════════════════════════════════════════════════════════════════════════════

/**
 * Why the subject could never act, in words. `no_login` is the live case: the employee has no
 * platform login, so the attestation step could never route to them at all.
 */
const UNABLE_WORDS: Record<string, string> = {
  no_login: "no way to act: no platform login",
  excluded_by_caller: "no way to act: they are excluded from deciding their own record here",
  terminated: "no way to act: the employment had ended",
  inactive: "no way to act: the employment was not active",
};

function unableWords(reason: string | null): string | null {
  if (!reason) return null;
  return UNABLE_WORDS[reason] ?? `no way to act: ${reason.replace(/_/g, " ")}`;
}

/**
 * 🚨 THE SENTENCE THAT REPLACES SUBTRACTION.
 *
 * An approved period used to render "Employee attested 0 / Manager approved 1" and leave a manager
 * to work out for themselves that pay was released on a timecard its subject never confirmed.
 * SPEC-TIME §7.1's ruling — a missed attestation *"auto-closes as not_attested and is flagged to
 * the manager. NEVER silently attested"* — is not in force if its outcome is invisible on the
 * screen where money is released.
 *
 * 🚨 THIS READS THE RECORD AND NEVER INFERS. It returns `null` unless the server actually said
 * `attestation_outcome`. It deliberately does NOT fall back to "attested_at is null, so they must
 * not have attested", and it must never be changed to: `counts.attested = 0` beside `approved = 1`
 * looks like proof and is not — those are CURRENT-state counts, so a row that attested and was
 * then approved has LEFT `attested` and ENTERED `approved`. On this screen the guess would be
 * about whether somebody confirmed the hours they were paid for.
 *
 * Where the server ships its own note, that note wins verbatim — one authority for the wording.
 */
export function attestationOutcomeSentence(
  row: Pick<
    PeriodWorkflowRow,
    "attestationOutcome" | "attestationNote" | "attestedAt" | "managerApprovedAt" | "unableReason"
  >,
): string | null {
  if (!row.attestationOutcome) return null;

  if (row.attestationOutcome !== "not_attested") {
    // A recognised, unremarkable outcome (e.g. `attested`). Nothing to warn about.
    return row.attestationNote;
  }

  const why = unableWords(row.unableReason);
  const approved = row.managerApprovedAt !== null;

  return (
    `Not attested — closed without the employee's confirmation` +
    (why ? ` (${why})` : "") +
    `;` +
    (approved
      ? " the manager approved the flagged timecard."
      : " no manager decision has been recorded on it yet.")
  );
}

/**
 * 🚨 True when money moved on hours the subject never confirmed. This is the combination §7.1
 * exists to make safe, and it is the one that must never be left to arithmetic.
 */
export function approvedWithoutAttestation(
  row: Pick<PeriodWorkflowRow, "attestationOutcome" | "attestedAt" | "managerApprovedAt">,
): boolean {
  return (
    row.attestationOutcome === "not_attested" &&
    row.attestedAt === null &&
    row.managerApprovedAt !== null
  );
}
