/**
 * A SECOND ACCOUNT'S PRESS NEVER UN-SPINS THE FIRST ACCOUNT'S LIVE CONTROL.
 *
 * THE DEFECT THIS PINS (VERIFY-U-P2-R3, N17). `ConnectorsSettingsPanel` held ONE
 * `ConnectorBusyAction`. `runConsent` set it before `runner.run` and cleared it
 * in `finally`. With account one's provider window still open, pressing account
 * two's Reconnect moved the marker to account two, the runner immediately threw
 * "A Google authorization window is already open." (honest, and shown), and that
 * throw's `finally` cleared busy ENTIRELY — so account one's Reconnect stopped
 * spinning and invited a press that would be refused, while its window was still
 * open. Round 2's N6 fixed which card a marker belongs to; this fixes how many
 * markers there can be.
 *
 * THE CLASS FIX PINNED BELOW: in-flight presses are a SET, keyed by account and
 * product, and each press removes only its own entry. The card takes the set and
 * spins only what is running on it.
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
  selectOrganizationId: () => "org-1",
  selectEffectiveOrganizationId: () => "org-1",
}));

jest.mock("@/features/scopes/redux/selectors/tree", () => ({
  selectOrganizationsList: () => [],
}));

jest.mock("@/features/surfaces/runtime/SurfaceRuntimeContext", () => ({
  useSurfaceScopeContribution: () => {},
}));

jest.mock("@/components/dialogs/confirm/ConfirmDialogHost", () => ({
  confirm: async () => false,
}));

jest.mock("@/features/marketing/google/hooks", () => ({
  useDisconnectGoogle: () => ({ mutateAsync: async () => {} }),
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

/**
 * The real runner's behaviour: the first window stays open (a promise that never
 * settles), and any second press is refused at once by its own guard.
 */
let openWindows = 0;
const run = jest.fn(() => {
  if (openWindows > 0) {
    return Promise.reject(
      new Error("A Google authorization window is already open."),
    );
  }
  openWindows += 1;
  return new Promise<{ connectionId: string }>(() => {});
});

jest.mock("../google-adapter", () => {
  const actual = jest.requireActual("../google-adapter");
  return {
    ...actual,
    useGoogleConsentRunner: () => ({ run, ready: true }),
    useGoogleConnectorState: () => ({
      accounts: ACCOUNTS,
      rollout: ROLLOUT,
      resourceCountByAccount: {},
      isLoading: false,
      rolloutUnavailable: false,
      isError: false,
      errorMessage: null,
      refetch: async () => {},
    }),
  };
});

import { ConnectorsSettingsPanel } from "../ConnectorsSettingsPanel";
import type { ConnectorAccount, ConnectorCapabilityRollout } from "../health";
import { GOOGLE_CONNECTOR_PROVIDER } from "../provider-config";

const provider = GOOGLE_CONNECTOR_PROVIDER;

const ROLLOUT: ConnectorCapabilityRollout[] = [
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

/** Two dead credentials: each card shows exactly one account-level Reconnect. */
function dead(id: string, label: string): ConnectorAccount {
  return {
    id,
    label,
    ownerKind: "person",
    organizationId: null,
    providerSubject: `sub-${id}`,
    grantedScopes: EVERY_SCOPE,
    usable: false,
    statusLabel: "Needs reconnecting",
    statusReason: "Google would not renew this account's permission.",
    statusRemedy: `Reconnect ${label}.`,
    lastVerifiedAt: "2026-09-17T12:00:00Z",
    lastRefusalSentence: null,
    activity: {},
  };
}

const ACCOUNTS = [dead("acct-1", "one@aimatrx.com"), dead("acct-2", "two@aimatrx.com")];

let container: HTMLDivElement | null = null;
let root: Root | null = null;

function cards(): HTMLElement[] {
  return [...container!.querySelectorAll("div.bg-card")] as HTMLElement[];
}

function accountReconnect(index: number): HTMLButtonElement {
  const card = cards()[index];
  const button = [...card.querySelectorAll("button")].find((node) =>
    (node.textContent ?? "").trim().startsWith("Reconnect"),
  );
  if (!button) throw new Error(`no account Reconnect on card ${index}`);
  return button as HTMLButtonElement;
}

afterEach(() => {
  if (root) act(() => root!.unmount());
  container?.remove();
  root = null;
  container = null;
  openWindows = 0;
  run.mockClear();
});

describe("two accounts, two presses", () => {
  it("keeps the first account's control spinning when the second is refused", async () => {
    container = document.createElement("div");
    document.body.appendChild(container);
    const mounted = createRoot(container);
    root = mounted;
    act(() => mounted.render(<ConnectorsSettingsPanel />));

    await act(async () => {
      accountReconnect(0).dispatchEvent(
        new MouseEvent("click", { bubbles: true }),
      );
    });
    expect(accountReconnect(0).disabled).toBe(true);

    await act(async () => {
      accountReconnect(1).dispatchEvent(
        new MouseEvent("click", { bubbles: true }),
      );
    });
    // Before the fix the single busy slot moved to account two and then its
    // `finally` cleared it, so THIS was false while account one's window was
    // still open.
    expect(accountReconnect(0).disabled).toBe(true);
    expect(accountReconnect(1).disabled).toBe(false);
    expect(run).toHaveBeenCalledTimes(2);
  });
});
