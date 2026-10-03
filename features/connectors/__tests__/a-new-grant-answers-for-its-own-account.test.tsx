import React, { act, useState } from "react";
import { createRoot, type Root } from "react-dom/client";
import type { ConnectorAccount, ConnectorCapabilityRollout } from "../health";
import { toast } from "@/lib/toast";

(
  globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

jest.mock("@/lib/toast", () => ({
  toast: { info: jest.fn(), success: jest.fn(), error: jest.fn() },
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
jest.mock("@/providers/google-provider/GoogleApiProvider", () => ({
  isGoogleAuthorizationCancelled: () => false,
  useGoogleAPI: () => ({ isGoogleLoaded: true }),
}));

const run = jest.fn();
jest.mock("../google-adapter", () => ({
  useGoogleConsentRunner: () => ({ run, ready: true }),
  useGoogleConnectorState: () => ({
    accounts: [], rollout: [], isLoading: false, rolloutUnavailable: false,
    errorMessage: null, refetch: async () => {},
  }),
  multiProductConsentUnsupported: () => false,
  MULTI_PRODUCT_CONSENT_UNSUPPORTED_MESSAGE: "not supported",
}));

import { ConnectorConsentBody } from "../ConnectorConsentDialog";
import { GOOGLE_CONNECTOR_PROVIDER } from "../provider-config";
import { GOOGLE_SCOPE } from "@/lib/googleScopes";

const provider = GOOGLE_CONNECTOR_PROVIDER;
const gmailRead = provider.products.find((product) => product.key === "gmail_read")!;
const rollout: ConnectorCapabilityRollout[] = gmailRead.capabilityKeys.map((capabilityKey) => ({
  capabilityKey, phase: "available", eligible: true, requiredScopes: [], ineligibleReason: null,
}));
const connected: ConnectorAccount = {
  id: "review-mailbox",
  label: "reviewer@example.test",
  ownerKind: "person",
  organizationId: null,
  providerSubject: "google-reviewer",
  grantedScopes: [...gmailRead.scopes],
  usable: true,
  statusLabel: "Connected",
  statusReason: "Ready",
  statusRemedy: null,
  lastVerifiedAt: "2026-09-24T12:00:00Z",
  lastRefusalSentence: null,
};

function Fixture({ initial = [], afterRefetch = [connected] }: {
  initial?: ConnectorAccount[];
  afterRefetch?: ConnectorAccount[];
}) {
  const [accounts, setAccounts] = useState<ConnectorAccount[]>(initial);
  return (
    <ConnectorConsentBody
      provider={provider}
      accounts={accounts}
      rollout={rollout}
      isLoading={false}
      rolloutUnavailable={false}
      errorMessage={null}
      initialProductKeys={["gmail_read"]}
      refetch={async () => setAccounts(afterRefetch)}
    />
  );
}

it("shows a successful new Gmail reading grant against the returned connection", async () => {
  run.mockResolvedValue({ connectionId: connected.id });
  jest.mocked(toast.success).mockClear();
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root: Root = createRoot(container);
  try {
    await act(async () => root.render(<Fixture />));
    const button = [...container.querySelectorAll("button")].find((node) =>
      (node.textContent ?? "").includes(provider.dialog.cta),
    );
    expect(button).toBeDefined();
    await act(async () => {
      button!.dispatchEvent(new MouseEvent("click", { bubbles: true }));
      await Promise.resolve();
    });
    expect(run).toHaveBeenCalledTimes(1);
    expect(run.mock.calls[0]?.[0].capabilityKeys).toEqual(["gmail_read"]);
    expect(container.textContent).toContain("Ready to use");
    expect(container.textContent).toContain("Gmail reading");
    expect(container.textContent).not.toContain("did not grant this one");
    expect(toast.success).toHaveBeenCalledWith("Google connected.");
  } finally {
    act(() => root.unmount());
    container.remove();
    run.mockReset();
  }
});

it("shows Gmail reading connected without an approval offer for a modify-only account", async () => {
  const modifyOnly = {
    ...connected,
    grantedScopes: [...provider.identityScopes, GOOGLE_SCOPE.gmailModify],
  };
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root: Root = createRoot(container);
  try {
    await act(async () =>
      root.render(
        <Fixture initial={[modifyOnly]} afterRefetch={[modifyOnly]} />,
      ),
    );
    const connectedSwitch = container.querySelector<HTMLButtonElement>(
      '[aria-label="Do not connect Gmail reading"]',
    );
    expect(connectedSwitch).not.toBeNull();
    expect(connectedSwitch?.disabled).toBe(true);
    expect(
      container.querySelector('[aria-label="Connect Gmail reading"]'),
    ).toBeNull();
    expect(run).not.toHaveBeenCalled();
  } finally {
    act(() => root.unmount());
    container.remove();
    run.mockReset();
  }
});

it("does not announce success when the returned connection is absent after refresh", async () => {
  run.mockResolvedValue({ connectionId: connected.id });
  jest.mocked(toast.success).mockClear();
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root: Root = createRoot(container);
  try {
    await act(async () => root.render(<Fixture afterRefetch={[]} />));
    const button = [...container.querySelectorAll("button")].find((node) =>
      (node.textContent ?? "").includes(provider.dialog.cta),
    );
    await act(async () => {
      button!.dispatchEvent(new MouseEvent("click", { bubbles: true }));
      await Promise.resolve();
    });
    expect(run).toHaveBeenCalledTimes(1);
    expect(container.textContent).toContain("could not confirm this account");
    expect(container.textContent).toContain("Settings → Connectors");
    expect(container.textContent).not.toContain("Ready to use");
    expect(toast.success).not.toHaveBeenCalled();
  } finally {
    act(() => root.unmount());
    container.remove();
    run.mockReset();
  }
});

it("keeps the completed request when an existing account's refreshed plan is empty", async () => {
  run.mockResolvedValue({ connectionId: connected.id });
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root: Root = createRoot(container);
  try {
    await act(async () => root.render(
      <Fixture initial={[{ ...connected, grantedScopes: [...provider.identityScopes] }]} />,
    ));
    const button = [...container.querySelectorAll("button")].find((node) =>
      (node.textContent ?? "").includes(provider.dialog.cta),
    );
    await act(async () => {
      button!.dispatchEvent(new MouseEvent("click", { bubbles: true }));
      await Promise.resolve();
    });
    expect(container.textContent).toContain("Ready to use");
    expect(container.textContent).not.toContain("did not grant this one");
  } finally {
    act(() => root.unmount());
    container.remove();
    run.mockReset();
  }
});
