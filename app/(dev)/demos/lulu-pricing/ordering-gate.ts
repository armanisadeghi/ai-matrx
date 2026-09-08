/**
 * LIVE-MONEY GATE — do not remove (reviewed 2026-09-07, review row d6a2d36d).
 *
 * WHY THIS EXISTS: this demo opens a REAL Stripe Checkout. On 2026-09-07 an
 * independent reviewer driving it from `localhost:3001` was handed an actual
 * `cs_live_` session, under a screen asserting "test mode when pointed at
 * localhost". A page can never know that — the base-URL resolver follows the
 * admin server toggle, so a local page may be talking to production.
 *
 * The only thing that can answer "whose money is this?" is the backend, via
 * `GET /lulu/payment-mode` (aidream `commerce_mode.py`, commit 1c26399d0),
 * which also refuses mismatched pairings and live charges returning to
 * localhost. That commit IS NOT DEPLOYED: production returns 404 and the route
 * is absent from the generated contract.
 *
 * So this surface does the only honest thing available: it does not offer
 * ordering at all. No hostname guess, no probe of a route that is not in the
 * contract, no locally-declared shadow of a response shape the contract does
 * not carry. An unknowable payment mode is a closed door.
 *
 * THREE ATTEMPTS AT A LIVE PROBE WERE DELETED IN ONE EVENING (f7a9e3c297,
 * 2d90e58b23, 69e8b9ff7f) — twice for binding to a contract that does not have
 * the route. The disagreement was about HOW to read the backend, never about
 * whether ordering should be open. This version has nothing left to disagree
 * with: it reads nothing.
 *
 * HOW THIS RE-OPENS (do it in this order, do not shortcut it):
 *   1. aidream deploys 1c26399d0, so `GET /lulu/payment-mode` 200s in prod;
 *   2. `pnpm sync-types` brings the route into `types/python-generated`;
 *   3. the `satisfies` line below STOPS COMPILING — deliberately — which is
 *      how you find this file;
 *   4. read the mode through the TYPED client, badge what it says, and gate
 *      `Order & pay` on `pairing_ok === true`, fail-closed on any other answer.
 * Do not simply flip the constant. Ordering opens on a backend answer, never
 * on a build-time boolean.
 */

import type { paths } from "@/types/python-generated/api-types";

/** Does the LIVE generated contract carry the payment-mode route yet? */
type PaymentModeRouteInContract = "/lulu/payment-mode" extends keyof paths
  ? true
  : false;

/**
 * The tripwire. `false` today, and the day sync-types picks the route up this
 * becomes `false satisfies true` — a compile error pointing right at the
 * instructions above.
 */
const PAYMENT_MODE_ROUTE_IN_CONTRACT = false satisfies PaymentModeRouteInContract;

/**
 * THE GATE. `Order & pay` is disabled while this is false, no matter how
 * complete the form is.
 */
export const ORDERING_ALLOWED: boolean = PAYMENT_MODE_ROUTE_IN_CONTRACT;

/** What the screen says instead of pretending the button might work. */
export const ORDERING_OFF_MESSAGE =
  "Ordering is off — this backend cannot confirm which payment mode it is in. " +
  "The demo talks to whichever server the admin toggle names, so this page " +
  "cannot tell a test charge from a real one until the server's payment-mode " +
  "check is deployed. Nothing can be bought here until then.";
