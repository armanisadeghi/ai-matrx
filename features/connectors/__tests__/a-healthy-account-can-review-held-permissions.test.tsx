/**
 * A healthy Google connection used to have no path back to Google's consent
 * screen. The product switches were already on, so the normal planner returned
 * an empty request; choosing "a different account" requested only the newly
 * selected product and the server correctly refused the resulting scope loss.
 *
 * This guard pins the dedicated review path: it targets the same connection,
 * copies its literal scopes without normalization, and forces genuine consent.
 */

import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { GOOGLE_SCOPE } from "@/lib/googleScopes";
import { buildPermissionsReviewPlan } from "../consent-plan";
import { ConnectedAccountHealth } from "../ConnectedAccountHealth";
import type { ConnectorAccount } from "../health";
import { MANAGEMENT_ALLOWED } from "../shared-account-level";
import { GOOGLE_CONNECTOR_PROVIDER } from "../provider-config";
import { consentRunOwnerForAccount } from "../google-adapter";

(
  globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

const reviewerScopes = [
  GOOGLE_SCOPE.profile,
  GOOGLE_SCOPE.gmailReadonly,
  GOOGLE_SCOPE.openid,
  GOOGLE_SCOPE.gmailModify,
  GOOGLE_SCOPE.email,
];
const rollout = [
  ...new Set(
    GOOGLE_CONNECTOR_PROVIDER.products.flatMap(
      (product) => product.capabilityKeys,
    ),
  ),
].map((capabilityKey) => ({
  capabilityKey,
  phase: "available" as const,
  eligible: true,
  requiredScopes: [] as string[],
  ineligibleReason: null,
}));

function account(overrides: Partial<ConnectorAccount> = {}): ConnectorAccount {
  return {
    id: "connection-reviewer",
    label: "oauth.reviewer@aimatrx.com",
    ownerKind: "person",
    ownerUserId: "reviewer-user",
    organizationId: null,
    providerSubject: "google-reviewer-subject",
    grantedScopes: reviewerScopes,
    connectionPurpose: "google_products",
    usable: true,
    statusLabel: "Connected",
    statusReason: "Google confirmed this connection.",
    statusRemedy: null,
    lastVerifiedAt: "2026-10-08T12:00:00Z",
    lastRefusalSentence: null,
    ...overrides,
  };
}

describe("reviewing a healthy account's held permissions", () => {
  it("targets that connection and sends its literal readonly + modify grant unchanged", () => {
    const current = account();
    const plan = buildPermissionsReviewPlan({
      provider: GOOGLE_CONNECTOR_PROVIDER,
      account: current,
      rollout,
    });
    const request = plan.request;

    expect(request).not.toBeNull();
    expect(request?.targetAccountId).toBe(current.id);
    expect(request?.scopes).toEqual(reviewerScopes);
    expect(request?.addedScopes).toEqual([]);
    expect(request?.forceConsent).toBe(true);
    expect(request?.capabilityKeys).toEqual(["gmail_read", "gmail_modify"]);
  });

  it.each([
    ["google_ads_isolated", [GOOGLE_SCOPE.openid, GOOGLE_SCOPE.googleAds]],
    ["youtube_isolated", [GOOGLE_SCOPE.openid, GOOGLE_SCOPE.youtubeReadonly]],
  ] as const)(
    "does not route a %s connection through shared product consent",
    (connectionPurpose, scopes) => {
      expect(
        buildPermissionsReviewPlan({
          provider: GOOGLE_CONNECTOR_PROVIDER,
          account: account({ connectionPurpose, grantedScopes: scopes }),
          rollout,
        }).request,
      ).toBeNull();
    },
  );

  it.each([
    GOOGLE_SCOPE.googleAds,
    GOOGLE_SCOPE.youtubeReadonly,
    GOOGLE_SCOPE.youtubeAnalyticsReadonly,
  ])("refuses an old unlabelled isolated grant containing %s", (scope) => {
    expect(
      buildPermissionsReviewPlan({
        provider: GOOGLE_CONNECTOR_PROVIDER,
        account: account({
          connectionPurpose: null,
          grantedScopes: [GOOGLE_SCOPE.openid, scope],
        }),
        rollout,
      }).request,
    ).toBeNull();
  });

  it("refuses an organization connection whose owner cannot be identified", () => {
    expect(
      buildPermissionsReviewPlan({
        provider: GOOGLE_CONNECTOR_PROVIDER,
        account: account({ ownerKind: "organization", organizationId: null }),
        rollout,
      }).request,
    ).toBeNull();
  });

  it("keeps the existing personal or organization owner tuple", () => {
    expect(consentRunOwnerForAccount(account())).toEqual({ type: "user" });
    expect(
      consentRunOwnerForAccount(
        account({ ownerKind: "organization", organizationId: "org-review" }),
      ),
    ).toEqual({ type: "organization", organizationId: "org-review" });
  });

  it("names a held product that the current catalog no longer admits", () => {
    const plan = buildPermissionsReviewPlan({
      provider: GOOGLE_CONNECTOR_PROVIDER,
      account: account(),
      rollout: rollout.map((row) =>
        row.capabilityKey === "gmail_modify"
          ? { ...row, eligible: false }
          : row,
      ),
    });
    expect(plan.request).toBeNull();
    expect(plan.refusal).toContain("Gmail changes");
  });

  it.each(["", " ", "https://www.googleapis.com/auth/future.product"])(
    "refuses the unmapped held scope %p instead of sending it to Google",
    (scope) => {
      const plan = buildPermissionsReviewPlan({
        provider: GOOGLE_CONNECTOR_PROVIDER,
        account: account({ grantedScopes: [...reviewerScopes, scope] }),
        rollout,
      });
      expect(plan.request).toBeNull();
      expect(plan.refusal).toContain("not listed here");
    },
  );

  it("accepts Google's canonical and URL identity scopes without treating them as products", () => {
    const scopes = [
      ...reviewerScopes,
      GOOGLE_SCOPE.userinfoEmail,
      GOOGLE_SCOPE.userinfoProfile,
    ];
    const plan = buildPermissionsReviewPlan({
      provider: GOOGLE_CONNECTOR_PROVIDER,
      account: account({ grantedScopes: scopes }),
      rollout,
    });
    expect(plan.request?.scopes).toEqual(scopes);
    expect(plan.request?.capabilityKeys).toEqual([
      "gmail_read",
      "gmail_modify",
    ]);
  });
});

describe("the healthy account card", () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
  });

  it("offers Review permissions only to someone allowed to manage the connection", () => {
    const onReviewPermissions = jest.fn();
    const current = account();
    act(() =>
      root.render(
        <ConnectedAccountHealth
          provider={GOOGLE_CONNECTOR_PROVIDER}
          account={current}
          health={[]}
          onReconnect={() => {}}
          onReconnectAccount={() => {}}
          onReviewPermissions={onReviewPermissions}
          onRevoke={() => {}}
          management={MANAGEMENT_ALLOWED}
        />,
      ),
    );
    const review = [...container.querySelectorAll("button")].find(
      (button) => button.textContent === "Review permissions",
    );
    expect(review).toBeDefined();
    act(() => review?.click());
    expect(onReviewPermissions).toHaveBeenCalledTimes(1);

    act(() =>
      root.render(
        <ConnectedAccountHealth
          provider={GOOGLE_CONNECTOR_PROVIDER}
          account={current}
          health={[]}
          onReconnect={() => {}}
          onReconnectAccount={() => {}}
          onReviewPermissions={onReviewPermissions}
          onRevoke={() => {}}
          management={{
            allowed: false,
            sentence: "An organization admin manages this connection.",
          }}
        />,
      ),
    );
    expect(container.textContent).not.toContain("Review permissions");
  });

  it("shows why an otherwise healthy connection cannot be reviewed", () => {
    act(() =>
      root.render(
        <ConnectedAccountHealth
          provider={GOOGLE_CONNECTOR_PROVIDER}
          account={account()}
          health={[]}
          onReconnect={() => {}}
          onReconnectAccount={() => {}}
          permissionsReviewUnavailableReason="Gmail changes cannot be reviewed for this account right now."
          onRevoke={() => {}}
          management={MANAGEMENT_ALLOWED}
        />,
      ),
    );
    expect(container.textContent).toContain(
      "Gmail changes cannot be reviewed for this account right now.",
    );
    expect(container.textContent).not.toContain("Review permissions");
  });
});
