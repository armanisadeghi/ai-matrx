/**
 * LIVE-MONEY VISIBILITY — the server decides via knobs; this surface only
 * reports honestly; never delete the badge.
 *
 * WHY THIS EXISTS: this flow opens a REAL Stripe Checkout. On 2026-09-07 an
 * independent reviewer driving it from `localhost:3001` was handed an actual
 * `cs_live_` session, under a screen asserting "test mode when pointed at
 * localhost". A page can never know that — the base-URL resolver follows the
 * admin server toggle, so a local page may be talking to production. Only the
 * backend can say whose money is at stake, so the backend is asked.
 *
 * WHAT CHANGED ON 2026-09-11 (Arman's ruling): "I don't want us to keep putting
 * these live money gates up. Instead I'd rather have settings and
 * configurations that do it… The key is to scare me by showing how much money
 * we spent so far today, not by putting blocks in the code." The two refusals
 * that used to be hard-coded in aidream are now org-configurable knobs:
 *
 *   commerce.print_orders.require_mode_pairing            (default true)
 *   commerce.print_orders.allow_dev_origin_live_charges   (default false)
 *
 * So this file is no longer a gate of its own. `GET /lulu/payment-mode`
 * (aidream `commerce_mode.py`) reports the derived Lulu environment, the Stripe
 * mode, whether the two agree, BOTH knob values as they resolve for the
 * caller's organization, the server's own `ordering_allowed` answer, and a
 * plain-words `settings_note`. This surface renders that verbatim and follows
 * the server's answer for the button. It asserts nothing of its own — asserting
 * a mode it could not know is exactly what went wrong on 2026-09-07.
 *
 * FAIL CLOSED, AND SAY SO: `readPaymentMode` never throws and never guesses.
 * Any answer that is not a clean 200 — a backend that predates the endpoint, a
 * network failure, an auth refusal, a `commerce_knob_missing` 503 — resolves to
 * `unavailable`, and unavailable keeps the button shut with the reason on
 * screen. An unlabeled payment mode is exactly the state that let a live
 * checkout pass for a test one. A knob the server cannot read is never quietly
 * defaulted here either: that is the server's 503, rendered as words.
 *
 * HISTORY (read before "simplifying" this): the badge was deleted three times on
 * 2026-09-07 — f7a9e3c297, 2d90e58b23, 69e8b9ff7f. Twice the reason was the
 * contract: the route was not deployed, so `sync-types` regenerated
 * `types/python-generated` without it and the reader stopped compiling. aidream
 * has DEPLOYED it, so this reader is bound to the contract like every other call
 * in this folder — no raw lane, no locally-declared shadow of the response
 * shape. If it ever stops compiling again, the backend was rolled back: fix the
 * reader, and leave ordering shut while you do.
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
 * Kept in step with aidream `commerce_mode.DEV_ORIGIN_HOSTS`. Knowing this page
 * runs on a developer machine says NOTHING about whose money is at stake — the
 * backend answers that — but it IS the half the browser knows and the server
 * cannot see until the order is submitted, so the surface can predict the
 * server's dev-origin answer instead of letting the buyer discover it as a 409
 * after filling in the whole form.
 */
const DEV_ORIGIN_HOSTS = new Set(["localhost", "127.0.0.1", "::1", "0.0.0.0"]);

export function isDevOriginSurface(): boolean {
  if (typeof window === "undefined") return false;
  return DEV_ORIGIN_HOSTS.has(window.location.hostname);
}

/**
 * THE SERVER'S ANSWER, not this file's opinion. Ordering is offered only when
 * the backend has SAID what mode it is in and its settings permit this request.
 * Unknown mode = closed door, never a hopeful one.
 *
 * Two halves, both the server's:
 *   - `ordering_allowed` — what the `require_mode_pairing` setting decided.
 *   - `allow_dev_origin_live_charges` — applied here because only the browser
 *     knows it is the dev origin the server would refuse.
 */
export function orderingAllowed(
  probe: PaymentModeProbe | null,
  devOrigin: boolean = isDevOriginSurface(),
): boolean {
  if (probe === null || probe.status !== "ok") return false;
  const { report } = probe;
  if (!report.ordering_allowed) return false;
  if (
    devOrigin &&
    report.payment_mode === "live" &&
    !report.allow_dev_origin_live_charges
  ) {
    return false;
  }
  return true;
}

/**
 * The one sentence that explains a shut door in plain words, or null when the
 * door is open. A control is absent or honest — never dead or disabled-looking
 * with no reason beside it.
 */
export function orderingBlockedReason(
  probe: PaymentModeProbe | null,
  devOrigin: boolean = isDevOriginSurface(),
): string | null {
  if (probe === null) return "Checking which payment mode this backend is in…";
  if (probe.status === "unavailable") {
    return `Ordering is off — could not confirm payment mode. ${probe.reason}`;
  }
  const { report } = probe;
  if (
    devOrigin &&
    report.payment_mode === "live" &&
    !report.allow_dev_origin_live_charges
  ) {
    return (
      "Ordering is off — this page is running on a development address and this " +
      "backend charges live money. Dev-origin orders: blocked by setting — " +
      "change it under Organization settings → Configuration (Commerce)."
    );
  }
  if (!report.ordering_allowed) return `Ordering is off — ${report.message}`;
  return null;
}
