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
    // The contact-graph writer moved BEHIND the one enrollment door on
    // 2026-09-22: `communication.enroll_verified_phone_for_assistant` calls
    // `record_verified_sms_phone` itself and then writes the two things it was
    // missing — the assistant destination/program binding (text) and the CRM
    // caller context in the enrollment's own organization (voice). The
    // invariant this test protects is unchanged: verification writes the
    // verified contact through a service-role-only RPC, never by hand.
    expect(route).toContain('.rpc("enroll_verified_phone_for_assistant"');
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
    const graphWrite = route.indexOf(
      '.rpc("enroll_verified_phone_for_assistant"',
    );

    expect(providerCheck).toBeGreaterThan(-1);
    expect(providerSuccessGuard).toBeGreaterThan(providerCheck);
    expect(graphWrite).toBeGreaterThan(providerSuccessGuard);
  });

  test("the enrollment doors never write the assistant binding by hand", () => {
    // 🚨 ONE WRITER. The August backfill
    // (`migrations/communications_p0_shared_assistant_binding.sql`) wrote
    // `assistant_destination_id` / `assistant_program_key` once, and the verify
    // route never wrote them at all — so everyone who enrolled afterwards was
    // unreachable by text and nothing said so. The repair is a single door, and
    // a second copy of it in a route is how that class comes back.
    // Matched against CODE, not prose: both routes explain the defect in
    // comments that name the two columns, and a test that cannot tell an
    // explanation from a write would force the explanation out.
    const code = (path: string) =>
      source(path)
        .split("\n")
        .filter((line) => !line.trim().startsWith("//"))
        .join("\n");

    for (const path of [
      "app/api/sms/verify/route.ts",
      "app/api/sms/preferences/route.ts",
    ]) {
      expect(source(path)).toContain(
        '.rpc("enroll_verified_phone_for_assistant"',
      );
      expect(code(path)).not.toContain("assistant_destination_id");
      expect(code(path)).not.toContain("assistant_program_key");
    }

    // And the verify route no longer hand-writes the enrollment row it used to
    // leave half-built.
    expect(source("app/api/sms/verify/route.ts")).not.toContain(
      'from("sms_notification_preferences")',
    );
  });

  test("preferences read separate notification and Personal Staff consent statuses", () => {
    const route = source("app/api/sms/preferences/route.ts");

    expect(route).toContain('.select("consent_type, status")');
    expect(route).toContain(
      '.in("consent_type", ["notifications", "ai_agent"])',
    );
    expect(route).toContain('sms_consent_status: consentStatus("notifications")');
    expect(route).toContain(
      'personal_staff_consent_status: consentStatus("ai_agent")',
    );

    // GET reports both program-specific states, but enabling notifications is
    // still authorized by the notifications-purpose row alone.
    expect(route).toContain('.eq("consent_type", "notifications")');
  });

  test("opting out disables every program represented by this settings switch", () => {
    const route = source("app/api/sms/preferences/route.ts");

    expect(route).toContain(
      '.in("consent_type", ["transactional", "notifications", "ai_agent"])',
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
