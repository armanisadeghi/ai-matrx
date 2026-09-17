/**
 * THE ONE ADAPTER over a Google approval RECEIPT — `receipt.state`.
 *
 * 🚨 THE FRONTEND USED TO IGNORE THIS FIELD ENTIRELY, and that was the worst
 * finding on the unit (round-2 hostile verification, common-docs
 * `/projects/google-native/VERIFY-U-P4-U-M1-R2.md` § A-iii). aidream's
 * `apply_google_approval` writes one of four states into the row's `result` and
 * returns the same object as the door's `receipt`:
 *
 * | `state`    | what actually happened                                    |
 * |---|---|
 * | `applying` | the claim landed and the write is IN FLIGHT right now      |
 * | `failed`   | the row was claimed and the change was NOT made (`error`)  |
 * | `applied`  | the change was made (`output`)                             |
 * | `rejected` | nothing was written anywhere                              |
 *
 * Reading only `status` + `applied_now`, the queue said, verbatim, *"had already
 * been approved, so nothing was done again — the change was made by that first
 * approval, not by this click"* over a receipt whose state was `failed`, and the
 * same sentence while an apply was still `applying`. A deep link to that row
 * answered "already decided". Nobody was ever told the change did not happen.
 *
 * So every reader of a receipt — the door's reply, and the `result` stored on a
 * still-pending row — comes through here, and the state is NARROWED, never
 * assumed: a shape this build cannot read is `unknown`, which every caller
 * reports as "the record does not say", never as success.
 *
 * SERVER CONTRACT (aidream lane B-8, in flight): a failed apply RETURNS THE ROW
 * TO `pending` carrying this same `failed` receipt, so the person can retry from
 * the queue. This module is written for that contract and for the pre-B-8 rows
 * that stayed `accepted` — the state decides either way, which is why the state
 * is what this reads.
 */

import type { Json } from "@/types/database.types";

export const APPROVAL_RECEIPT_KIND = "google_workspace_approval_receipt";

export type ApprovalReceiptState =
  | "applying"
  | "failed"
  | "applied"
  | "rejected"
  /** No receipt, or one written in a shape this build does not recognise. */
  | "unknown";

const STATES: readonly ApprovalReceiptState[] = [
  "applying",
  "failed",
  "applied",
  "rejected",
];

export interface ApprovalReceipt {
  state: ApprovalReceiptState;
  /** The refusal, verbatim from the server, when `state` is `failed`. */
  error: string | null;
  /** The action the door re-ran, when the receipt names it. */
  action: string | null;
}

function record(value: unknown): Record<string, unknown> | null {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function text(from: Record<string, unknown>, key: string): string | null {
  const value = from[key];
  return typeof value === "string" && value.length > 0 ? value : null;
}

/** Read a receipt — from the door's reply or from a row's stored `result`. */
export function readApprovalReceipt(
  value: Json | Record<string, unknown> | null | undefined,
): ApprovalReceipt {
  const row = record(value);
  if (!row) return { state: "unknown", error: null, action: null };
  const state = row.state;
  return {
    state:
      typeof state === "string" && STATES.includes(state as ApprovalReceiptState)
        ? (state as ApprovalReceiptState)
        : "unknown",
    error: text(row, "error"),
    action: text(row, "action"),
  };
}

/**
 * THE SENTENCE A PERSON READS when a claimed apply failed. It says the change
 * was NOT made, names the refusal when the server gave one, and says what to do
 * — because the row is theirs to retry or reject, and a screen that stops at
 * "something went wrong" is the dead end this queue exists to end.
 */
export function failedApplySentence(
  receipt: ApprovalReceipt,
  what?: string,
): string {
  const subject = what ? `"${what}": ` : "";
  const because = receipt.error
    ? ` ${receipt.error.replace(/\s+$/, "")}`
    : " The server did not say why.";
  return `${subject}The change was NOT made.${because} Try again, or reject it — nothing was retried automatically.`;
}

/** The sentence for a row whose apply is still running. No decision controls. */
export function applyingSentence(what?: string): string {
  const subject = what ? `"${what}" is` : "This is";
  return `${subject} being applied now — an approval already in progress is making the change. Nothing new was done by this click; reload in a moment to see what happened.`;
}
