/**
 * LIVE-MONEY GATE — do not remove; if a type error appears here after
 * sync-types, fix the READER, never delete the gate
 * (reviewed 2026-09-07, review row d6a2d36d).
 *
 * WHY THIS EXISTS: this demo opens a REAL Stripe Checkout. On 2026-09-07 an
 * independent reviewer driving it from `localhost:3001` was handed an actual
 * `cs_live_` session, under a screen asserting "test mode when pointed at
 * localhost". A page can never know that — the base-URL resolver follows the
 * admin server toggle, so a local page may be talking to production. Only the
 * backend can say whose money is at stake, so the backend is asked.
 *
 * `GET /lulu/payment-mode` (aidream `commerce_mode.py`) reports the derived Lulu
 * environment and Stripe mode and whether the two agree. The same commit refuses
 * mismatched pairings and refuses a live charge returning to localhost, before
 * any provider call. This surface adds the human-visible half: it badges exactly
 * what comes back and keeps `Order & pay` shut unless `pairing_ok` is true.
 *
 * FAIL CLOSED: `readPaymentMode` never throws and never guesses. Any answer that
 * is not a clean 200 — a backend that predates the endpoint, a network failure,
 * an auth refusal — resolves to `unavailable`, and unavailable keeps the button
 * shut. An unlabeled payment mode is exactly the state that let a live checkout
 * pass for a test one.
 *
 * HISTORY (read before "simplifying" this): the gate was deleted three times on
 * 2026-09-07 — f7a9e3c297, 2d90e58b23, 69e8b9ff7f. Twice the reason was the
 * contract: the route was not deployed, so `sync-types` regenerated
 * `types/python-generated` without it and the reader stopped compiling. aidream
 * has now DEPLOYED it (production `GET /lulu/payment-mode` answers, and both the
 * path and `PrintPaymentMode` are in the generated contract), so this reader is
 * bound to the contract like every other call in this folder — no raw lane, no
 * locally-declared shadow of the response shape. If it ever stops compiling
 * again, the backend was rolled back: fix the reader, and leave ordering shut
 * while you do.
 */

import { apiGet } from "@/lib/api/typed-client";
import type { components } from "@/types/python-generated/api-types";

export type PrintPaymentMode = components["schemas"]["PrintPaymentMode"];

export type PaymentModeProbe =
  | { status: "ok"; report: PrintPaymentMode }
  | { status: "unavailable"; reason: string };

export async function readPaymentMode(
  signal?: AbortSignal,
): Promise<PaymentModeProbe> {
  try {
    const { data } = await apiGet("/lulu/payment-mode", {
      signal,
      // This caller owns the outcome: an unanswered mode is rendered on screen
      // and closes the button, so it is not an unhandled system error.
      captureErrors: false,
    });
    return { status: "ok", report: data };
  } catch (error: unknown) {
    return {
      status: "unavailable",
      reason:
        error instanceof Error && error.message.length > 0
          ? error.message
          : "The backend did not report its payment mode.",
    };
  }
}

/**
 * THE GATE. Ordering is offered only when the backend has SAID what mode it is
 * in and its two money integrations agree. Unknown mode = closed door, never a
 * hopeful one.
 */
export function orderingAllowed(probe: PaymentModeProbe | null): boolean {
  return probe !== null && probe.status === "ok" && probe.report.pairing_ok;
}
