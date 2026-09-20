import {
  createDefaultTableRowMenuDescriptor,
  createTableRowMenuDescriptor,
  registerTableRowContextResolver,
  resolveTableRowMenuDescriptor,
} from "./table-row-context-registry";

describe("table row context registry", () => {
  it("resolves the clicked row from its mounted table and unregisters it", () => {
    const table = document.createElement("div");
    table.dataset.matrxTableId = "table-instance-a";
    const row = document.createElement("div");
    row.dataset.rowId = "row-2";
    const target = document.createElement("button");
    row.append(target);
    table.append(row);
    document.body.append(table);

    const descriptor = createTableRowMenuDescriptor({
      context: { content: "current row" },
      extraSections: [],
    });
    const unregister = registerTableRowContextResolver(
      "table-instance-a",
      (target) => (target.level === "row" && target.rowId === "row-2" ? descriptor : null),
    );

    expect(resolveTableRowMenuDescriptor(target)?.context.content).toBe("current row");
    unregister();
    expect(resolveTableRowMenuDescriptor(target)).toBeNull();
    table.remove();
  });

  it("keeps full current row data and only exposes declared edit controls", () => {
    const beginEdit = jest.fn();
    const descriptor = createDefaultTableRowMenuDescriptor({
      level: "row",
      rowId: "row-3",
      row: { id: "row-3", title: "Pending title", draft: true },
      controls: {
        closeDetail: jest.fn(),
        openDetail: jest.fn(),
        openWindow: jest.fn(),
        closeWindow: jest.fn(),
        hasPendingEdits: false,
        discardPendingEdits: jest.fn(),
        beginEdit,
      },
    });
    const table = document.createElement("div");
    table.dataset.matrxTableId = "table-instance-b";
    const row = document.createElement("div");
    row.dataset.rowId = "row-3";
    table.append(row);
    document.body.append(table);
    const unregister = registerTableRowContextResolver("table-instance-b", () => descriptor);

    const resolved = resolveTableRowMenuDescriptor(row);
    expect(resolved?.context.content).toContain('"draft": true');
    expect(resolved?.context.__entity).toBeNull();
    const edit = resolved?.extraSections[0]?.items[0];
    expect(edit?.kind).toBe("item");
    if (edit?.kind === "item") edit.onSelect();
    expect(beginEdit).toHaveBeenCalledTimes(1);

    unregister();
    table.remove();
  });
});
