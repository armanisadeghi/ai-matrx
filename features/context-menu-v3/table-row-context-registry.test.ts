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

  it("heads the menu with the clicked cell's words, never the row's raw document", () => {
    const descriptor = createDefaultTableRowMenuDescriptor({
      level: "row",
      rowId: "row-9",
      row: { id: "row-9", level: "admin", hidden: {}, document: { customer: "Priya Nair", _choices: {} } },
      controls: {} as never,
    });
    const table = document.createElement("table");
    table.dataset.matrxTableId = "table-instance-c";
    const row = document.createElement("tr");
    row.dataset.rowId = "row-9";
    row.innerHTML = '<td><span>One-off — Harbor Motel</span></td><td><span>Priya Nair</span><button>who?</button></td>';
    table.append(row);
    document.body.append(table);
    const unregister = registerTableRowContextResolver("table-instance-c", () => descriptor);
    const customerCell = row.querySelectorAll("td")[1]!.querySelector("span")!;
    expect(resolveTableRowMenuDescriptor(customerCell)?.context.content).toBe("Priya Nair");
    expect(resolveTableRowMenuDescriptor(row)?.context.content).toBe("One-off — Harbor Motel · Priya Nair");
    expect(String(resolveTableRowMenuDescriptor(customerCell)?.context.content)).not.toContain("_choices");
    unregister();
    table.remove();
  });

  it("the header names the clicked cell's PRIMARY line — stacked lines are never glued together (page-pass 2026-09-27)", () => {
    const table = document.createElement("table");
    table.dataset.matrxTableId = "table-instance-lines";
    table.innerHTML =
      '<tbody><tr data-row-id="r1">' +
      '<td id="name"><div><a>Data Destruction, <b>Inc.</b></a></div><div>Company record</div></td>' +
      '<td id="surface"><span>Notes</span><div>matrx-user/notes</div><button>Open</button></td>' +
      "</tr></tbody>";
    document.body.append(table);
    const descriptor = createTableRowMenuDescriptor({ context: { content: "{}" }, extraSections: [] });
    const unregister = registerTableRowContextResolver("table-instance-lines", () => descriptor);
    const content = (id: string) =>
      resolveTableRowMenuDescriptor(table.querySelector<HTMLElement>(`#${id}`))?.context.content;
    expect(content("name")).toBe("Data Destruction, Inc.");
    expect(content("surface")).toBe("Notes");
    expect(resolveTableRowMenuDescriptor(table.querySelector<HTMLElement>("tr"))?.context.content).toBe(
      "Data Destruction, Inc. · Notes",
    );
    unregister();
    table.remove();
  });
});
