/** @jest-environment jsdom */

import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";

import type { ConsentRequest } from "../consent-plan";
import type { ConnectorCapabilityRollout } from "../health";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const run = jest.fn<Promise<{ connectionId: string }>, [ConsentRequest, unknown?]>(
  async () => ({ connectionId: "calendar-write-reviewer" }),
);

jest.mock("@/lib/toast", () => ({
  toast: { info: jest.fn(), success: jest.fn(), error: jest.fn() },
}));
jest.mock("@/lib/redux/hooks", () => ({
  useAppSelector: (selector: (state: unknown) => unknown) => selector({}),
  useAppDispatch: () => jest.fn(),
}));
jest.mock("@/lib/redux/slices/appContextSlice", () => ({
  selectOrganizationId: () => "organization-cedar",
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
  phase: capabilityKey === "calendar_write" ? "pending" : "available",
  eligible: capabilityKey === "calendar_write",
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

test("the canonical dialog requests only Calendar event changes for an admitted reviewer", async () => {
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
        initialProductKeys={["calendar_changes"]}
      />,
    );
  });

  const calendarChanges = container.querySelector<HTMLButtonElement>(
    '[role="switch"][aria-label="Do not connect Calendar changes"]',
  );
  expect(calendarChanges?.getAttribute("data-state")).toBe("checked");

  const connect = Array.from(container.querySelectorAll("button")).find((button) =>
    (button.textContent ?? "").includes(provider.dialog.cta),
  );
  expect(connect).toBeDefined();
  if (!connect) throw new Error("Calendar changes connect control did not render.");
  await act(async () => {
    connect.click();
  });

  expect(run).toHaveBeenCalledTimes(1);
  const request = run.mock.calls[0]?.[0];
  expect(request?.capabilityKeys).toEqual(["calendar_write"]);
  expect(request?.scopes).toEqual([
    ...GOOGLE_IDENTITY_SCOPES,
    GOOGLE_SCOPE.calendarListReadonly,
    GOOGLE_SCOPE.calendarEventsWrite,
  ]);
  expect(request?.scopes).not.toContain(GOOGLE_SCOPE.calendarEventsReadonly);
});
