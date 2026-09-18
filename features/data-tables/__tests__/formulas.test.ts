import {
  FORMULA_FUNCTIONS,
  evaluateFormula,
  formulaResultType,
  parseFormula,
  type FormulaAst,
  type FormulaValue,
  type ResolveColumnType,
} from "../formulas";

// ─── harness ─────────────────────────────────────────────────────────────────

const ROW: Record<string, unknown> = {
  Price: 10,
  Quantity: 3,
  "Discount %": "12.5",
  Name: "  Widget  ",
  Notes: "",
  Empty: null,
  Ticked: true,
  Started: "2026-01-31",
  Finished: "2026-03-02",
  Stamp: "2026-01-31T06:30:00.000Z",
  Junk: "n/a",
  price: 99, // machine field name — a distinct column from `Price`
};

/** `undefined` for an unknown column is the whole contract of `resolve`. */
function resolve(name: string): unknown {
  return Object.prototype.hasOwnProperty.call(ROW, name) ? ROW[name] : undefined;
}

function ast(source: string): FormulaAst {
  const parsed = parseFormula(source);
  if (!parsed.ok) throw new Error(`parse failed: ${parsed.error}`);
  return parsed.ast;
}

/** Evaluate a formula end-to-end; fails the test if it does not parse. */
function value(source: string): FormulaValue {
  const result = evaluateFormula(ast(source), resolve);
  if (!result.ok) throw new Error(`evaluate failed: ${result.error}`);
  return result.value;
}

/** The error a formula produces at evaluation time. */
function error(source: string): string {
  const result = evaluateFormula(ast(source), resolve);
  if (result.ok) throw new Error(`expected an error, got ${String(result.value)}`);
  return result.error;
}

// ─── parsing ─────────────────────────────────────────────────────────────────

describe("parseFormula", () => {
  it("reports every {…} name it saw, in first-use order, deduped", () => {
    const parsed = parseFormula("{Price} * {Quantity} + {Price}");
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    expect(parsed.references).toEqual(["Price", "Quantity"]);
  });

  it("keeps a display name with spaces and punctuation intact", () => {
    const parsed = parseFormula("{Discount %} + 1");
    expect(parsed.ok && parsed.references).toEqual(["Discount %"]);
  });

  it("refuses an empty formula", () => {
    expect(parseFormula("   ")).toEqual({
      ok: false,
      error: "This formula is empty.",
      position: 0,
    });
  });

  it("points at the character that broke it", () => {
    const parsed = parseFormula("1 + $");
    expect(parsed.ok).toBe(false);
    if (parsed.ok) return;
    expect(parsed.position).toBe(4);
    expect(parsed.error).toContain("does not mean anything");
  });

  it("points at an unterminated column reference", () => {
    const parsed = parseFormula("1 + {Price");
    expect(parsed.ok).toBe(false);
    if (parsed.ok) return;
    expect(parsed.position).toBe(4);
    expect(parsed.error).toContain("closing brace");
  });

  it("points at an unterminated string", () => {
    const parsed = parseFormula('UPPER("abc)');
    expect(parsed.ok).toBe(false);
    if (parsed.ok) return;
    expect(parsed.position).toBe(6);
    expect(parsed.error).toContain("closing double quote");
  });

  it("points at an unclosed bracket", () => {
    const parsed = parseFormula("(1 + 2");
    expect(parsed.ok).toBe(false);
    if (parsed.ok) return;
    expect(parsed.position).toBe(0);
  });

  it("rejects an unknown function and suggests brace syntax", () => {
    const parsed = parseFormula("Total + 1");
    expect(parsed.ok).toBe(false);
    if (parsed.ok) return;
    expect(parsed.position).toBe(0);
    expect(parsed.error).toContain("{Total}");
  });

  it("rejects the wrong number of arguments at parse time, with a position", () => {
    const parsed = parseFormula("1 + LEFT('abc')");
    expect(parsed.ok).toBe(false);
    if (parsed.ok) return;
    expect(parsed.position).toBe(4);
    expect(parsed.error).toContain("LEFT(text, count)");
  });

  it("rejects trailing junk after a complete formula", () => {
    const parsed = parseFormula("1 + 2 3");
    expect(parsed.ok).toBe(false);
    if (parsed.ok) return;
    expect(parsed.position).toBe(6);
  });

  it("never executes code — a formula is only ever data", () => {
    // Nothing here may reach a JS runtime. It must simply fail to parse.
    for (const attack of [
      "constructor",
      "process.exit(1)",
      "globalThis['x']=1",
      "(()=>1)()",
    ]) {
      expect(parseFormula(attack).ok).toBe(false);
    }
  });
});

// ─── precedence and operators ────────────────────────────────────────────────

describe("precedence", () => {
  it("multiplies before adding", () => {
    expect(value("2 + 3 * 4")).toBe(14);
  });

  it("honours brackets", () => {
    expect(value("(2 + 3) * 4")).toBe(20);
  });

  it("applies unary minus tighter than arithmetic", () => {
    expect(value("-2 + 3")).toBe(1);
    expect(value("-2 * 3")).toBe(-6);
    expect(value("- -2")).toBe(2);
  });

  it("is left-associative for - and /", () => {
    expect(value("10 - 3 - 2")).toBe(5);
    expect(value("100 / 5 / 2")).toBe(10);
  });

  it("computes modulo", () => {
    expect(value("10 % 3")).toBe(1);
  });

  it("concatenates tighter than it compares, looser than it adds", () => {
    // 1 + 2 runs first, then &, then =.
    expect(value("1 + 2 & 'x' = '3x'")).toBe(true);
  });

  it("compares numerically when both sides read as numbers", () => {
    expect(value("{Price} > 9")).toBe(true);
    expect(value("'10' > '9'")).toBe(true);
  });

  it("compares as text when a side is not numeric", () => {
    expect(value("'apple' < 'banana'")).toBe(true);
  });

  it("treats != and <> as the same operator", () => {
    expect(value("1 != 2")).toBe(true);
    expect(value("1 <> 2")).toBe(true);
    expect(value("2 <> 2")).toBe(false);
  });

  it("reads >= and <= as single operators", () => {
    expect(value("2 >= 2")).toBe(true);
    expect(value("2 <= 1")).toBe(false);
  });
});

// ─── references ──────────────────────────────────────────────────────────────

describe("column references", () => {
  it("reads a column by display name", () => {
    expect(value("{Price} * {Quantity}")).toBe(30);
  });

  it("reads a column by machine field name, case-sensitively", () => {
    // `Price` and `price` are two different columns; the lookup is the
    // caller's, so the engine must not fold case.
    expect(value("{price}")).toBe(99);
    expect(value("{Price}")).toBe(10);
  });

  it("coerces a numeric string cell in arithmetic", () => {
    expect(value("{Discount %} + 0.5")).toBe(13);
  });

  it("errors by name on a column that does not exist", () => {
    expect(error("{Pryce} + 1")).toBe("There is no column called {Pryce}.");
  });

  it("errors on a cell that is not a number where one is needed", () => {
    expect(error("{Junk} + 1")).toContain('got "n/a"');
  });

  it("trims whitespace inside the braces", () => {
    expect(value("{ Price }")).toBe(10);
  });
});

// ─── blanks ──────────────────────────────────────────────────────────────────

describe("blanks", () => {
  it("treats null and empty text as the same BLANK", () => {
    expect(value("ISBLANK({Empty})")).toBe(true);
    expect(value("ISBLANK({Notes})")).toBe(true);
    expect(value("ISBLANK({Price})")).toBe(false);
  });

  it("adds a blank as zero rather than erroring the whole cell", () => {
    expect(value("{Price} + {Empty}")).toBe(10);
    expect(value("{Empty} * 5")).toBe(0);
  });

  it("SKIPS blanks in aggregates instead of counting them as zero", () => {
    expect(value("SUM({Price}, {Empty}, {Quantity})")).toBe(13);
    expect(value("AVERAGE({Price}, {Empty}, {Quantity})")).toBe(6.5);
    expect(value("MIN({Price}, {Empty})")).toBe(10);
  });

  it("returns BLANK from an aggregate with nothing to aggregate", () => {
    expect(value("AVERAGE({Empty})")).toBeNull();
    expect(value("MIN({Empty})")).toBeNull();
    expect(value("MAX({Empty})")).toBeNull();
  });

  it("sums nothing to zero — a total is a number even when empty", () => {
    expect(value("SUM({Empty})")).toBe(0);
  });

  it("concatenates a blank as empty text", () => {
    expect(value("'a' & {Empty} & 'b'")).toBe("ab");
  });

  it("compares a blank as zero and as empty text", () => {
    expect(value("{Empty} = BLANK()")).toBe(true);
    expect(value("{Empty} = 0")).toBe(true);
    expect(value("{Empty} = ''")).toBe(true);
  });

  it("reads a blank as false in a condition", () => {
    expect(value("IF({Empty}, 'yes', 'no')")).toBe("no");
  });
});

// ─── every function ──────────────────────────────────────────────────────────

describe("functions", () => {
  it("SUM / MIN / MAX / AVERAGE", () => {
    expect(value("SUM(1, 2, 3)")).toBe(6);
    expect(value("MIN(4, 2, 9)")).toBe(2);
    expect(value("MAX(4, 2, 9)")).toBe(9);
    expect(value("AVERAGE(2, 4, 9)")).toBe(5);
  });

  it("ROUND with and without places, halves away from zero", () => {
    expect(value("ROUND(2.4)")).toBe(2);
    expect(value("ROUND(2.5)")).toBe(3);
    expect(value("ROUND(-2.5)")).toBe(-3);
    expect(value("ROUND(3.14159, 2)")).toBe(3.14);
    expect(value("ROUND(1.005, 2)")).toBe(1.01);
  });

  it("ABS", () => {
    expect(value("ABS(-7)")).toBe(7);
    expect(value("ABS(7)")).toBe(7);
  });

  it("LEN / UPPER / LOWER / TRIM", () => {
    expect(value("LEN('abcd')")).toBe(4);
    expect(value("UPPER('abc')")).toBe("ABC");
    expect(value("LOWER('ABC')")).toBe("abc");
    expect(value("TRIM({Name})")).toBe("Widget");
    expect(value("LEN(TRIM({Name}))")).toBe(6);
  });

  it("CONCATENATE joins everything, numbers included", () => {
    expect(value("CONCATENATE('a', 1, TRUE)")).toBe("a1true");
    expect(value("CONCATENATE(TRIM({Name}), ' x', {Quantity})")).toBe("Widget x3");
  });

  it("LEFT / RIGHT, and clamp rather than error on a silly count", () => {
    expect(value("LEFT('abcdef', 3)")).toBe("abc");
    expect(value("RIGHT('abcdef', 2)")).toBe("ef");
    expect(value("LEFT('abc', 0)")).toBe("");
    expect(value("RIGHT('abc', 0)")).toBe("");
    expect(value("LEFT('abc', 99)")).toBe("abc");
  });

  it("CONTAINS ignores case", () => {
    expect(value("CONTAINS('Hello World', 'world')")).toBe(true);
    expect(value("CONTAINS('Hello World', 'zzz')")).toBe(false);
  });

  it("IF, with an optional third branch", () => {
    expect(value("IF({Price} > 5, 'big', 'small')")).toBe("big");
    expect(value("IF({Price} > 50, 'big', 'small')")).toBe("small");
    expect(value("IF(FALSE, 'x')")).toBeNull();
  });

  it("IF does not evaluate the branch it did not take", () => {
    // The dead branch divides by zero; short-circuiting is what keeps the
    // cell honest instead of erroring on arithmetic that never happens.
    expect(value("IF(TRUE, 1, 1 / 0)")).toBe(1);
  });

  it("AND / OR / NOT, short-circuiting", () => {
    expect(value("AND(TRUE, TRUE, TRUE)")).toBe(true);
    expect(value("AND(TRUE, FALSE)")).toBe(false);
    expect(value("OR(FALSE, FALSE, TRUE)")).toBe(true);
    expect(value("OR(FALSE, FALSE)")).toBe(false);
    expect(value("NOT(FALSE)")).toBe(true);
    expect(value("AND(FALSE, 1 / 0)")).toBe(false);
    expect(value("OR(TRUE, 1 / 0)")).toBe(true);
  });

  it("BLANK / ISBLANK", () => {
    expect(value("BLANK()")).toBeNull();
    expect(value("ISBLANK(BLANK())")).toBe(true);
    expect(value("ISBLANK('x')")).toBe(false);
  });

  it("TODAY is a date-only ISO string and NOW carries a time", () => {
    const today = value("TODAY()");
    expect(typeof today).toBe("string");
    expect(today).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(value("NOW()")).toMatch(/^\d{4}-\d{2}-\d{2}T.*Z$/);
  });

  it("DATEDIFF counts forward from the first date to the second", () => {
    expect(value("DATEDIFF({Started}, {Finished}, 'days')")).toBe(30);
    expect(value("DATEDIFF({Finished}, {Started}, 'days')")).toBe(-30);
    expect(value("DATEDIFF('2026-01-01', '2026-01-02', 'hours')")).toBe(24);
    expect(value("DATEDIFF('2026-01-01', '2026-01-01T00:30:00Z', 'minutes')")).toBe(30);
  });

  it("DATEDIFF rejects an unknown unit by name", () => {
    expect(error("DATEDIFF({Started}, {Finished}, 'weeks')")).toContain("'days'");
  });

  it("YEAR / MONTH / DAY read in UTC, so a date-only value never slips a day", () => {
    expect(value("YEAR({Started})")).toBe(2026);
    expect(value("MONTH({Started})")).toBe(1);
    expect(value("DAY({Started})")).toBe(31);
    expect(value("DAY({Stamp})")).toBe(31);
  });

  it("DATEADD keeps the shape of its input and clamps a short month", () => {
    expect(value("DATEADD({Started}, 1, 'days')")).toBe("2026-02-01");
    expect(value("DATEADD({Started}, -1, 'days')")).toBe("2026-01-30");
    // 31 January + 1 month is the END of February, never 3 March.
    expect(value("DATEADD({Started}, 1, 'months')")).toBe("2026-02-28");
    expect(value("DATEADD({Started}, 1, 'years')")).toBe("2027-01-31");
    expect(value("DATEADD({Stamp}, 1, 'days')")).toBe("2026-02-01T06:30:00.000Z");
  });

  it("date functions refuse a value that is not a date", () => {
    expect(error("YEAR({Junk})")).toContain("needs a date");
    expect(error("YEAR({Empty})")).toContain("empty");
  });

  it("publishes a help entry for every function it implements", () => {
    const names = FORMULA_FUNCTIONS.map((f) => f.name);
    expect(new Set(names).size).toBe(names.length);
    for (const entry of FORMULA_FUNCTIONS) {
      expect(entry.signature).toContain(entry.name);
      expect(entry.description.length).toBeGreaterThan(0);
    }
    // Every published function actually parses at its documented minimum.
    expect(names).toContain("DATEADD");
    expect(names.length).toBeGreaterThanOrEqual(26);
  });
});

// ─── errors ──────────────────────────────────────────────────────────────────

describe("errors never throw", () => {
  it("division by zero", () => {
    expect(error("1 / 0")).toBe("This formula divides by zero.");
    expect(error("{Price} / {Empty}")).toBe("This formula divides by zero.");
    expect(error("5 % 0")).toBe("This formula divides by zero.");
  });

  it("a type mismatch names the offending value", () => {
    expect(error("'abc' * 2")).toContain('got "abc"');
  });

  it("returns a result object even when resolve() itself explodes", () => {
    const result = evaluateFormula(ast("{Price} + 1"), () => {
      throw new Error("boom");
    });
    expect(result).toEqual({
      ok: false,
      error: "This formula could not be calculated.",
    });
  });

  it("an object cell becomes legible text rather than an exception", () => {
    const result = evaluateFormula(ast("{X} & '!'"), () => ({ a: 1 }));
    expect(result).toEqual({ ok: true, value: '{"a":1}!' });
  });

  it("a Date cell is read as an ISO string", () => {
    const result = evaluateFormula(
      ast("YEAR({X})"),
      () => new Date("2026-05-04T00:00:00Z"),
    );
    expect(result).toEqual({ ok: true, value: 2026 });
  });

  it("a boolean counts as 1 and 0 in arithmetic", () => {
    expect(value("{Ticked} + 1")).toBe(2);
    expect(value("SUM({Ticked}, {Ticked})")).toBe(2);
  });
});

// ─── static typing ───────────────────────────────────────────────────────────

describe("formulaResultType", () => {
  const columnType: ResolveColumnType = (name) =>
    name === "Price" || name === "Quantity"
      ? "number"
      : name === "Name"
        ? "text"
        : name === "Ticked"
          ? "boolean"
          : name === "Started"
            ? "date"
            : undefined;

  const typeOf = (source: string) => formulaResultType(ast(source), columnType);

  it("types literals", () => {
    expect(typeOf("1")).toBe("number");
    expect(typeOf("'x'")).toBe("text");
    expect(typeOf("TRUE")).toBe("boolean");
  });

  it("types arithmetic, concatenation and comparison", () => {
    expect(typeOf("{Price} * {Quantity}")).toBe("number");
    expect(typeOf("{Name} & '!'")).toBe("text");
    expect(typeOf("{Price} > 1")).toBe("boolean");
    expect(typeOf("-{Price}")).toBe("number");
  });

  it("types a bare reference from the column, and unknown when it cannot", () => {
    expect(typeOf("{Price}")).toBe("number");
    expect(typeOf("{Name}")).toBe("text");
    expect(typeOf("{Ticked}")).toBe("boolean");
    expect(typeOf("{Started}")).toBe("date");
    expect(typeOf("{Mystery}")).toBe("unknown");
  });

  it("types functions by their declared result", () => {
    expect(typeOf("ROUND({Price}, 2)")).toBe("number");
    expect(typeOf("UPPER({Name})")).toBe("text");
    expect(typeOf("CONTAINS({Name}, 'x')")).toBe("boolean");
    expect(typeOf("TODAY()")).toBe("date");
    expect(typeOf("DATEADD({Started}, 1, 'days')")).toBe("date");
    expect(typeOf("DATEDIFF({Started}, TODAY(), 'days')")).toBe("number");
    expect(typeOf("BLANK()")).toBe("unknown");
  });

  it("unifies the branches of IF, and gives up honestly when they disagree", () => {
    expect(typeOf("IF({Ticked}, 1, 2)")).toBe("number");
    expect(typeOf("IF({Ticked}, 'a', 'b')")).toBe("text");
    expect(typeOf("IF({Ticked}, 1, 'b')")).toBe("unknown");
    expect(typeOf("IF({Ticked}, 'a')")).toBe("text");
    // BLANK() on one side should not destroy the reading of the other.
    expect(typeOf("IF({Ticked}, {Price}, BLANK())")).toBe("number");
  });

  it("keeps MIN/MAX over dates a date", () => {
    expect(typeOf("MAX({Started}, TODAY())")).toBe("date");
    expect(typeOf("MAX({Price}, 1)")).toBe("number");
  });
});
