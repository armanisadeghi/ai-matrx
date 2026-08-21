// lib/stripe/server.ts
//
// Server-only Stripe client. Legitimate Next.js API-route surface (webhooks +
// checkout + portal) — the ONE place the app talks to Stripe. Never import this
// into client code.
//
// Credential mode is selected by deployment identity, never key availability:
// confirmed Vercel production uses live keys; every other environment uses test.

import Stripe from "stripe";

let cached: Stripe | null = null;

export class StripeCredentialModeError extends Error {}

export function requiredStripeMode(): "test" | "live" {
  return process.env.VERCEL_ENV === "production" ? "live" : "test";
}

export function resolveSecretKeyOrRaise(): string {
  /** Missing test credentials used to fall through to the live account. Those
   * are different money ledgers, not equivalent credentials. Fix the exact
   * mode's setting or do not run Stripe in this environment. */
  const mode = requiredStripeMode();
  const setting = mode === "live" ? "STRIPE_SECRET_KEY" : "STRIPE_TEST_MODE_SECRET_KEY";
  const key = process.env[setting]?.trim();
  if (!key) throw new StripeCredentialModeError(
    `Stripe ${mode} mode was requested by VERCEL_ENV=${process.env.VERCEL_ENV || "unset"}, but ${setting} is missing. ` +
    `Set ${setting} for this environment, or leave Stripe unavailable; substituting the ${mode === "live" ? "test" : "live"} account is refused.`
  );
  return key;
}

/** 'test' when a test key is active, else 'live'. Drives the guard + logging. */
export function stripeMode(): "test" | "live" {
  return requiredStripeMode();
}

/** Lazily construct the Stripe client. Throws clearly if the key is missing. */
export function getStripe(): Stripe {
  if (cached) return cached;
  // 🚨 Do not restore `test || live`; the resolver owns account identity.
  const key = resolveSecretKeyOrRaise();
  // Omit apiVersion → the SDK uses the version it was built against, avoiding a
  // literal-type mismatch on upgrades.
  cached = new Stripe(key);
  return cached;
}

/** Publishable key for the active mode (client-safe to expose). */
export function getPublishableKey(): string | undefined {
  const mode = requiredStripeMode();
  return process.env[mode === "live" ? "NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY" : "STRIPE_TEST_MODE_PUBLISHABLE_KEY"]?.trim();
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
  try { resolveSecretKeyOrRaise(); return true; } catch { return false; }
}
