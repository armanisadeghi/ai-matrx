import {
  buildDeleteOps,
  buildDuplicateOps,
  buildFillDownOps,
  buildSetColumnOps,
  capturePriorValues,
  orderSelectedRows,
  selectedRowsToTsv,
  type SelectableRow,
} from "../bulk-row-actions";

const ROWS: SelectableRow[] = [
  { id: "r1", data: { name: "Ada", status: "active", note: null } },
  { id: "r2", data: { name: "Grace", status: "paused", note: "on leave" } },
  { id: "r3", data: { name: "Alan", status: "active", note: "" } },
];

const FIELDS = [
  { field_name: "name", display_name: "Name" },
  { field_name: "status", display_name: "Status" },
];

describe("buildDeleteOps", () => {
  it("emits one delete per row, in the given order", () => {
    expect(buildDeleteOps(["r2", "r1"])).toEqual([
      { op: "delete", row_id: "r2" },
      { op: "delete", row_id: "r1" },
    ]);
  });

  it("emits nothing for an empty selection", () => {
    expect(buildDeleteOps([])).toEqual([]);
  });
});

describe("buildDuplicateOps", () => {
  it("inserts the DATA only — never the row id", () => {
    const ops = buildDuplicateOps([ROWS[0]]);
    expect(ops).toEqual([
      { op: "insert", data: { name: "Ada", status: "active", note: null } },
    ]);
    // Carrying the original id would collide or overwrite the source row.
    expect(JSON.stringify(ops)).not.toContain("r1");
  });

  it("copies the data rather than aliasing it", () => {
    const ops = buildDuplicateOps([ROWS[0]]) as { data: Record<string, unknown> }[];
    ops[0].data.name = "MUTATED";
    expect(ROWS[0].data!.name).toBe("Ada");
  });

  it("tolerates a row with no data", () => {
    expect(buildDuplicateOps([{ id: "x" }])).toEqual([{ op: "insert", data: {} }]);
  });
});

describe("buildSetColumnOps", () => {
  it("uses surgical cell ops so no other field can be touched", () => {
    expect(buildSetColumnOps(["r1", "r2"], "status", "archived")).toEqual([
      { op: "cell", row_id: "r1", field_name: "status", value: "archived" },
      { op: "cell", row_id: "r2", field_name: "status", value: "archived" },
    ]);
  });

  it("can set null to clear a column across a selection", () => {
    expect(buildSetColumnOps(["r1"], "note", null)).toEqual([
      { op: "cell", row_id: "r1", field_name: "note", value: null },
    ]);
  });
});

describe("buildFillDownOps", () => {
  it("fills from the FIRST row into every row below it", () => {
    expect(buildFillDownOps(ROWS, "status")).toEqual([
      { op: "cell", row_id: "r2", field_name: "status", value: "active" },
      { op: "cell", row_id: "r3", field_name: "status", value: "active" },
    ]);
  });

  it("never rewrites the source row", () => {
    const ops = buildFillDownOps(ROWS, "status") as { row_id: string }[];
    expect(ops.map((o) => o.row_id)).not.toContain("r1");
  });

  it("propagates an EMPTY source rather than skipping it — clearing down is a real intent", () => {
    expect(buildFillDownOps(ROWS, "note")).toEqual([
      { op: "cell", row_id: "r2", field_name: "note", value: null },
      { op: "cell", row_id: "r3", field_name: "note", value: null },
    ]);
  });

  it("emits nothing when there is nothing to fill", () => {
    expect(buildFillDownOps([ROWS[0]], "status")).toEqual([]);
    expect(buildFillDownOps([], "status")).toEqual([]);
  });
});

describe("capturePriorValues", () => {
  it("captures the inverse BEFORE the write, normalising absent to null", () => {
    const prior = capturePriorValues(ROWS, "note");
    expect(prior.get("r1")).toBeNull();
    expect(prior.get("r2")).toBe("on leave");
    expect(prior.get("missing")).toBeUndefined();
  });
});

describe("orderSelectedRows", () => {
  // Fill-down means "downward on screen". Ordering by click order would fill
  // from whichever row the user happened to touch first.
  it("returns DISPLAY order, not selection order", () => {
    expect(orderSelectedRows(ROWS, ["r3", "r1"]).map((r) => r.id)).toEqual([
      "r1",
      "r3",
    ]);
  });

  it("ignores ids that are not on the page", () => {
    expect(orderSelectedRows(ROWS, ["r2", "ghost"]).map((r) => r.id)).toEqual(["r2"]);
  });
});

describe("selectedRowsToTsv", () => {
  it("writes display headers then one line per row", () => {
    expect(selectedRowsToTsv([ROWS[0], ROWS[1]], FIELDS)).toBe(
      ["Name\tStatus", "Ada\tactive", "Grace\tpaused"].join("\n"),
    );
  });

  it("quotes values holding a tab or newline so a cell cannot become columns", () => {
    const tricky: SelectableRow[] = [
      { id: "x", data: { name: "a\tb", status: "line1\nline2" } },
    ];
    // A multi-line cell legitimately spans output lines, so assert on the whole
    // document — splitting on newlines is exactly the mistake the quoting exists
    // to make safe for a spreadsheet importer.
    expect(selectedRowsToTsv(tricky, FIELDS)).toBe(
      'Name\tStatus\n"a\tb"\t"line1\nline2"',
    );
  });

  it("escapes embedded quotes by doubling them", () => {
    const tricky: SelectableRow[] = [{ id: "x", data: { name: 'He said "hi"\there' } }];
    expect(selectedRowsToTsv(tricky, [FIELDS[0]]).split("\n")[1]).toBe(
      '"He said ""hi""\there"',
    );
  });

  it("renders empty for null, and quoted JSON for objects", () => {
    const rows: SelectableRow[] = [{ id: "x", data: { name: null, status: { a: 1 } } }];
    // The JSON contains quotes, so it MUST be quoted and its quotes doubled —
    // pasting a bare {"a":1} into a spreadsheet would break the row.
    expect(selectedRowsToTsv(rows, FIELDS).split("\n")[1]).toBe(
      '\t"{""a"":1}"',
    );
  });
});
