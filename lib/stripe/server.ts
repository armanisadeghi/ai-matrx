// lib/stripe/server.ts
//
// Server-only Stripe client. Legitimate Next.js API-route surface (webhooks +
// checkout + portal) — the ONE place the app talks to Stripe. Never import this
// into client code.
//
// Key resolution (test-safe by construction): TEST keys WIN when present. So a
// dev/preview env with STRIPE_TEST_MODE_SECRET_KEY set never touches the live
// account, even though STRIPE_SECRET_KEY (live) is also in .env.local.
//   secret:      STRIPE_TEST_MODE_SECRET_KEY  ?? STRIPE_SECRET_KEY
//   publishable: STRIPE_TEST_MODE_PUBLISHABLE_KEY ?? NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY
//   webhook:     STRIPE_WEBHOOK_SECRET (from `stripe listen` or the dashboard)
// Production sets only the live keys (no TEST_MODE vars) → live is used there.

import Stripe from "stripe";

let cached: Stripe | null = null;

function resolveSecretKey(): string | undefined {
  return (
    process.env.STRIPE_TEST_MODE_SECRET_KEY?.trim() ||
    process.env.STRIPE_SECRET_KEY?.trim()
  );
}

/** 'test' when a test key is active, else 'live'. Drives the guard + logging. */
export function stripeMode(): "test" | "live" {
  const key = resolveSecretKey();
  return key?.startsWith("sk_test_") ? "test" : "live";
}

/** Lazily construct the Stripe client. Throws clearly if the key is missing. */
export function getStripe(): Stripe {
  if (cached) return cached;
  const key = resolveSecretKey();
  if (!key) {
    throw new Error(
      "No Stripe secret key configured (STRIPE_TEST_MODE_SECRET_KEY or STRIPE_SECRET_KEY).",
    );
  }
  // Omit apiVersion → the SDK uses the version it was built against, avoiding a
  // literal-type mismatch on upgrades.
  cached = new Stripe(key);
  return cached;
}

/** Publishable key for the active mode (client-safe to expose). */
export function getPublishableKey(): string | undefined {
  return (
    process.env.STRIPE_TEST_MODE_PUBLISHABLE_KEY?.trim() ||
    process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY?.trim()
  );
}

export function getWebhookSecret(): string {
  const secret = process.env.STRIPE_WEBHOOK_SECRET?.trim();
  if (!secret) {
    throw new Error(
      "STRIPE_WEBHOOK_SECRET is not configured. Get it from `stripe listen` or the dashboard.",
    );
  }
  return secret;
}

/** True when Stripe is configured enough to run checkout (a secret key exists). */
export function isStripeConfigured(): boolean {
  return Boolean(resolveSecretKey());
}
