/**
 * A SHARE-REQUIRED REFUSAL IS NEVER LABELLED "OURS TO REPAIR — WE ARE ON IT".
 *
 * THE DEFECT THIS PINS (Cursor Bugbot round 13, PR 228, commit `8855439f`,
 * review comment id 4041550778). F-19/F-23 added `resource_permission_denied`
 * (disposition `share_required`) to the refusal vocabulary and to the
 * `refused` census in `health.ts`. But two consumers of that census had been
 * written against a world where every `refused`-without-reconnect row was
 * `platform_configuration` (disposition `ours`) — OUR configuration mistake —
 * and both of them said so unconditionally:
 *
 *   - `buildConsentPlan` (`consent-plan.ts`) appended "This one is ours to
 *     repair — approving it again would not help, and we are on it." to EVERY
 *     blocked refused-without-renewal row, whatever its disposition.
 *   - `ProductRow` (`ConnectorConsentDialog.tsx`) appended "Approving Google
 *     again renews it — nothing new is asked for." to every selected refused
 *     row, whatever its disposition.
 *
 * For a GA4 property this account was never shared into
 * (`resource_permission_denied`), both sentences are false: it is not ours to
 * repair, we are not "on it", and approving again asks Google for nothing new
 * and changes nothing — the server's own sentence already says a DIFFERENT
 * Google identity must share the item. Nobody here can fix it; owning it and
 * promising a re-approval both contradict what the server told the person.
 *
 * THE RULING: each disposition carries its own person-facing consequence.
 * `share_required` states the server's sentence (which already names who must
 * act) and adds nothing that claims ownership or offers a renewal. `ours`
 * keeps the existing "ours to repair" copy. A disposition this switch has
 * never seen fails TYPE-CHECK via an exhaustive switch, never a silent
 * default that reuses someone else's copy.
 */

import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";

const toastInfo = jest.fn();

jest.mock("@/lib/toast", () => ({
  toast: {
    info: (...args: unknown[]) => toastInfo(...args),
    success: jest.fn(),
    error: jest.fn(),
  },
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

const run = jest.fn();

jest.mock("../google-adapter", () => ({
  useGoogleConsentRunner: () => ({ run, ready: true }),
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
  multiProductConsentUnsupported: () => false,
  MULTI_PRODUCT_CONSENT_UNSUPPORTED_MESSAGE: "not supported",
}));

import { ConnectorConsentBody } from "../ConnectorConsentDialog";
import { buildConsentPlan, emptyPlanAnswer } from "../consent-plan";
import {
  googleActivityByProduct,
  parseGoogleCapabilityHealth,
  GOOGLE_CAPABILITY_HEALTH_KIND,
} from "../google-capability-health";
import {
  accountHealth,
  CONNECTOR_REFUSAL_CODES,
  refusalDisposition,
  type ConnectorAccount,
  type ConnectorCapabilityRollout,
  type ConnectorRefusalCode,
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

const GA4_SENTENCE =
  "Your Google account has no access to this Analytics item — whoever owns it " +
  "has not shared it with this account. Reconnecting will not change that: ask " +
  "its owner to share it, or choose one this account can see.";

function account(activity: ConnectorAccount["activity"]): ConnectorAccount {
  return {
    id: "conn-share",
    label: "probe@example.com",
    ownerKind: "person",
    organizationId: null,
    providerSubject: "sub-share",
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
  return { __kind: GOOGLE_CAPABILITY_HEALTH_KIND, ...capabilities };
}

const GA4_ACTIVITY = googleActivityByProduct(
  provider,
  parseGoogleCapabilityHealth(
    column({
      analytics: {
        last_refusal: {
          at: "2026-09-17T12:00:00Z",
          action: "analytics.report",
          code: "resource_permission_denied",
          http_status: 403,
          sentence: GA4_SENTENCE,
        },
      },
    }),
  ),
);

const SHARE_ACCOUNT = account(GA4_ACTIVITY);

describe("buildConsentPlan for a share_required refusal", () => {
  it("blocks the row without calling it ours to repair", () => {
    const plan = buildConsentPlan({
      provider,
      selectedProductKeys: ["analytics"],
      account: SHARE_ACCOUNT,
      rollout: LIVE,
    });
    expect(plan.request).toBeNull();
    expect(plan.empty).toBe(true);
    expect(plan.blocked.map((block) => block.productKey)).toEqual(["analytics"]);
    const reason = plan.blocked[0]?.reason ?? "";
    // THE LIE this test exists to catch:
    expect(reason).not.toContain("ours to repair");
    expect(reason).not.toContain("we are on it");
    // The server's own sentence — which already names who must act — is kept.
    expect(reason).toContain(GA4_SENTENCE);
  });

  it("is what the one answer function says, without claiming ownership", () => {
    const plan = buildConsentPlan({
      provider,
      selectedProductKeys: ["analytics"],
      account: SHARE_ACCOUNT,
      rollout: LIVE,
    });
    const answer = emptyPlanAnswer(plan, 1);
    expect(answer).not.toContain("already connected");
    expect(answer).not.toContain("ours to repair");
    expect(answer).toContain("Analytics");
    expect(answer).toContain(GA4_SENTENCE);
  });
});

let container: HTMLDivElement | null = null;
let root: Root | null = null;

function click(element: Element) {
  act(() => {
    element.dispatchEvent(new MouseEvent("click", { bubbles: true }));
  });
}

afterEach(() => {
  if (root) act(() => root!.unmount());
  container?.remove();
  root = null;
  container = null;
  toastInfo.mockReset();
  run.mockReset();
});

describe("the row for a share_required refusal, switched on", () => {
  it("never promises that approving again renews it", () => {
    container = document.createElement("div");
    document.body.appendChild(container);
    const mounted = createRoot(container);
    root = mounted;
    act(() =>
      mounted.render(
        <ConnectorConsentBody
          provider={provider}
          accounts={[SHARE_ACCOUNT]}
          rollout={LIVE}
          isLoading={false}
          rolloutUnavailable={false}
          errorMessage={null}
          refetch={async () => {}}
        />,
      ),
    );
    const text = container!.textContent ?? "";
    expect(text).toContain(GA4_SENTENCE);
    // THE LIE this test exists to catch: this row's only fix is a different
    // Google identity sharing the item — a re-approval asks Google for
    // nothing new and changes nothing.
    expect(text).not.toContain("renews it — nothing new is asked for");
    expect(text).not.toContain("ours to repair");
  });

  it("presses the CTA and answers honestly, opening no provider window", () => {
    container = document.createElement("div");
    document.body.appendChild(container);
    const mounted = createRoot(container);
    root = mounted;
    act(() =>
      mounted.render(
        <ConnectorConsentBody
          provider={provider}
          accounts={[SHARE_ACCOUNT]}
          rollout={LIVE}
          isLoading={false}
          rolloutUnavailable={false}
          errorMessage={null}
          refetch={async () => {}}
        />,
      ),
    );
    const cta = [...container!.querySelectorAll("button")].find((node) =>
      (node.textContent ?? "").includes(provider.dialog.cta),
    );
    click(cta!);
    expect(run).not.toHaveBeenCalled();
    const said = String(toastInfo.mock.calls[0]?.[0] ?? "");
    expect(said).not.toContain("already connected");
    expect(said).not.toContain("ours to repair");
    expect(said).toContain("Analytics");
  });
});

describe("the disposition contract — no consumer folds one disposition into another's copy", () => {
  const REPRESENTATIVE_SENTENCE: Record<ConnectorRefusalCode, string> = {
    scope_missing: "Reconnect and approve the missing scope.",
    grant_expired_or_revoked: "Your Google grant expired. Reconnect to renew it.",
    platform_configuration:
      "We have not finished setting this up on our side. We are fixing it.",
    provider_denied: "Google refused this request. Reconnect to try again.",
    resource_permission_denied: GA4_SENTENCE,
    resource_unavailable: "This item is temporarily unavailable. Try again shortly.",
    quota_exhausted: "Google's rate limit was hit. This clears on its own shortly.",
    provider_unavailable: "Google was briefly unavailable. This clears on its own.",
    call_failed: "The last call failed. Try again.",
  };

  for (const code of CONNECTOR_REFUSAL_CODES) {
    const disposition = refusalDisposition(code);

    it(`${code} (disposition ${disposition}) never claims another disposition's actor in what WE add`, () => {
      const activity = googleActivityByProduct(
        provider,
        parseGoogleCapabilityHealth(
          column({
            analytics: {
              last_refusal: {
                at: "2026-09-17T12:00:00Z",
                action: "analytics.report",
                code,
                http_status: 403,
                sentence: REPRESENTATIVE_SENTENCE[code],
              },
            },
          }),
        ),
      );
      const rows = accountHealth({
        provider,
        account: account(activity),
        rollout: LIVE,
      });
      const row = rows.find((candidate) => candidate.product.key === "analytics");
      if (!row) throw new Error("no product row covers the analytics capability");

      // Our own remedy — never the passed-through server sentence — is the
      // thing under test: it must say "Reconnect" ONLY for disposition
      // `reconnect`, and never claim ownership for anything else.
      if (disposition === "reconnect") {
        expect(row.remedy ?? "").toContain("Reconnect");
      } else {
        expect(row.remedy).toBeNull();
      }
      if (disposition !== "ours") {
        expect((row.remedy ?? "") + (row.activityNote ?? "")).not.toContain(
          "ours to repair",
        );
      }

      // The same fact, read through buildConsentPlan, for a fully-granted
      // account with no renewal available (the blocked-without-a-button case).
      const plan = buildConsentPlan({
        provider,
        selectedProductKeys: ["analytics"],
        account: account(activity),
        rollout: LIVE,
      });
      if (disposition === "reconnect") {
        // A reconnect-disposition refusal with every scope held is a
        // RENEWAL, not a blocked row — it is asked for, not named as blocked.
        expect(plan.blocked).toEqual([]);
        expect(plan.request?.renewals.map((p) => p.key)).toEqual(["analytics"]);
      } else if (disposition === "self_healing" || disposition === "retry") {
        // Neither state reaches `refused` in health.ts's census, so nothing
        // is blocked and the row is read as already granted.
        expect(plan.alreadyGranted.map((p) => p.key)).toEqual(["analytics"]);
      } else {
        const reason = plan.blocked[0]?.reason ?? "";
        expect(reason).toContain(REPRESENTATIVE_SENTENCE[code]);
        if (disposition === "ours") {
          expect(reason).toContain("ours to repair");
        } else {
          // share_required and any future non-reconnect, non-ours,
          // non-self-healing, non-retry disposition: no ownership claim.
          expect(reason).not.toContain("ours to repair");
          expect(reason).not.toContain("we are on it");
        }
      }
    });
  }
});
