/**
 * LINKED RECORDS on a platform record (AP-4). SUT: `EntityBackLinks` over a REAL Redux store, the
 * door mocked at hub/doors. Catches: rows not grouped by table; a row that does not open its custom
 * record page; "Load more" not following next_cursor; the empty state missing; a door absent from the
 * database (PGRST202) printing an error box instead of staying hidden.
 * Use case: an "Onboarding checklist" row linked to an HR employee shows on that employee's page.
 */
import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { Provider } from "react-redux";
import { configureStore } from "@reduxjs/toolkit";
import storeReadsReducer from "@/lib/redux/slices/storeReadsSlice";

const ORG = "0a54df90-eab8-4d07-ab29-81a45fb41e04";
const EMPLOYEE = "7f75a779-b63c-4c0b-b342-ceeea2670ae4";
const item = (n: number, table: string) => ({
  record: { token: "record" as const, id: `rec-${n}`, label: `Onboarding checklist ${n}` },
  table_id: table,
  table_label: table === "t1" ? "Onboarding checklist" : "Equipment",
  field_id: "f1",
  field_key: "employee",
  field_label: "Employee",
  organization_id: ORG,
  linked_at: null,
});
const door = jest.fn();

jest.mock("@ai-matrx/records-ui", () => ({ recordsDataSource: () => ({}) }));
jest.mock("@/utils/supabase/client", () => ({ createClient: () => ({}) }));
jest.mock("@/features/unified-data/hub/doors", () => ({ entityBackLinks: (...a: unknown[]) => door(...a) }));
jest.mock("@/components/official/entity-ref/EntityRef", () => ({
  EntityRef: ({ name, href }: { name?: string | null; href?: string }) => <a href={href}>{name}</a>,
}));

import { EntityBackLinks } from "../EntityBackLinks";

let root: Root;
let host: HTMLElement;
const mount = async () => {
  const store = configureStore({ reducer: { storeReads: storeReadsReducer } });
  await act(async () => {
    root.render(
      <Provider store={store}>
        <EntityBackLinks entityToken="hr_employee" recordId={EMPLOYEE} organizationId={ORG} />
      </Provider>,
    );
  });
  await act(async () => {});
};
beforeEach(() => {
  door.mockReset();
  host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);
});
afterEach(() => {
  act(() => root.unmount());
  host.remove();
});

it("groups linked rows by table and opens each at its custom record page", async () => {
  door.mockResolvedValue({
    ok: true,
    data: { target: { token: "hr_employee", id: EMPLOYEE, label: "Ada" }, items: [item(1, "t1"), item(2, "t2"), item(3, "t1")], next_cursor: null },
  });
  await mount();
  expect(host.querySelectorAll("[data-back-links-table]")).toHaveLength(2);
  expect(host.querySelector('[data-back-links-table="t1"]')?.querySelectorAll("a")).toHaveLength(2);
  expect(host.querySelector("a")?.getAttribute("href")).toBe("/data/t1/r/rec-1");
  expect(door.mock.calls[0].slice(1, 5)).toEqual([ORG, "hr_employee", EMPLOYEE]);
});

it("loads more through next_cursor", async () => {
  door
    .mockResolvedValueOnce({ ok: true, data: { target: {}, items: [item(1, "t1")], next_cursor: "c1" } })
    .mockResolvedValueOnce({ ok: true, data: { target: {}, items: [item(2, "t1")], next_cursor: null } });
  await mount();
  const more = [...host.querySelectorAll("button")].find((b) => b.textContent === "Load more")!;
  await act(async () => more.click());
  expect(host.querySelectorAll("a")).toHaveLength(2);
  expect(door.mock.calls[1][4]).toBe("c1");
  expect([...host.querySelectorAll("button")].some((b) => b.textContent === "Load more")).toBe(false);
});

it("says so when nothing links here", async () => {
  door.mockResolvedValue({ ok: true, data: { target: {}, items: [], next_cursor: null } });
  await mount();
  expect(host.querySelector('[data-section="back-links"]')?.getAttribute("data-state")).toBe("empty");
  expect(host.textContent).toContain("Nothing links here");
});

it("stays hidden, announced in the console, when the door is not on the database", async () => {
  const warn = jest.spyOn(console, "warn").mockImplementation(() => undefined);
  door.mockResolvedValue({ ok: false, error: { message: "x", sqlstate: "PGRST202" } });
  await mount();
  expect(host.querySelector('[data-section="back-links"]')).toBeNull();
  expect(warn).toHaveBeenCalled();
  warn.mockRestore();
});
