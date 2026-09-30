/** @jest-environment jsdom */

import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";

import type { ConsentRequest } from "../consent-plan";
import type { ConnectorCapabilityRollout } from "../health";

(
  globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

const run = jest.fn<
  Promise<{ connectionId: string }>,
  [ConsentRequest, unknown?]
>(async () => ({ connectionId: "other-contacts-reviewer" }));

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
  phase: "available" as const,
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
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

test("the canonical dialog selects and requests only Other Contacts", async () => {
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
        initialProductKeys={["other_contacts"]}
      />,
    );
  });

  const otherContacts = container.querySelector<HTMLButtonElement>(
    '[role="switch"][aria-label="Do not connect Other Contacts"]',
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
  expect(request?.capabilityKeys).toEqual(["other_contacts"]);
  expect(request?.scopes).toEqual([
    ...GOOGLE_IDENTITY_SCOPES,
    GOOGLE_SCOPE.contactsOtherReadonly,
  ]);
});
