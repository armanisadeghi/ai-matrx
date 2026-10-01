/** @jest-environment jsdom */

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { ContactWriteReview, contactWriteConnectionForRead } from "./ContactWriteReview";
import { GOOGLE_SCOPE } from "@/lib/googleScopes";
import type { GoogleConnectionSummary } from "@/features/marketing/google/types";
import type { ContactSearchResultPending } from "./types";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const post = jest.fn();
jest.mock("@tanstack/react-query", () => ({
  useQuery: () => ({ data: { eligible: true }, isLoading: false, isError: false }),
}));
jest.mock("@/lib/python-client", () => ({
  getJson: jest.fn(),
  postJson: (...args: unknown[]) => post(...args),
}));

const props = {
  organizationId: "org-1", connectionId: "connection-1",
  resourceName: "people/contact-1", displayName: "Ada Lovelace",
  accountLabel: "reviewer@example.invalid",
};
const names = (givenName: string) => ({
  resourceName: props.resourceName, etag: "etag-1", names: [{ givenName, familyName: "Lovelace" }],
});
const preview = {
  resource_name: props.resourceName, etag: "etag-1", field_mask: ["names"],
  before: names("Ada"), after: names("Augusta"), receipt: "signed-review",
};

test("a duplicate account email cannot substitute a different write connection", () => {
  const read = { connection_id: "read-1", google_account: "same@example.invalid" } as ContactSearchResultPending;
  const connection = (id: string) => ({
    id, owner_type: "user", status: "connected", account_email: "same@example.invalid",
    scopes: [GOOGLE_SCOPE.contactsWrite],
  }) as GoogleConnectionSummary;
  expect(contactWriteConnectionForRead([connection("write-2")], read, null)).toBeNull();
  expect(contactWriteConnectionForRead([connection("read-1")], read, null)?.id).toBe("read-1");
  expect(contactWriteConnectionForRead([connection("read-1")], read, "other@example.invalid")).toBeNull();
});
let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
  post.mockReset();
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
});
afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

function button(label: string): HTMLButtonElement {
  const found = Array.from(container.querySelectorAll("button")).find((item) => item.textContent === label);
  if (!found) throw new Error(`Missing button: ${label}`);
  return found;
}

test("only an unchanged signed name preview can be applied, then reverse requires another review", async () => {
  post.mockResolvedValueOnce({ data: preview }).mockResolvedValueOnce({ data: {
    resource_name: props.resourceName, etag: "etag-2", field_mask: ["names"],
    before: names("Ada"), after: names("Augusta"), verified: true,
  }}).mockResolvedValueOnce({ data: { ...preview, before: names("Augusta"), after: names("Ada"), receipt: "reverse-review" } });
  await act(async () => { root.render(<ContactWriteReview {...props} />); });
  const input = container.querySelector("input")!;
  await act(async () => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(input, "Augusta");
    input.dispatchEvent(new Event("input", { bubbles: true }));
  });
  await act(async () => { button("Preview name edit").click(); });
  expect(container.textContent).toContain("Google now: Ada Lovelace");
  expect(container.textContent).toContain("After edit: Augusta Lovelace");
  await act(async () => { button("Apply reviewed edit").click(); });
  expect(post.mock.calls[1][1]).toMatchObject({ review_receipt: "signed-review", edits: { name: { given_name: "Augusta" } } });
  expect(container.textContent).toContain("Google confirmed: Augusta Lovelace");
  expect(container.textContent).not.toContain("Apply reviewed edit");
  await act(async () => { button("Preview reverse edit").click(); });
  expect(post.mock.calls[2][1].edits.name).toEqual({ given_name: "Ada", family_name: "Lovelace" });
  expect(container.textContent).toContain("After edit: Ada Lovelace");
  expect(container.textContent).toContain("Restore reviewed name");
});

test("editing the input invalidates the reviewed receipt", async () => {
  post.mockResolvedValueOnce({ data: preview });
  await act(async () => { root.render(<ContactWriteReview {...props} />); });
  const input = container.querySelector("input")!;
  await act(async () => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(input, "Augusta");
    input.dispatchEvent(new Event("input", { bubbles: true }));
  });
  await act(async () => { button("Preview name edit").click(); });
  await act(async () => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(input, "Grace");
    input.dispatchEvent(new Event("input", { bubbles: true }));
  });
  expect(container.textContent).not.toContain("Apply reviewed edit");
  expect(post).toHaveBeenCalledTimes(1);
});

test("an in-flight review cannot strand the next contact or accept an edited name", async () => {
  let resolveOld!: (value: unknown) => void;
  post.mockImplementationOnce(() => new Promise((resolve) => { resolveOld = resolve; }));
  await act(async () => { root.render(<ContactWriteReview {...props} />); });
  const input = container.querySelector("input")!;
  await act(async () => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(input, "Augusta");
    input.dispatchEvent(new Event("input", { bubbles: true }));
  });
  await act(async () => { button("Preview name edit").click(); });
  expect(input.disabled).toBe(true);
  await act(async () => { root.render(<ContactWriteReview {...props} resourceName="people/contact-2" />); });
  expect(container.querySelector("input")!.disabled).toBe(false);
  expect(container.querySelector("input")!.value).toBe("");
  await act(async () => { resolveOld({ data: preview }); });
  expect(container.textContent).not.toContain("Apply reviewed edit");
  expect(button("Preview name edit").disabled).toBe(true);
});

test("a failed reverse preview keeps the verified result and offers another fresh review", async () => {
  post.mockResolvedValueOnce({ data: preview }).mockResolvedValueOnce({ data: {
    resource_name: props.resourceName, etag: "etag-2", field_mask: ["names"],
    before: names("Ada"), after: names("Augusta"), verified: true,
  }}).mockRejectedValueOnce(new Error("Google changed"));
  await act(async () => { root.render(<ContactWriteReview {...props} />); });
  const input = container.querySelector("input")!;
  await act(async () => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(input, "Augusta");
    input.dispatchEvent(new Event("input", { bubbles: true }));
  });
  await act(async () => { button("Preview name edit").click(); });
  await act(async () => { button("Apply reviewed edit").click(); });
  await act(async () => { button("Preview reverse edit").click(); });
  expect(container.textContent).toContain("Google confirmed: Augusta Lovelace");
  expect(container.textContent).toContain("Preview reverse edit");
  expect(container.textContent).not.toContain("Apply reviewed edit");
});

test("reverse review explicitly clears a name part absent from the original source", async () => {
  post.mockResolvedValueOnce({ data: {
    ...preview, before: { ...names("Ada"), names: [{ givenName: "Ada" }] },
    after: names("Augusta"),
  }}).mockResolvedValueOnce({ data: {
    resource_name: props.resourceName, etag: "etag-2", field_mask: ["names"],
    before: { ...names("Ada"), names: [{ givenName: "Ada" }] }, after: names("Augusta"), verified: true,
  }}).mockResolvedValueOnce({ data: {
    ...preview, before: names("Augusta"),
    after: { ...names("Ada"), names: [{ givenName: "Ada" }] }, receipt: "reverse-review",
  }});
  await act(async () => { root.render(<ContactWriteReview {...props} />); });
  const input = container.querySelector("input")!;
  await act(async () => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(input, "Augusta");
    input.dispatchEvent(new Event("input", { bubbles: true }));
  });
  await act(async () => { button("Preview name edit").click(); });
  await act(async () => { button("Apply reviewed edit").click(); });
  await act(async () => { button("Preview reverse edit").click(); });
  expect(post.mock.calls[2][1].edits.name).toEqual({ given_name: "Ada", family_name: null });
  expect(container.textContent).toContain("Restore reviewed name");
});
