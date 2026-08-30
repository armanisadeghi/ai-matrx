/** @jest-environment node */

import fs from "node:fs";
import { createHmac } from "node:crypto";
import {
  getWebhookSecret,
  requiredStripeMode,
  resolveSecretKeyOrRaise,
  StripeCredentialModeError,
  StripeWebhookVerificationError,
  verifyStripeWebhook,
} from "./server";

function signedHeader(payload: string, secret: string): string {
  const timestamp = Math.floor(Date.now() / 1000);
  const signature = createHmac("sha256", secret)
    .update(`${timestamp}.${payload}`)
    .digest("hex");
  return `t=${timestamp},v1=${signature}`;
}

function eventPayload(livemode: boolean): string {
  return JSON.stringify({
    id: `evt_${livemode ? "live" : "test"}`,
    object: "event",
    type: "account.updated",
    created: Math.floor(Date.now() / 1000),
    livemode,
    data: { object: { id: "acct_fixture", object: "account" } },
  });
}

describe("Stripe credential identity", () => {
  const original = { ...process.env };
  afterEach(() => { process.env = { ...original }; });

  it("refuses live substitution outside confirmed production", () => {
    delete process.env.VERCEL_ENV;
    delete process.env.STRIPE_TEST_MODE_SECRET_KEY;
    process.env.STRIPE_SECRET_KEY = "sk_live_wrong";
    expect(() => resolveSecretKeyOrRaise()).toThrow(StripeCredentialModeError);
    expect(() => resolveSecretKeyOrRaise()).toThrow("STRIPE_TEST_MODE_SECRET_KEY");
  });

  it("keeps the safe paths", () => {
    process.env.VERCEL_ENV = "preview";
    process.env.STRIPE_TEST_MODE_SECRET_KEY = "sk_test_right";
    expect(requiredStripeMode()).toBe("test");
    expect(resolveSecretKeyOrRaise()).toBe("sk_test_right");
    process.env.VERCEL_ENV = "production";
    process.env.STRIPE_SECRET_KEY = "sk_live_right";
    expect(resolveSecretKeyOrRaise()).toBe("sk_live_right");
  });

  it("source guard bans cross-account fallback", () => {
    const source = fs.readFileSync(require.resolve("./server"), "utf8");
    expect(source).not.toMatch(/STRIPE_TEST_MODE_SECRET_KEY[\s\S]{0,80}\|\|[\s\S]{0,80}STRIPE_SECRET_KEY/);
  });

  it("verifies live and test production endpoints with their matching clients", () => {
    process.env.VERCEL_ENV = "production";
    process.env.STRIPE_SECRET_KEY = "sk_live_fixture";
    process.env.STRIPE_TEST_MODE_SECRET_KEY = "sk_test_fixture";
    process.env.STRIPE_WEBHOOK_SECRET = "whsec_live_fixture";
    process.env.STRIPE_TEST_MODE_WEBHOOK_SECRET = "whsec_test_fixture";

    const livePayload = eventPayload(true);
    const testPayload = eventPayload(false);
    expect(
      verifyStripeWebhook(
        livePayload,
        signedHeader(livePayload, process.env.STRIPE_WEBHOOK_SECRET),
      ).mode,
    ).toBe("live");
    expect(
      verifyStripeWebhook(
        testPayload,
        signedHeader(testPayload, process.env.STRIPE_TEST_MODE_WEBHOOK_SECRET),
      ).mode,
    ).toBe("test");
  });

  it("rejects a valid signature when the payload livemode belongs to the other ledger", () => {
    process.env.VERCEL_ENV = "production";
    process.env.STRIPE_SECRET_KEY = "sk_live_fixture";
    process.env.STRIPE_TEST_MODE_SECRET_KEY = "sk_test_fixture";
    const liveWebhookSecret = "whsec_live_fixture";
    process.env.STRIPE_WEBHOOK_SECRET = liveWebhookSecret;
    process.env.STRIPE_TEST_MODE_WEBHOOK_SECRET = "whsec_test_fixture";

    const testPayload = eventPayload(false);
    expect(() =>
      verifyStripeWebhook(
        testPayload,
        signedHeader(testPayload, liveWebhookSecret),
      ),
    ).toThrow(StripeWebhookVerificationError);
  });

  it("keeps the established webhook setting for non-production test deliveries", () => {
    process.env.VERCEL_ENV = "preview";
    process.env.STRIPE_WEBHOOK_SECRET = "whsec_preview_fixture";
    process.env.STRIPE_TEST_MODE_WEBHOOK_SECRET = "whsec_wrong_fixture";
    expect(getWebhookSecret()).toBe("whsec_preview_fixture");
  });
});
