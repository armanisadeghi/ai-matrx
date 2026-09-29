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
    return <div>{props.toolbar?.customSearch}{props.toolbar?.leading}</div>;
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
      })
      .mockRejectedValue(new Error("Source unavailable"));

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
    expect(tableProps?.pageSizeOptions).toEqual([10, 25, 50, 100]);
    expect(tableProps?.query).toMatchObject({
      mode: "controlled",
      totalItems: 418,
      state: { page: 1, pageSize: 25, search: "" },
      sourceProcessing: {
        search: "source",
        columnFilters: "source",
        sort: "source",
      },
    });
    expect(tableProps?.hidePagination).toBeUndefined();
    await act(async () => root.render(<WorkItemsPanel {...props} refreshTick={1} />));
    expect(tableProps?.coverage).toBeUndefined();
    expect(tableProps?.data).toEqual([{ id: "one" }]);
    expect(tableProps?.query).toMatchObject({ totalItems: 418 });
    expect(tableProps?.read).toEqual(
      expect.objectContaining({ status: "error", what: "the work items" }),
    );
  });

  it("reconciles a deleted final page to the last page under one inspection boundary", async () => {
    jest.mocked(listWorkItems)
      .mockResolvedValueOnce({ items: [{ id: "one" } as WorkItem], matched: 418 })
      .mockResolvedValueOnce({ items: [], matched: 25 })
      .mockResolvedValueOnce({ items: [{ id: "one" } as WorkItem], matched: 25 });
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
    const query = tableProps?.query;
    if (!query || query.mode !== "controlled") {
      throw new Error("Work items table did not receive a controlled source query");
    }
    await act(async () => {
      query.onStateChange({ ...query.state, page: 3 });
    });

    const sourceCalls = jest.mocked(listWorkItems).mock.calls;
    const pageThreeCall = sourceCalls.find(([, options]) => options?.page === 3);
    const finalCall = sourceCalls.at(-1);
    expect(listWorkItems).toHaveBeenLastCalledWith(
      expect.any(Object),
      expect.objectContaining({ page: 1, pageSize: 25, asOf: expect.any(String) }),
    );
    expect(finalCall?.[1]?.asOf).toBe(pageThreeCall?.[1]?.asOf);
    expect(tableProps?.query).toMatchObject({
      totalItems: 25,
      state: { page: 1, pageSize: 25 },
    });
  });

  it("asks the source for the requested numbered page and resets to page one when its size changes", async () => {
    jest.mocked(listWorkItems).mockResolvedValue({
      items: [{ id: "one" } as WorkItem],
      matched: 418,
    });
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
    const query = tableProps?.query;
    if (!query || query.mode !== "controlled") {
      throw new Error("Work items table did not receive a controlled source query");
    }

    await act(async () => {
      query.onStateChange({ ...query.state, page: 3 });
    });
    expect(listWorkItems).toHaveBeenLastCalledWith(
      expect.any(Object),
      expect.objectContaining({ page: 3, pageSize: 25 }),
    );

    const resizedQuery = tableProps?.query;
    if (!resizedQuery || resizedQuery.mode !== "controlled") {
      throw new Error("Work items table lost its controlled source query");
    }
    await act(async () => {
      resizedQuery.onStateChange({ ...resizedQuery.state, page: 3, pageSize: 50 });
    });
    expect(listWorkItems).toHaveBeenLastCalledWith(
      expect.any(Object),
      expect.objectContaining({ page: 1, pageSize: 50 }),
    );

    const pagedQuery = tableProps?.query;
    if (!pagedQuery || pagedQuery.mode !== "controlled") {
      throw new Error("Work items table lost its controlled source query");
    }
    await act(async () => {
      pagedQuery.onStateChange({ ...pagedQuery.state, page: 3 });
      root.render(<WorkItemsPanel {...props} statusFilter="pending" refreshTick={0} />);
    });
    expect(listWorkItems).toHaveBeenLastCalledWith(
      expect.objectContaining({ status: "pending" }),
      expect.objectContaining({ page: 1, pageSize: 50 }),
    );
  });

  it("sends the debounced source search term to the next source query", async () => {
    jest.useFakeTimers();
    jest.mocked(listWorkItems).mockResolvedValue({
      items: [{ id: "s13" } as WorkItem],
      matched: 3,
    });
    const props = {
      statusFilter: "completed",
      handlerFilter: null,
      onStatusFilter: jest.fn(),
      onHandlerFilter: jest.fn(),
      batchFilter: null,
      onBatchFilter: jest.fn(),
      onOpenBatch: jest.fn(),
    };
    try {
      await act(async () => root.render(<WorkItemsPanel {...props} refreshTick={0} />));
      const input = host.querySelector<HTMLInputElement>("input[aria-label='Search work items']");
      if (!input) throw new Error("Source search input did not render");
      const setValue = Object.getOwnPropertyDescriptor(
        HTMLInputElement.prototype,
        "value",
      )?.set;
      if (!setValue) throw new Error("Input value setter is unavailable");
      await act(async () => {
        setValue.call(input, "s13");
        input.dispatchEvent(new Event("input", { bubbles: true }));
        jest.advanceTimersByTime(250);
      });
      expect(listWorkItems).toHaveBeenLastCalledWith(
        expect.objectContaining({ status: "completed", search: "s13" }),
        expect.objectContaining({ page: 1, pageSize: 25, asOf: expect.any(String) }),
      );
    } finally {
      jest.useRealTimers();
    }
  });
});
