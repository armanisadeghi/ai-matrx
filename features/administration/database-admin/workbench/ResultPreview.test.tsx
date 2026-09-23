/** @jest-environment jsdom */

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import type {
  MatrxDataTableProps,
} from "@ai-matrx/design-system/data-table";
import { ResultPreview } from "./ResultPreview";

(
  globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

type PreviewRow = { row: Record<string, unknown>; index: number };

let tableProps: MatrxDataTableProps<PreviewRow> | null = null;

jest.mock("@ai-matrx/design-system/data-table", () => ({
  MatrxDataTable: (props: MatrxDataTableProps<PreviewRow>) => {
    tableProps = props;
    return null;
  },
}));

jest.mock(
  "@/components/official-candidate/json-inspector/JsonInspector",
  () => ({ JsonInspector: () => null }),
);

describe("ResultPreview", () => {
  let host: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    tableProps = null;
    host = document.createElement("div");
    document.body.append(host);
    root = createRoot(host);
  });

  afterEach(() => {
    act(() => root.unmount());
    host.remove();
  });

  it("uses the canonical table for a capped table view while retaining the full result count", () => {
    const rows = Array.from({ length: 101 }, (_, index) => ({
      id: index + 1,
      metadata: { rank: index + 1 },
      nullable: index === 0 ? null : "present",
    }));

    act(() => {
      root.render(<ResultPreview data={rows} maxTableRows={100} />);
    });

    if (!tableProps) throw new Error("Result table was not rendered");
    expect(tableProps.data).toHaveLength(100);
    expect(tableProps.data[0]).toEqual({ row: rows[0], index: 0 });
    expect(tableProps.data.at(-1)).toEqual({ row: rows[99], index: 99 });
    expect(tableProps.pageSize).toBe(0);
    expect(tableProps.hidePagination).toBe(true);
    expect(tableProps.coverage).toBeUndefined();
    expect(tableProps.viewTabs).toBe(false);
    expect(tableProps.detail).toEqual({ enabled: false });
    expect(tableProps.window).toEqual({ enabled: false });
    expect(tableProps.copy).toBe(false);
    expect(tableProps.toolbar).toEqual(
      expect.objectContaining({ title: "Query results", search: true }),
    );
    expect(tableProps.columns.map((column) => column.id)).toEqual([
      "row-number",
      "id",
      "metadata",
      "nullable",
    ]);
    expect(tableProps.columns.slice(1)).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: "id", filter: "text" }),
        expect.objectContaining({ id: "metadata", filter: "text" }),
        expect.objectContaining({ id: "nullable", filter: "text" }),
      ]),
    );

    const metadata = tableProps.columns.find(
      (column) => column.id === "metadata",
    );
    const nullable = tableProps.columns.find(
      (column) => column.id === "nullable",
    );
    expect(metadata?.filterValue?.(tableProps.data[0])).toBe('{"rank":1}');
    expect(nullable?.cell?.(tableProps.data[0], 0)).toMatchObject({
      props: { children: { props: { children: "NULL" } } },
    });
    expect(host.textContent).toContain("Table (101)");
    expect(host.textContent).toContain("Showing 100 of 101 rows. Switch to JSON");
  });
});
