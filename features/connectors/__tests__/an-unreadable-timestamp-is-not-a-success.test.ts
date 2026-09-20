/**
 * A SUCCESS WE CANNOT DATE IS NOT A SUCCESS.
 *
 * THE DEFECT THIS PINS (VERIFY-U-P2-R3, N14). `parseSuccess` accepted any
 * non-empty string as `at` while `parseRefusal` demanded a known code and a
 * sentence. `refusalStands` is `!lastSuccessAt || Date.parse(refusal.at) >
 * Date.parse(lastSuccessAt)`, and every comparison with `NaN` is false — so a
 * success recorded as `"whenever"` made EVERY refusal, however new, stop
 * standing. The row then read "Connected" and, one line below, "Last successful
 * use: no calls recorded yet." — claiming to work while admitting nothing ever
 * has. The reader's whole job is to be the one place that refuses to show half a
 * fact, and it was asymmetric about which half it checked.
 *
 * THE CLASS FIX PINNED BELOW: ONE strict timestamp parser guards both halves. A
 * success whose timestamp cannot be parsed is not recorded at all, so the row
 * says "no calls recorded yet" and the refusal keeps standing; a refusal whose
 * timestamp cannot be parsed is kept and STANDS, because nothing proves it was
 * overtaken. The health derivation applies the same rule to whatever an adapter
 * hands it, so a second provider cannot reintroduce it.
 */

import {
  googleActivityByProduct,
  parseGoogleCapabilityHealth,
} from "../google-capability-health";
import {
  productHealth,
  type ConnectorAccount,
  type ConnectorCapabilityRollout,
} from "../health";
import { GOOGLE_CONNECTOR_PROVIDER, productByKey } from "../provider-config";

const provider = GOOGLE_CONNECTOR_PROVIDER;
const calendar = productByKey(provider, "calendar")!;

const LIVE: ConnectorCapabilityRollout[] = [
  ...new Set(provider.products.flatMap((product) => product.capabilityKeys)),
].map((capabilityKey) => ({
  capabilityKey,
  phase: "available" as const,
  eligible: true,
  requiredScopes: [],
  ineligibleReason: null,
}));

const EVERY_SCOPE = [
  ...new Set([
    ...provider.identityScopes,
    ...provider.products.flatMap((product) => product.scopes),
  ]),
];

function account(activity: ConnectorAccount["activity"]): ConnectorAccount {
  return {
    id: "conn-1",
    label: "probe@example.com",
    ownerKind: "person",
    organizationId: null,
    providerSubject: "sub-1",
    grantedScopes: EVERY_SCOPE,
    usable: true,
    statusLabel: "Connected",
    statusReason: "This account can authorize Google calls.",
    statusRemedy: null,
    lastVerifiedAt: "2026-09-17T12:00:00Z",
    lastRefusalSentence: null,
    activity,
  };
}

const EXPIRED = {
  at: "2026-09-17T12:00:00Z",
  action: "calendar.agenda",
  code: "grant_expired_or_revoked",
  http_status: 401,
  sentence:
    "Google no longer accepts this account's permission for Calendar. Reconnect it to restore access.",
};

function row(raw: unknown) {
  const activity = googleActivityByProduct(
    provider,
    parseGoogleCapabilityHealth(raw),
  );
  return productHealth({
    provider,
    product: calendar,
    account: account(activity),
    rollout: LIVE,
  });
}

describe("a capability whose success timestamp is not a timestamp", () => {
  it("does not stop a standing refusal", () => {
    const health = row({
      __kind: "google_connection_capability_health",
      calendar: {
        last_refusal: EXPIRED,
        last_success: { at: "whenever", action: "calendar.agenda" },
      },
    });
    // Before the fix: state "connected" AND "no calls recorded yet".
    expect(health.lastSuccessAt).toBeNull();
    expect(health.state).toBe("refused");
    expect(health.actionLabel).toBe("Reconnect");
  });

  it("is not recorded as a success on its own either", () => {
    const health = row({
      __kind: "google_connection_capability_health",
      calendar: { last_success: { at: "2026-13-45T99:99:99Z", action: "x" } },
    });
    expect(health.lastSuccessAt).toBeNull();
  });

  it("keeps a refusal whose own timestamp is unreadable, and it stands", () => {
    const health = row({
      __kind: "google_connection_capability_health",
      calendar: {
        last_refusal: { ...EXPIRED, at: "not a date" },
        last_success: { at: "2026-09-17T12:30:00Z", action: "calendar.agenda" },
      },
    });
    expect(health.lastRefusal?.message).toBe(EXPIRED.sentence);
    expect(health.state).toBe("refused");
  });
});

describe("the health derivation itself", () => {
  it("treats an adapter's unreadable success timestamp as no success", () => {
    const health = productHealth({
      provider,
      product: calendar,
      account: account({
        calendar: {
          lastSuccessAt: "whenever",
          lastRefusal: {
            message: EXPIRED.sentence,
            at: EXPIRED.at,
            code: "grant_expired_or_revoked",
            httpStatus: 401,
          },
        },
      }),
      rollout: LIVE,
    });
    expect(health.lastSuccessAt).toBeNull();
    expect(health.state).toBe("refused");
  });
});
