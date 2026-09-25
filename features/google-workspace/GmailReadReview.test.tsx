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
const mockModify = jest.fn();
const mockLabels = jest.fn();
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
  modifyGmailMessage: (...args: unknown[]) => mockModify(...args),
  listGmailLabels: (...args: unknown[]) => mockLabels(...args),
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
  mockModify.mockReset();
  mockLabels.mockReset();
  mockInventory.mockReset();
  mockCapabilities.mockReset();
  mockOpenConsent.mockReset();
  mockCapabilities.mockReturnValue({
    data: [{ key: "gmail_read", eligible: true }, { key: "gmail_modify", eligible: true }],
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

it("offers a separate Gmail changes consent for a personal read-only account", async () => {
  await act(async () => root.render(<GmailReadReview />));
  const input = container.querySelector<HTMLInputElement>("#gmail-read-query")!;
  mockSearch.mockResolvedValue({
    messages: [{ id: "message-1", subject: "Note", from_address: "sender@example.com", date: "Today", snippet: "Preview" }],
    has_more: false,
    access_mode: "on_demand_read_only",
  });
  mockRead.mockResolvedValue({
    id: "message-1", label_ids: ["INBOX"], subject: "Note", from_address: "sender@example.com", to_address: "reviewer@example.com", date: "Today", snippet: "Preview", text_body: "Body", truncated: false, access_mode: "on_demand_read_only",
  });
  await act(async () => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(input, "in:inbox");
    input.dispatchEvent(new Event("input", { bubbles: true }));
  });
  await act(async () => container.querySelector("form")!.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true })));
  await act(async () => container.querySelector<HTMLButtonElement>("section[aria-label='Gmail search results'] button")!.click());
  const enable = Array.from(container.querySelectorAll<HTMLButtonElement>("button")).find((button) => button.textContent?.trim() === "Enable Gmail changes");
  expect(enable).toBeDefined();
  await act(async () => enable!.click());
  expect(mockOpenConsent).toHaveBeenCalledWith({ initialProductKeys: ["gmail_modify"] });
  expect(mockModify).not.toHaveBeenCalled();
});

it("lists a first-time personal modify-only connection without requiring a second read scope", async () => {
  mockInventory.mockReturnValue({
    data: { connections: [{ ...owned, scopes: [GOOGLE_SCOPE.gmailModify] }], resources: [] },
    isLoading: false,
    isError: false,
  });
  await act(async () => root.render(<GmailReadReview />));
  expect(container.textContent).toContain("reviewer@example.com");
  expect(container.textContent).not.toContain("No personal Google account");
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
  expect(container.textContent).toContain("Message changes require a separate Gmail change grant.");
  expect(mockModify).not.toHaveBeenCalled();
});

it("changes only an opened message on the selected modify-granted account", async () => {
  mockInventory.mockReturnValue({
    data: {
      connections: [{ ...owned, scopes: [GOOGLE_SCOPE.gmailReadonly, GOOGLE_SCOPE.gmailModify] }],
      resources: [],
    },
    isLoading: false,
    isError: false,
  });
  mockSearch.mockResolvedValue({
    messages: [{ id: "message_1", subject: "Review note", from_address: "sender@example.com", date: "Today", snippet: "Preview" }],
    has_more: false,
    access_mode: "on_demand_read_only",
  });
  mockRead.mockResolvedValue({
    id: "message_1", label_ids: [], subject: "Review note", from_address: "sender@example.com", to_address: "reviewer@example.com", date: "Today", snippet: "Preview", text_body: "Body", truncated: false, access_mode: "on_demand_read_only",
  });
  mockModify.mockResolvedValueOnce({ message_id: "message_1", label_ids: ["STARRED"] })
    .mockResolvedValueOnce({ message_id: "message_1", label_ids: [] })
    .mockResolvedValueOnce({ message_id: "message_1", label_ids: ["Label_1"] });
  mockLabels.mockResolvedValue({ labels: [{ id: "Label_1", name: "Projects", type: "user" }], has_more: false, next_offset: null });
  await act(async () => root.render(<GmailReadReview />));
  expect(mockModify).not.toHaveBeenCalled();
  const input = container.querySelector<HTMLInputElement>("#gmail-read-query")!;
  await act(async () => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(input, "from:sender@example.com");
    input.dispatchEvent(new Event("input", { bubbles: true }));
  });
  await act(async () => container.querySelector("form")!.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true })));
  await act(async () => container.querySelector<HTMLButtonElement>("section[aria-label='Gmail search results'] button")!.click());
  const action = (label: string) => Array.from(container.querySelectorAll<HTMLButtonElement>("button")).find((button) => button.textContent?.trim() === label)!;
  await act(async () => action("Star").click());
  expect(mockModify).toHaveBeenCalledWith({ connectionId: "owned-connection", messageId: "message_1", action: "star" });
  expect(container.querySelector("[role='status']")?.textContent).toContain("Starred in Gmail.");
  await act(async () => action("Undo").click());
  expect(mockModify).toHaveBeenLastCalledWith({ connectionId: "owned-connection", messageId: "message_1", action: "unstar" });
  expect(container.querySelector("[role='status']")?.textContent).toContain("Last change undone in Gmail.");
  await act(async () => action("Load Gmail labels").click());
  expect(mockLabels).toHaveBeenCalledWith("owned-connection", 0);
  const picker = container.querySelector<HTMLSelectElement>("#gmail-label-picker")!;
  expect(picker.options[1].text).toBe("Projects");
  await act(async () => {
    picker.value = "Label_1";
    picker.dispatchEvent(new Event("change", { bubbles: true }));
  });
  await act(async () => action("Add label").click());
  expect(mockModify).toHaveBeenLastCalledWith({ connectionId: "owned-connection", messageId: "message_1", action: "add_label", labelId: "Label_1" });
});
