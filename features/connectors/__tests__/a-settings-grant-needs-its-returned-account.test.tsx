import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { toast } from "@/lib/toast";
import { GOOGLE_SCOPE } from "@/lib/googleScopes";
import type { ConnectorAccount, ConnectorCapabilityRollout } from "../health";
import { GOOGLE_CONNECTOR_PROVIDER } from "../provider-config";

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean })
  .IS_REACT_ACT_ENVIRONMENT = true;

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
// The chat package reads these hooks through its own module (P3): one double covers both.
jest.mock("@ai-matrx/chat/store/hooks", () => jest.requireMock("@/lib/redux/hooks"));
jest.mock("@/features/scopes/redux/selectors/tree", () => ({
  selectOrganizationsList: () => [],
}));
jest.mock("@/lib/scoped-config/effectiveKnobs.client", () => ({
  useEffectiveKnob: () => undefined,
}));
jest.mock("@ai-matrx/chat/surfaces/runtime/SurfaceRuntimeContext", () => ({
  useSurfaceScopeContribution: () => {},
}));
const confirm = jest.fn(async (_options: { title: string }) => true);
jest.mock("@/components/dialogs/confirm/ConfirmDialogHost", () => ({ confirm }));
jest.mock("@/features/marketing/google/hooks", () => ({
  useDisconnectGoogle: () => ({ mutateAsync: async () => {} }),
}));
jest.mock("@/providers/google-provider/LazyGoogleAPIProvider", () => ({
  LazyGoogleAPIProvider: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));
const isGoogleAuthorizationCancelled = jest.fn(() => false);
jest.mock("@/providers/google-provider/GoogleApiProvider", () => ({
  isGoogleAuthorizationCancelled,
  useGoogleAPI: () => ({ isGoogleLoaded: true }),
}));
jest.mock("../ConnectorConsentDialog", () => ({ ConnectorConsentBody: () => null }));

const run = jest.fn();
const runInThisTab = jest.fn();
let refreshed: ConnectorAccount[];
jest.mock("../google-adapter", () => {
  const actual = jest.requireActual("../google-adapter");
  return {
    ...actual,
    useGoogleConsentRunner: () => ({ run, runInThisTab, ready: true }),
    useGoogleConnectorState: () => ({
      accounts: [activeAccount],
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
const gmailModify = provider.products.find((product) => product.key === "gmail_modify")!;
const rollout: ConnectorCapabilityRollout[] = [...gmailRead.capabilityKeys, ...gmailModify.capabilityKeys].map((capabilityKey) => ({
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
let activeAccount = before;
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
  runInThisTab.mockReset();
  confirm.mockReset().mockResolvedValue(true);
  isGoogleAuthorizationCancelled.mockReset().mockReturnValue(false);
  jest.mocked(toast.success).mockClear();
  jest.mocked(toast.info).mockClear();
  activeAccount = before;
});

it("announces a cancelled same-tab authorization without claiming approval", async () => {
  activeAccount = { ...before, grantedScopes: [GOOGLE_SCOPE.openid,
    GOOGLE_SCOPE.gmailReadonly, GOOGLE_SCOPE.gmailModify] };
  runInThisTab.mockRejectedValue(new Error("Authorization cancelled"));
  isGoogleAuthorizationCancelled.mockReturnValue(true);
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);
  try {
    await act(async () => root.render(<ConnectorsSettingsPanel />));
    const action = [...container.querySelectorAll("button")].find((node) =>
      node.textContent?.trim() === "Review in this tab",
    );
    expect(action).toBeDefined();
    await act(async () => action?.click());
    expect(toast.info).toHaveBeenCalledWith("Authorization cancelled — nothing changed.");
    expect(toast.success).not.toHaveBeenCalled();
  } finally {
    act(() => root.unmount());
    container.remove();
  }
});

it("redirects the healthy account with its exact held scopes only after both Gmail disclosures", async () => {
  const heldScopes = [GOOGLE_SCOPE.profile, GOOGLE_SCOPE.gmailReadonly,
    GOOGLE_SCOPE.openid, GOOGLE_SCOPE.gmailModify, GOOGLE_SCOPE.email];
  activeAccount = { ...before, grantedScopes: heldScopes };
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);
  try {
    await act(async () => root.render(<ConnectorsSettingsPanel />));
    const action = [...container.querySelectorAll("button")].find((node) =>
      node.textContent?.trim() === "Review in this tab",
    );
    expect(action).toBeDefined();
    await act(async () => action?.click());
    expect(confirm.mock.calls.map(([options]) => options.title)).toEqual([
      "Allow AI Matrx to read Gmail?",
      "Allow AI Matrx to change Gmail messages?",
    ]);
    expect(runInThisTab).toHaveBeenCalledWith(expect.objectContaining({
      targetAccountId: before.id,
      scopes: heldScopes,
      addedScopes: [],
      capabilityKeys: ["gmail_read", "gmail_modify"],
      connectionPurpose: "google_products",
      forceConsent: true,
    }), { owner: { type: "user" }, loginHint: before.label });
    expect(runInThisTab.mock.calls[0]?.[0].products.map(
      (product: { key: string }) => product.key,
    )).toEqual(["gmail_read", "gmail_modify"]);
    expect(run).not.toHaveBeenCalled();
    expect(toast.success).not.toHaveBeenCalled();
  } finally {
    act(() => root.unmount());
    container.remove();
  }
});

it("does not redirect when the second Gmail disclosure is declined", async () => {
  activeAccount = { ...before, grantedScopes: [GOOGLE_SCOPE.openid,
    GOOGLE_SCOPE.gmailReadonly, GOOGLE_SCOPE.gmailModify] };
  confirm.mockResolvedValueOnce(true).mockResolvedValueOnce(false);
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);
  try {
    await act(async () => root.render(<ConnectorsSettingsPanel />));
    const action = [...container.querySelectorAll("button")].find((node) =>
      node.textContent?.trim() === "Review in this tab",
    );
    expect(action).toBeDefined();
    await act(async () => action?.click());
    expect(confirm).toHaveBeenCalledTimes(2);
    expect(runInThisTab).not.toHaveBeenCalled();
    expect(run).not.toHaveBeenCalled();
  } finally {
    act(() => root.unmount());
    container.remove();
  }
});

it("does not offer Gmail changes on an organization-owned account in Settings", async () => {
  activeAccount = { ...before, ownerKind: "organization", organizationId: "org-1" };
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);
  try {
    await act(async () => root.render(<ConnectorsSettingsPanel />));
    // An organization's account is SHARED, not the viewer's own: it sits
    // collapsed under "Shared with you" until opened on purpose.
    expect(container.textContent).toContain("Shared with you");
    const sharedRow = container.querySelector<HTMLButtonElement>('button[aria-expanded="false"]');
    expect(sharedRow?.textContent).toContain("Connected by");
    await act(async () => sharedRow?.click());
    expect(container.textContent).toContain("Gmail changes are available only on personal Google connections");
    const modifyRow = [...container.querySelectorAll("li")].find((node) =>
      (node.textContent ?? "").includes("Gmail changes"),
    );
    expect(modifyRow).toBeUndefined();
    expect(run).not.toHaveBeenCalled();
  } finally {
    act(() => root.unmount());
    container.remove();
  }
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
