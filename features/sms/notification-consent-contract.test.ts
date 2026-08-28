import { readFileSync } from "node:fs";
import { join } from "node:path";

function source(relativePath: string): string {
  return readFileSync(join(process.cwd(), relativePath), "utf8");
}

describe("SMS notification consent contract", () => {
  test("verification records separate transactional and notification purposes", () => {
    const route = source("app/api/sms/verify/route.ts");

    expect(route).toContain('["transactional", "notifications"]');
    expect(route).toContain("consent_type: consentType");
    expect(route).toContain("consent_version: SMS_CONSENT_VERSION");
    expect(route).toContain("disclosure: SMS_CONSENT_DISCLOSURE");
    expect(route).toContain('.rpc("record_verified_sms_phone"');
    expect(route).toContain('p_source: "twilio_verify"');
  });

  test("only a successful provider check reaches the verified contact writer", () => {
    const route = source("app/api/sms/verify/route.ts");
    const providerCheck = route.indexOf(
      "await checkVerification(phoneNumber, code)",
    );
    const providerSuccessGuard = route.indexOf(
      "if (!result.success)",
      providerCheck,
    );
    const graphWrite = route.indexOf('.rpc("record_verified_sms_phone"');

    expect(providerCheck).toBeGreaterThan(-1);
    expect(providerSuccessGuard).toBeGreaterThan(providerCheck);
    expect(graphWrite).toBeGreaterThan(providerSuccessGuard);
  });

  test("notification preferences require notification-purpose consent", () => {
    const route = source("app/api/sms/preferences/route.ts");

    expect(
      route.match(/\.eq\("consent_type", "notifications"\)/g),
    ).toHaveLength(2);
    expect(route).toContain(
      '.in("consent_type", ["transactional", "notifications"])',
    );
  });

  test("the non-spine sender gates notifications on notification-purpose consent", () => {
    // 🚨 lib/sms/send.ts is a SECOND SMS sender. The enable-path commit
    // (77305f15bd) closed the legacy-account inheritance on the spine, and this
    // sender inherited the old basis — it gated notifications on
    // ['transactional', 'all'], which let an account-only grant authorize
    // workforce notifications. This contract keeps that from drifting back.
    const sender = source("lib/sms/send.ts");

    // A non-marketing send resolves to the notification purpose, exactly as the
    // spine's enable gate (.eq("consent_type", "notifications")) does.
    expect(sender).toContain(
      "category === 'marketing' ? ['marketing'] : ['notifications']",
    );

    // And the legacy account basis is gone: the consent query may not be handed a
    // basis array containing 'all', and a notification may never be authorized by a
    // bare 'transactional' grant. (Matched against the consentBasis expression, not
    // prose — the word 'all' still appears in the explanatory comment above it.)
    expect(sender).toMatch(/const consentBasis =/);
    expect(sender).not.toMatch(/\[[^\]]*'all'[^\]]*\]\s*:\s*\[/);
    expect(sender).not.toMatch(/consentBasis[\s\S]{0,80}'all'/);
  });
});
