/** @jest-environment jsdom */

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { ContactWriteReview } from "./ContactWriteReview";

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
};
const names = (givenName: string) => ({
  resourceName: props.resourceName, etag: "etag-1", names: [{ givenName, familyName: "Lovelace" }],
});
const preview = {
  resource_name: props.resourceName, etag: "etag-1", field_mask: ["names"],
  before: names("Ada"), after: names("Augusta"), receipt: "signed-review",
};
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
  expect(container.textContent).toContain("Apply reviewed edit");
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
