/** @jest-environment jsdom */

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";

import { OtherContactsReview } from "./OtherContactsReview";

(
  globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

const openGoogleConnect = jest.fn();
const refetchInventory = jest.fn();

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
    refetch: refetchInventory,
  }),
}));
jest.mock("@/features/overlays/openers/googleConnectWindow", () => ({
  useOpenGoogleConnectWindow: () => openGoogleConnect,
}));

let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  openGoogleConnect.mockReset();
  refetchInventory.mockReset();
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

test("opens the canonical connector in place and refreshes accounts after it closes", async () => {
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

  expect(openGoogleConnect).toHaveBeenCalledWith(
    expect.objectContaining({
      reason: "to review a selected Google Other Contact",
    }),
  );
  const options = openGoogleConnect.mock.calls[0][0] as {
    onWindowClose: (event: { type: "window-close" }) => Promise<unknown>;
  };
  await act(async () => {
    await options.onWindowClose({ type: "window-close" });
  });
  expect(refetchInventory).toHaveBeenCalledTimes(1);
});
