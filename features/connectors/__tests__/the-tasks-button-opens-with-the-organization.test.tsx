/**
 * THE TASKS FIRST ACTION CARRIES THE SAME ORGANIZATION THE TYPED OPENER WOULD
 * (lane F-55, Cursor Bugbot, Medium, thread 4043109495, PR 228, commit
 * 9e31d18a) — through a real DOM, with a real click, on the real component.
 *
 * THE DEFECT THIS PINS. F-51 gave `ConnectorProduct.firstAction` a closed union
 * `route | overlay | none`, and the Tasks row's button dispatched
 * `openOverlay({ overlayId: "googleTasksImportWindow" })` — no `data` at all.
 * The window it opens (`GoogleTasksImportWindow` → `GoogleTasksImportPanel`)
 * reads `organizationId` off that data and refuses to load without it, so the
 * button opened a window that could list and import nothing. The typed opener
 * for the same overlay (`useOpenGoogleTasksImport`, called from
 * `TasksHeaderControls` with `selectEffectiveOrganizationId`) always supplies
 * it; this proves the dialog's button now does too, from the same value.
 *
 * The fixture is a standing Tasks refusal that renews on this press — the same
 * shape `the-refused-row-opens-the-provider-window.test.tsx` uses for Gmail —
 * because that is the one path through `consentOutcomes` that reaches
 * `state: "granted"` (a renewal: the scope is already on the account, so the
 * exchange only needs to clear the refusal) and renders the "Ready to use"
 * list this button lives in.
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

const dispatch = jest.fn();

jest.mock("@/lib/redux/hooks", () => ({
  useAppSelector: (selector: (state: unknown) => unknown) => selector({}),
  useAppDispatch: () => dispatch,
}));

// The organization the dialog would carry for this account — the SAME value
// `TasksHeaderControls` reads via `selectEffectiveOrganizationId` before
// calling `useOpenGoogleTasksImport({ organizationId })`.
const ORGANIZATION_ID = "org-77";

jest.mock("@/lib/redux/slices/appContextSlice", () => ({
  selectOrganizationId: () => null,
  selectEffectiveOrganizationId: () => ORGANIZATION_ID,
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

const run = jest.fn(() => Promise.resolve());

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

import { openOverlay } from "@/lib/redux/slices/overlaySlice";
import { ConnectorConsentBody } from "../ConnectorConsentDialog";
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

const tasksProduct = provider.products.find((product) => product.key === "tasks");
if (!tasksProduct) throw new Error("no tasks product in the Google config");

const ACTIVITY = googleActivityByProduct(
  provider,
  parseGoogleCapabilityHealth({
    __kind: GOOGLE_CAPABILITY_HEALTH_KIND,
    tasks: {
      last_refusal: {
        at: "2026-09-17T14:02:11Z",
        action: "tasks.list",
        code: "grant_expired_or_revoked",
        sentence:
          "Google is no longer honouring this account's permission for Tasks.",
        http_status: 401,
      },
    },
  }),
);

/** Tasks already granted once, but the grant is standing-refused. */
const REFUSED: ConnectorAccount = {
  id: "c4",
  label: "info@aimatrx.com",
  ownerKind: "person",
  organizationId: null,
  providerSubject: "sub-c4",
  grantedScopes: [...provider.identityScopes, ...tasksProduct.scopes],
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

function click(element: Element) {
  act(() => {
    element.dispatchEvent(new MouseEvent("click", { bubbles: true }));
  });
}

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

afterEach(() => {
  act(() => root.unmount());
  container.remove();
  toastInfo.mockReset();
  run.mockReset();
  dispatch.mockReset();
});

describe("pressing Import your tasks after the renewal lands", () => {
  it("dispatches openOverlay with the organization the window needs to load", async () => {
    mount();

    const connect = [...container.querySelectorAll("button")].find((node) =>
      (node.textContent ?? "").includes(provider.dialog.cta),
    );
    expect(connect).toBeDefined();
    await act(async () => {
      connect!.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });

    expect(run).toHaveBeenCalledTimes(1);
    expect(container.textContent).toContain("Ready to use");

    const importButton = container.querySelector(
      '[data-connector-first-action="tasks"]',
    );
    expect(importButton).not.toBeNull();
    expect(importButton?.textContent).toContain("Import your tasks");

    dispatch.mockClear();
    click(importButton!);

    expect(dispatch).toHaveBeenCalledTimes(1);
    expect(dispatch).toHaveBeenCalledWith(
      openOverlay({
        overlayId: "googleTasksImportWindow",
        data: { organizationId: ORGANIZATION_ID },
      }),
    );
  });
});
