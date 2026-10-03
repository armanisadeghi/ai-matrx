import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";

const mockList = jest.fn();
const mockMeta = jest.fn();
const mockPage = jest.fn();
jest.mock("@/features/data-tables/service", () => ({
  listTablesEverywhere: (...a: unknown[]) => mockList(...a),
  getTableMetadata: (...a: unknown[]) => mockMeta(...a),
  getTablePage: (...a: unknown[]) => mockPage(...a),
}));
jest.mock("@/features/data-tables/data-source/locate-table", () => ({
  locateTable: async () => ({ ok: true }),
}));
jest.mock("@/features/data-tables/components/LocatedTableViewer", () => () => null);
jest.mock("@/components/errors/ErrorAlchemyMenu", () => ({ ErrorAlchemyMenu: () => null }));

import { TablesResourcePicker, type TableReference } from "../TablesResourcePicker";

(
  globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

const PATIENTS = {
  id: "11111111-1111-4111-8111-111111111111",
  table_name: "Patients",
  description: null,
  version: 1,
  is_public: false,
  authenticated_read: false,
  row_count: 3,
  field_count: 2,
  created_at: "2026-10-01T00:00:00Z",
  updated_at: "2026-10-01T00:00:00Z",
  organization_id: null,
};

/**
 * THE TABLE PICKER UNDER A SLOW OR FAILING READ (real test 2026-10-02: "Failed
 * to load your tables" with no way out; a pick that added no chip). Every
 * failure says what failed and offers the retry; a failed detail read never
 * eats the picker; a pick that can attach, attaches.
 */
describe("TablesResourcePicker — failed reads", () => {
  let host: HTMLDivElement;
  let root: Root;
  const flush = async () => {
    await act(async () => {
      for (let i = 0; i < 5; i++) await Promise.resolve();
    });
  };
  const button = (text: RegExp) =>
    [...host.querySelectorAll("button")].find((b) => text.test(b.textContent ?? ""));

  beforeEach(() => {
    host = document.createElement("div");
    document.body.appendChild(host);
    root = createRoot(host);
    mockList.mockReset();
    mockMeta.mockReset();
    mockPage.mockReset();
  });
  afterEach(() => {
    act(() => root.unmount());
    host.remove();
  });

  it("a failed list read offers Try again, and the retry loads the tables", async () => {
    mockList
      .mockResolvedValueOnce({ success: false, error: "canceling statement due to statement timeout" })
      .mockResolvedValueOnce({ success: true, data: [PATIENTS] });
    act(() => root.render(<TablesResourcePicker onBack={() => {}} onSelect={() => {}} />));
    await flush();
    const retry = button(/try again/i);
    expect(retry).toBeDefined();
    await act(async () => retry!.click());
    await flush();
    expect(host.textContent).toContain("Patients");
    expect(mockList).toHaveBeenCalledTimes(2);
  });

  it("a failed row read says so, keeps the picker usable, and Full table still attaches", async () => {
    mockList.mockResolvedValue({ success: true, data: [PATIENTS] });
    mockMeta.mockResolvedValue({ success: false, error: "canceling statement due to statement timeout" });
    const picks: TableReference[] = [];
    act(() => root.render(<TablesResourcePicker onBack={() => {}} onSelect={(r) => picks.push(r)} />));
    await flush();
    await act(async () => button(/Patients/)!.click());
    await act(async () => button(/Single row/)!.click());
    await flush();
    expect(host.textContent).not.toContain("No rows in table");
    expect(button(/try again/i)).toBeDefined();
    const full = button(/Full table/);
    expect(full).toBeDefined();
    await act(async () => full!.click());
    expect(picks).toEqual([expect.objectContaining({ type: "full_table", table_id: PATIENTS.id })]);
  });
});
