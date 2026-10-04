/** @jest-environment jsdom */

import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";

import type { ConsentRequest } from "../consent-plan";
import type { ConnectorCapabilityRollout } from "../health";

(
  globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

const dispatch = jest.fn();

const run = jest.fn<
  Promise<{ connectionId: string }>,
  [ConsentRequest, unknown?]
>(async () => ({ connectionId: "meet-reviewer" }));

jest.mock("@/lib/toast", () => ({
  toast: { info: jest.fn(), success: jest.fn(), error: jest.fn() },
}));
jest.mock("@/lib/redux/hooks", () => ({
  useAppSelector: (selector: (state: unknown) => unknown) => selector({}),
  useAppDispatch: () => dispatch,
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
jest.mock("../gmail-read-disclosure", () => ({
  confirmGmailReadDisclosure: async () => true,
  confirmGmailChangesDisclosure: async () => true,
}));
jest.mock("../google-adapter", () => ({
  useGoogleConsentRunner: () => ({ run, ready: true }),
  consentFailureAnswer: (cause: unknown) => ({
    sentence: String(cause),
    details: null,
  }),
}));

import { ConnectorConsentBody } from "../ConnectorConsentDialog";
import { GOOGLE_CONNECTOR_PROVIDER } from "../provider-config";
import { GOOGLE_IDENTITY_SCOPES, GOOGLE_SCOPE } from "@/lib/googleScopes";

const provider = GOOGLE_CONNECTOR_PROVIDER;
const rollout: ConnectorCapabilityRollout[] = [
  ...new Set(provider.products.flatMap((product) => product.capabilityKeys)),
].map((capabilityKey) => ({
  capabilityKey,
  phase: "pending" as const,
  eligible: true,
  requiredScopes: [],
  ineligibleReason: null,
}));

let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  run.mockClear();
  dispatch.mockClear();
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

test("the canonical dialog selects and requests only Meet on a personal account", async () => {
  await act(async () => {
    root.render(
      <ConnectorConsentBody
        provider={provider}
        accounts={[]}
        rollout={rollout}
        isLoading={false}
        rolloutUnavailable={false}
        errorMessage={null}
        refetch={async () => {}}
        initialProductKeys={["meet"]}
      />,
    );
  });

  const otherContacts = container.querySelector<HTMLButtonElement>(
    '[role="switch"][aria-label="Do not connect Google Meet review"]',
  );
  expect(otherContacts?.getAttribute("data-state")).toBe("checked");

  const connect = Array.from(container.querySelectorAll("button")).find(
    (button) => (button.textContent ?? "").includes(provider.dialog.cta),
  );
  expect(connect).toBeDefined();
  await act(async () => {
    connect!.click();
  });

  expect(run).toHaveBeenCalledTimes(1);
  const request = run.mock.calls[0]?.[0];
  expect(request?.capabilityKeys).toEqual(["meet"]);
  expect(run.mock.calls[0]?.[1]).toEqual({ owner: { type: "user" }, loginHint: null });
  expect(container.textContent).toContain("No data is saved or sent to an AI model");
  expect(request?.scopes).toEqual([
    ...GOOGLE_IDENTITY_SCOPES,
    GOOGLE_SCOPE.meetingsSpaceReadonly,
  ]);
});

test("ordinary accounts cannot select the internal Meet product", async () => {
  await act(async () => root.render(<ConnectorConsentBody provider={provider} accounts={[]} rollout={rollout.map((item) => item.capabilityKey === "meet" ? { ...item, eligible: false, ineligibleReason: "Internal review only" } : item)} isLoading={false} rolloutUnavailable={false} errorMessage={null} refetch={async () => {}} initialProductKeys={["meet"]} />));
  expect(container.querySelector('[role="switch"][aria-label="Do not connect Google Meet review"]')).toBeNull();
  const button = Array.from(container.querySelectorAll("button")).find((item) => item.textContent?.includes(provider.dialog.cta));
  await act(async () => button!.click());
  expect(run).not.toHaveBeenCalled();
});

test("an existing organization account cannot be renewed with Meet", async () => {
  await act(async () => root.render(<ConnectorConsentBody provider={provider} accounts={[{
    id: "org-meet-test", label: "disposable@example.com", ownerKind: "organization", organizationId: "org-1", providerSubject: "subject-1", grantedScopes: [], usable: true, statusLabel: "Connected", statusReason: "This account is connected.", statusRemedy: null, lastVerifiedAt: null, lastRefusalSentence: null,
  }]} rollout={rollout} isLoading={false} rolloutUnavailable={false} errorMessage={null} refetch={async () => {}} initialAccountId="org-meet-test" initialProductKeys={["meet"]} />));
  const button = Array.from(container.querySelectorAll("button")).find((item) => item.textContent?.includes(provider.dialog.cta));
  if (!button) throw new Error("Missing connect control");
  await act(async () => button.click());
  expect(run).not.toHaveBeenCalled();
  expect(container.textContent).toContain("Google Meet review can connect only to your own Google account");
});
