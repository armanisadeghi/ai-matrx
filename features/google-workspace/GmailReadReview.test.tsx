/** @jest-environment jsdom */

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { GmailReadReview } from "./GmailReadReview";
import { GOOGLE_SCOPE } from "@/lib/googleScopes";

(
  globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

const mockSearch = jest.fn();
const mockRead = jest.fn();
const mockInventory = jest.fn();
const mockCapabilities = jest.fn();
const mockOpenConsent = jest.fn();

jest.mock("@/features/overlays/openers/connectorConsentDialog", () => ({
  useOpenConnectorConsentDialog: () => mockOpenConsent,
}));
jest.mock("@/features/marketing/google/hooks", () => ({
  useGoogleConnectionInventory: () => mockInventory(),
  useGoogleCapabilities: () => mockCapabilities(),
}));
jest.mock("@/lib/redux/hooks", () => ({
  useAppSelector: (selector: (state: { userId: string }) => unknown) =>
    selector({ userId: "admin-user" }),
}));
jest.mock("@/lib/redux/selectors/userSelectors", () => ({
  selectUserId: (state: { userId: string }) => state.userId,
}));
jest.mock("@/features/marketing/google/service", () => ({
  searchGmail: (...args: unknown[]) => mockSearch(...args),
  readGmailMessage: (...args: unknown[]) => mockRead(...args),
}));

const owned = {
  id: "owned-connection",
  owner_type: "user",
  owner_user_id: "admin-user",
  health: "connected",
  scopes: [GOOGLE_SCOPE.gmailReadonly],
  account_email: "reviewer@example.com",
};

let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  mockSearch.mockReset();
  mockRead.mockReset();
  mockInventory.mockReset();
  mockCapabilities.mockReset();
  mockOpenConsent.mockReset();
  mockCapabilities.mockReturnValue({
    data: [{ key: "gmail_read", eligible: true }],
    isLoading: false,
    isError: false,
  });
  mockInventory.mockReturnValue({
    data: {
      connections: [
        { ...owned, id: "someone-else", owner_user_id: "other-user" },
        owned,
      ],
      resources: [],
    },
    isLoading: false,
    isError: false,
  });
});

it("offers Gmail reading consent from the empty state without starting it on load", async () => {
  mockInventory.mockReturnValue({
    data: { connections: [], resources: [] },
    isLoading: false,
    isError: false,
  });
  await act(async () => root.render(<GmailReadReview />));

  expect(mockOpenConsent).not.toHaveBeenCalled();
  expect(container.querySelector('a[href="/user-settings/integrations"]')).toBeNull();
  const connect = Array.from(container.querySelectorAll("button")).find(
    (button) => button.textContent === "Connect Gmail reading",
  );
  expect(connect).toBeDefined();
  await act(async () => connect!.click());
  expect(mockOpenConsent).toHaveBeenCalledWith({
    initialProductKeys: ["gmail_read"],
  });
});

it("does not offer Gmail reading consent outside the admitted rollout", async () => {
  mockInventory.mockReturnValue({
    data: { connections: [], resources: [] },
    isLoading: false,
    isError: false,
  });
  mockCapabilities.mockReturnValue({
    data: [{ key: "gmail_read", eligible: false }],
    isLoading: false,
    isError: false,
  });
  await act(async () => root.render(<GmailReadReview />));
  expect(container.textContent).toContain(
    "Gmail reading is not available to you during this rollout.",
  );
  expect(container.textContent).not.toContain("Connect Gmail reading");
  expect(mockOpenConsent).not.toHaveBeenCalled();
});

it("shows a newly authorized personal mailbox after the shared inventory refreshes", async () => {
  mockInventory.mockReturnValue({
    data: { connections: [], resources: [] },
    isLoading: false,
    isError: false,
  });
  await act(async () => root.render(<GmailReadReview />));
  expect(container.textContent).toContain("No personal Google account");

  mockInventory.mockReturnValue({
    data: {
      connections: [
        { ...owned, id: "foreign", owner_user_id: "other-user" },
        owned,
      ],
      resources: [],
    },
    isLoading: false,
    isError: false,
  });
  await act(async () => root.render(<GmailReadReview />));
  expect(container.textContent).not.toContain("No personal Google account");
  expect(container.textContent).toContain("reviewer@example.com");
  expect(container.querySelectorAll("select option")).toHaveLength(1);
});

afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
});

it("reads nothing on load, excludes foreign accounts, then opens only the chosen search hit", async () => {
  mockSearch.mockResolvedValue({
    messages: [
      {
        id: "message_1",
        thread_id: "thread_1",
        subject: "Review note",
        from_address: "sender@example.com",
        to_address: "reviewer@example.com",
        date: "Today",
        snippet: "A short preview",
      },
    ],
    has_more: false,
    access_mode: "on_demand_read_only",
  });
  mockRead.mockResolvedValue({
    id: "message_1",
    thread_id: "thread_1",
    subject: "Review note",
    from_address: "sender@example.com",
    to_address: "reviewer@example.com",
    date: "Today",
    snippet: "A short preview",
    text_body: "The selected body",
    truncated: false,
    access_mode: "on_demand_read_only",
  });
  await act(async () => {
    root.render(<GmailReadReview />);
  });
  expect(mockSearch).not.toHaveBeenCalled();
  expect(mockRead).not.toHaveBeenCalled();
  expect(container.querySelectorAll("select option")).toHaveLength(1);
  expect(container.textContent).toContain("reviewer@example.com");
  expect(container.textContent).not.toContain("someone-else");

  const input = container.querySelector<HTMLInputElement>("#gmail-read-query")!;
  await act(async () => {
    Object.getOwnPropertyDescriptor(
      HTMLInputElement.prototype,
      "value",
    )!.set!.call(input, "from:sender@example.com");
    input.dispatchEvent(new Event("input", { bubbles: true }));
  });
  await act(async () => {
    container
      .querySelector("form")!
      .dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
  });
  expect(mockSearch).toHaveBeenCalledWith(
    "owned-connection",
    "from:sender@example.com",
  );
  expect(mockRead).not.toHaveBeenCalled();
  expect(container.textContent).toContain("Review note");

  const hit = container.querySelector<HTMLButtonElement>(
    "section[aria-label='Gmail search results'] button",
  )!;
  await act(async () => {
    hit.click();
  });
  expect(mockRead).toHaveBeenCalledWith("owned-connection", "message_1");
  expect(container.textContent).toContain("The selected body");
});
