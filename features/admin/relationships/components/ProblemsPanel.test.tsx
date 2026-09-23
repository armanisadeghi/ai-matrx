/** @jest-environment jsdom */

import { act, Children, isValidElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import type {
  MatrxDataTableProps,
  MatrxDataTableRecordControls,
} from "@ai-matrx/design-system/data-table";

import type { RelationshipProblem } from "../types";
import { ProblemsPanel } from "./ProblemsPanel";

type ProblemTableRow = RelationshipProblem & { tableRowId: string };

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let tableProps: MatrxDataTableProps<ProblemTableRow> | null = null;

jest.mock("@ai-matrx/design-system/data-table", () => ({
  MatrxDataTable: (props: MatrxDataTableProps<ProblemTableRow>) => {
    tableProps = props;
    return null;
  },
}));

jest.mock("@/components/ui/button", () => ({
  Button: ({ children, ...props }: React.ButtonHTMLAttributes<HTMLButtonElement>) => (
    <button {...props}>{children}</button>
  ),
}));

const problems: RelationshipProblem[] = [
  {
    kind: "unregistered_pair",
    severity: "error",
    source_type: "task",
    target_type: "project",
    label: "contains",
    detail: "This relationship is not registered.",
    edge_count: 3,
    container_side: "target",
  },
  {
    kind: "conveying_container_not_shareable",
    severity: "warning",
    source_type: "note",
    target_type: "project",
    label: "",
    detail: "The container is not shareable.",
    edge_count: 0,
    container_side: "target",
  },
  {
    kind: "wrong_way_edges",
    severity: "error",
    source_type: "file",
    target_type: "folder",
    label: "",
    detail: "Edges point the wrong way.",
    edge_count: 1,
    container_side: "source",
  },
];

describe("ProblemsPanel", () => {
  let host: HTMLDivElement;
  let root: Root;
  const onRegister = jest.fn();
  const onRegisterShareable = jest.fn();
  const onEdit = jest.fn();

  beforeEach(() => {
    tableProps = null;
    onRegister.mockReset();
    onRegisterShareable.mockReset();
    onEdit.mockReset();
    host = document.createElement("div");
    document.body.append(host);
    root = createRoot(host);
  });

  afterEach(() => {
    act(() => root.unmount());
    host.remove();
  });

  function render(rows = problems) {
    act(() => {
      root.render(
        <ProblemsPanel
          problems={rows}
          errorCount={rows.filter((row) => row.severity === "error").length}
          warningCount={rows.filter((row) => row.severity === "warning").length}
          busy={false}
          onRegister={onRegister}
          onRegisterShareable={onRegisterShareable}
          onEdit={onEdit}
        />,
      );
    });
  }

  it("uses the canonical table without changing row data, copy data, or repair actions", () => {
    render();

    if (!tableProps) throw new Error("Problems table did not render");
    if (!tableProps.copy || tableProps.copy === false) {
      throw new Error("Problems table copy configuration did not render");
    }

    expect(tableProps.urlState).toEqual({
      id: "relationship-problems",
      selectedRow: false,
    });
    expect(tableProps.detail).toEqual({ enabled: false });
    expect(tableProps.pageSize).toBe(0);
    expect(tableProps.toolbar?.titleCount).toBeUndefined();
    expect(tableProps.columns.map((column) => column.id)).toEqual([
      "severity",
      "kind",
      "source_type",
      "target_type",
      "label",
      "detail",
      "edge_count",
    ]);
    expect(tableProps.data.map((row) => tableProps?.getRowId(row))).toEqual([
      "unregistered_pair:task:project:contains:0",
      "conveying_container_not_shareable:note:project::1",
      "wrong_way_edges:file:folder::2",
    ]);
    expect(tableProps.copy?.agentRow?.(tableProps.data[0])).toEqual(problems[0]);
    expect(tableProps.copy?.humanRow(tableProps.data[0])).toContain(
      "Unregistered pair",
    );
    const detailCell = tableProps.columns.find((column) => column.id === "detail")?.cell?.(
      tableProps.data[0],
      0,
    );
    if (!isValidElement<{ children: React.ReactNode }>(detailCell)) {
      throw new Error("Detail cell did not render its tooltip");
    }
    const [trigger, content] = Children.toArray(detailCell.props.children);
    if (
      !isValidElement<{ children: React.ReactNode }>(trigger) ||
      !isValidElement<{ className?: string; children: string }>(trigger.props.children) ||
      !isValidElement<{ children: string }>(content)
    ) {
      throw new Error("Detail tooltip is missing its trigger or content");
    }
    expect(trigger.props.children.props.className).toContain("truncate");
    expect(content.props.children).toBe(problems[0].detail);

    const controls: MatrxDataTableRecordControls = {
      closeDetail() {},
      openDetail() {},
      openWindow() {},
      closeWindow() {},
      hasPendingEdits: false,
      discardPendingEdits() {},
    };
    const clickRowAction = (row: ProblemTableRow) => {
      const action = tableProps.rowActions?.(row, controls);
      if (!isValidElement<{ onClick?: () => void }>(action) || !action.props.onClick) {
        throw new Error("Missing row action");
      }
      action.props.onClick();
    };

    act(() => clickRowAction(tableProps.data[0]));
    act(() => clickRowAction(tableProps.data[1]));
    act(() => clickRowAction(tableProps.data[2]));

    expect(onRegister).toHaveBeenCalledWith("task", "project", "contains");
    expect(onRegisterShareable).toHaveBeenCalledWith("project");
    expect(onEdit).toHaveBeenCalledWith("file", "folder", "");
  });

  it("retains the successful zero-drift state instead of rendering an empty table", () => {
    render([]);

    expect(tableProps).toBeNull();
    expect(host.textContent).toContain("No drift detected");
  });
});
