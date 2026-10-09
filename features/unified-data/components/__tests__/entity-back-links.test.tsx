/**
 * LINKED RECORDS on a platform record (AP-4). SUT: `EntityBackLinks` over the records package's
 * `useEntityBackLinks` (its door, cache and paging are proven in @ai-matrx/records' own suite; here the
 * hook is the seam). Catches: rows not grouped by table; a row that does not open its custom record page;
 * "Load more" not calling the hook's loadMore; the empty state missing; a MISSING DOOR or a refused read
 * disappearing instead of saying so in the section (nothing fails silently).
 * Use case: an "Onboarding checklist" row linked to an HR employee shows on that employee's page.
 */
import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";

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
const hook = jest.fn();
const asked = jest.fn();

jest.mock("@ai-matrx/records-ui", () => ({
  RecordsMount: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));
jest.mock("@/features/unified-data/components/useKeptEntityBackLinks", () => ({
  useKeptEntityBackLinks: (...a: unknown[]) => {
    asked(...a);
    return hook();
  },
}));
jest.mock("@/features/data-tables/records-ui-host/recordsUiHost", () => ({ useAppRecordsConfig: () => ({}) }));
jest.mock("@/components/official/entity-ref/EntityRef", () => ({
  EntityRef: ({ name, href }: { name?: string | null; href?: string }) => <a href={href}>{name}</a>,
}));

import { EntityBackLinks } from "../EntityBackLinks";

const state = (over: Record<string, unknown> = {}) => ({
  items: [],
  target: null,
  loading: false,
  error: null,
  hasMore: false,
  loadingMore: false,
  moreError: null,
  loadMore: jest.fn(),
  reload: jest.fn(),
  ...over,
});

let root: Root;
let host: HTMLElement;
const mount = async (organizationId: string | null = ORG) => {
  await act(async () => {
    root.render(<EntityBackLinks entityToken="hr_employee" recordId={EMPLOYEE} organizationId={organizationId} />);
  });
};
beforeEach(() => {
  hook.mockReset();
  asked.mockReset();
  host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);
});
afterEach(() => {
  act(() => root.unmount());
  host.remove();
});

it("groups linked rows by table and opens each at its custom record page", async () => {
  hook.mockReturnValue(state({ items: [item(1, "t1"), item(2, "t2"), item(3, "t1")] }));
  await mount();
  expect(host.querySelectorAll("[data-back-links-table]")).toHaveLength(2);
  expect(host.querySelector('[data-back-links-table="t1"]')?.querySelectorAll("a")).toHaveLength(2);
  expect(host.querySelector("a")?.getAttribute("href")).toBe("/data/t1/r/rec-1");
  expect(asked).toHaveBeenCalledWith("hr_employee", EMPLOYEE, { organizationId: ORG });
});

it("Load more calls the hook's loadMore, and goes when there is no next page", async () => {
  const loadMore = jest.fn();
  hook.mockReturnValue(state({ items: [item(1, "t1")], hasMore: true, loadMore }));
  await mount();
  const more = [...host.querySelectorAll("button")].find((b) => b.textContent === "Load more")!;
  await act(async () => more.click());
  expect(loadMore).toHaveBeenCalledTimes(1);
  hook.mockReturnValue(state({ items: [item(1, "t1")], hasMore: false }));
  await mount();
  expect([...host.querySelectorAll("button")].some((b) => b.textContent === "Load more")).toBe(false);
});

it("says so when nothing links here", async () => {
  hook.mockReturnValue(state());
  await mount();
  expect(host.querySelector('[data-section="back-links"]')?.getAttribute("data-state")).toBe("empty");
  expect(host.textContent).toContain("Nothing links here");
});

it("a store without the door says so in the section, with Retry - never hidden", async () => {
  const reload = jest.fn();
  hook.mockReturnValue(
    state({ error: { code: "door_absent", message: "custom.entity_back_links is not on this database yet." }, reload }),
  );
  await mount();
  const section = host.querySelector('[data-section="back-links"]');
  expect(section?.getAttribute("data-state")).toBe("error");
  expect(section?.textContent).toContain("custom.entity_back_links is not on this database yet.");
  const retry = [...host.querySelectorAll("button")].find((b) => b.textContent === "Retry")!;
  await act(async () => retry.click());
  expect(reload).toHaveBeenCalled();
});

it("another organization's record is a plain state, never the store's door name (DRILL-LIVE-FIX-2 #7)", async () => {
  hook.mockReturnValue(
    state({ error: { code: "door", message: "You are not a member of that organization, so custom.entity_back_links has nothing to do there." } }),
  );
  await mount();
  const section = host.querySelector('[data-section="back-links"]');
  expect(section?.getAttribute("data-state")).toBe("walled");
  expect(section?.textContent).toContain("Only its organization's members see these");
  expect(section?.textContent).not.toContain("custom.");
  expect([...host.querySelectorAll("button")].some((b) => b.textContent === "Retry")).toBe(false);
});

it("asks nothing until the row's organization is known", async () => {
  hook.mockReturnValue(state());
  await mount(null);
  expect(host.querySelector('[data-section="back-links"]')).toBeNull();
});
