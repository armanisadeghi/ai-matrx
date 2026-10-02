/**
 * EXPECTED vs ACTUAL — every turn (common-docs context-delivery RULES.md §6).
 *
 * When the server's `context_receipt` arrives, it is compared with the rows
 * the request was BUILT from (what the screen showed when the person pressed
 * send). Any difference — a value the screen showed as sent that the server
 * dropped, a limit that did not hold, a saved rule the server did not read —
 * is never silent:
 *   - permanent: the composer's context chip turns amber with the count, the
 *     row shows both values, and a `context_truth_mismatch` error is captured
 *     (persisted by the diagnostics pipeline);
 *   - temporary (2026-09-30, removed after 14 days with zero mismatches):
 *     admins also get a toast and a console dump of the full diff.
 */

import type { AppDispatch, RootState } from "@host/lib/redux/store";
import {
  compareReceipt,
  type ContextReceipt,
  type ContextReceiptMismatch,
} from "@ai-matrx/agents/context";
import type { ContextReceiptData } from "@host/types/python-generated/stream-events";
import { setContextReceipt } from "../instance-context/instance-context.slice";
import { captureError } from "@host/lib/diagnostics/errorCaptureStore";
import { toast } from "@host/lib/toast";

/** Normalize the generated wire type (optional fields) to the package's receipt. */
export function toContextReceipt(data: ContextReceiptData): ContextReceipt {
  return {
    version: 1,
    surface: data.surface ?? null,
    cap: data.cap,
    model_reads_context: data.model_reads_context !== false,
    rules_error: data.rules_error ?? null,
    rows: (data.rows ?? []).map((row) => ({
      key: row.key,
      label: row.label,
      surface_key: row.surface_key,
      origin: row.origin,
      chars: row.chars ?? null,
      include: row.include,
      max_inline_chars: row.max_inline_chars,
      delivery: row.delivery,
      decided_by: row.decided_by,
      user_rule: row.user_rule
        ? {
            ...(typeof row.user_rule.include === "boolean"
              ? { include: row.user_rule.include }
              : {}),
            ...(typeof row.user_rule.max_inline_chars === "number"
              ? { max_inline_chars: row.user_rule.max_inline_chars }
              : {}),
          }
        : null,
      clamped: row.clamped ?? false,
      client_sent_excluded: row.client_sent_excluded ?? false,
      blocked_by: row.blocked_by ?? null,
      consumed_as: row.consumed_as ?? null,
      consumed_into: row.consumed_into ?? [],
    })),
  };
}

/** Store the receipt and run the expected-vs-actual check for this request. */
export function recordContextReceipt(
  dispatch: AppDispatch,
  getState: () => RootState,
  args: { conversationId: string; requestId: string; data: ContextReceiptData },
): void {
  const { conversationId, requestId, data } = args;
  const receipt = toContextReceipt(data);
  const expected = getState().instanceContext.expectedByConversationId?.[conversationId];

  let mismatches: ContextReceiptMismatch[] = [];
  // Whether this receipt was compared with what the screen showed. A turn this
  // client sent always records its rows first; a receipt with no rows of its own
  // (a run the server started, or a send path that skipped the record) is NOT
  // silently treated as a pass — it is stored as unchecked and, when this client
  // has sent before in the conversation, reported.
  const checked = Boolean(expected && expected.requestId === requestId);
  if (expected && !checked) {
    captureError({
      source: "context-truth",
      code: "context_truth_unchecked",
      message: "Context receipt arrived for a request with no recorded rows",
      details: `receipt request ${requestId}; last recorded ${expected.requestId}`,
      conversationId,
      requestId,
      level: "low",
    });
  }
  if (expected && checked) {
    // Every key is held to the receipt, the envelopes the server expands
    // included (`consumed_as: "expanded"`). A server that leaves one out lost
    // it: the skip that used to hide that hid a dialog the model never saw.
    mismatches = compareReceipt(expected.rows, receipt).mismatches;
    // A model that reads no context received none of it — that is the truth
    // the chip shows ("This model can't read context"), not a broken promise.
    if (!receipt.model_reads_context) {
      mismatches = mismatches.filter((m) => m.field !== "delivery");
    }
  }
  // A value the client sent although the person turned it off is a mismatch
  // even when nothing else differs: the request carried what it promised not to.
  for (const row of receipt.rows) {
    if (row.client_sent_excluded) {
      mismatches.push({ key: row.key, field: "include", expected: false, actual: "sent" });
    }
  }
  if (receipt.rules_error) {
    mismatches.push({ key: "*", field: "user_rule", expected: "read", actual: receipt.rules_error });
  }

  dispatch(
    setContextReceipt({
      conversationId,
      requestId,
      receipt: data,
      receivedAt: Date.now(),
      mismatches,
      checked,
    }),
  );

  if (mismatches.length === 0) return;

  // A value the server's post-render safety check stripped is the server
  // protecting the person's rules, not the screen lying: say so by name.
  const describe = (m: ContextReceiptMismatch) =>
    m.reason === "self_check"
      ? `${m.key}: removed by the server's safety check`
      : `${m.key}.${m.field}: expected ${JSON.stringify(m.expected)}, got ${JSON.stringify(m.actual)}`;
  const summary = mismatches.slice(0, 6).map(describe).join("; ");
  const allSafetyCheck = mismatches.every((m) => m.reason === "self_check");
  captureError({
    source: "context-truth",
    code: "context_truth_mismatch",
    message: allSafetyCheck
      ? `Removed by the server's safety check (${mismatches.length})`
      : `Context sent differently than shown (${mismatches.length})`,
    details: summary,
    raw: { mismatches, surface: receipt.surface },
    conversationId,
    requestId,
    level: "high",
  });

  // TEMPORARY (2026-09-30): admins see every mismatch at once.
  const auth = getState().userAuth;
  if (auth?.isAdmin && auth.adminLaneOpen) {
    console.error("[context-rules] receipt mismatch", { conversationId, requestId, mismatches, receipt });
    toast.warning(`Context mismatch: ${summary}`.slice(0, 140));
  }
}
