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

jest.mock("@/utils/supabase/client", () => ({
  createClient: () => ({
    auth: {
      getSession: async () => ({
        data: { session: { access_token: "test-token" } },
      }),
    },
  }),
}));
jest.mock("@/utils/supabase/claimsUser", () => ({
  getClaimsUser: async () => ({
    data: {
      claims: { user: { id: "admin-user" } },
      user: { id: "admin-user" },
    },
    error: null,
  }),
}));
jest.mock("@/features/marketing/google/service", () => ({
  listGoogleConnectionInventory: (...args: unknown[]) => mockInventory(...args),
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
  mockInventory.mockResolvedValue({
    connections: [
      { ...owned, id: "someone-else", owner_user_id: "other-user" },
      owned,
    ],
    resources: [],
  });
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
