/**
 * A DEAD CREDENTIAL IS A RENEWAL OF EVERYTHING THIS ACCOUNT HOLDS — and it is
 * offered, once, on the account.
 *
 * THE DEFECT THIS PINS (VERIFY-U-P2-R2, N2 — the worst finding of that round).
 * An account whose credential is dead (`usable: false`: revoked,
 * `credential_present` false, or `status = 'needs_attention'` — nine such rows
 * were live on 2026-09-17) with every scope still granted and nothing recorded
 * in `capability_health` produced `actionLabel: null` on every row, because the
 * verb was derived from `missingScopes` and the recorded refusal alone and never
 * from `account.usable`. So all nine rows printed "Needs reconnecting — Reconnect
 * <account>." beside ZERO action buttons — the exact dead end `health.ts`'s own
 * header says this primitive exists to end — and the consent dialog was worse:
 * every product landed in `alreadyGranted`, the plan was empty, and the press
 * answered "Everything you switched on is already connected."
 *
 * THE RULING (chair, 2026-09-17): a dead credential is a renewal of EVERY
 * granted product on that account — ONE Reconnect on the account, the plan
 * carries all of them as renewals, and the press opens the provider window.
 *
 * THE CLASS FIX PINNED BELOW: the verb AND its scope come from the one
 * derivation in `health.ts`, so `grantNeedsRenewal`, `buildConsentPlan`, the
 * dialog and the settings rows cannot disagree about the same account.
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

import { ConnectedAccountHealth } from "../ConnectedAccountHealth";
import { MANAGEMENT_ALLOWED } from "../shared-account-level";
import { ConnectorConsentBody } from "../ConnectorConsentDialog";
import { buildConsentPlan } from "../consent-plan";
import {
  accountHealth,
  accountRenewalProductKeys,
  grantNeedsRenewal,
  productHealth,
  type ConnectorAccount,
  type ConnectorCapabilityRollout,
} from "../health";
import { GOOGLE_CONNECTOR_PROVIDER, productByKey } from "../provider-config";

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

/** Every scope the nine products need — the "all granted" half of the shape. */
const EVERY_SCOPE = [
  ...new Set([
    ...provider.identityScopes,
    ...provider.products.flatMap((product) => product.scopes),
  ]),
];

/**
 * The live shape of the 2026-07-25 incident and of the nine `status='revoked'`
 * rows: the grant is intact, the credential is gone, nothing is recorded.
 */
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
  lastVerifiedAt: "2026-07-25T12:00:00Z",
  lastRefusalSentence: null,
  activity: {},
};

describe("the one derivation reads the credential, not only the scopes", () => {
  it("offers a Reconnect on every granted product of a dead account", () => {
    const rows = accountHealth({ provider, account: DEAD, rollout: LIVE });
    expect(rows).toHaveLength(provider.products.length);
    for (const row of rows) {
      expect(row.state).toBe("account_unusable");
      expect(row.missingScopes).toEqual([]);
      // Before the fix this was null on all nine rows.
      expect(row.actionLabel).toBe("Reconnect");
      // And the repair is the ACCOUNT's, not this product's.
      expect(row.actionScope).toBe("account");
    }
  });

  it("calls every one of them a renewal", () => {
    for (const product of provider.products) {
      expect(
        grantNeedsRenewal({ provider, product, account: DEAD, rollout: LIVE }),
      ).toBe(true);
    }
    expect(accountRenewalProductKeys({ provider, account: DEAD, rollout: LIVE })).toEqual(
      provider.products.map((product) => product.key),
    );
  });

  it("still says Connect on a product this dead account never granted", () => {
    const partial: ConnectorAccount = {
      ...DEAD,
      grantedScopes: [
        ...provider.identityScopes,
        ...productByKey(provider, "gmail")!.scopes,
      ],
    };
    const gmail = productHealth({
      provider,
      product: productByKey(provider, "gmail")!,
      account: partial,
      rollout: LIVE,
    });
    expect(gmail.actionLabel).toBe("Reconnect");
    expect(gmail.actionScope).toBe("account");
    const calendar = productHealth({
      provider,
      product: productByKey(provider, "calendar")!,
      account: partial,
      rollout: LIVE,
    });
    // Nothing was ever granted here, so "Reconnect" would be a lie about it.
    expect(calendar.state).toBe("not_connected");
    expect(calendar.actionLabel).toBe("Connect");
    expect(calendar.actionScope).toBe("product");
  });
});

describe("the plan a dead credential produces", () => {
  it("renews every granted product in ONE request and asks for nothing new", () => {
    const plan = buildConsentPlan({
      provider,
      selectedProductKeys: provider.products.map((product) => product.key),
      account: DEAD,
      rollout: LIVE,
    });
    expect(plan.empty).toBe(false);
    expect(plan.alreadyGranted).toEqual([]);
    expect(plan.request?.renewals.map((product) => product.key)).toEqual(
      provider.products.map((product) => product.key),
    );
    expect(plan.request?.addedScopes).toEqual([]);
    expect(plan.request?.targetAccountId).toBe("conn-dead");
  });
});

let container: HTMLDivElement | null = null;
let root: Root | null = null;

function mount(node: React.ReactElement) {
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  act(() => root!.render(node));
}

function buttons(): HTMLButtonElement[] {
  return [...container!.querySelectorAll("button")];
}

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

describe("the settings card for a dead account", () => {
  it("carries ONE account Reconnect that renews what the account holds", () => {
    const reconnectAccount = jest.fn();
    mount(
      <ConnectedAccountHealth
        management={MANAGEMENT_ALLOWED}
        provider={provider}
        account={DEAD}
        health={accountHealth({ provider, account: DEAD, rollout: LIVE })}
        onReconnect={() => {}}
        onReconnectAccount={reconnectAccount}
        onRevoke={() => {}}
        busy={null}
      />,
    );
    const repair = buttons().filter((node) =>
      (node.textContent ?? "").includes("Reconnect"),
    );
    // Before the fix: zero. Now exactly one — the account's, not nine copies.
    expect(repair).toHaveLength(1);
    click(repair[0]!);
    expect(reconnectAccount).toHaveBeenCalledTimes(1);
    const text = container!.textContent ?? "";
    expect(text).toContain("Reconnect probe@example.com.");
    // It says what one approval covers, before it is pressed.
    expect(text).toContain("9 products");
  });
});

describe("the consent dialog for a dead account", () => {
  it("opens the provider window instead of saying everything is connected", () => {
    mount(
      <ConnectorConsentBody
        provider={provider}
        accounts={[DEAD]}
        rollout={LIVE}
        isLoading={false}
        rolloutUnavailable={false}
        errorMessage={null}
        refetch={async () => {}}
      />,
    );
    const cta = buttons().find((node) =>
      (node.textContent ?? "").includes(provider.dialog.cta),
    );
    expect(cta).toBeDefined();
    click(cta!);
    expect(toastInfo).not.toHaveBeenCalled();
    expect(run).toHaveBeenCalledTimes(1);
    const request = run.mock.calls[0]?.[0] as
      | { renewals: { key: string }[]; addedScopes: string[] }
      | undefined;
    expect(request?.addedScopes).toEqual([]);
    expect(request?.renewals).toHaveLength(provider.products.length);
    expect(container!.textContent ?? "").not.toContain("already connected");
    // And the switcher does not call a held-but-unusable account empty.
    expect(container!.textContent ?? "").not.toContain(
      "Nothing connected on this account yet",
    );
  });
});
