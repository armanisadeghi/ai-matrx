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

function ControlledLocalTable() {
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
      toolbar={{ title: "Deprecated models", search: true }}
      copy={false}
      detail={{ enabled: false }}
      window={{ enabled: false }}
    />
  );
}

describe("DeprecatedModelsAudit pagination", () => {
  it("lets the canonical Show more control advance controlled-local rows", async () => {
    const container = document.createElement("div");
    document.body.append(container);
    const root = createRoot(container);

    await act(async () => {
      root.render(<ControlledLocalTable />);
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
