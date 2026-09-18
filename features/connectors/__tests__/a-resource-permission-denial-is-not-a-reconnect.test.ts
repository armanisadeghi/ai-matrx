/**
 * A GA4 PROPERTY-LEVEL 403 IS NOT THE SAME REFUSAL AS A REVOKED CREDENTIAL.
 *
 * THE DEFECT THIS PINS: aidream added `resource_permission_denied` to the
 * refusal vocabulary (`call_health.py::RefusalCode`) so Google's "caller does
 * not have permission for this property" 403 stops being classified as
 * `provider_denied` — reconnect it — when reconnecting asks for exactly the
 * scopes the account already holds and lands in the identical refusal. Until
 * the client knew the code, `parseGoogleCapabilityHealth`
 * (`isConnectorRefusalCode`) DROPPED it, so the row rendered no refusal at
 * all: no "Not working", no server sentence, no disclosure entry — a
 * property-permission denial disappeared completely.
 *
 * THE RULING PINNED HERE: the row goes to `refused` / "Not working" and
 * states the server's own sentence (which already names the remedy: ask the
 * item's owner to share it, or choose a different item). It offers NO button
 * — not `Reconnect` (the grant is already complete and re-approving it would
 * ask Google for nothing new) and not any other control, because nothing this
 * account can press changes who a different Google identity has shared an
 * item with.
 */

import { googleActivityByProduct, parseGoogleCapabilityHealth } from "../google-capability-health";
import {
  accountHealth,
  isConnectorRefusalCode,
  refusalDisposition,
  type ConnectorAccount,
  type ConnectorCapabilityRollout,
} from "../health";
import { GOOGLE_CONNECTOR_PROVIDER } from "../provider-config";

const provider = GOOGLE_CONNECTOR_PROVIDER;

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

function column(capabilities: Record<string, unknown>): Record<string, unknown> {
  return { __kind: "google_connection_capability_health", ...capabilities };
}

const GA4_SENTENCE =
  "Your Google account has no access to this Analytics item — whoever owns it " +
  "has not shared it with this account. Reconnecting will not change that: ask " +
  "its owner to share it, or choose one this account can see.";

const GA4_REFUSAL = {
  at: "2026-09-17T12:00:00Z",
  action: "analytics.report",
  code: "resource_permission_denied",
  http_status: 403,
  sentence: GA4_SENTENCE,
};

function analyticsRow(raw: Record<string, unknown>) {
  const parsed = parseGoogleCapabilityHealth(raw);
  const activity = googleActivityByProduct(provider, parsed);
  const rows = accountHealth({ provider, account: account(activity), rollout: LIVE });
  const row = rows.find((candidate) => candidate.product.key === "analytics");
  if (!row) throw new Error("no product row covers the analytics capability");
  return row;
}

describe("the client's refusal vocabulary includes resource_permission_denied", () => {
  it("is recognized rather than dropped", () => {
    expect(isConnectorRefusalCode("resource_permission_denied")).toBe(true);
  });

  it("carries a disposition that is neither reconnect nor retry", () => {
    const disposition = refusalDisposition("resource_permission_denied");
    expect(disposition).toBeTruthy();
    expect(disposition).not.toBe("reconnect");
    expect(disposition).not.toBe("retry");
  });
});

describe("a GA4 property-permission denial on the health row", () => {
  it("is not silently dropped — before the code existed, the row showed no refusal at all", () => {
    const row = analyticsRow(column({ analytics: { last_refusal: GA4_REFUSAL } }));
    expect(row.lastRefusal).not.toBeNull();
    expect(row.lastRefusal?.message).toBe(GA4_SENTENCE);
  });

  it("goes to refused / Not working with the server's own sentence", () => {
    const row = analyticsRow(column({ analytics: { last_refusal: GA4_REFUSAL } }));
    expect(row.state).toBe("refused");
    expect(row.label).toBe("Not working");
    expect(row.reason).toBe(GA4_SENTENCE);
  });

  it("offers no button that would change nothing — not Reconnect, not anything else", () => {
    const row = analyticsRow(column({ analytics: { last_refusal: GA4_REFUSAL } }));
    expect(row.actionLabel).toBeNull();
    expect(row.actionScope).toBeNull();
    expect(row.remedy).toBeNull();
  });
});
