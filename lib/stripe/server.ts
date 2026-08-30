// lib/stripe/server.ts
//
// Server-only Stripe client. Legitimate Next.js API-route surface (webhooks +
// checkout + portal) — the ONE place the app talks to Stripe. Never import this
// into client code.
//
// Credential mode is selected by deployment identity, never key availability:
// confirmed Vercel production uses live keys; every other environment uses test.
// The production webhook is the deliberate exception: Stripe sends both live
// and test endpoint deliveries to the same URL, so verification pins each
// signature secret to the event's `livemode` value before exposing the event.

import Stripe from "stripe";

export type StripeMode = "test" | "live";

interface CachedStripeClient {
  key: string;
  client: Stripe;
}

export interface VerifiedStripeWebhook {
  event: Stripe.Event;
  mode: StripeMode;
  stripe: Stripe;
}

const cached: Partial<Record<StripeMode, CachedStripeClient>> = {};

export class StripeCredentialModeError extends Error {}
export class StripeWebhookVerificationError extends Error {}

export function requiredStripeMode(): StripeMode {
  return process.env.VERCEL_ENV === "production" ? "live" : "test";
}

export function resolveSecretKeyOrRaise(
  mode: StripeMode = requiredStripeMode(),
): string {
  /** Missing test credentials used to fall through to the live account. Those
   * are different money ledgers, not equivalent credentials. Fix the exact
   * mode's setting or do not run Stripe in this environment. */
  const setting = mode === "live" ? "STRIPE_SECRET_KEY" : "STRIPE_TEST_MODE_SECRET_KEY";
  const key = process.env[setting]?.trim();
  if (!key) throw new StripeCredentialModeError(
    `Stripe ${mode} mode was requested by VERCEL_ENV=${process.env.VERCEL_ENV || "unset"}, but ${setting} is missing. ` +
    `Set ${setting} for this environment, or leave Stripe unavailable; substituting the ${mode === "live" ? "test" : "live"} account is refused.`
  );
  return key;
}

/** 'test' when a test key is active, else 'live'. Drives the guard + logging. */
export function stripeMode(): StripeMode {
  return requiredStripeMode();
}

/** Lazily construct the Stripe client. Throws clearly if the key is missing. */
export function getStripe(mode: StripeMode = requiredStripeMode()): Stripe {
  // 🚨 Do not restore `test || live`; the resolver owns account identity.
  const key = resolveSecretKeyOrRaise(mode);
  if (cached[mode]?.key === key) return cached[mode].client;
  // Omit apiVersion → the SDK uses the version it was built against, avoiding a
  // literal-type mismatch on upgrades.
  const client = new Stripe(key);
  cached[mode] = { key, client };
  return client;
}

/** Publishable key for the active mode (client-safe to expose). */
export function getPublishableKey(
  mode: StripeMode = requiredStripeMode(),
): string | undefined {
  return process.env[mode === "live" ? "NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY" : "STRIPE_TEST_MODE_PUBLISHABLE_KEY"]?.trim();
}

/**
 * Resolve the endpoint secret for one Stripe ledger.
 *
 * Preview/development receive only test deliveries and keep the established
 * STRIPE_WEBHOOK_SECRET name. Production receives both Stripe endpoints at the
 * same URL, so its additional test secret has a mode-specific name while the
 * established setting remains the live secret.
 */
export function getWebhookSecret(
  mode: StripeMode = requiredStripeMode(),
): string {
  const setting =
    mode === "test" && process.env.VERCEL_ENV === "production"
      ? "STRIPE_TEST_MODE_WEBHOOK_SECRET"
      : "STRIPE_WEBHOOK_SECRET";
  const secret = process.env[setting]?.trim();
  if (!secret) {
    throw new Error(
      `${setting} is not configured for Stripe ${mode} webhook deliveries.`,
    );
  }
  return secret;
}

/**
 * Verify an inbound Stripe event and return the API client for the same ledger.
 * Production deliberately has two candidates because both Stripe Dashboard
 * endpoints target the public URL. A signature is not sufficient on its own:
 * `event.livemode` must agree with the secret that matched, preventing a secret
 * from ever authorizing an event into the wrong money ledger.
 */
export function verifyStripeWebhook(
  body: string,
  signature: string,
): VerifiedStripeWebhook {
  const modes: StripeMode[] =
    process.env.VERCEL_ENV === "production" ? ["live", "test"] : ["test"];
  let configuredModeCount = 0;

  for (const mode of modes) {
    let secret: string;
    try {
      secret = getWebhookSecret(mode);
    } catch {
      continue;
    }
    configuredModeCount += 1;

    try {
      const event = Stripe.webhooks.constructEvent(body, signature, secret);
      if (event.livemode !== (mode === "live")) continue;
      const stripe = getStripe(mode);
      return { event, mode, stripe };
    } catch {
      // Try the other explicitly configured ledger. Never include Stripe's
      // signature exception here because it can retain the raw request body.
    }
  }

  if (configuredModeCount === 0) {
    throw new StripeWebhookVerificationError(
      "No Stripe webhook secrets are configured for this deployment.",
    );
  }
  throw new StripeWebhookVerificationError(
    "Stripe webhook signature or livemode did not match a configured endpoint.",
  );
}

/** True when Stripe is configured enough to run checkout (a secret key exists). */
export function isStripeConfigured(): boolean {
  try { resolveSecretKeyOrRaise(); return true; } catch { return false; }
}
