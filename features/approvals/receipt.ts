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

/**
 * THE ONE READING OF A DECISION REPLY — used by ACCEPT AND REJECT ALIKE.
 *
 * 🚨 IT EXISTS BECAUSE THE TWO PATHS DISAGREED ABOUT THE SAME ROW. The accept
 * path was fixed to require `receipt.state === "applied"` before it would claim
 * a change was made; the reject path kept branching on the door's `status`
 * alone, so a reply of `accepted` printed, verbatim, *"had already been APPROVED
 * and the change was made, so it could not be rejected. Undo it where it
 * landed."* over a receipt this build could not read — and over one whose state
 * was never checked at all (Bugbot round 10, finding 2, frontend PR 228). One
 * person, two clicks, two opposite answers about whether their change happened.
 *
 * So the ladder lives HERE, once, and each path only says which decision it was
 * asking for. The receipt outranks the status on both: `failed` and `applying`
 * are the same answer whichever button was pressed, because they describe the
 * row, not the click.
 *
 * 🚨 AND THE SENTENCE IS THE SERVER'S WHENEVER THE SERVER SENT ONE (round-3
 * verification § A-N3). aidream sets `ApprovalDecisionResponse.sentence` on
 * every reply precisely so no screen has to infer what happened from a status
 * enum; this module derived its own regardless, which made TWO producers of one
 * event — and they had already drifted (§ A-N2). The BUCKET stays this build's
 * own reading, because the queue must know whether the click performed anything
 * to count it and a sentence cannot be counted; the WORDS are the server's. A
 * derived sentence is what a reply carrying none gets, and nothing else.
 */
export type DecisionBucket =
  /** The door did what this click asked. */
  | "performed"
  /** Nothing was performed: the row was already decided. */
  | "already"
  /** The change was NOT made, or the reply cannot be read as success. */
  | "failed";

export interface DecisionReading {
  bucket: DecisionBucket;
  /** The sentence a person reads; `null` only when the click performed it. */
  message: string | null;
}

export function readDecisionReply(question: {
  /** `ApprovalDecisionResponse.status` — `accepted`, `dismissed`, `pending`, … */
  status: string;
  /** `ApprovalDecisionResponse.applied_now`. */
  appliedNow: boolean;
  /** The reply's receipt, already through `readApprovalReceipt`. */
  receipt: ApprovalReceipt;
  /** Which button the person pressed. */
  decision: "accept" | "reject";
  /** The row's headline, for a sentence that names the thing. */
  what?: string;
  /**
   * `ApprovalDecisionResponse.sentence`, verbatim — the server's one sentence
   * about THIS call. Absent or blank means the reply carried none, and only
   * then is one derived below.
   */
  serverSentence?: string | null;
}): DecisionReading {
  const derived = deriveDecisionReply(question);
  if (derived.bucket === "performed") return derived;
  const server = question.serverSentence?.trim();
  if (!server) return derived;
  // The server's words, with the row named in front of them so a batch of five
  // replies stays attributable. The sentence itself is never rewritten.
  return {
    bucket: derived.bucket,
    message: question.what ? `"${question.what}": ${server}` : server,
  };
}

/**
 * THE BUCKET, and the sentence for a reply that carried none. Split out from
 * `readDecisionReply` so the server's sentence can replace the words WITHOUT
 * touching the reading of what happened — the queue counts the bucket, and a
 * sentence must never be able to turn a failed receipt into a success.
 */
function deriveDecisionReply({
  status,
  appliedNow,
  receipt,
  decision,
  what,
}: {
  status: string;
  appliedNow: boolean;
  receipt: ApprovalReceipt;
  decision: "accept" | "reject";
  what?: string;
}): DecisionReading {
  // THE RECEIPT OUTRANKS THE STATUS, and says the same thing on both paths.
  if (receipt.state === "failed") {
    return { bucket: "failed", message: failedApplySentence(receipt, what) };
  }
  if (receipt.state === "applying") {
    return { bucket: "already", message: applyingSentence(what) };
  }

  const subject = what ? `"${what}"` : "That proposal";

  if (decision === "accept") {
    if (status === "accepted" && appliedNow) {
      return { bucket: "performed", message: null };
    }
    if (status === "accepted") {
      return receipt.state === "applied"
        ? {
            bucket: "already",
            message: `${subject} had already been approved, so nothing was done again — the change was made by that first approval, not by this click.`,
          }
        : {
            // Approved, no receipt this build can read: the record does not say
            // whether the change was made, so neither does the screen.
            bucket: "already",
            message: `${subject} had already been approved and this click did nothing. The record does not say whether the change was actually made — open the row and check before approving it again.`,
          };
    }
    if (status === "dismissed") {
      return {
        bucket: "already",
        message: `${subject} had already been rejected, so it was NOT approved and the change was not made. Ask for it again if you want it.`,
      };
    }
    if (status === "pending") {
      // B-8 returns a failed apply to `pending`; a `pending` reply whose receipt
      // this build cannot read is still "nothing happened".
      return {
        bucket: "failed",
        message: `${subject} is still waiting on you — the change was NOT made and the server did not say why. Try again, or reject it.`,
      };
    }
    return {
      bucket: "failed",
      message: `${subject} came back as "${status}", which this screen cannot read as approved. Reload the queue to see where it stands; nothing here retried it.`,
    };
  }

  // REJECT, judged on `status` — never on `applied_now`, which answers "did
  // THIS CALL change the row's state" and not "did it do what you asked": it is
  // true for a fresh reject (aidream lane B-8) and false for an apply whose
  // write failed, so neither door can read success off it.
  if (status === "dismissed") return { bucket: "performed", message: null };
  if (status === "accepted") {
    return receipt.state === "applied"
      ? {
          bucket: "already",
          message: `${subject} had already been APPROVED and the change was made, so it could not be rejected. Undo it where it landed.`,
        }
      : {
          // The mirror of the accept path's unreadable case, and the finding
          // this adapter was written for: approved, but the record does not say
          // the change landed — so the screen does not say it either, and it
          // never sends a person hunting for something to undo.
          bucket: "already",
          message: `${subject} had already been approved, so it could not be rejected — and the record does not say whether the change was actually made. Open the row and check before assuming it landed.`,
        };
  }
  if (status === "pending") {
    return {
      bucket: "failed",
      message: `${subject} is still waiting on you — nothing was rejected and the server did not say why. Try again.`,
    };
  }
  return {
    bucket: "failed",
    message: `${subject} came back as "${status}", which this screen cannot read as rejected. Reload the queue to see where it stands.`,
  };
}
