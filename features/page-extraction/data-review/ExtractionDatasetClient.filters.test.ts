import type { MatrxDataTableQueryState } from "@ai-matrx/design-system/data-table";
import type {
  ExtractionColumn,
  PageExtractionResult,
} from "@/features/page-extraction/types";

jest.mock("./ExportMenu", () => ({ ExportMenu: () => null }));
jest.mock("./SendToMenu", () => ({ SendToMenu: () => null }));
jest.mock("./RunsPopover", () => ({ RunsPopover: () => null }));
jest.mock("./ExtractionCellDisplay", () => ({ ExtractionCellDisplay: () => null }));

import {
  extractionColumnFilterKind,
  extractionDatasetPageIndex,
  processExtractionDatasetRows,
} from "./ExtractionDatasetClient";

const columns: ExtractionColumn[] = [
  { key: "title", label: "Title", type: "string", source: "agent", agentField: "title" },
  { key: "score", label: "Score", type: "number", source: "agent", agentField: "score" },
  { key: "approved", label: "Approved", type: "boolean", source: "manual" },
];

function row(id: string, payload: PageExtractionResult["payload"]): PageExtractionResult {
  return {
    id,
    run_id: "run-1",
    page_run_id: "page-run-1",
    job_id: "job-1",
    file_id: "file-1",
    payload,
    source_pages: [1],
    canonical_page: 1,
    created_at: "2026-09-25T00:00:00.000Z",
  };
}

function state(overrides: Partial<MatrxDataTableQueryState>): MatrxDataTableQueryState {
  return {
    page: 1,
    pageSize: 100,
    search: "",
    anyOf: "",
    layeredFilters: [],
    columnFilters: {},
    sort: null,
    ...overrides,
  };
}

describe("ExtractionDatasetClient local column filters", () => {
  it("keeps low-cardinality string columns eligible for canonical select inference", () => {
    expect(extractionColumnFilterKind("string")).toBe("auto");
    expect(extractionColumnFilterKind("number")).toBe("number");
    expect(extractionColumnFilterKind("integer")).toBe("number");
    expect(extractionColumnFilterKind("boolean")).toBe("boolean");
  });

  it("returns to the first page when filters narrow the local dataset", () => {
    expect(
      extractionDatasetPageIndex(
        {},
        state({ page: 4, columnFilters: { title: { kind: "text", value: "severity" } } }),
      ),
    ).toBe(0);
    expect(
      extractionDatasetPageIndex(
        { title: { kind: "text", value: "severity" } },
        state({ page: 4, columnFilters: { title: { kind: "text", value: "severity" } } }),
      ),
    ).toBe(3);
  });

  it("uses canonical typed filters before its visible-column search and numeric sort", () => {
    const rows = [
      row("a", { title: "Alpha", score: 20, approved: true }),
      row("b", { title: "Alpha", score: 5, approved: true }),
      row("c", { title: "Beta", score: 30, approved: false }),
    ];
    const visibleColumns = columns.filter((column) => column.key === "title");

    const result = processExtractionDatasetRows(
      rows,
      state({
        search: "alpha",
        columnFilters: {
          score: { kind: "number", min: 10 },
          approved: { kind: "boolean", value: true },
        },
        sort: { id: "score", direction: "desc" },
      }),
      columns,
      visibleColumns,
    );

    expect(result.map((item) => item.id)).toEqual(["a"]);
  });
});
