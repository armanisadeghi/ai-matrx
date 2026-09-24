import {
  applyStylePath,
  BOOLEAN_TRUE_COLOR,
  COLOR_RULE_OPS,
  evaluateRule,
  EMPTY_TABLE_STYLE,
  parseTableStyle,
  resolveCellColor,
  resolveRowColor,
  stylePath,
  tableStyleFromMetadata,
  tableStyleIsEmpty,
  type ChoiceColorLookup,
  type ColorRule,
  type TableStyle,
} from "@ai-matrx/design-system/data-table/table-style";

const noColor: ChoiceColorLookup = () => undefined;

function rowRule(overrides: Partial<ColorRule> = {}): ColorRule {
  return {
    id: "r1",
    field: "status",
    op: "is",
    value: "blocked",
    color: "red",
    target: "row",
    ...overrides,
  };
}

describe("parseTableStyle", () => {
  it("returns EMPTY for non-objects", () => {
    expect(parseTableStyle(null)).toEqual(EMPTY_TABLE_STYLE);
    expect(parseTableStyle(undefined)).toEqual(EMPTY_TABLE_STYLE);
    expect(parseTableStyle("string")).toEqual(EMPTY_TABLE_STYLE);
    expect(parseTableStyle(42)).toEqual(EMPTY_TABLE_STYLE);
    expect(parseTableStyle([1, 2])).toEqual(EMPTY_TABLE_STYLE);
  });

  it("drops unknown color names from rows, columns and cells", () => {
    const style = parseTableStyle({
      rows: { r1: "red", r2: "not-a-color" },
      columns: { name: "blue", other: "chartreuse" },
      cells: { r1: { name: "green", status: "nope" } },
    });
    expect(style.rows).toEqual({ r1: "red" });
    expect(style.columns).toEqual({ name: "blue" });
    expect(style.cells).toEqual({ r1: { name: "green" } });
  });

  it("drops a rule missing id or field", () => {
    const style = parseTableStyle({
      rules: [
        { field: "status", op: "is", value: "x", color: "red", target: "row" },
        { id: "r1", op: "is", value: "x", color: "red", target: "row" },
      ],
    });
    expect(style.rules).toBeUndefined();
  });

  it("drops a rule with a bad op", () => {
    const style = parseTableStyle({
      rules: [{ id: "r1", field: "status", op: "equals", value: "x", color: "red", target: "row" }],
    });
    expect(style.rules).toBeUndefined();
  });

  it("drops a rule with a bad target", () => {
    const style = parseTableStyle({
      rules: [{ id: "r1", field: "status", op: "is", value: "x", color: "red", target: "column" }],
    });
    expect(style.rules).toBeUndefined();
  });

  it("drops a rule with a non-style color", () => {
    const style = parseTableStyle({
      rules: [{ id: "r1", field: "status", op: "is", value: "x", color: "chartreuse", target: "row" }],
    });
    expect(style.rules).toBeUndefined();
  });

  it("keeps a well-formed rule", () => {
    const style = parseTableStyle({
      rules: [{ id: "r1", field: "status", op: "is", value: "blocked", color: "red", target: "row" }],
    });
    expect(style.rules).toEqual([
      { id: "r1", field: "status", op: "is", value: "blocked", color: "red", target: "row" },
    ]);
  });

  it("coerces a numeric rule value to a string", () => {
    const style = parseTableStyle({
      rules: [{ id: "r1", field: "amount", op: "gt", value: 1000, color: "amber", target: "row" }],
    });
    expect(style.rules?.[0].value).toBe("1000");
    expect(typeof style.rules?.[0].value).toBe("string");
  });

  it("parses colorBy only when field is a string and target is row or cell", () => {
    expect(parseTableStyle({ colorBy: { field: "status", target: "row" } }).colorBy).toEqual({
      field: "status",
      target: "row",
    });
    expect(parseTableStyle({ colorBy: { field: "status", target: "cell" } }).colorBy).toEqual({
      field: "status",
      target: "cell",
    });
    expect(parseTableStyle({ colorBy: { field: 5, target: "row" } }).colorBy).toBeUndefined();
    expect(parseTableStyle({ colorBy: { field: "status", target: "column" } }).colorBy).toBeUndefined();
    expect(parseTableStyle({ colorBy: null }).colorBy).toBeUndefined();
  });

  it("prunes empty cell maps", () => {
    const style = parseTableStyle({
      cells: { r1: { name: "not-a-color" }, r2: {} },
    });
    expect(style.cells).toBeUndefined();
  });
});

describe("tableStyleFromMetadata", () => {
  it("reads the style key off metadata", () => {
    const style = tableStyleFromMetadata({ style: { rows: { r1: "red" } } });
    expect(style.rows).toEqual({ r1: "red" });
  });

  it("tolerates null metadata", () => {
    expect(tableStyleFromMetadata(null)).toEqual(EMPTY_TABLE_STYLE);
    expect(tableStyleFromMetadata(undefined)).toEqual(EMPTY_TABLE_STYLE);
  });
});

describe("evaluateRule", () => {
  it("covers every op in COLOR_RULE_OPS", () => {
    expect(COLOR_RULE_OPS).toEqual([
      "is",
      "is_not",
      "contains",
      "is_empty",
      "not_empty",
      "is_true",
      "is_false",
      "gt",
      "gte",
      "lt",
      "lte",
    ]);
  });

  it("is/is_not are case-insensitive and trimmed", () => {
    expect(evaluateRule(rowRule({ op: "is", value: "Blocked" }), "  blocked  ")).toBe(true);
    expect(evaluateRule(rowRule({ op: "is", value: "blocked" }), "OPEN")).toBe(false);
    expect(evaluateRule(rowRule({ op: "is_not", value: "Blocked" }), "  blocked  ")).toBe(false);
    expect(evaluateRule(rowRule({ op: "is_not", value: "blocked" }), "open")).toBe(true);
  });

  it("contains is case-insensitive and trimmed", () => {
    expect(evaluateRule(rowRule({ op: "contains", value: "Lock" }), "unBLOCKed")).toBe(true);
    expect(evaluateRule(rowRule({ op: "contains", value: "  lock  " }), "unblocked")).toBe(true);
    expect(evaluateRule(rowRule({ op: "contains", value: "zzz" }), "unblocked")).toBe(false);
  });

  it("is/is_not match ANY element of an array (multi-choice) value", () => {
    expect(evaluateRule(rowRule({ op: "is", value: "blocked" }), ["open", "blocked"])).toBe(true);
    expect(evaluateRule(rowRule({ op: "is", value: "blocked" }), ["open", "done"])).toBe(false);
    expect(evaluateRule(rowRule({ op: "is_not", value: "blocked" }), ["open", "blocked"])).toBe(false);
    expect(evaluateRule(rowRule({ op: "is_not", value: "blocked" }), ["open", "done"])).toBe(true);
  });

  it("contains with an empty value never matches", () => {
    expect(evaluateRule(rowRule({ op: "contains", value: "" }), "anything")).toBe(false);
    expect(evaluateRule(rowRule({ op: "contains", value: "   " }), "anything")).toBe(false);
  });

  it("gt/gte/lt/lte parse numeric strings", () => {
    expect(evaluateRule(rowRule({ op: "gt", value: "10" }), "15")).toBe(true);
    expect(evaluateRule(rowRule({ op: "gt", value: "10" }), 15)).toBe(true);
    expect(evaluateRule(rowRule({ op: "gte", value: "10" }), "10")).toBe(true);
    expect(evaluateRule(rowRule({ op: "lt", value: "10" }), "5")).toBe(true);
    expect(evaluateRule(rowRule({ op: "lte", value: "10" }), "10")).toBe(true);
  });

  it("gt/gte/lt/lte return false for non-numbers", () => {
    expect(evaluateRule(rowRule({ op: "gt", value: "10" }), "not-a-number")).toBe(false);
    expect(evaluateRule(rowRule({ op: "gt", value: "not-a-number" }), "15")).toBe(false);
    expect(evaluateRule(rowRule({ op: "lt", value: "10" }), { nested: true })).toBe(false);
  });

  it("is_true/is_false only match real booleans", () => {
    expect(evaluateRule(rowRule({ op: "is_true" }), true)).toBe(true);
    expect(evaluateRule(rowRule({ op: "is_true" }), "true")).toBe(false);
    expect(evaluateRule(rowRule({ op: "is_true" }), 1)).toBe(false);
    expect(evaluateRule(rowRule({ op: "is_false" }), false)).toBe(true);
    expect(evaluateRule(rowRule({ op: "is_false" }), "false")).toBe(false);
    expect(evaluateRule(rowRule({ op: "is_false" }), 0)).toBe(false);
  });

  it("is_empty treats null, empty/whitespace string and [] as empty", () => {
    expect(evaluateRule(rowRule({ op: "is_empty" }), null)).toBe(true);
    expect(evaluateRule(rowRule({ op: "is_empty" }), undefined)).toBe(true);
    expect(evaluateRule(rowRule({ op: "is_empty" }), "")).toBe(true);
    expect(evaluateRule(rowRule({ op: "is_empty" }), "  ")).toBe(true);
    expect(evaluateRule(rowRule({ op: "is_empty" }), [])).toBe(true);
    expect(evaluateRule(rowRule({ op: "is_empty" }), "x")).toBe(false);
    expect(evaluateRule(rowRule({ op: "is_empty" }), [1])).toBe(false);
    expect(evaluateRule(rowRule({ op: "is_empty" }), 0)).toBe(false);
    expect(evaluateRule(rowRule({ op: "not_empty" }), "  ")).toBe(false);
    expect(evaluateRule(rowRule({ op: "not_empty" }), "x")).toBe(true);
  });
});

describe("resolveRowColor", () => {
  const withRule: TableStyle = {
    version: 1,
    rows: { r1: "blue" },
    rules: [rowRule()],
    colorBy: { field: "status", target: "row" },
  };
  const choiceColorFor: ChoiceColorLookup = (field, value) =>
    field === "status" && value === "blocked" ? "amber" : undefined;

  it("manual row color wins over a row rule and colorBy", () => {
    const color = resolveRowColor(withRule, { id: "r1", data: { status: "blocked" } }, choiceColorFor);
    expect(color).toBe("blue");
  });

  it("a row rule wins over colorBy when there is no manual color", () => {
    const color = resolveRowColor(withRule, { id: "r2", data: { status: "blocked" } }, choiceColorFor);
    expect(color).toBe("red");
  });

  it("falls through to colorBy(row) when no manual color or rule matches", () => {
    const style: TableStyle = { version: 1, colorBy: { field: "status", target: "row" } };
    const color = resolveRowColor(style, { id: "r3", data: { status: "blocked" } }, choiceColorFor);
    expect(color).toBe("amber");
  });

  it("colorBy paints boolean true with BOOLEAN_TRUE_COLOR", () => {
    const style: TableStyle = { version: 1, colorBy: { field: "done", target: "row" } };
    const color = resolveRowColor(style, { id: "r1", data: { done: true } }, noColor);
    expect(color).toBe(BOOLEAN_TRUE_COLOR);
  });

  it("colorBy leaves false and empty values untinted", () => {
    const style: TableStyle = { version: 1, colorBy: { field: "done", target: "row" } };
    expect(resolveRowColor(style, { id: "r1", data: { done: false } }, noColor)).toBeNull();
    expect(resolveRowColor(style, { id: "r1", data: { done: null } }, noColor)).toBeNull();
    expect(resolveRowColor(style, { id: "r1", data: { done: "" } }, noColor)).toBeNull();
  });

  it("colorBy takes the FIRST element of a multi-choice value", () => {
    const style: TableStyle = { version: 1, colorBy: { field: "tags", target: "row" } };
    const lookup: ChoiceColorLookup = (field, value) => {
      if (field !== "tags") return undefined;
      if (value === "first") return "teal";
      if (value === "second") return "violet";
      return undefined;
    };
    const color = resolveRowColor(style, { id: "r1", data: { tags: ["first", "second"] } }, lookup);
    expect(color).toBe("teal");
  });
});

describe("resolveCellColor", () => {
  it("manual cell color wins over everything else", () => {
    const style: TableStyle = {
      version: 1,
      cells: { r1: { status: "blue" } },
      rules: [rowRule({ target: "cell" })],
      columns: { status: "green" },
    };
    const color = resolveCellColor(style, { id: "r1", data: { status: "blocked" } }, "status", noColor);
    expect(color).toBe("blue");
  });

  it("a cell rule wins over colorBy(cell) and the column highlight", () => {
    const style: TableStyle = {
      version: 1,
      rules: [rowRule({ target: "cell", field: "status" })],
      colorBy: { field: "status", target: "cell" },
      columns: { status: "green" },
    };
    const choiceColorFor: ChoiceColorLookup = () => "teal";
    const color = resolveCellColor(style, { id: "r1", data: { status: "blocked" } }, "status", choiceColorFor);
    expect(color).toBe("red");
  });

  it("a cell rule for another column does not paint this cell", () => {
    const style: TableStyle = {
      version: 1,
      rules: [rowRule({ target: "cell", field: "other" })],
    };
    const color = resolveCellColor(style, { id: "r1", data: { status: "blocked", other: "blocked" } }, "status", noColor);
    expect(color).toBeNull();
  });

  it("colorBy targeting cells only applies to that column", () => {
    const style: TableStyle = { version: 1, colorBy: { field: "status", target: "cell" } };
    const choiceColorFor: ChoiceColorLookup = (field, value) =>
      field === "status" && value === "blocked" ? "amber" : undefined;
    expect(
      resolveCellColor(style, { id: "r1", data: { status: "blocked" } }, "status", choiceColorFor),
    ).toBe("amber");
    expect(
      resolveCellColor(style, { id: "r1", data: { status: "blocked" } }, "other", choiceColorFor),
    ).toBeNull();
  });

  it("falls through to the manual column highlight last", () => {
    const style: TableStyle = { version: 1, columns: { status: "green" } };
    const color = resolveCellColor(style, { id: "r1", data: { status: "blocked" } }, "status", noColor);
    expect(color).toBe("green");
  });

  it("returns null when nothing applies", () => {
    const style: TableStyle = { version: 1 };
    expect(resolveCellColor(style, { id: "r1", data: {} }, "status", noColor)).toBeNull();
  });
});

describe("applyStylePath", () => {
  it("sets and deletes colorBy", () => {
    const withColorBy = applyStylePath({ version: 1 }, stylePath.colorBy(), {
      field: "status",
      target: "row",
    });
    expect(withColorBy.colorBy).toEqual({ field: "status", target: "row" });

    const cleared = applyStylePath(withColorBy, stylePath.colorBy(), null);
    expect(cleared.colorBy).toBeNull();
  });

  it("sets and deletes rules", () => {
    const rule = { id: "r1", field: "status", op: "is", value: "blocked", color: "red", target: "row" };
    const withRules = applyStylePath({ version: 1 }, stylePath.rules(), [rule]);
    expect(withRules.rules).toEqual([rule]);

    const cleared = applyStylePath(withRules, stylePath.rules(), null);
    expect(cleared.rules).toEqual([]);
  });

  it("sets and deletes a manual row highlight", () => {
    const withRow = applyStylePath({ version: 1 }, stylePath.row("r1"), "blue");
    expect(withRow.rows).toEqual({ r1: "blue" });

    const cleared = applyStylePath(withRow, stylePath.row("r1"), null);
    expect(cleared.rows).toEqual({});
  });

  it("sets and deletes a manual cell highlight", () => {
    const withCell = applyStylePath({ version: 1 }, stylePath.cell("r1", "status"), "amber");
    expect(withCell.cells).toEqual({ r1: { status: "amber" } });

    const cleared = applyStylePath(withCell, stylePath.cell("r1", "status"), null);
    expect(cleared.cells).toEqual({});
  });

  it("deleting the last cell of a row removes the row key entirely", () => {
    const withTwo = applyStylePath(
      applyStylePath({ version: 1 }, stylePath.cell("r1", "status"), "amber"),
      stylePath.cell("r1", "name"),
      "blue",
    );
    expect(withTwo.cells).toEqual({ r1: { status: "amber", name: "blue" } });

    const oneLeft = applyStylePath(withTwo, stylePath.cell("r1", "status"), null);
    expect(oneLeft.cells).toEqual({ r1: { name: "blue" } });

    const noneLeft = applyStylePath(oneLeft, stylePath.cell("r1", "name"), null);
    expect(noneLeft.cells).toEqual({});
    expect(Object.prototype.hasOwnProperty.call(noneLeft.cells, "r1")).toBe(false);
  });

  it("sets and deletes a manual column highlight", () => {
    const withColumn = applyStylePath({ version: 1 }, stylePath.column("status"), "teal");
    expect(withColumn.columns).toEqual({ status: "teal" });

    const cleared = applyStylePath(withColumn, stylePath.column("status"), null);
    expect(cleared.columns).toEqual({});
  });

  it("a non-color value for row/cell/column paths deletes rather than stores", () => {
    const seeded: TableStyle = {
      version: 1,
      rows: { r1: "blue" },
      cells: { r1: { status: "amber" } },
      columns: { status: "green" },
    };
    const afterRow = applyStylePath(seeded, stylePath.row("r1"), "not-a-color");
    expect(afterRow.rows).toEqual({});

    const afterCell = applyStylePath(seeded, stylePath.cell("r1", "status"), "not-a-color");
    expect(afterCell.cells).toEqual({});

    const afterColumn = applyStylePath(seeded, stylePath.column("status"), "not-a-color");
    expect(afterColumn.columns).toEqual({});
  });
});

describe("tableStyleIsEmpty", () => {
  it("is true for EMPTY_TABLE_STYLE", () => {
    expect(tableStyleIsEmpty(EMPTY_TABLE_STYLE)).toBe(true);
  });

  it("is true for a style with an explicit empty rules array and nothing else", () => {
    expect(tableStyleIsEmpty({ version: 1, rules: [] })).toBe(true);
  });

  it("is false once colorBy, rules, rows, cells or columns is set", () => {
    expect(tableStyleIsEmpty({ version: 1, colorBy: { field: "status", target: "row" } })).toBe(false);
    expect(tableStyleIsEmpty({ version: 1, rules: [rowRule()] })).toBe(false);
    expect(tableStyleIsEmpty({ version: 1, rows: { r1: "red" } })).toBe(false);
    expect(tableStyleIsEmpty({ version: 1, cells: { r1: { status: "red" } } })).toBe(false);
    expect(tableStyleIsEmpty({ version: 1, columns: { status: "red" } })).toBe(false);
  });
});

describe("colorForChoice", () => {
  const { colorForChoice, STYLE_COLORS } = require("@ai-matrx/design-system/data-table/table-style");
  it("uses the option's declared color when it has one", () => {
    expect(colorForChoice([{ value: "Done", color: "green" }], "Done")).toBe("green");
  });
  it("assigns a stable palette color to an option with no color, by position", () => {
    const choices = [{ value: "a" }, { value: "b" }, { value: "c" }];
    expect(colorForChoice(choices, "a")).toBe(STYLE_COLORS[0]);
    expect(colorForChoice(choices, "c")).toBe(STYLE_COLORS[2]);
    expect(colorForChoice(choices, "c")).toBe(colorForChoice(choices, "c"));
  });
  it("returns nothing for a value that is not an option, or with no options", () => {
    expect(colorForChoice([{ value: "a" }], "zzz")).toBeUndefined();
    expect(colorForChoice(undefined, "a")).toBeUndefined();
  });
});
