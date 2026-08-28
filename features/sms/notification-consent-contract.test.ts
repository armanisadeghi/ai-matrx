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
});
