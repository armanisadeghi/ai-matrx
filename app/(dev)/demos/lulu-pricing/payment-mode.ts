/**
 * LIVE-MONEY GATE — do not remove; if a type error appears here after
 * sync-types, fix the READER, never delete the gate
 * (reviewed 2026-09-07, review row d6a2d36d).
 *
 * WHAT THIS IS: the backend's own answer to "whose money is this?" — read from
 * GET /lulu/payment-mode (aidream commit 1c26399d0). This surface must never
 * infer the mode from its own hostname: the app's base-URL resolver follows the
 * admin server toggle, so a page served from localhost can be talking to
 * production. On 2026-09-07 that is exactly how a reviewer was handed a real
 * `cs_live_` Stripe session under a screen that claimed "test mode".
 *
 * WHY IT IS SHAPED LIKE THIS (the reason the first attempt got deleted):
 * commit f57438c08c read this route through the contract-bound typed client and
 * the generated `PrintPaymentMode` type. The route is not in the LIVE contract
 * yet (aidream has not deployed 1c26399d0), so the next `pnpm sync-types`
 * regenerated `types/python-generated/*` without it, the typed usage stopped
 * compiling, and a concurrent session "fixed" the build by deleting the whole
 * gate (f7a9e3c297, 127 lines) — a live-money guard removed to make a type
 * error go away.
 *
 * So this reader binds to NOTHING that sync-types can regenerate:
 *   • the raw lane (`getJson` from `@/lib/python-client`) — the documented
 *     exception in lib/api/FEATURE.md for "endpoints absent from `paths`
 *     (nothing to bind to)"; the typed client's path parameter is
 *     `keyof paths`, so it cannot even express this route today;
 *   • a NARROW LOCAL type validated out of `unknown` — never the generated
 *     `PrintPaymentMode`.
 * Typed-client conversion only after aidream ships /lulu/payment-mode to prod
 * and sync-types picks it up.
 *
 * FAIL CLOSED: this function never throws and never guesses. Anything short of
 * a well-formed answer (404 from a backend that predates the endpoint, network
 * failure, garbage payload) resolves to `unavailable`, and an unavailable mode
 * keeps the order button shut.
 */

import { getJson } from "@/lib/python-client";

/** The backend's derived print/payment lane. Narrow, local, hand-validated. */
export interface PaymentModeReport {
  /** Derived from LULU_API_BASE — "live" | "test" | "unconfigured" | "unknown". */
  luluEnvironment: string;
  /** The Lulu base URL in use. Not a secret. */
  luluApiBase: string;
  /** Derived from the Stripe key prefix. The key itself never leaves the server. */
  paymentMode: string;
  /** True only when both providers are configured and in the SAME mode. */
  pairingOk: boolean;
  /** True when a completed checkout would move real money and print a real book. */
  chargesRealMoney: boolean;
  /** One human sentence naming the mode and, when refused, the remedy. */
  message: string;
}

export type PaymentModeProbe =
  | { status: "ok"; report: PaymentModeReport }
  | { status: "unavailable"; reason: string };

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function str(value: unknown): string | null {
  return typeof value === "string" && value.length > 0 ? value : null;
}

/**
 * Validate the payload field by field. A missing or wrong-typed field is an
 * unusable answer, not a defaultable one — defaults are how an unknown mode
 * becomes an optimistic one.
 */
export function readPaymentModeReport(payload: unknown): PaymentModeReport | null {
  if (!isRecord(payload)) return null;
  const luluEnvironment = str(payload.lulu_environment);
  const luluApiBase = str(payload.lulu_api_base);
  const paymentMode = str(payload.payment_mode);
  const message = str(payload.message);
  if (
    luluEnvironment === null ||
    luluApiBase === null ||
    paymentMode === null ||
    message === null ||
    typeof payload.pairing_ok !== "boolean" ||
    typeof payload.charges_real_money !== "boolean"
  ) {
    return null;
  }
  return {
    luluEnvironment,
    luluApiBase,
    paymentMode,
    pairingOk: payload.pairing_ok,
    chargesRealMoney: payload.charges_real_money,
    message,
  };
}

export async function probePaymentMode(
  signal?: AbortSignal,
): Promise<PaymentModeProbe> {
  try {
    const { data } = await getJson<unknown>("/lulu/payment-mode", {
      signal,
      // This caller owns the outcome: an unanswered mode is rendered on the
      // screen and closes the button, so it is not an unhandled system error.
      captureErrors: false,
    });
    const report = readPaymentModeReport(data);
    if (report === null) {
      return {
        status: "unavailable",
        reason: "The backend's payment-mode answer was not in the expected shape.",
      };
    }
    return { status: "ok", report };
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
 * THE GATE ITSELF. Ordering is offered only when the backend has SAID what mode
 * it is in and its two money integrations agree. Unknown mode = closed door.
 */
export function orderingAllowed(probe: PaymentModeProbe | null): boolean {
  return probe !== null && probe.status === "ok" && probe.report.pairingOk;
}
