/**
 * 🚨 V-24 NEW-3 (seat-proven 2026-09-18) — /settings/integrations said NOTHING
 * about the organization at any second.
 *
 * With every `db.matrxserver.com/rest/v1/**` request aborted on a cold load,
 * the hostile verifier watched this page for thirty seconds: no organization
 * sentence, no notice, no retry, and no red ring — while the consent body's
 * "Connect for <org>" switch silently could not appear and every first-action
 * control quietly lost the organization it needs. A screen is absent or honest,
 * never dead (law 4), and "honest" here is the ONE fourth-state primitive every
 * other surface already renders.
 *
 * This mounts the real panel with the real gate over a failed read and presses
 * the notice's own Try again.
 */

import * as React from "react";
import { act } from "react";
import { createRoot } from "react-dom/client";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

/** The app context this page is read over. The read FAILED (R37). */
const appContext = {
  organizationId: null as string | null,
  readFailed: "the organization read failed: Failed to fetch" as string | null,
};

const dispatched: unknown[] = [];

jest.mock("@/lib/toast", () => ({
  toast: { info: jest.fn(), success: jest.fn(), error: jest.fn() },
}));

jest.mock("@/lib/redux/hooks", () => ({
  useAppSelector: (selector: (state: unknown) => unknown) =>
    selector({
      // THE FIXTURE LAW — the slice builds its own state (F-107).
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      appContext: require("@/lib/redux/slices/appContextSlice").makeAppContextState({
        organization_id: appContext.organizationId,
        orgBootstrapResolved: true,
        orgBootstrapFailure: appContext.readFailed,
      }),
      // The connect prompt card reads the signed-in person; nothing here is
      // about who they are.
      userAuth: { id: "user-1", createdAt: null, isAnonymous: false },
    }),
  useAppDispatch: () => jest.fn(),
}));

jest.mock("@/lib/redux/thunks/activeOrgBootstrap", () => ({
  retryActiveOrgBootstrap: () => ({ type: "test/retry-organization-read" }),
}));

jest.mock("@/lib/redux/store-singleton", () => ({
  getStoreSingleton: () => ({
    dispatch: (action: unknown) => {
      dispatched.push(action);
      return action;
    },
  }),
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

jest.mock("@/features/organizations/components/OrganizationPickerPanel", () => ({
  OrganizationPickerPanel: () => null,
}));

/** The connections read failed too — that is the same outage. */
const connectorState = {
  accounts: [],
  rollout: [],
  resourceCountByAccount: {},
  isLoading: false,
  rolloutUnavailable: true,
  isError: true,
  errorMessage: "Failed to fetch",
  refetch: async () => {},
};

jest.mock("../google-adapter", () => {
  const actual = jest.requireActual("../google-adapter");
  return {
    ...actual,
    useGoogleConsentRunner: () => ({ run: jest.fn(), ready: true }),
    useGoogleConnectorState: () => connectorState,
  };
});

import { ConnectorsSettingsPanel } from "../ConnectorsSettingsPanel";

function render(): { host: HTMLElement; unmount: () => void } {
  const host = document.createElement("div");
  document.body.appendChild(host);
  const root = createRoot(host);
  act(() => {
    root.render(<ConnectorsSettingsPanel />);
  });
  return {
    host,
    unmount: () => {
      act(() => root.unmount());
      host.remove();
    },
  };
}

describe("/settings/integrations and the organization read that failed", () => {
  beforeEach(() => {
    dispatched.length = 0;
    appContext.organizationId = null;
    appContext.readFailed = "the organization read failed: Failed to fetch";
    connectorState.isLoading = false;
  });

  it("says we could not check, never 'select an organization', and its Try again re-runs the read", () => {
    const { host, unmount } = render();
    try {
      const notice = host.querySelector(
        '[data-testid="organization-unavailable-notice"]',
      );
      expect(notice).not.toBeNull();
      const text = host.textContent ?? "";
      expect(text).toContain("We could not check your organization");
      expect(text).not.toMatch(/Select an organization/i);
      expect(text).toMatch(/Try again/);

      const retry = Array.from(
        (notice as HTMLElement).querySelectorAll("button"),
      ).find((button) => (button.textContent ?? "").includes("Try again"));
      if (!retry) throw new Error("the fourth state rendered no Try again");
      act(() => {
        retry.click();
      });
      expect(dispatched).toEqual([{ type: "test/retry-organization-read" }]);
    } finally {
      unmount();
    }
  });

  it("says it while the connections are still loading too", () => {
    connectorState.isLoading = true;
    const { host, unmount } = render();
    try {
      expect(
        host.querySelector('[data-testid="organization-unavailable-notice"]'),
      ).not.toBeNull();
      expect(host.textContent ?? "").toContain("Loading your Google connections…");
    } finally {
      unmount();
    }
  });

  it("with the read ANSWERED, the page says nothing about the organization", () => {
    appContext.readFailed = null;
    appContext.organizationId = "11111111-2222-3333-4444-555555555555";
    const { host, unmount } = render();
    try {
      expect(
        host.querySelector('[data-testid="organization-unavailable-notice"]'),
      ).toBeNull();
      expect(host.textContent ?? "").not.toMatch(/could not check/i);
    } finally {
      unmount();
    }
  });
});
