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

  it("the header names the ROW's record, not the clicked cell (admin pass 2026-09-27: 'Content: partial')", () => {
    const table = document.createElement("table");
    table.dataset.matrxTableId = "table-instance-record";
    table.innerHTML =
      '<tbody><tr data-row-id="r1">' +
      '<td data-matrx-table-column-id="favorite"><button aria-label="Star">*</button></td>' +
      '<td data-matrx-table-column-id="name"><div>Notes</div><div>matrx-user/notes</div></td>' +
      '<td data-matrx-table-column-id="readiness" id="status">partial</td>' +
      "</tr></tbody>";
    document.body.append(table);
    const descriptor = createTableRowMenuDescriptor({ context: { content: "{}" }, extraSections: [] });
    const unregister = registerTableRowContextResolver("table-instance-record", () => descriptor);
    const resolved = resolveTableRowMenuDescriptor(table.querySelector<HTMLElement>("#status"));
    expect(resolved?.context.content).toBe("partial");
    expect((resolved?.context as Record<string, unknown>).__heading).toEqual({ label: "Row", text: "Notes" });
    // A descriptor that names itself keeps its own heading.
    const named = createTableRowMenuDescriptor({ context: { content: "{}", __heading: { label: "Surface", text: "Notes" } }, extraSections: [] });
    const unregister2 = registerTableRowContextResolver("table-instance-record", () => named);
    expect((resolveTableRowMenuDescriptor(table.querySelector<HTMLElement>("#status"))?.context as Record<string, unknown>).__heading).toEqual({ label: "Surface", text: "Notes" });
    unregister2();
    unregister();
    table.remove();
  });

  it("names the row ONCE: a primary section labelled with the header's name is headed 'Row' instead (admin judge 2026-09-27)", () => {
    const table = document.createElement("table");
    table.dataset.matrxTableId = "table-instance-once";
    table.innerHTML =
      '<tbody><tr data-row-id="r1"><td data-matrx-table-column-id="name" id="n">Basic Editor</td></tr></tbody>';
    document.body.append(table);
    const descriptor = createTableRowMenuDescriptor({
      context: { content: "{}" },
      extraSections: [
        { id: "surface-row", label: "Basic Editor", primary: true, items: [{ kind: "item", id: "open", label: "Open editor", onSelect: () => {} }] },
        { id: "other", label: "Tools", items: [{ kind: "item", id: "x", label: "X", onSelect: () => {} }] },
      ],
    });
    const unregister = registerTableRowContextResolver("table-instance-once", () => descriptor);
    const resolved = resolveTableRowMenuDescriptor(table.querySelector<HTMLElement>("#n"));
    expect((resolved?.context as Record<string, unknown>).__heading).toEqual({ label: "Row", text: "Basic Editor" });
    expect(resolved?.extraSections[0]?.label).toBe("Row");
    expect(resolved?.extraSections[0]?.items).toHaveLength(1);
    expect(resolved?.extraSections[1]?.label).toBe("Tools");
    unregister();
    table.remove();
  });
});
