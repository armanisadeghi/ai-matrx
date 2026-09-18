/**
 * A REFUSAL THIS CLIENT HAS NOT SHIPPED A CODE FOR IS STILL A REFUSAL.
 *
 * THE DEFECT THIS PINS (VERIFY-U-P2-R4, V13-4). `parseRefusal` dropped the WHOLE
 * refusal when `isConnectorRefusalCode(code)` was false, so a server release that
 * classifies a refusal this client has never heard of produced a row reading
 * **Connected**, with `lastRefusal: null`, and the server's own sentence — written
 * for this person — thrown away. The two halves deploy independently and the
 * coupling test reads a FILE in a local checkout, not the running server, so the
 * window is real and the failure is the exact lie §5.3 exists to end.
 *
 * And the second half of it: `refusalDisposition` returned `undefined` for an
 * unknown code while `health.ts` tested `=== null`, so the branch meant to catch
 * "we cannot classify this" was unreachable dead defence (law 4: a defence that
 * cannot fire is worse than none).
 *
 * THE RULE NOW: an unrecognised code keeps its refusal, the row states the
 * server's sentence verbatim, it is never "Connected", and it offers no button
 * that might not help — a generic remedy tells the person what to do instead.
 */

import {
  isConnectorRefusalCode,
  productHealth,
  refusalDisposition,
  type ConnectorAccount,
  type ConnectorCapabilityRollout,
} from "../health";
import { GOOGLE_CONNECTOR_PROVIDER } from "../provider-config";
import {
  googleActivityByProduct,
  parseGoogleCapabilityHealth,
} from "../google-capability-health";

const provider = GOOGLE_CONNECTOR_PROVIDER;
const product = provider.products.find((row) => row.key === "analytics")!;

const rollout: ConnectorCapabilityRollout[] = product.capabilityKeys.map(
  (capabilityKey) => ({
    capabilityKey,
    phase: "available" as const,
    eligible: true,
    requiredScopes: [],
    ineligibleReason: null,
  }),
);

/** A plausible future code with a perfectly good server sentence. */
const FUTURE_CODE = "tenant_suspended_by_provider";
const FUTURE_SENTENCE =
  "Google has suspended this Workspace account, so it cannot answer for anyone until an administrator restores it.";

function account(activity: ReturnType<typeof googleActivityByProduct>): ConnectorAccount {
  return {
    id: "4a4f4ad5-0000-4000-8000-000000000000",
    label: "probe@example.com",
    ownerKind: "person",
    organizationId: null,
    providerSubject: "10293847",
    grantedScopes: product.scopes,
    usable: true,
    statusLabel: "Connected",
    statusReason: "probe@example.com is connected and working.",
    statusRemedy: null,
    lastVerifiedAt: "2026-09-17T20:00:00Z",
    lastRefusalSentence: null,
    activity,
  };
}

describe("the disposition of a code we do not know", () => {
  it("is null — never undefined, which no branch could test for", () => {
    expect(isConnectorRefusalCode(FUTURE_CODE)).toBe(false);
    expect(refusalDisposition(FUTURE_CODE)).toBeNull();
    expect(refusalDisposition(null)).toBeNull();
    expect(refusalDisposition("scope_missing")).toBe("reconnect");
  });
});

describe("a refusal carrying an unrecognised code", () => {
  const activity = googleActivityByProduct(
    provider,
    parseGoogleCapabilityHealth({
      __kind: "google_connection_capability_health",
      analytics: {
        last_refusal: {
          at: "2026-09-17T21:00:00.000Z",
          code: FUTURE_CODE,
          action: "analytics.report",
          sentence: FUTURE_SENTENCE,
          http_status: 451,
        },
      },
    }),
  );

  it("is kept, not discarded", () => {
    expect(activity.analytics?.lastRefusal?.message).toBe(FUTURE_SENTENCE);
    expect(activity.analytics?.refusalStands).toBe(true);
  });

  it("never reads Connected, and says what the server said", () => {
    const row = productHealth({
      provider,
      product,
      account: account(activity),
      rollout,
    });
    expect(row.state).toBe("refused");
    expect(row.label).not.toBe("Connected");
    expect(row.reason).toBe(FUTURE_SENTENCE);
    expect(row.lastRefusal?.disposition).toBeNull();
    expect(row.lastRefusal?.httpStatus).toBe(451);
  });

  it("offers a remedy that cannot be wrong, and no press", () => {
    const row = productHealth({
      provider,
      product,
      account: account(activity),
      rollout,
    });
    expect(row.remedy).toBeTruthy();
    // It must not promise a reconnect would fix something we cannot classify.
    expect(row.remedy).not.toMatch(/reconnect/i);
    expect(row.actionLabel).toBeNull();
    expect(row.actionScope).toBeNull();
    // The unknown code is a machine token and never reaches the person.
    expect(`${row.reason} ${row.remedy ?? ""}`).not.toContain(FUTURE_CODE);
  });

  it("does not hide the same refusal in the activity note instead", () => {
    const row = productHealth({
      provider,
      product,
      account: account(activity),
      rollout,
    });
    expect(row.activityNote).toBeNull();
  });

  it("is still overtaken by a later success, like any other refusal", () => {
    const later = googleActivityByProduct(
      provider,
      parseGoogleCapabilityHealth({
        __kind: "google_connection_capability_health",
        analytics: {
          last_refusal: {
            at: "2026-09-17T21:00:00.000Z",
            code: FUTURE_CODE,
            action: "analytics.report",
            sentence: FUTURE_SENTENCE,
            http_status: 451,
          },
          last_success: {
            at: "2026-09-17T21:05:00.000Z",
            action: "analytics.report",
          },
        },
      }),
    );
    const row = productHealth({
      provider,
      product,
      account: account(later),
      rollout,
    });
    expect(row.state).toBe("connected");
    expect(row.lastRefusal?.message).toBe(FUTURE_SENTENCE);
  });

  it("keeps a refusal with no code at all on the same honest footing", () => {
    const uncoded = googleActivityByProduct(
      provider,
      parseGoogleCapabilityHealth({
        __kind: "google_connection_capability_health",
        analytics: {
          last_refusal: {
            at: "2026-09-17T21:00:00.000Z",
            action: "analytics.report",
            sentence: FUTURE_SENTENCE,
          },
        },
      }),
    );
    const row = productHealth({
      provider,
      product,
      account: account(uncoded),
      rollout,
    });
    expect(row.state).toBe("refused");
    expect(row.reason).toBe(FUTURE_SENTENCE);
  });
});
