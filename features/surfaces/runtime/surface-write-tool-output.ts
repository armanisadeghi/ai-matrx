/**
 * features/surfaces/runtime/surface-write-tool-output.ts
 *
 * THE ONE ANSWER A MODEL GETS FOR A SURFACE WRITE — the tool output (and the
 * error message, when there is one) built from a `SurfaceWriteResult`. Every
 * agent path into the writeback seam formats its result here, so a write made
 * through `apply_surface_write` on a page and one made through
 * `board_item_act` on a board tile read identically:
 *
 *  - applied        → `{ ok: true, status: "applied_now", surface_name,
 *    target, mode, message, change?, result? }` — the message states what
 *    landed and ends with `surfaceWriteReceiptSentence`, so the model never
 *    reads its own effect in the refreshed page values as "already there";
 *  - user declined  → `{ ok: false, declined: true, message }`, NOT an error
 *    (an error result would invite retrying the write the user refused);
 *  - nothing open can apply it → error, `reason: "surface_not_available"`;
 *  - refused/failed → error, `reason` + `stage` + ONE self-contained sentence
 *    (`surfaceWriteFailureSentence`), identical in `message` and the error.
 */

import type { SurfaceWriteChange, SurfaceWriteResult } from "./surface-writeback";

/**
 * The sentence the model reads when a write did not land. It always says
 * whether the person was asked, whether they approved, what the page said,
 * that nothing (or not all of it) was written, and what to do next.
 */
export function surfaceWriteFailureSentence(
  target: string,
  result: { error: string; phase?: "before_approval" | "apply"; refused?: true },
  approvedByUser: boolean,
): string {
  const reason = result.error.trim().replace(/[.\s]*$/, ".");
  // The page's own message may already end with the same assurance (the
  // collectProblems format does); say it once.
  const saysNothingChanged = /Nothing was changed\.$/.test(reason);
  const nothingChanged = saysNothingChanged ? "" : "Nothing was changed. ";
  if (result.phase === "before_approval") {
    return (
      `apply_surface_write("${target}") was refused before the user was asked: ${reason} ` +
      `${nothingChanged}Correct the value and call apply_surface_write again.`
    );
  }
  if (approvedByUser) {
    return (
      `The user approved the "${target}" write, but the page could not apply it: ${reason} ` +
      `The write did not complete. Tell the user what went wrong; if the value was the problem, ` +
      `correct it and call apply_surface_write again (the user will be asked again).`
    );
  }
  return (
    `apply_surface_write("${target}") did not complete: ${reason} ` +
    `${nothingChanged}Tell the user, or correct the value and call apply_surface_write again.`
  );
}

/**
 * The sentence every successful write ends with, so the model can never read
 * its own effect as a value that was already there (2026-09-27: three HR
 * employer writes landed once each, and the agent told the person the rows
 * "already existed" — because the page values it was handed next were re-read
 * AFTER the write and nothing said so).
 */
export function surfaceWriteReceiptSentence(
  change: SurfaceWriteChange | undefined,
): string {
  if (change?.sameAsBefore) {
    return (
      `The page already held exactly this value before this call, so the save re-applied it ` +
      `and nothing visible changed — tell the user it was already set.`
    );
  }
  const before =
    change?.before !== undefined && change.pageValue
      ? ` Before this call "${change.pageValue}" was: ${change.before}.`
      : "";
  return (
    `This call made this change just now${change ? ` (${change.appliedAt})` : ""}; it did not exist before this call.${before} ` +
    `Page values you receive after this result were re-read after the write, so they already include it — ` +
    `that is this write's effect, not an earlier value. Tell the user you made the change; do not write it again.`
  );
}

export interface SurfaceWriteToolOutput {
  output: Record<string, unknown>;
  /** Set when the result is an error result for the model. */
  errorMessage?: string;
}

/** Format one `SurfaceWriteResult` as the model's tool output. */
export function surfaceWriteToolOutput(
  target: string,
  result: SurfaceWriteResult,
  approvedByUser: boolean,
): SurfaceWriteToolOutput {
  if (result.ok) {
    const label = result.target.label;
    const base =
      result.target.mode === "draft"
        ? `"${label}" staged into the page's draft — the user still reviews and saves.`
        : result.target.mode === "entity"
          ? `"${label}" applied and saved.`
          : `"${label}" applied.`;
    const change = result.change;
    return {
      output: {
        ok: true,
        // THE WRITE RECEIPT, unmistakable: this call made the change now.
        status: "applied_now",
        ...(change ? { applied_at: change.appliedAt } : {}),
        surface_name: result.surfaceName,
        target: result.target.name,
        mode: result.target.mode,
        message: [base, result.outcome?.summary, surfaceWriteReceiptSentence(change)]
          .filter(Boolean)
          .join(" "),
        ...(change
          ? {
              change: {
                ...(change.pageValue ? { page_value: change.pageValue } : {}),
                ...(change.before !== undefined ? { before: change.before } : {}),
                written: change.written,
                ...(change.sameAsBefore ? { same_as_before: true } : {}),
              },
            }
          : {}),
        // WHAT LANDED (ids, names) as the page reported it — the page's list
        // may not show the new rows yet if you re-read it immediately, so
        // trust this over an immediate re-read and do not retry the write.
        ...(result.outcome?.data !== undefined ? { result: result.outcome.data } : {}),
      },
    };
  }

  if (result.declined) {
    // The user answered "keep as is". Deliberately NOT an error result.
    const message =
      `${result.error} Nothing was changed. Do not retry the same write` +
      (result.instructions
        ? " — follow the user's instructions below instead."
        : " unless the user asks for it.");
    return {
      output: {
        ok: false,
        declined: true,
        message,
        ...(result.instructions ? { instructions: result.instructions } : {}),
      },
    };
  }

  if (result.unapplicable) {
    // NOTHING OPEN CAN APPLY IT (wall W49): the model gets the same sentence
    // the screen showed, under its own reason code, so it reports that the
    // write did not happen instead of narrating a success.
    return {
      output: { ok: false, reason: "surface_not_available", message: result.error },
      errorMessage: result.error,
    };
  }

  const message = surfaceWriteFailureSentence(target, result, approvedByUser);
  return {
    output: {
      ok: false,
      reason:
        result.phase === "before_approval" ? "surface_write_refused" : "surface_write_failed",
      stage:
        result.phase === "before_approval"
          ? "before_approval"
          : approvedByUser
            ? "after_approval"
            : result.phase === "apply"
              ? "apply"
              : "not_applied",
      ...(approvedByUser ? { user_approved: true } : {}),
      message,
    },
    errorMessage: message,
  };
}
