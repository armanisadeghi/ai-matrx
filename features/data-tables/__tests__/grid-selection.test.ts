import {
  classifyGridKey,
  isDirectClickEditor,
  isTypingKey,
  moveSelection,
  sameCell,
  type CellAddress,
} from "../grid-selection";

const ROWS = ["r1", "r2", "r3"];
const COLS = ["name", "status", "count"];

const key = (over: Partial<Parameters<typeof classifyGridKey>[0]> & { key: string }) => ({
  shiftKey: false,
  ctrlKey: false,
  metaKey: false,
  altKey: false,
  ...over,
});

describe("moveSelection", () => {
  it("selects the first cell when nothing is selected", () => {
    expect(moveSelection(null, "down", ROWS, COLS)).toEqual({
      rowId: "r1",
      fieldName: "name",
    });
  });

  it("returns null for an empty grid", () => {
    expect(moveSelection(null, "down", [], COLS)).toBeNull();
    expect(moveSelection(null, "down", ROWS, [])).toBeNull();
  });

  it("moves in all four directions", () => {
    const mid: CellAddress = { rowId: "r2", fieldName: "status" };
    expect(moveSelection(mid, "up", ROWS, COLS)).toEqual({ rowId: "r1", fieldName: "status" });
    expect(moveSelection(mid, "down", ROWS, COLS)).toEqual({ rowId: "r3", fieldName: "status" });
    expect(moveSelection(mid, "left", ROWS, COLS)).toEqual({ rowId: "r2", fieldName: "name" });
    expect(moveSelection(mid, "right", ROWS, COLS)).toEqual({ rowId: "r2", fieldName: "count" });
  });

  it("CLAMPS at the edges instead of clearing — overshooting must not lose your place", () => {
    const topLeft: CellAddress = { rowId: "r1", fieldName: "name" };
    expect(moveSelection(topLeft, "up", ROWS, COLS)).toEqual(topLeft);
    expect(moveSelection(topLeft, "left", ROWS, COLS)).toEqual(topLeft);

    const bottomRight: CellAddress = { rowId: "r3", fieldName: "count" };
    expect(moveSelection(bottomRight, "down", ROWS, COLS)).toEqual(bottomRight);
    expect(moveSelection(bottomRight, "right", ROWS, COLS)).toEqual(bottomRight);
  });

  it("wraps Tab across row boundaries", () => {
    expect(
      moveSelection({ rowId: "r1", fieldName: "count" }, "nextCell", ROWS, COLS),
    ).toEqual({ rowId: "r2", fieldName: "name" });

    expect(
      moveSelection({ rowId: "r2", fieldName: "name" }, "prevCell", ROWS, COLS),
    ).toEqual({ rowId: "r1", fieldName: "count" });
  });

  it("stops Tab at the very end and very start rather than wrapping around", () => {
    const last: CellAddress = { rowId: "r3", fieldName: "count" };
    expect(moveSelection(last, "nextCell", ROWS, COLS)).toEqual(last);
    const first: CellAddress = { rowId: "r1", fieldName: "name" };
    expect(moveSelection(first, "prevCell", ROWS, COLS)).toEqual(first);
  });

  it("jumps to row and grid extents", () => {
    const mid: CellAddress = { rowId: "r2", fieldName: "status" };
    expect(moveSelection(mid, "rowStart", ROWS, COLS)).toEqual({ rowId: "r2", fieldName: "name" });
    expect(moveSelection(mid, "rowEnd", ROWS, COLS)).toEqual({ rowId: "r2", fieldName: "count" });
    expect(moveSelection(mid, "gridStart", ROWS, COLS)).toEqual({ rowId: "r1", fieldName: "name" });
    expect(moveSelection(mid, "gridEnd", ROWS, COLS)).toEqual({ rowId: "r3", fieldName: "count" });
  });

  // THE REGRESSION THIS MODEL EXISTS TO PREVENT. Rows reload after every write
  // and realtime reorders them underneath the user; an index-based selection
  // would silently point at a different row and the next keystroke would edit
  // the wrong one.
  it("falls back to the first cell when the selected row no longer exists", () => {
    const gone: CellAddress = { rowId: "deleted-row", fieldName: "status" };
    expect(moveSelection(gone, "down", ROWS, COLS)).toEqual({
      rowId: "r1",
      fieldName: "name",
    });
  });

  it("falls back to the first cell when the selected column no longer exists", () => {
    const gone: CellAddress = { rowId: "r2", fieldName: "dropped_column" };
    expect(moveSelection(gone, "right", ROWS, COLS)).toEqual({
      rowId: "r1",
      fieldName: "name",
    });
  });

  it("survives a row REORDER by address, landing on the true neighbour", () => {
    const reordered = ["r3", "r1", "r2"];
    // Selected r1; "down" must follow the NEW ordering, not a stale index.
    expect(
      moveSelection({ rowId: "r1", fieldName: "name" }, "down", reordered, COLS),
    ).toEqual({ rowId: "r2", fieldName: "name" });
  });
});

describe("classifyGridKey", () => {
  it("maps arrows to moves and modified arrows to extents", () => {
    expect(classifyGridKey(key({ key: "ArrowDown" }))).toEqual({ kind: "move", move: "down" });
    expect(classifyGridKey(key({ key: "ArrowDown", metaKey: true }))).toEqual({
      kind: "move",
      move: "gridEnd",
    });
    expect(classifyGridKey(key({ key: "ArrowLeft", ctrlKey: true }))).toEqual({
      kind: "move",
      move: "rowStart",
    });
  });

  it("maps Tab and Shift+Tab", () => {
    expect(classifyGridKey(key({ key: "Tab" }))).toEqual({ kind: "move", move: "nextCell" });
    expect(classifyGridKey(key({ key: "Tab", shiftKey: true }))).toEqual({
      kind: "move",
      move: "prevCell",
    });
  });

  it("opens the editor on Enter, F2 and Space", () => {
    for (const k of ["Enter", "F2", " "]) {
      expect(classifyGridKey(key({ key: k }))).toEqual({ kind: "edit" });
    }
  });

  it("seeds an edit from a printable character", () => {
    expect(classifyGridKey(key({ key: "a" }))).toEqual({ kind: "editSeeded", seed: "a" });
    expect(classifyGridKey(key({ key: "7" }))).toEqual({ kind: "editSeeded", seed: "7" });
  });

  it("never mistakes a shortcut for typing", () => {
    expect(classifyGridKey(key({ key: "c", metaKey: true }))).toEqual({ kind: "copy" });
    expect(classifyGridKey(key({ key: "r", ctrlKey: true }))).toBeNull();
    expect(classifyGridKey(key({ key: "s", metaKey: true }))).toBeNull();
  });

  it("maps Delete and Backspace to clearing the cell", () => {
    expect(classifyGridKey(key({ key: "Delete" }))).toEqual({ kind: "clearCell" });
    expect(classifyGridKey(key({ key: "Backspace" }))).toEqual({ kind: "clearCell" });
  });

  it("returns null for keys the grid has no opinion about", () => {
    expect(classifyGridKey(key({ key: "F5" }))).toBeNull();
    expect(classifyGridKey(key({ key: "Shift" }))).toBeNull();
  });
});

describe("isTypingKey", () => {
  it("excludes space so it can open an editor instead", () => {
    expect(isTypingKey(key({ key: " " }))).toBe(false);
  });
  it("excludes modified characters", () => {
    expect(isTypingKey(key({ key: "a", metaKey: true }))).toBe(false);
    expect(isTypingKey(key({ key: "a", altKey: true }))).toBe(false);
  });
  it("accepts plain printable characters", () => {
    expect(isTypingKey(key({ key: "z" }))).toBe(true);
  });
});

// THE CLICK LAW. If a free-text editor ever appears in this list, a single
// click starts dropping users into a text buffer and select-to-copy becomes an
// accidental edit.
describe("isDirectClickEditor", () => {
  it("allows only closed sets and two-state values", () => {
    expect(isDirectClickEditor("checkbox")).toBe(true);
    expect(isDirectClickEditor("rating")).toBe(true);
    expect(isDirectClickEditor("select")).toBe(true);
    expect(isDirectClickEditor("multiselect")).toBe(true);
  });

  it("REFUSES every free-text editor", () => {
    for (const k of ["text", "textarea", "number", "json", "date", "datetime", "email", "url", "tel", "color"]) {
      expect(isDirectClickEditor(k)).toBe(false);
    }
    expect(isDirectClickEditor(undefined)).toBe(false);
  });
});

describe("sameCell", () => {
  it("compares by address, and treats null as its own value", () => {
    expect(sameCell({ rowId: "a", fieldName: "b" }, { rowId: "a", fieldName: "b" })).toBe(true);
    expect(sameCell({ rowId: "a", fieldName: "b" }, { rowId: "a", fieldName: "c" })).toBe(false);
    expect(sameCell(null, null)).toBe(true);
    expect(sameCell(null, { rowId: "a", fieldName: "b" })).toBe(false);
  });
});
