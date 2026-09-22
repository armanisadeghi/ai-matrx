/** @jest-environment jsdom */

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import type { MatrxDataTableProps } from "@ai-matrx/design-system/data-table";
import { FunctionsList } from "./FunctionsList";
import { databaseFunctionSignature, type DatabaseFunction } from "./types";

(
  globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

let tableProps: MatrxDataTableProps<DatabaseFunction> | null = null;

jest.mock("@ai-matrx/design-system/data-table", () => ({
  MatrxDataTable: (props: MatrxDataTableProps<DatabaseFunction>) => {
    tableProps = props;
    return null;
  },
}));

jest.mock("@ai-matrx/tap-target/buttons", () => ({
  ViewTapButton: () => null,
}));

const overloadedFunctions: DatabaseFunction[] = [
  {
    schema: "public",
    name: "declare_output_schema_kind_marker",
    arguments: "kind text",
    security_type: "SECURITY DEFINER",
    returns: "jsonb",
    definition: "create function …",
  },
  {
    schema: "public",
    name: "declare_output_schema_kind_marker",
    arguments: "kind text, strict boolean",
    security_type: "SECURITY INVOKER",
    returns: "jsonb",
    definition: "create function …",
  },
];

describe("FunctionsList canonical contract", () => {
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

  it("keeps each function overload addressable and every meaningful field independently filterable", () => {
    act(() => {
      root.render(
        <FunctionsList
          functions={overloadedFunctions}
          loading={false}
          isRefreshing={false}
          error={null}
          onRefresh={jest.fn()}
          onViewDetails={jest.fn()}
        />,
      );
    });

    if (!tableProps) throw new Error("Functions table was not rendered");
    expect(tableProps.getRowId(overloadedFunctions[0])).not.toBe(
      tableProps.getRowId(overloadedFunctions[1]),
    );
    expect(tableProps.getRowId(overloadedFunctions[0])).toBe(
      databaseFunctionSignature(overloadedFunctions[0]),
    );
    expect(tableProps.columns).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ accessorKey: "name", filter: "text" }),
        expect.objectContaining({ accessorKey: "schema", filter: "select" }),
        expect.objectContaining({
          accessorKey: "security_type",
          filter: "select",
        }),
        expect.objectContaining({ accessorKey: "arguments", filter: "text" }),
        expect.objectContaining({ accessorKey: "returns", filter: "text" }),
      ]),
    );
    expect(tableProps.coverage).toEqual({
      noun: "database function",
      cap: 1000,
      answeredBy: "client",
    });
    expect(tableProps.hidePagination).toBeUndefined();
    expect(tableProps.pageSize).toBeUndefined();
    expect(tableProps.toolbar?.refresh?.onRefresh).toEqual(
      expect.any(Function),
    );
    expect(tableProps.rowActions).toEqual(expect.any(Function));
  });

  it("shows a recoverable read failure without removing the canonical table", () => {
    act(() => {
      root.render(
        <FunctionsList
          functions={overloadedFunctions}
          loading={false}
          isRefreshing={false}
          error="Function receipt unavailable"
          onRefresh={jest.fn()}
          onViewDetails={jest.fn()}
        />,
      );
    });

    expect(host.textContent).toContain("Function receipt unavailable");
    expect(host.textContent).toContain("Retry");
    expect(tableProps?.data).toBe(overloadedFunctions);
  });
});
