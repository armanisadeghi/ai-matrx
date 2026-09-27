import { accountHealth, type ConnectorAccount } from "../health";
import { effectiveGoogleRollout } from "../google-adapter";
import { buildConsentPlan } from "../consent-plan";
import { productSwitchVisible } from "../ConnectorConsentDialog";
import { GOOGLE_CONNECTOR_PROVIDER } from "../provider-config";

const provider = GOOGLE_CONNECTOR_PROVIDER;

function selectedCalendarRow(account: ConnectorAccount | null) {
  const row = accountHealth({ provider, account, rollout: [] }).find(
    (item) => item.product.key === "calendar_shared",
  );
  if (!row) throw new Error("Selected calendars product is missing");
  return row;
}

it("refuses a new grant while its catalog answer is missing", () => {
  const row = selectedCalendarRow(null);
  expect(row.state).toBe("unavailable");
  expect(row.togglable).toBe(false);
  expect(row.actionLabel).toBeNull();
  expect(row.reason).toMatch(/could not confirm/i);
});

it("does not pretend an already granted account lost its access", () => {
  const product = provider.products.find(
    (item) => item.key === "calendar_shared",
  );
  if (!product) throw new Error("Selected calendars product is missing");
  const account: ConnectorAccount = {
    id: "existing-connection",
    label: "test@example.com",
    ownerKind: "person",
    organizationId: null,
    providerSubject: "test-subject",
    grantedScopes: [...provider.identityScopes, ...product.scopes],
    usable: true,
    statusLabel: "Connected",
    statusReason: "This account can authorize Google calls.",
    statusRemedy: null,
    lastVerifiedAt: null,
    lastRefusalSentence: null,
  };
  const row = selectedCalendarRow(account);
  expect(row.state).toBe("connected");
  expect(row.actionLabel).toBeNull();
});

it("refuses consent after a failed refresh even if the query retains a complete cached catalog", () => {
  const product = provider.products.find(
    (item) => item.key === "calendar_shared",
  );
  if (!product) throw new Error("Selected calendars product is missing");
  const cached = product.capabilityKeys.map((capabilityKey) => ({
    capabilityKey,
    phase: "available" as const,
    eligible: true,
    requiredScopes: [...product.scopes],
    ineligibleReason: null,
  }));
  const rollout = effectiveGoogleRollout(cached, true);
  const health = accountHealth({ provider, account: null, rollout }).find(
    (item) => item.product.key === product.key,
  );
  const plan = buildConsentPlan({
    provider,
    selectedProductKeys: [product.key],
    account: null,
    rollout,
  });
  expect(health?.togglable).toBe(false);
  expect(health?.actionLabel).toBeNull();
  expect(plan.request).toBeNull();
  expect(plan.blocked).toHaveLength(1);
});

it("does not offer a renewal switch for a dead credential during a catalog outage", () => {
  const product = provider.products.find(
    (item) => item.key === "calendar_shared",
  );
  if (!product) throw new Error("Selected calendars product is missing");
  const account: ConnectorAccount = {
    id: "expired-connection",
    label: "test@example.com",
    ownerKind: "person",
    organizationId: null,
    providerSubject: "test-subject",
    grantedScopes: [...provider.identityScopes, ...product.scopes],
    usable: false,
    statusLabel: "Needs reconnecting",
    statusReason: "The Google grant expired.",
    statusRemedy: "Reconnect this account.",
    lastVerifiedAt: null,
    lastRefusalSentence: null,
  };
  const health = selectedCalendarRow(account);
  expect(health.state).toBe("account_unusable");
  expect(health.togglable).toBe(false);
  expect(productSwitchVisible(health)).toBe(false);
});
