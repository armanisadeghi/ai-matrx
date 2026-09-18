/**
 * THE DIALOG A PERSON REACHES FROM "Needs reconnecting" SAYS SO (V17-3).
 *
 * THE DEFECT THIS PINS (VERIFY-U-P2-R5). Driving the real `ConnectorConsentBody`
 * with one account whose credential is gone, the entire visible DOM was:
 *
 *   "Connecting as info@aimatrx.com · Switching on another product adds it to
 *    this account. Nothing it already has is asked for again." — then nine rows,
 *    each just its name, its promise and "What Google is asked for" — then
 *    "Connect selected" and "Google will ask you to approve 9 products again,
 *    which renews the access it stopped honouring. Nothing new is asked for."
 *
 * "Needs reconnecting" appeared ZERO times and "cannot be used" ZERO times.
 * `ProductRow` rendered a badge for `connected`, `scope_missing` and `refused`
 * and NOTHING for `account_unusable`, so every one of the nine broken rows read
 * exactly like a row nobody had ever connected — and the line above them promised
 * the OPPOSITE of what the press would do, while the footer under the button said
 * it would approve nine products again.
 *
 * The honest sentence already existed (`accountSummary` builds "Needs
 * reconnecting — 9 products it already has cannot be used") and was rendered ONLY
 * inside the account `Select`'s item list, which is closed, and which a person
 * with a single account never opens. This is N2's shape surviving in the surface
 * a person reaches from the prompt card.
 *
 * RED before the fix, with this file's own inputs: "Needs reconnecting" 0×,
 * "cannot be used" 0×, and the contradicting "Nothing it already has is asked for
 * again" present above a footer promising nine renewals.
 */

import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import type { ConnectorAccount, ConnectorCapabilityRollout } from "../health";

jest.mock("@/lib/toast", () => ({
  toast: { info: jest.fn(), success: jest.fn(), error: jest.fn() },
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

jest.mock("../google-adapter", () => ({
  useGoogleConsentRunner: () => ({ run: jest.fn(), ready: true }),
  multiProductConsentUnsupported: () => false,
  MULTI_PRODUCT_CONSENT_UNSUPPORTED_MESSAGE: "not supported",
}));

import { ConnectorConsentBody } from "../ConnectorConsentDialog";
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

/** Every scope the provider config declares — the account HOLDS all nine products. */
const ALL_SCOPES = [
  ...new Set([
    ...provider.identityScopes,
    ...provider.products.flatMap((product) => product.scopes),
  ]),
];

/** THE VERIFIER'S ACCOUNT: nine products granted, and a credential that is gone. */
const DEAD: ConnectorAccount = {
  id: "c4",
  label: "info@aimatrx.com",
  ownerKind: "person",
  organizationId: null,
  providerSubject: "sub-c4",
  grantedScopes: ALL_SCOPES,
  usable: false,
  statusLabel: "Needs reconnecting",
  statusReason:
    "AI Matrx no longer holds a saved permission for info@aimatrx.com, so it cannot make any Google request with it.",
  statusRemedy: "Reconnect info@aimatrx.com to restore access.",
  lastVerifiedAt: "2026-09-14T22:11:00Z",
  lastRefusalSentence: null,
};

/** The same account, blocked by our own configuration instead (V17-1's state). */
const BLOCKED: ConnectorAccount = {
  ...DEAD,
  blocked: true,
  statusLabel: "Ours to repair",
  statusReason:
    "Google rejected AI Matrx's own app configuration for info@aimatrx.com. This one is ours to repair, and approving it again would not help.",
  statusRemedy: null,
};

let container: HTMLDivElement;
let root: Root;

function mount(account: ConnectorAccount) {
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  act(() => {
    root.render(
      <ConnectorConsentBody
        provider={provider}
        accounts={[account]}
        rollout={LIVE}
        isLoading={false}
        rolloutUnavailable={false}
        errorMessage={null}
        refetch={async () => {}}
      />,
    );
  });
}

afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

/** Text a person can actually see — a closed `Select`'s items are not rendered. */
function visible(): string {
  return container.textContent ?? "";
}

describe("a dead credential, in the dialog", () => {
  it("says the account needs reconnecting ABOVE the rows, not only inside the switcher", () => {
    mount(DEAD);
    const shown = visible();
    expect(shown).toContain("Needs reconnecting");
    expect(shown).toContain("cannot be used");
    expect(shown).toContain(
      `${provider.products.length} products it already has cannot be used`,
    );
  });

  it("stops promising that nothing it already has is asked for again", () => {
    mount(DEAD);
    // That line is TRUE for a healthy account and false for this one: the press
    // renews every product the account holds.
    expect(visible()).not.toContain(
      "Nothing it already has is asked for again",
    );
    // …and it says what the press really does, agreeing with the footer.
    expect(visible()).toContain("renews what it already has");
  });

  it("agrees with its own footer", () => {
    mount(DEAD);
    const shown = visible();
    // The footer's renewal promise, and the line above the rows, now make the
    // same claim. Before this, one said nothing was asked for again and the other
    // said nine products would be approved again.
    expect(shown).toContain(
      `approve ${provider.products.length} products again`,
    );
    expect(shown).toContain("nothing new is asked for");
  });

  it("badges every row the account HOLDS, so none reads as never connected", () => {
    mount(DEAD);
    const badges = visible().match(/Needs reconnecting/g) ?? [];
    // One per product row, plus the account-level line above them.
    expect(badges.length).toBeGreaterThanOrEqual(provider.products.length);
    // And each row carries the account's own sentence rather than only a promise.
    const sentences =
      visible().match(/no longer holds a saved permission/g) ?? [];
    expect(sentences.length).toBeGreaterThanOrEqual(provider.products.length);
  });
});

describe("an account our own configuration blocks, in the dialog", () => {
  it("says blocked, offers no toggle, and never claims a renewal would help", () => {
    mount(BLOCKED);
    const shown = visible();
    expect(shown).toContain("Blocked");
    expect(shown).toContain("approving it again would not help");
    expect(shown).not.toContain("Nothing it already has is asked for again");
    expect(shown).not.toContain("renews what it already has");
    // No row may be switched on: the provider window could not succeed.
    expect(container.querySelectorAll('button[role="switch"]')).toHaveLength(0);
  });

  it("answers the press in words instead of reporting it already connected", () => {
    mount(BLOCKED);
    const cta = [...container.querySelectorAll("button")].find((button) =>
      (button.textContent ?? "").includes(provider.dialog.cta),
    );
    expect(cta).toBeTruthy();
    // The plan is empty and blocked, so the standing answer is on screen.
    expect(visible()).not.toContain(
      "Everything you switched on is already connected",
    );
  });
});
