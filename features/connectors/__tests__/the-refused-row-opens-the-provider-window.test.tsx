/**
 * PRESSING THE DIALOG'S BUTTON ON A REFUSED PRODUCT OPENS THE PROVIDER WINDOW —
 * through the real component, a real DOM and a real click.
 *
 * The defect (Cursor Bugbot, frontend PR 228, `f514f3b7`): with a standing
 * `grant_expired_or_revoked` refusal and every scope already held, the dialog's
 * plan was empty, the press was answered with "Everything you switched on is
 * already connected — there is nothing to approve", and `runner.run` was never
 * called. Settings → Reconnect opened the window for the same account, so the
 * person's outcome depended on which door they came through.
 *
 * The fixture is the live column the server writes, through the real parser.
 */

import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import type { ConnectorAccount, ConnectorCapabilityRollout } from "../health";

const toastInfo = jest.fn();

jest.mock("@/lib/toast", () => ({
  toast: {
    info: (...args: unknown[]) => toastInfo(...args),
    success: jest.fn(),
    error: jest.fn(),
  },
}));

jest.mock("@/components/dialogs/confirm/ConfirmDialogHost", () => ({
  confirm: async () => true,
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

import {
  ConnectorConsentBody,
  consentRequestSentence,
} from "../ConnectorConsentDialog";
import { buildConsentPlan } from "../consent-plan";
import {
  googleActivityByProduct,
  parseGoogleCapabilityHealth,
  GOOGLE_CAPABILITY_HEALTH_KIND,
} from "../google-capability-health";
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

const REFUSAL_SENTENCE =
  "Google is no longer honouring this account's permission for Gmail. Reconnect it to send email again.";

const ACTIVITY = googleActivityByProduct(
  provider,
  parseGoogleCapabilityHealth({
    __kind: GOOGLE_CAPABILITY_HEALTH_KIND,
    gmail_send: {
      last_refusal: {
        at: "2026-09-17T14:02:11Z",
        action: "gmail.send",
        code: "grant_expired_or_revoked",
        sentence: REFUSAL_SENTENCE,
        http_status: 401,
      },
    },
  }),
);

const REFUSED: ConnectorAccount = {
  id: "c4",
  label: "info@aimatrx.com",
  ownerKind: "person",
  organizationId: null,
  providerSubject: "sub-c4",
  grantedScopes: [
    "openid",
    "https://www.googleapis.com/auth/userinfo.email",
    "https://www.googleapis.com/auth/userinfo.profile",
    "https://www.googleapis.com/auth/drive.file",
    "https://www.googleapis.com/auth/gmail.send",
  ],
  usable: true,
  statusLabel: "Connected",
  statusReason: "This account can authorize Google calls.",
  statusRemedy: null,
  lastVerifiedAt: "2026-09-14T22:11:00Z",
  lastRefusalSentence: null,
  activity: ACTIVITY,
};

let container: HTMLDivElement;
let root: Root;

function mount() {
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  act(() => {
    root.render(
      <ConnectorConsentBody
        provider={provider}
        accounts={[REFUSED]}
        rollout={LIVE}
        isLoading={false}
        rolloutUnavailable={false}
        errorMessage={null}
        refetch={async () => {}}
      />,
    );
  });
}

function click(element: Element) {
  act(() => {
    element.dispatchEvent(new MouseEvent("click", { bubbles: true }));
  });
}

// The runner resolves the connection the provider window granted (its real
// contract since the dialog reads the returned account, c24b5d5a93); a
// renewal comes back on the same connection it renewed.
beforeEach(() => {
  run.mockResolvedValue({ connectionId: "c4" });
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
  toastInfo.mockReset();
  run.mockReset();
});

describe("the press on a refused product reaches the provider", () => {
  it("opens the provider window instead of answering 'already connected'", async () => {
    mount();
    const cta = [...container.querySelectorAll("button")].find((node) =>
      (node.textContent ?? "").includes(provider.dialog.cta),
    );
    expect(cta).toBeDefined();
    click(cta!);
    await act(async () => {
      await Promise.resolve();
    });
    expect(toastInfo).not.toHaveBeenCalled();
    expect(run).toHaveBeenCalledTimes(1);
    const request = run.mock.calls[0]?.[0] as
      | { capabilityKeys: string[]; addedScopes: string[]; targetAccountId: string | null }
      | undefined;
    expect(request?.capabilityKeys).toContain("gmail_send");
    expect(request?.addedScopes).toEqual([]);
    expect(request?.targetAccountId).toBe("c4");
  });
});

describe("the copy on a refused row promises a renewal", () => {
  it("says what is broken and that approving again renews it", () => {
    mount();
    const text = container.textContent ?? "";
    // The server's own sentence, on the row, where the person reads it.
    expect(text).toContain(REFUSAL_SENTENCE);
    // And the line under the button promises the renewal, not "already connected".
    expect(text).toContain("renew");
    expect(text).not.toContain("already connected");
  });
});

/**
 * A request that BOTH renews a broken grant and adds a new product must say so:
 * neither half may be described as if it were the other.
 */
describe("the sentence for a mixed renew-and-add request", () => {
  it("names what is renewed and keeps the rest of the grant out of it", () => {
    const plan = buildConsentPlan({
      provider,
      selectedProductKeys: ["gmail", "search_console"],
      account: REFUSED,
      rollout: LIVE,
    });
    expect(plan.request?.renewals.map((product) => product.name)).toEqual([
      "Gmail",
    ]);
    expect(plan.request?.addedScopes.length).toBeGreaterThan(0);
    const sentence = consentRequestSentence(provider.name, plan.request!);
    expect(sentence).toContain("renews Gmail");
    expect(sentence).not.toContain("Nothing you already granted is asked for again");
  });
});
