/** @jest-environment jsdom */

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import type { MatrxDataTableProps } from "@ai-matrx/design-system/data-table";
import { listWorkItems, fetchWorkItemFacets, type WorkItem } from "../service/batchAdminService";
import { WorkItemsPanel } from "./WorkItemsPanel";

(
  globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

let tableProps: MatrxDataTableProps<WorkItem> | null = null;

jest.mock("@ai-matrx/design-system/data-table", () => ({
  MatrxDataTable: (props: MatrxDataTableProps<WorkItem>) => {
    tableProps = props;
    return <div>{props.toolbar?.leading}</div>;
  },
}));

jest.mock("../service/batchAdminService", () => ({
  ...jest.requireActual("../service/batchAdminService"),
  listWorkItems: jest.fn(),
  fetchWorkItemFacets: jest.fn(),
}));

describe("WorkItemsPanel failed refresh", () => {
  let host: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    host = document.createElement("div");
    document.body.append(host);
    root = createRoot(host);
    tableProps = null;
    jest.mocked(fetchWorkItemFacets).mockResolvedValue({ purposes: [], providers: [] });
  });

  afterEach(() => {
    act(() => root.unmount());
    host.remove();
    jest.clearAllMocks();
  });

  it("does not report a prior exact count after the new source request fails", async () => {
    jest.mocked(listWorkItems)
      .mockResolvedValueOnce({
        items: [{ id: "one" } as WorkItem],
        matched: 418,
        truncated: true,
      })
      .mockRejectedValueOnce(new Error("Source unavailable"));

    const props = {
      statusFilter: null,
      handlerFilter: null,
      onStatusFilter: jest.fn(),
      onHandlerFilter: jest.fn(),
      batchFilter: null,
      onBatchFilter: jest.fn(),
      onOpenBatch: jest.fn(),
    };

    await act(async () => root.render(<WorkItemsPanel {...props} refreshTick={0} />));
    expect(tableProps?.pageSize).toBe(0);
    expect(tableProps?.pageSizeOptions).toEqual([]);
    expect(tableProps?.paginationLabelFormat?.(1, 1, 1)).toBe(
      "1 loaded · 418 matching source",
    );
    expect(tableProps?.hidePagination).toBeUndefined();
    expect(host.textContent).toContain("Narrow the filters to inspect the rest.");

    await act(async () => root.render(<WorkItemsPanel {...props} refreshTick={1} />));
    expect(tableProps?.coverage).toBeUndefined();
    expect(tableProps?.read).toEqual(
      expect.objectContaining({ status: "error", what: "the work items" }),
    );
    expect(host.textContent).not.toContain("Narrow the filters to inspect the rest.");
  });
});
