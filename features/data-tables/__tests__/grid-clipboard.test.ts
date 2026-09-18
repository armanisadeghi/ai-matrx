import {
  cellClipboardText,
  gridToTsv,
  isSingleCell,
  parseClipboardGrid,
  planPaste,
  storedValuesEqual,
} from "../grid-clipboard";

const ROWS = ["r1", "r2", "r3"];
const COLS = ["name", "status", "count"];

describe("parseClipboardGrid", () => {
  it("reads a single value as a 1×1 block", () => {
    expect(parseClipboardGrid("Beijing")).toEqual([["Beijing"]]);
    expect(isSingleCell(parseClipboardGrid("Beijing"))).toBe(true);
  });

  it("splits tabs into columns and lines into rows", () => {
    expect(parseClipboardGrid("a\tb\nc\td")).toEqual([
      ["a", "b"],
      ["c", "d"],
    ]);
  });

  it("accepts Windows line endings", () => {
    expect(parseClipboardGrid("a\tb\r\nc\td")).toEqual([
      ["a", "b"],
      ["c", "d"],
    ]);
  });

  it("STRIPS the single trailing line break every spreadsheet appends", () => {
    // Excel and Sheets end every copy with a line break; without this rule a
    // paste would be one empty row taller than what was copied.
    expect(parseClipboardGrid("a\tb\r\n")).toEqual([["a", "b"]]);
    expect(parseClipboardGrid("a\nb\n")).toEqual([["a"], ["b"]]);
  });

  it("keeps a quoted cell that spans lines as ONE cell", () => {
    expect(parseClipboardGrid('"line one\nline two"\tnext')).toEqual([
      ["line one\nline two", "next"],
    ]);
  });

  it("unescapes doubled quotes inside a quoted cell", () => {
    expect(parseClipboardGrid('"say ""hi"""\tx')).toEqual([['say "hi"', "x"]]);
  });

  it("treats a quote that does not open a well-formed cell literally", () => {
    expect(parseClipboardGrid('5" screen\tx')).toEqual([['5" screen', "x"]]);
  });

  it("keeps empty cells so columns stay aligned", () => {
    expect(parseClipboardGrid("a\t\tc")).toEqual([["a", "", "c"]]);
  });

  it("round-trips what gridToTsv produces", () => {
    const block = [
      ["plain", 'has "quote"', "multi\nline"],
      ["tab\there", 42, null],
    ];
    expect(parseClipboardGrid(gridToTsv(block))).toEqual([
      ["plain", 'has "quote"', "multi\nline"],
      ["tab\there", "42", ""],
    ]);
  });
});

describe("cellClipboardText", () => {
  it("serialises objects as JSON and null as empty", () => {
    expect(cellClipboardText({ a: 1 })).toBe('{"a":1}');
    expect(cellClipboardText(null)).toBe("");
    expect(cellClipboardText(3)).toBe("3");
  });
});

describe("planPaste", () => {
  it("lands a block downward and rightward from the anchor", () => {
    const plan = planPaste(
      { rowId: "r1", fieldName: "status" },
      [
        ["x", "1"],
        ["y", "2"],
      ],
      ROWS,
      COLS,
    );
    expect(plan?.cells).toEqual([
      { rowId: "r1", fieldName: "status", raw: "x" },
      { rowId: "r1", fieldName: "count", raw: "1" },
      { rowId: "r2", fieldName: "status", raw: "y" },
      { rowId: "r2", fieldName: "count", raw: "2" },
    ]);
    expect(plan?.overflowRows).toEqual([]);
    expect(plan?.clippedColumns).toBe(0);
  });

  it("clips columns that fall off the right edge and says how many", () => {
    const plan = planPaste(
      { rowId: "r1", fieldName: "count" },
      [["a", "b", "c"]],
      ROWS,
      COLS,
    );
    expect(plan?.cells).toEqual([{ rowId: "r1", fieldName: "count", raw: "a" }]);
    expect(plan?.clippedColumns).toBe(2);
  });

  it("reports rows below the grid as overflow instead of dropping them", () => {
    const plan = planPaste(
      { rowId: "r3", fieldName: "name" },
      [
        ["fits", "1"],
        ["over", "2"],
        ["flow", "3"],
      ],
      ROWS,
      COLS,
    );
    expect(plan?.cells).toEqual([
      { rowId: "r3", fieldName: "name", raw: "fits" },
      { rowId: "r3", fieldName: "status", raw: "1" },
    ]);
    expect(plan?.overflowRows).toEqual([
      ["over", "2"],
      ["flow", "3"],
    ]);
    expect(plan?.fieldNames).toEqual(["name", "status"]);
  });

  it("leaves cells a ragged row does not reach alone", () => {
    const plan = planPaste(
      { rowId: "r1", fieldName: "name" },
      [["a", "b"], ["c"]],
      ROWS,
      COLS,
    );
    expect(plan?.cells).toEqual([
      { rowId: "r1", fieldName: "name", raw: "a" },
      { rowId: "r1", fieldName: "status", raw: "b" },
      { rowId: "r2", fieldName: "name", raw: "c" },
    ]);
  });

  it("refuses when the anchor is no longer on the grid", () => {
    expect(
      planPaste({ rowId: "gone", fieldName: "name" }, [["a"]], ROWS, COLS),
    ).toBeNull();
    expect(
      planPaste({ rowId: "r1", fieldName: "hidden" }, [["a"]], ROWS, COLS),
    ).toBeNull();
  });

  it("honours the grid's column ORDER, not the schema's", () => {
    const plan = planPaste(
      { rowId: "r1", fieldName: "count" },
      [["a", "b"]],
      ROWS,
      ["count", "name", "status"],
    );
    expect(plan?.cells.map((c) => c.fieldName)).toEqual(["count", "name"]);
  });
});

describe("storedValuesEqual", () => {
  it("treats null and undefined as the same empty cell", () => {
    expect(storedValuesEqual(null, undefined)).toBe(true);
    expect(storedValuesEqual(null, "")).toBe(false);
  });
  it("compares objects by content and primitives by identity", () => {
    expect(storedValuesEqual({ a: 1 }, { a: 1 })).toBe(true);
    expect(storedValuesEqual(3, "3")).toBe(false);
    expect(storedValuesEqual("x", "x")).toBe(true);
  });
});
