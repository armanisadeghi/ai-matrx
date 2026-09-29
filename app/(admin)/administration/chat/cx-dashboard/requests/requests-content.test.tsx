/** @jest-environment jsdom */

import { act, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import type { MatrxDataTableProps } from "@ai-matrx/design-system/data-table/types";
import type { CxUserRequest } from "@/features/cx-dashboard/types/cxDashboardTypes";
import { RequestsContent } from "./requests-content";

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean })
  .IS_REACT_ACT_ENVIRONMENT = true;

let tableProps: MatrxDataTableProps<CxUserRequest> | null = null;
const push = jest.fn();

jest.mock("next/navigation", () => ({
  usePathname: () => "/administration/chat/cx-dashboard/requests",
  useRouter: () => ({ push, refresh: jest.fn() }),
  useSearchParams: () => new URLSearchParams(window.location.search),
}));

jest.mock("@ai-matrx/design-system/data-table", () => ({
  MatrxDataTable: (props: MatrxDataTableProps<CxUserRequest>) => {
    if (props.urlState && props.query?.mode !== "local") {
      throw new Error("urlState cannot be combined with a controlled query");
    }
    tableProps = props;
    return null;
  },
}));

jest.mock("@/features/surfaces/runtime/SurfaceRuntimeContext", () => ({
  SurfaceRuntimeProvider: ({ children }: { children: ReactNode }) => children,
}));

jest.mock("@/features/context-menu-v3/NonEditableContextMenu", () => ({
  NonEditableContextMenu: ({ children }: { children: ReactNode }) => children,
}));

jest.mock("@/features/cx-dashboard/components/cx-row-actions", () => ({
  cxUserRequestMenuTarget: jest.fn(),
  useCxRowMenu: () => ({ resolveContextOnOpen: jest.fn(), sections: [] }),
}));

const request: CxUserRequest = {
  id: "request-1",
  conversation_id: "conversation-1",
  created_by: null,
  total_input_tokens: 3,
  total_output_tokens: 5,
  total_cached_tokens: 0,
  total_tokens: 8,
  total_cost: 0.01,
  total_duration_ms: 120,
  api_duration_ms: 100,
  tool_duration_ms: 20,
  iterations: 1,
  total_tool_calls: 0,
  status: "completed",
  finish_reason: "stop",
  error: null,
  created_at: "2026-09-28T00:00:00Z",
  completed_at: "2026-09-28T00:00:01Z",
  deleted_at: null,
  metadata: {},
};

describe("RequestsContent", () => {
  let host: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    tableProps = null;
    push.mockReset();
    window.history.replaceState(
      {},
      "",
      "/administration/chat/cx-dashboard/requests?status=completed",
    );
    host = document.createElement("div");
    document.body.append(host);
    root = createRoot(host);
  });

  afterEach(() => {
    act(() => root.unmount());
    host.remove();
  });

  it("uses the counted controlled source footer while local controls only affect the fetched page", () => {
    act(() => {
      root.render(
        <RequestsContent
          result={{ data: [request], total: 213, page: 2, per_page: 50, total_pages: 5 }}
        />,
      );
    });

    if (!tableProps?.query || tableProps.query.mode !== "controlled") {
      throw new Error("Requests table did not receive a controlled query");
    }

    expect(tableProps.hidePagination).toBeUndefined();
    expect(tableProps.urlState).toBeUndefined();
    expect(tableProps.pageSizeOptions).toEqual([25, 50, 100]);
    expect(tableProps.query).toMatchObject({
      state: { page: 2, pageSize: 50, search: "" },
      totalItems: 213,
      sourceProcessing: {
        search: "local",
        columnFilters: "local",
        sort: "local",
        sourceTotal: 213,
      },
    });

    const controlledQuery = tableProps.query;
    act(() => {
      controlledQuery.onStateChange({
        ...controlledQuery.state,
        page: 3,
        pageSize: 100,
      });
    });

    expect(push).toHaveBeenCalledWith(
      "/administration/chat/cx-dashboard/requests?status=completed&page=3&per_page=100",
      { scroll: false },
    );

    push.mockReset();
    const localQuery = tableProps.query;
    act(() => {
      localQuery.onStateChange({
        ...localQuery.state,
        page: 1,
        search: "fetched-only",
        columnFilters: {
          status: { kind: "select", value: "completed" },
        },
        sort: { id: "created_at", direction: "desc" },
      });
    });

    expect(push).not.toHaveBeenCalled();
    expect(tableProps.query.state.search).toBe("fetched-only");
    expect(tableProps.query.state.page).toBe(2);
  });
});
