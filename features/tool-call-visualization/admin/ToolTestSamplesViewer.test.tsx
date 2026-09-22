/** @jest-environment jsdom */

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import type {
  MatrxDataTableProps,
  MatrxDataTableRecordControls,
} from "@ai-matrx/design-system/data-table";
import type { Tables } from "@/types/database.types";
import { ToolTestSamplesViewer } from "./ToolTestSamplesViewer";

type ToolTestSample = Tables<{ schema: "tool" }, "test_sample">;

(
  globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

let tableProps: MatrxDataTableProps<ToolTestSample> | null = null;
const recordControls: MatrxDataTableRecordControls = {
  closeDetail: jest.fn(),
  openDetail: jest.fn(),
  openWindow: jest.fn(),
  closeWindow: jest.fn(),
  hasPendingEdits: false,
  discardPendingEdits: jest.fn(),
  isExpanded: true,
  toggleExpanded: jest.fn(),
};

const sample: ToolTestSample = {
  id: "sample-1",
  tool_id: "tool-1",
  tool_name: "weather",
  tested_by: "admin",
  arguments: { city: "Seattle" },
  raw_stream_events: [],
  final_payload: {
    output: { full_result: { output: { temperature: 62 }, duration_ms: 15 } },
    metadata: { output_schema: { type: "object" } },
  },
  admin_comments: "Expected result",
  is_success: true,
  use_for_component: true,
  created_at: "2026-09-22T00:00:00.000Z",
  updated_at: "2026-09-22T00:00:00.000Z",
  created_by: null,
  custom_fields: {},
  deleted_at: null,
  metadata: {},
  organization_id: "org-1",
  updated_by: null,
  version: 1,
};

const order = jest.fn().mockResolvedValue({ data: [sample], error: null });
const or = jest.fn(() => ({ order }));
const select = jest.fn(() => ({ or }));
const from = jest.fn(() => ({ select }));

jest.mock("@ai-matrx/design-system/data-table", () => ({
  MatrxDataTable: (props: MatrxDataTableProps<ToolTestSample>) => {
    tableProps = props;
    return <>{props.toolbar?.leading}</>;
  },
}));

jest.mock("@/utils/supabase/client", () => ({
  supabase: { schema: () => ({ from }) },
}));

jest.mock("@/components/ui/use-toast", () => ({
  useToast: () => ({ toast: jest.fn() }),
}));

jest.mock("@/components/official/ProTextarea", () => ({
  ProTextarea: () => null,
}));

describe("ToolTestSamplesViewer", () => {
  let host: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    jest.useFakeTimers();
    tableProps = null;
    order.mockClear();
    or.mockClear();
    select.mockClear();
    from.mockClear();
    host = document.createElement("div");
    document.body.append(host);
    root = createRoot(host);
  });

  afterEach(() => {
    act(() => root.unmount());
    host.remove();
    jest.useRealTimers();
  });

  it("keeps every sample workflow expanded while using the canonical table", async () => {
    await act(async () => {
      root.render(<ToolTestSamplesViewer toolName="weather" toolId="tool-1" />);
    });
    await act(async () => {
      jest.runOnlyPendingTimers();
      await Promise.resolve();
      await Promise.resolve();
    });

    if (!tableProps) throw new Error("Test samples table did not render");
    expect(tableProps.getRowId(sample)).toBe("sample-1");
    expect(tableProps.columns.map((column) => column.id)).toEqual([
      "status",
      "component",
      "comments",
      "tested_by",
      "created_at",
    ]);
    expect(tableProps.expandedDetail?.expandedIds).toEqual(new Set(["sample-1"]));
    expect(tableProps.expandedDetail?.render(sample, recordControls)).toBeTruthy();
    expect(tableProps.coverage).toEqual({
      noun: "test sample",
      answeredBy: "client",
      cap: 1000,
    });
    expect(tableProps.copy).toBe(false);
    expect(tableProps.detail?.enabled).toBe(false);
    expect(tableProps.window?.enabled).toBe(false);
  });

  it("describes an empty quick-filter view as matching samples", async () => {
    await act(async () => {
      root.render(<ToolTestSamplesViewer toolName="weather" toolId="tool-1" />);
    });
    await act(async () => {
      jest.runOnlyPendingTimers();
      await Promise.resolve();
      await Promise.resolve();
    });

    const failure = Array.from(host.querySelectorAll("button")).find((button) =>
      button.textContent?.startsWith("Failure"),
    );
    if (!failure) throw new Error("Failure quick filter did not render");
    await act(async () => failure.click());

    if (!tableProps) throw new Error("Test samples table did not render");
    expect(tableProps.data).toEqual([]);
    expect(tableProps.coverage).toEqual({
      noun: "matching test sample",
      answeredBy: "client",
      cap: 1000,
    });
  });
});
