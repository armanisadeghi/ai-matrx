import React, { act, useState } from "react";
import { createRoot } from "react-dom/client";
import {
  MatrxDataTable,
  type MatrxDataTableQueryState,
} from "@ai-matrx/design-system/data-table";

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT =
  true;

type Row = { id: string; label: string };

const rows: Row[] = Array.from({ length: 115 }, (_, index) => ({
  id: String(index + 1),
  label: `Deprecated model ${index + 1}`,
}));

function ControlledLocalTable({ progressive = false }: { progressive?: boolean }) {
  const [state, onStateChange] = useState<MatrxDataTableQueryState>({
    page: 1,
    pageSize: 50,
    search: "",
    anyOf: "",
    columnFilters: {},
    sort: null,
  });

  return (
    <MatrxDataTable<Row>
      tableId="ai-models/deprecated-audit-pagination-test"
      data={rows}
      columns={[
        {
          id: "label",
          header: "Deprecated model",
          accessorFn: (row) => row.label,
        },
      ]}
      getRowId={(row) => row.id}
      query={{ mode: "controlled-local", state, onStateChange }}
      {...(progressive ? { localPagination: { mode: "progressive" as const } } : {})}
      toolbar={{ title: "Deprecated models", search: true }}
      copy={false}
      detail={{ enabled: false }}
      window={{ enabled: false }}
    />
  );
}

describe("DeprecatedModelsAudit pagination", () => {
  // design-system 0.68: progressive "Show more" is the default only inside a MatrxTableCard; a bare
  // table (the audit's own shape) pages. Both controls must advance controlled-local rows.
  it("lets the canonical page control advance controlled-local rows", async () => {
    const container = document.createElement("div");
    document.body.append(container);
    const root = createRoot(container);

    await act(async () => {
      root.render(<ControlledLocalTable />);
    });

    expect(container.querySelectorAll("tbody tr")).toHaveLength(50);
    expect(container.textContent).toContain("Deprecated model 1");
    const next = container.querySelector<HTMLButtonElement>('button[aria-label="Next page"]');
    expect(next).not.toBeNull();

    await act(async () => {
      next?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });

    expect(container.querySelectorAll("tbody tr")).toHaveLength(50);
    expect(container.textContent).toContain("Deprecated model 51");
    expect(container.textContent).not.toContain("Deprecated model 1 ");
    await act(async () => {
      root.unmount();
    });
    container.remove();
  });

  it("lets the canonical Show more control advance controlled-local rows", async () => {
    const container = document.createElement("div");
    document.body.append(container);
    const root = createRoot(container);

    await act(async () => {
      root.render(<ControlledLocalTable progressive />);
    });

    expect(container.querySelectorAll("tbody tr")).toHaveLength(50);
    const showMore = Array.from(container.querySelectorAll("button")).find(
      (button) => button.textContent?.trim() === "Show more",
    );
    expect(showMore).toBeDefined();

    await act(async () => {
      showMore?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });

    expect(container.querySelectorAll("tbody tr")).toHaveLength(100);
    await act(async () => {
      root.unmount();
    });
    container.remove();
  });
});
