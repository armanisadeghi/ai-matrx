/** @jest-environment jsdom */

import { act, createElement, Fragment, useState } from "react";
import { createRoot, type Root } from "react-dom/client";
import { MatrxDataTable } from "@ai-matrx/design-system/data-table";
import type {
  MatrxColumnDef,
  MatrxDataTableQueryState,
} from "@ai-matrx/design-system/data-table/types";
import { ToolDetail } from "./ToolRefetchConsole";
import type { ToolRefetchDetailRow } from "./service";

let mockDetailQuery: {
  data: ToolRefetchDetailRow[];
  isPending: boolean;
  isError: boolean;
  isFetching: boolean;
  error: null;
  refetch: jest.Mock;
};
const mockDetailQueryKeys: unknown[][] = [];

jest.mock("@tanstack/react-query", () => ({
  keepPreviousData: (data: unknown) => data,
  useQuery: (options: { queryKey: unknown[] }) => {
    mockDetailQueryKeys.push(options.queryKey);
    return mockDetailQuery;
  },
}));

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

describe("ToolDetail canonical repeat grid", () => {
  let host: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    host = document.createElement("div");
    document.body.append(host);
    root = createRoot(host);
    mockDetailQueryKeys.length = 0;
    mockDetailQuery = {
      data: Array.from({ length: 50 }, (_, index) => ({
        repeatToolCallId: `repeat-${index}`,
        conversationId: index === 0 ? "12345678-1234-1234-1234-123456789abc" : null,
        toolName: "web.search",
        repeatAt: "2026-09-24T12:00:00.000Z",
        repeatIteration: index + 2,
        repeatOutputChars: 40,
        firstAt: "2026-09-24T11:59:00.000Z",
        firstIteration: 1,
        firstOutputChars: 20,
        priorIdenticalCalls: index + 1,
        sameData: index % 2 === 0,
        gapCalls: 2,
        gapSecs: 60,
        gapIterations: 1,
        trimmedBeforeRepeat: false,
        args: { query: "repeat" },
      })),
      isPending: false,
      isError: false,
      isFetching: false,
      error: null,
      refetch: jest.fn(),
    };
  });

  afterEach(() => {
    act(() => root.unmount());
    host.remove();
  });

  it("uses the canonical append footer for an honest loaded window and retains every repeat field", async () => {
    await act(async () => {
      root.render(createElement(ToolDetail, { toolName: "web.search", window: "30d", expectedRepeats: 75 }));
    });

    expect(host.textContent).toContain("50 loaded of 75");
    expect(host.textContent).toContain("Load more");
    expect(host.textContent).not.toContain("Showing 50 of 75 repeats.");
    expect(Array.from(host.querySelectorAll("th")).map((cell) => cell.textContent)).toEqual(
      expect.arrayContaining([
        "When",
        "Repeat iteration",
        "Conversation",
        "Data",
        "After trim",
        "Gap (calls)",
        "Gap (mm:ss)",
        "Gap (iterations)",
        "First call",
        "First iteration",
        "First chars",
        "Repeat chars",
        "Prior identical",
        "Arguments",
      ]),
    );

    const loadMore = Array.from(host.querySelectorAll("button")).find(
      (button) => button.textContent === "Load more",
    );
    expect(loadMore).toBeDefined();
    await act(async () => {
      loadMore?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });
    expect(mockDetailQueryKeys.at(-1)).toEqual([
      "admin",
      "tool-refetch",
      "detail",
      "web.search",
      "30d",
      2,
    ]);
  });

  it("keeps loaded repeat rows visible while the next source window is fetching", async () => {
    await act(async () => {
      root.render(createElement(ToolDetail, { toolName: "web.search", window: "30d", expectedRepeats: 75 }));
    });
    mockDetailQuery = { ...mockDetailQuery, isPending: true, isFetching: true };
    await act(async () => {
      root.render(createElement(ToolDetail, { toolName: "web.search", window: "30d", expectedRepeats: 75 }));
    });
    expect(host.querySelectorAll("th").length).toBeGreaterThan(0);
    expect(host.textContent).toContain("50 repeats loaded so far");
    expect(host.textContent).not.toContain("Loading repeats for web.search");
  });
});
