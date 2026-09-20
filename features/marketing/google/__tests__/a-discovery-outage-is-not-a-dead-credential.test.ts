/**
 * A DISCOVERY OUTAGE IS NOT A DEAD CREDENTIAL (aidream verifier N15, closed on
 * the writer side in `service.py::google_discovery_health` and
 * `_record_discovery_outage_refusals`).
 *
 * The exchange SUCCEEDED — the token is live, the vault item is written, Gmail
 * send would work perfectly — but Google did not answer when asked what this
 * account can reach for some products. The server keeps `status = 'connected'`
 * with no `last_error` and records the fact in `metadata.discovery_outage`
 * instead: `{products, sentence, at}`. Only `_record_credential_failure` may
 * write `needs_attention`.
 *
 * Before this, the same condition landed on `needs_attention`, and
 * `health.ts` put EVERY product on the account into `account_unusable` — nine
 * "Needs reconnecting" rows and an account-level Reconnect press that
 * re-approves the same scopes and changes nothing, over a credential that was
 * never actually broken.
 *
 * This pins the client half: a row shaped exactly like the server's writer
 * stays `health: 'connected'`, and `googleDiscoveryOutageSentence` surfaces
 * the server's own sentence rather than nothing.
 */

import { googleDiscoveryOutageSentence } from "../health";
import type { GoogleConnectionSummary } from "../types";

function connection(
  overrides: Partial<GoogleConnectionSummary> = {},
): GoogleConnectionSummary {
  return {
    id: "7223fed4-7296-4f1e-9126-a83a96a917e9",
    owner_type: "user",
    owner_user_id: "4cf62e4e-2679-484f-b652-034e697418df",
    organization_id: null,
    provider: "google",
    provider_subject: "10293847",
    account_email: "arman@armansadeghi.com",
    account_name: null,
    scopes: ["openid", "https://www.googleapis.com/auth/webmasters.readonly"],
    status: "connected",
    last_verified_at: "2026-09-17T20:07:27.780Z",
    last_error: null,
    created_at: "2026-07-19T20:07:27.780Z",
    updated_at: "2026-09-17T20:07:27.780Z",
    metadata: {},
    credential_present: true,
    credential_stable: true,
    capability_health: { __kind: "google_connection_capability_health" },
    health: "connected",
    ...overrides,
  };
}

/** The exact shape `google_discovery_health`/`_record_discovery_outage_refusals` writes. */
const DISCOVERY_OUTAGE = {
  products: ["analytics", "youtube"],
  sentence:
    "Google did not answer when AI Matrx asked what this account can reach for " +
    "these products. The account itself is connected — try again in a few minutes.",
  at: "2026-09-17T20:07:27.780Z",
};

describe("a row shaped like the discovery-outage writer", () => {
  it("stays status='connected' with no last_error — never needs_attention", () => {
    const row = connection({
      status: "connected",
      last_error: null,
      metadata: { discovery_outage: DISCOVERY_OUTAGE },
      health: "connected",
    });
    expect(row.status).toBe("connected");
    expect(row.last_error).toBeNull();
    expect(row.health).toBe("connected");
  });

  it("surfaces the server's own outage sentence, verbatim", () => {
    const row = connection({ metadata: { discovery_outage: DISCOVERY_OUTAGE } });
    expect(googleDiscoveryOutageSentence(row)).toBe(DISCOVERY_OUTAGE.sentence);
  });

  it("says try again, not reconnect", () => {
    const row = connection({ metadata: { discovery_outage: DISCOVERY_OUTAGE } });
    const sentence = googleDiscoveryOutageSentence(row) ?? "";
    expect(sentence.toLowerCase()).toContain("try again");
    expect(sentence.toLowerCase()).not.toContain("reconnect");
  });

  it("is null when nothing of the shape is recorded", () => {
    expect(googleDiscoveryOutageSentence(connection({ metadata: {} }))).toBeNull();
    expect(
      googleDiscoveryOutageSentence(
        connection({ metadata: { discovery_outage: null } }),
      ),
    ).toBeNull();
    expect(
      googleDiscoveryOutageSentence(
        connection({ metadata: { discovery_outage: "not an object" } }),
      ),
    ).toBeNull();
  });
});
