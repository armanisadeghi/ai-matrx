// features/education/compliance/consent/verificationSync.ts
//
// SERVER-SIDE confirmation of a COPPA card-verification. Runs from the Stripe
// webhook (the ONE inbound sync) with the service_role admin client — the child
// (or the guardian in-browser) can NEVER self-verify; verification is confirmed
// here, server-side, only after Stripe reports a successful card transaction.
//
// Method: the guardian completes a $0.50 Checkout in MANUAL-CAPTURE mode (an
// authorization, not a charge). A successful auth proves an adult cardholder.
// We immediately VOID the authorization (cancel the PaymentIntent) so no money
// ever settles — the classic COPPA "monetary-transaction" verifiable method with
// zero cost. If Stripe auto-captured (belt-and-suspenders), we refund instead.
// Then we stamp the guardian_link verified via the service-only RPC.
//
// Kept in a SEPARATE file from creator-payout / subscription Stripe sync — this
// $0-auth consent flow is a distinct concern that only shares the Stripe client.

import type Stripe from "stripe";
import { createAdminClient } from "@/utils/supabase/adminClient";
import { getStripe } from "@/lib/stripe/server";

/** metadata.purpose value that routes a Checkout session to this handler. */
export const COPPA_VERIFICATION_PURPOSE = "coppa_verification";

/**
 * Confirm a COPPA card-verification from a completed Checkout session. Idempotent:
 * re-marking an already-verified link is harmless (the RPC just re-stamps), and
 * cancelling/refunding an already-settled PI is guarded by the PI status.
 *
 * Throws on a genuinely unexpected failure so the webhook returns 500 and Stripe
 * retries (the handler is safe to re-run).
 */
export async function confirmCoppaVerification(
  session: Stripe.Checkout.Session,
): Promise<void> {
  const linkId = session.metadata?.link_id;
  if (!linkId) {
    console.error(
      "[coppa/verify] LOUD: coppa_verification session with no link_id metadata — cannot confirm consent",
      { session: session.id },
    );
    return; // nothing actionable; do not 500-loop on a malformed session
  }

  const stripe = getStripe();
  const piId =
    typeof session.payment_intent === "string"
      ? session.payment_intent
      : session.payment_intent?.id;

  // Release the money: void the auth (manual capture) or refund (if captured).
  // A successful card transaction already occurred — that is what verifies the
  // adult cardholder — so consent is confirmed even if the void/refund hiccups.
  if (piId) {
    try {
      const pi = await stripe.paymentIntents.retrieve(piId);
      if (pi.status === "requires_capture") {
        await stripe.paymentIntents.cancel(piId); // void the hold, $0 settles
      } else if (pi.status === "succeeded") {
        await stripe.refunds.create({ payment_intent: piId }); // refund the $0.50
      }
    } catch (err) {
      // Do not block consent confirmation on a release failure — but scream, so a
      // stuck hold is visible (loud-recovery). Ops can void it manually.
      console.error(
        "[coppa/verify] LOUD: failed to void/refund the verification PaymentIntent — release it manually",
        { paymentIntent: piId, error: err },
      );
    }
  }

  // The ONLY verified-write path. service_role RPC — a child cannot reach it.
  const admin = createAdminClient();
  const { error } = await admin.rpc("guardian_confirm_verification", {
    p_link_id: linkId,
    p_method: "card",
    p_ref: piId ?? session.id,
  });
  if (error) {
    console.error("[coppa/verify] guardian_confirm_verification failed", {
      linkId,
      error,
    });
    throw new Error(`guardian_confirm_verification failed: ${error.message}`);
  }
}
