// lib/stripe/server.ts
//
// Server-only Stripe client. Legitimate Next.js API-route surface (webhooks +
// checkout + portal) — the ONE place the app talks to Stripe. Never import this
// into client code.
//
// Keys: STRIPE_SECRET_KEY (secret) + STRIPE_WEBHOOK_SECRET (webhook signing).
// NOTE (2026-07-07): .env.local currently holds LIVE keys and no webhook secret.
// Checkout/webhook verification is UNTESTED pending Stripe TEST keys + a webhook
// secret from Arman — do not run these routes against live keys.

import Stripe from "stripe";

let cached: Stripe | null = null;

/** Lazily construct the Stripe client. Throws clearly if the key is missing. */
export function getStripe(): Stripe {
  if (cached) return cached;
  const key = process.env.STRIPE_SECRET_KEY?.trim();
  if (!key) {
    throw new Error(
      "STRIPE_SECRET_KEY is not configured. Add a test-mode key to .env.local.",
    );
  }
  // Omit apiVersion → the SDK uses the version it was built against, avoiding a
  // literal-type mismatch on upgrades.
  cached = new Stripe(key);
  return cached;
}

export function getWebhookSecret(): string {
  const secret = process.env.STRIPE_WEBHOOK_SECRET?.trim();
  if (!secret) {
    throw new Error(
      "STRIPE_WEBHOOK_SECRET is not configured. Get it from the Stripe CLI / dashboard.",
    );
  }
  return secret;
}

/** True when Stripe is configured enough to run checkout (secret key present). */
export function isStripeConfigured(): boolean {
  return Boolean(process.env.STRIPE_SECRET_KEY?.trim());
}
