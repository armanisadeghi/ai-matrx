import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { toast } from "@/lib/toast";
import type { ConnectorAccount, ConnectorCapabilityRollout } from "../health";
import { GOOGLE_CONNECTOR_PROVIDER } from "../provider-config";

const { makeAppContextState } = jest.requireActual<
  typeof import("@/lib/redux/slices/appContextSlice")
>("@/lib/redux/slices/appContextSlice");
const appContext = makeAppContextState({
  organization_id: "org-1",
  orgBootstrapResolved: true,
});

jest.mock("@/lib/toast", () => ({
  toast: { info: jest.fn(), success: jest.fn(), error: jest.fn() },
}));
jest.mock("@/lib/redux/hooks", () => ({
  useAppSelector: (selector: (state: unknown) => unknown) =>
    selector({ appContext, userAuth: { id: "user-1" } }),
  useAppDispatch: () => jest.fn(),
}));
jest.mock("@/features/scopes/redux/selectors/tree", () => ({
  selectOrganizationsList: () => [],
}));
jest.mock("@/features/surfaces/runtime/SurfaceRuntimeContext", () => ({
  useSurfaceScopeContribution: () => {},
}));
jest.mock("@/components/dialogs/confirm/ConfirmDialogHost", () => ({
  confirm: async () => true,
}));
jest.mock("@/features/marketing/google/hooks", () => ({
  useDisconnectGoogle: () => ({ mutateAsync: async () => {} }),
}));
jest.mock("@/providers/google-provider/LazyGoogleAPIProvider", () => ({
  LazyGoogleAPIProvider: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));
jest.mock("@/providers/google-provider/GoogleApiProvider", () => ({
  isGoogleAuthorizationCancelled: () => false,
  useGoogleAPI: () => ({ isGoogleLoaded: true }),
}));
jest.mock("../ConnectorConsentDialog", () => ({ ConnectorConsentBody: () => null }));

const run = jest.fn();
let refreshed: ConnectorAccount[];
jest.mock("../google-adapter", () => {
  const actual = jest.requireActual("../google-adapter");
  return {
    ...actual,
    useGoogleConsentRunner: () => ({ run, ready: true }),
    useGoogleConnectorState: () => ({
      accounts: [before],
      rollout,
      resourceCountByAccount: {},
      isLoading: false,
      rolloutUnavailable: false,
      isError: false,
      errorMessage: null,
      refetch: async () => refreshed,
    }),
  };
});

import { ConnectorsSettingsPanel } from "../ConnectorsSettingsPanel";

const provider = GOOGLE_CONNECTOR_PROVIDER;
const gmailRead = provider.products.find((product) => product.key === "gmail_read")!;
const rollout: ConnectorCapabilityRollout[] = gmailRead.capabilityKeys.map((capabilityKey) => ({
  capabilityKey,
  phase: "available",
  eligible: true,
  requiredScopes: [],
  ineligibleReason: null,
}));
const before: ConnectorAccount = {
  id: "review-mailbox",
  label: "reviewer@example.test",
  ownerKind: "person",
  organizationId: null,
  providerSubject: "google-reviewer",
  grantedScopes: [...provider.identityScopes],
  usable: true,
  statusLabel: "Connected",
  statusReason: "Ready",
  statusRemedy: null,
  lastVerifiedAt: "2026-09-24T12:00:00Z",
  lastRefusalSentence: null,
};
const after: ConnectorAccount = {
  ...before,
  grantedScopes: [...provider.identityScopes, ...gmailRead.scopes],
};

async function pressGmailReading(): Promise<{ container: HTMLDivElement; root: Root }> {
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);
  await act(async () => root.render(<ConnectorsSettingsPanel />));
  const row = [...container.querySelectorAll("li")].find((node) =>
    (node.textContent ?? "").includes("Gmail reading"),
  );
  const button = [...(row?.querySelectorAll("button") ?? [])].find((node) =>
    (node.textContent ?? "").trim() === "Connect",
  );
  expect(button).toBeDefined();
  await act(async () => {
    button!.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    await Promise.resolve();
  });
  return { container, root };
}

afterEach(() => {
  run.mockReset();
  jest.mocked(toast.success).mockClear();
});

it("does not say Connected when the returned account is absent from the refreshed inventory", async () => {
  refreshed = [];
  run.mockResolvedValue({ connectionId: before.id });
  const { container, root } = await pressGmailReading();
  try {
    expect(run).toHaveBeenCalledTimes(1);
    expect(toast.success).not.toHaveBeenCalled();
    expect(container.textContent).toContain("could not confirm this account");
  } finally {
    act(() => root.unmount());
    container.remove();
  }
});

it("announces Connected when the returned account has the requested grant", async () => {
  refreshed = [after];
  run.mockResolvedValue({ connectionId: before.id });
  const { container, root } = await pressGmailReading();
  try {
    expect(run).toHaveBeenCalledTimes(1);
    expect(toast.success).toHaveBeenCalledWith("Connected.");
    expect(container.textContent).not.toContain("could not confirm this account");
  } finally {
    act(() => root.unmount());
    container.remove();
  }
});

it("does not use another account's grant as proof for the returned connection", async () => {
  refreshed = [{ ...after, id: "another-mailbox" }];
  run.mockResolvedValue({ connectionId: before.id });
  const { container, root } = await pressGmailReading();
  try {
    expect(toast.success).not.toHaveBeenCalled();
    expect(container.textContent).toContain("could not confirm this account");
  } finally {
    act(() => root.unmount());
    container.remove();
  }
});

it("does not announce Connected when the returned account lacks the requested permission", async () => {
  refreshed = [before];
  run.mockResolvedValue({ connectionId: before.id });
  const { container, root } = await pressGmailReading();
  try {
    expect(toast.success).not.toHaveBeenCalled();
    expect(container.textContent).toContain("Gmail reading");
    expect(container.textContent).toContain("did not grant this one");
  } finally {
    act(() => root.unmount());
    container.remove();
  }
});
