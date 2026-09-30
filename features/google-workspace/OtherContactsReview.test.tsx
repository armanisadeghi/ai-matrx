/** @jest-environment jsdom */

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";

import { OtherContactsReview } from "./OtherContactsReview";

(
  globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

const openConsent = jest.fn();

jest.mock("@tanstack/react-query", () => ({
  useQuery: () => ({
    data: { eligible: true, admission_error: null, message: "Available" },
    isLoading: false,
    isError: false,
  }),
}));
jest.mock("@/features/organizations/useOrganizationRequired", () => ({
  useOrganizationRequired: () => ({
    organizationId: "org-1",
    organizationState: "ready",
  }),
}));
jest.mock("@/features/marketing/google/hooks", () => ({
  useGoogleConnectionInventory: () => ({
    data: { connections: [], resources: [] },
    isLoading: false,
    isError: false,
  }),
}));
jest.mock("@/features/overlays/openers/connectorConsentDialog", () => ({
  useOpenConnectorConsentDialog: () => openConsent,
}));

let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  openConsent.mockReset();
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

test("opens the canonical consent dialog with Other Contacts selected", async () => {
  await act(async () => {
    root.render(<OtherContactsReview />);
  });

  expect(container.textContent).toContain("Choose a Google account");
  expect(
    container.querySelector("a[href='/user-settings/integrations']"),
  ).toBeNull();
  const connect = Array.from(container.querySelectorAll("button")).find(
    (button) => button.textContent === "Connect a Google account",
  );
  expect(connect).toBeDefined();

  await act(async () => {
    connect!.click();
  });

  expect(openConsent).toHaveBeenCalledWith({
    initialProductKeys: ["other_contacts"],
  });
});
