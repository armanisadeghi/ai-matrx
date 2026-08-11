import {
  nextQueryState,
  resolveQueryFilterMeta,
  safeQueryPage,
} from "./query-control";
import type { MatrxColumnDef, MatrxDataTableQueryState } from "./types";

const BASE_STATE: MatrxDataTableQueryState = {
  page: 4,
  pageSize: 25,
  search: "",
  anyOf: "",
  columnFilters: {},
  sort: null,
};

describe("MatrxDataTable controlled query state", () => {
  it.each([
    ["search", { search: "pricing" }],
    ["search match mode", { searchMatchMode: "whole_words" }],
    ["any-of search", { anyOf: "example.com" }],
    [
      "column filters",
      { columnFilters: { status: { kind: "select", value: "active" } } },
    ],
    ["sort", { sort: { id: "updated_at", direction: "desc" } }],
    ["page size", { pageSize: 100 }],
  ] as const)("resets page one for a %s change", (_label, patch) => {
    const next = nextQueryState(BASE_STATE, patch, { resetPage: true });

    expect(next.page).toBe(1);
    expect(next).toMatchObject(patch);
    expect(BASE_STATE.page).toBe(4);
  });

  it("preserves direct page navigation", () => {
    expect(nextQueryState(BASE_STATE, { page: 7 })).toEqual({
      ...BASE_STATE,
      page: 7,
    });
  });

  it("clamps pages after a remote total shrinks", () => {
    expect(safeQueryPage(7, 41, 20)).toBe(3);
    expect(safeQueryPage(0, 41, 20)).toBe(1);
    expect(safeQueryPage(9, 0, 20)).toBe(1);
  });

  it("uses only declared select options for controlled result pages", () => {
    const column: MatrxColumnDef<{ status: string }> = {
      accessorKey: "status",
      header: "Status",
      filter: "select",
      filterOptions: [{ value: "active", label: "Active" }],
    };

    expect(
      resolveQueryFilterMeta(column, [{ status: "page-only-value" }], true),
    ).toEqual({
      kind: "select",
      options: [{ value: "active", label: "Active" }],
    });
  });

  it("keeps local inference while making controlled auto filters deterministic", () => {
    const column: MatrxColumnDef<{ status: string }> = {
      accessorKey: "status",
      header: "Status",
    };
    const rows = [
      { status: "active" },
      { status: "paused" },
      { status: "active" },
      { status: "paused" },
    ];

    expect(resolveQueryFilterMeta(column, rows, false)).toMatchObject({
      kind: "select",
      options: [
        { value: "active", label: "active" },
        { value: "paused", label: "paused" },
      ],
    });
    expect(resolveQueryFilterMeta(column, rows, true)).toEqual({
      kind: "text",
      options: [],
    });
  });
});
