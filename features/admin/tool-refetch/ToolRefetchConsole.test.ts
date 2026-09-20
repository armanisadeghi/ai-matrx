/** @jest-environment jsdom */

import { act, createElement, Fragment, useState } from "react";
import { createRoot, type Root } from "react-dom/client";
import { MatrxDataTable } from "@ai-matrx/design-system/data-table";
import type {
  MatrxColumnDef,
  MatrxDataTableQueryState,
} from "@ai-matrx/design-system/data-table/types";

(
  globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

type SearchRow = {
  id: string;
  name: string;
  internalDescription: string;
};

const rows: SearchRow[] = [
  {
    id: "hidden-match",
    name: "Other tool",
    internalDescription: "needle found only in this hidden column",
  },
  {
    id: "name-exact-match",
    name: "needle",
    internalDescription: "",
  },
];

const columns: MatrxColumnDef<SearchRow>[] = [
  { id: "name", accessorKey: "name", header: "Tool" },
  {
    id: "internalDescription",
    accessorKey: "internalDescription",
    header: "Internal description",
    hidden: true,
  },
];

const queryState: MatrxDataTableQueryState = {
  page: 1,
  pageSize: 50,
  search: "needle",
  anyOf: "",
  columnFilters: {},
  sort: null,
};

function CopyViewHarness() {
  const [visibleRows, setVisibleRows] = useState<SearchRow[]>([]);

  return createElement(
    Fragment,
    null,
    createElement("output", { "data-testid": "copy-row-ids" }, visibleRows.map((row) => row.id).join(",")),
    createElement(MatrxDataTable<SearchRow>, {
      query: { mode: "controlled-local", state: queryState, onStateChange: () => undefined },
      data: rows,
      columns,
      getRowId: (row) => row.id,
      toolbar: { search: true },
      onViewChange: setVisibleRows,
    }),
  );
}

describe("ToolRefetchConsole canonical copy view", () => {
  let host: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    host = document.createElement("div");
    document.body.append(host);
    root = createRoot(host);
  });

  afterEach(() => {
    act(() => root.unmount());
    host.remove();
  });

  it("uses the table's ranked view, including hidden-column matches, for a copy consumer", async () => {
    await act(async () => {
      root.render(createElement(CopyViewHarness));
    });

    expect(host.querySelector("[data-testid='copy-row-ids']")?.textContent).toBe(
      "name-exact-match,hidden-match",
    );
  });
});
