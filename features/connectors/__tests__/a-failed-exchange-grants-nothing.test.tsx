/**
 * A RENEWAL THAT FAILED GRANTS NOTHING — the result block never says "Ready to
 * use" beside the red failure notice.
 *
 * THE DEFECT THIS PINS (VERIFY-U-P2-R3, N10). `consentOutcomes` derived each
 * row's outcome from SCOPE PRESENCE alone. A renewal's scopes are already
 * present by definition, so a renewal whose exchange FAILED — the dialog's catch
 * branch sets `attempted` before the refetch, so the result block renders —
 * reported 9 of 9 products `granted`: the green "Ready to use" list with a first
 * action per product, directly beside the failure notice, while Settings →
 * Connectors still read "Needs reconnecting" for the same nine rows. That is
 * round 2's N7 ("the screen says both things at once") moved onto the failure
 * path, where no server-side success write can rescue it.
 *
 * THE CLASS FIX PINNED BELOW: an outcome is not derivable from the account's
 * scopes alone, so `consentOutcomes` takes the exchange result and a failed
 * exchange renders NO product as granted — for one product or for nine.
 */

import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";

jest.mock("@/lib/toast", () => ({
  toast: { info: jest.fn(), success: jest.fn(), error: jest.fn() },
}));

jest.mock("@/lib/redux/hooks", () => ({
  useAppSelector: (selector: (state: unknown) => unknown) => selector({}),
  useAppDispatch: () => jest.fn(),
}));

jest.mock("@/lib/redux/slices/appContextSlice", () => ({
  selectOrganizationId: () => null,
  selectEffectiveOrganizationId: () => null,
}));

jest.mock("@/features/scopes/redux/selectors/tree", () => ({
  selectOrganizationsList: () => [],
}));

jest.mock("@/providers/google-provider/LazyGoogleAPIProvider", () => ({
  LazyGoogleAPIProvider: ({ children }: { children: React.ReactNode }) => (
    <>{children}</>
  ),
}));

jest.mock("@/providers/google-provider/GoogleApiProvider", () => ({
  isGoogleAuthorizationCancelled: () => false,
  useGoogleAPI: () => ({ isGoogleLoaded: true }),
}));

jest.mock("../google-adapter", () => {
  const actual = jest.requireActual("../google-adapter");
  return {
    ...actual,
    useGoogleConsentRunner: () => ({
      run: () =>
        Promise.reject(
          new (jest.requireActual("@/lib/api/errors").BackendApiError)({
            code: "google_resource_persist_failed",
            detail:
              "Google connection 7f3e2b41 authorized, but NONE of its 4 discovered resources could be persisted",
            userMessage: "authorized, but none could be persisted",
            status: 500,
          }),
        ),
      ready: true,
    }),
    useGoogleConnectorState: () => ({
      accounts: [],
      rollout: [],
      resourceCountByAccount: {},
      isLoading: false,
      rolloutUnavailable: false,
      isError: false,
      errorMessage: null,
      refetch: async () => {},
    }),
  };
});

import { ConnectorConsentBody } from "../ConnectorConsentDialog";
import { buildConsentPlan, consentOutcomes } from "../consent-plan";
import type { ConnectorAccount, ConnectorCapabilityRollout } from "../health";
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

/** A dead credential holding every scope: nine renewals, zero added scopes. */
const DEAD: ConnectorAccount = {
  id: "conn-dead",
  label: "probe@example.com",
  ownerKind: "person",
  organizationId: null,
  providerSubject: "sub-dead",
  grantedScopes: EVERY_SCOPE,
  usable: false,
  statusLabel: "Needs reconnecting",
  statusReason: "Google would not renew this account's permission.",
  statusRemedy: "Reconnect probe@example.com.",
  lastVerifiedAt: "2026-09-17T12:00:00Z",
  lastRefusalSentence: null,
  activity: {},
};

describe("consentOutcomes after an exchange that failed", () => {
  it("grants nothing for a nine-product renewal", () => {
    const plan = buildConsentPlan({
      provider,
      selectedProductKeys: provider.products.map((product) => product.key),
      account: DEAD,
      rollout: LIVE,
    });
    expect(plan.request?.renewals).toHaveLength(provider.products.length);
    const outcomes = consentOutcomes({
      provider,
      plan,
      // The account is byte-identical: the exchange changed nothing.
      account: DEAD,
      rollout: LIVE,
      exchange: { completed: false },
    });
    expect(outcomes.filter((row) => row.state === "granted")).toHaveLength(0);
    for (const outcome of outcomes) {
      expect(outcome.message).not.toContain("_");
    }
  });

  it("grants nothing for a single-product renewal either", () => {
    const plan = buildConsentPlan({
      provider,
      selectedProductKeys: ["calendar"],
      account: DEAD,
      rollout: LIVE,
    });
    const outcomes = consentOutcomes({
      provider,
      plan,
      account: DEAD,
      rollout: LIVE,
      exchange: { completed: false },
    });
    expect(outcomes.some((row) => row.state === "granted")).toBe(false);
  });

  it("still reports what landed when the exchange completed", () => {
    const plan = buildConsentPlan({
      provider,
      selectedProductKeys: ["calendar"],
      account: { ...DEAD, usable: true },
      rollout: LIVE,
    });
    // Nothing to ask for on a usable account holding every scope.
    expect(plan.request).toBeNull();
    const outcomes = consentOutcomes({
      provider,
      plan,
      account: { ...DEAD, usable: true },
      rollout: LIVE,
      exchange: { completed: true },
    });
    expect(outcomes.every((row) => row.state === "already_granted")).toBe(true);
  });
});

let container: HTMLDivElement | null = null;
let root: Root | null = null;

afterEach(() => {
  if (root) act(() => root!.unmount());
  container?.remove();
  root = null;
  container = null;
});

describe("the dialog after a renewal whose exchange failed", () => {
  it("shows no green Ready-to-use list beside the failure", async () => {
    container = document.createElement("div");
    document.body.appendChild(container);
    const mounted = createRoot(container);
    root = mounted;
    act(() =>
      mounted.render(
        <ConnectorConsentBody
          provider={provider}
          accounts={[DEAD]}
          rollout={LIVE}
          isLoading={false}
          rolloutUnavailable={false}
          errorMessage={null}
          refetch={async () => {}}
        />,
      ),
    );
    const cta = [...container.querySelectorAll("button")].find((node) =>
      (node.textContent ?? "").includes(provider.dialog.cta),
    );
    await act(async () => {
      cta!.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });
    const shown = container.textContent ?? "";
    expect(shown).not.toContain("Ready to use");
    // And the failure itself is on screen, in our words.
    expect(shown).toContain("Google did not finish connecting this");
  });
});
