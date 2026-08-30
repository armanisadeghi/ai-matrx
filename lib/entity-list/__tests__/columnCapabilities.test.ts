import {
  entityColumnSortable,
  type EntityColumnSpec,
} from "@/lib/entity-list/columns";

interface Row {
  id: string;
}

describe("entity-list column capabilities", () => {
  it("defaults sorting on but preserves an explicit server capability refusal", () => {
    const defaultColumn: EntityColumnSpec<Row> = {
      id: "id",
      label: "ID",
      column: { id: "id", accessorKey: "id", header: "ID" },
    };
    const unsupportedSort: EntityColumnSpec<Row> = {
      id: "connections",
      label: "Connections",
      column: {
        id: "connections",
        accessorKey: "id",
        header: "Connections",
        sortable: false,
      },
    };

    expect(entityColumnSortable(defaultColumn)).toBe(true);
    expect(entityColumnSortable(unsupportedSort)).toBe(false);
  });
});
