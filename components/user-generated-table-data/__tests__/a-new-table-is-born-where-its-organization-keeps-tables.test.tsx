/**
 * Lane SWITCH-BACK-CARRIES (found during the Harbor Dental proof) — /data's "Create Table" and
 * "Import" made every new table through the OLDER store's door (`create_new_user_table_dynamic`),
 * even for an organization whose Data tables had moved to the new system: the table landed live in
 * the older store beside archived tables nothing reads, and opened in the older viewer. Both modals
 * must make a table through THE ONE BIRTH (`createTable` in features/data-tables/service), which
 * asks where the organization's tables live.
 */
import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";

const serviceCreate = jest.fn(async () => ({ success: true, tableId: "7c1e2f40-5a6b-4c3d-8e9f-0a1b2c3d4e5f" }));
const olderCreate = jest.fn(async () => ({ success: true, tableId: "older-door" }));
jest.mock("@/features/data-tables/service", () => ({
  createTable: (...a: unknown[]) => serviceCreate(...(a as [])),
  bulkWrite: jest.fn(),
}));
jest.mock("@/utils/user-table-utls/table-utils", () => {
  const actual = jest.requireActual("@/utils/user-table-utls/table-utils");
  return { ...actual, createTable: (...a: unknown[]) => olderCreate(...(a as [])) };
});
jest.mock("@/utils/supabase/client", () => ({
  supabase: {
    schema: () => ({ from: () => ({ select: () => ({ eq: () => ({ eq: () => ({ is: () => ({ limit: async () => ({ data: [], error: null }) }), limit: async () => ({ data: [], error: null }) }) }) }) }) }),
  },
}));
jest.mock("@/utils/supabase/claimsUser", () => ({ getClaimsUser: async () => ({ data: { user: { id: "87a6e699-3622-4869-8843-d0867456c0dd" } } }) }));

jest.mock("@/components/official/ProTextarea", () => ({
  ProTextarea: (props: { id?: string; value?: string }) => <textarea id={props.id} defaultValue={props.value} />,
}));

import CreateTableModal from "../CreateTableModal";

let container: HTMLDivElement;
let root: Root;
beforeEach(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  (globalThis as { ResizeObserver?: unknown }).ResizeObserver ??= class {
    observe() {}
    unobserve() {}
    disconnect() {}
  };
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
});
afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

test("Create Table makes the table through the one birth, never the older store's door", async () => {
  const onSuccess = jest.fn();
  await act(async () => {
    root.render(<CreateTableModal isOpen onClose={() => undefined} onSuccess={onSuccess} />);
  });
  const name = document.querySelector<HTMLInputElement>("#tableName")!;
  await act(async () => {
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!;
    setter.call(name, "Hygiene Supply Reorders");
    name.dispatchEvent(new Event("input", { bubbles: true }));
  });
  await act(async () => {
    await new Promise((r) => setTimeout(r, 50));
  });
  const form = name.closest("form")!;
  await act(async () => {
    form.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
    await new Promise((r) => setTimeout(r, 50));
  });
  expect(olderCreate).not.toHaveBeenCalled();
  expect(serviceCreate).toHaveBeenCalledTimes(1);
  expect(serviceCreate.mock.calls[0]![0]).toMatchObject({ tableName: "Hygiene Supply Reorders" });
  expect(onSuccess).toHaveBeenCalledWith("7c1e2f40-5a6b-4c3d-8e9f-0a1b2c3d4e5f");
});
