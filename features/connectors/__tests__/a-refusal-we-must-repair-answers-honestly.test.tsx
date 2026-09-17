/**
 * A REFUSAL THAT IS OURS TO REPAIR IS ANSWERED HONESTLY — never with "everything
 * you switched on is already connected".
 *
 * THE DEFECT THIS PINS (VERIFY-U-P2-R2, N1). With a `platform_configuration`
 * refusal recorded for a product whose scopes are all present, the row correctly
 * said "Not working", carried the server's "this is ours to repair" sentence and
 * offered no button. But the row still starts switched ON (it IS connected on
 * this account), the plan was empty because the refusal is not a renewal, and the
 * ONE sentence the press produced — inline AND in a toast — was "Everything you
 * switched on is already connected — there is nothing to approve." That is the
 * boolean that lies, in the one place the owner named, directly under a row that
 * says the opposite.
 *
 * THE RULING: the press must answer honestly — name the product, say it is ours
 * to repair, and offer no fake button. The plan-empty sentence is never the
 * answer when a selected product is refused for a reason a reconnect cannot
 * clear.
 *
 * THE CLASS FIX PINNED BELOW: `buildConsentPlan` reports such a product as
 * BLOCKED with its own reason instead of quietly calling it already granted, and
 * the one answer function names every blocked row. So a rollout-gated row and an
 * ours-to-repair row are both answered, on every consent surface, from one place.
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

const OURS_SENTENCE =
  "We have not finished setting Gmail up on our side, so reconnecting will not help. We are fixing it.";

/** The live column, through the real parser: a 500 we own. */
const ACTIVITY = googleActivityByProduct(
  provider,
  parseGoogleCapabilityHealth({
    __kind: GOOGLE_CAPABILITY_HEALTH_KIND,
    gmail_send: {
      last_refusal: {
        at: "2026-09-17T14:02:11Z",
        action: "gmail.send",
        code: "platform_configuration",
        sentence: OURS_SENTENCE,
        http_status: 500,
      },
    },
  }),
);

const ACCOUNT: ConnectorAccount = {
  id: "c9",
  label: "info@aimatrx.com",
  ownerKind: "person",
  organizationId: null,
  providerSubject: "sub-c9",
  grantedScopes: [
    ...provider.identityScopes,
    "https://www.googleapis.com/auth/gmail.send",
  ],
  usable: true,
  statusLabel: "Connected",
  statusReason: "This account can authorize Google calls.",
  statusRemedy: null,
  lastVerifiedAt: "2026-09-16T22:11:00Z",
  lastRefusalSentence: null,
  activity: ACTIVITY,
};

describe("the plan for a refusal a reconnect cannot clear", () => {
  it("blocks it with its own reason instead of calling it already granted", () => {
    const plan = buildConsentPlan({
      provider,
      selectedProductKeys: ["gmail"],
      account: ACCOUNT,
      rollout: LIVE,
    });
    expect(plan.request).toBeNull();
    expect(plan.empty).toBe(true);
    // Before the fix Gmail sat in `alreadyGranted` and nothing was blocked.
    expect(plan.alreadyGranted).toEqual([]);
    expect(plan.blocked.map((block) => block.productKey)).toEqual(["gmail"]);
    expect(plan.blocked[0]?.reason).toContain(OURS_SENTENCE);
    expect(plan.blocked[0]?.reason).toContain("ours to repair");
  });

  it("is what the one answer function says, naming the product", () => {
    const plan = buildConsentPlan({
      provider,
      selectedProductKeys: ["gmail"],
      account: ACCOUNT,
      rollout: LIVE,
    });
    const answer = emptyPlanAnswer(plan, 1);
    expect(answer).not.toContain("already connected");
    expect(answer).toContain("Gmail");
    expect(answer).toContain(OURS_SENTENCE);
  });

  it("still says 'already connected' when that is the truth", () => {
    const healthy = { ...ACCOUNT, activity: {} };
    const plan = buildConsentPlan({
      provider,
      selectedProductKeys: ["gmail"],
      account: healthy,
      rollout: LIVE,
    });
    expect(plan.alreadyGranted.map((product) => product.key)).toEqual(["gmail"]);
    expect(emptyPlanAnswer(plan, 1)).toContain("already connected");
    expect(emptyPlanAnswer(plan, 0)).toContain("Nothing is switched on yet");
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

describe("the press in the dialog", () => {
  it("answers with the product and why, and opens no provider window", () => {
    container = document.createElement("div");
    document.body.appendChild(container);
    const mounted = createRoot(container);
    root = mounted;
    act(() =>
      mounted.render(
        <ConnectorConsentBody
          provider={provider}
          accounts={[ACCOUNT]}
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
    expect(toastInfo).toHaveBeenCalledTimes(1);
    const said = String(toastInfo.mock.calls[0]?.[0] ?? "");
    expect(said).not.toContain("already connected");
    expect(said).toContain("Gmail");
    const text = container!.textContent ?? "";
    expect(text).not.toContain("already connected");
    expect(text).toContain("ours to repair");
  });
});
