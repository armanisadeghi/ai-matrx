import fs from "node:fs";
import { requiredStripeMode, resolveSecretKeyOrRaise, StripeCredentialModeError } from "./server";

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
});
