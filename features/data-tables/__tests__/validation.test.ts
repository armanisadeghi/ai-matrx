import {
  describeValidationRules,
  hasValidationRules,
  parseValidationRules,
  serializeValidationRules,
  validateCellValue,
  type ValidationRules,
} from "../validation";

const ok = (rules: ValidationRules, value: unknown, extra = {}) =>
  validateCellValue({ rules, dataType: "string", value, ...extra });

describe("parseValidationRules", () => {
  it("returns an empty rule set for anything it cannot read", () => {
    expect(parseValidationRules(null)).toEqual({});
    expect(parseValidationRules(undefined)).toEqual({});
    expect(parseValidationRules(42)).toEqual({});
    expect(parseValidationRules([1, 2])).toEqual({});
    expect(parseValidationRules("not json")).toEqual({});
    expect(parseValidationRules("")).toEqual({});
  });

  it("reads a JSON STRING, because an import or an agent may have written one", () => {
    expect(parseValidationRules('{"min":1,"max":9}')).toEqual({ min: 1, max: 9 });
  });

  it("keeps only the keys it understands", () => {
    expect(
      parseValidationRules({
        min: 0,
        max: 100,
        minLength: 2,
        maxLength: 5,
        pattern: "^a",
        patternHint: "starts with a",
        allowedValues: ["x", "y"],
        unique: true,
        somethingElse: "ignored",
      }),
    ).toEqual({
      min: 0,
      max: 100,
      minLength: 2,
      maxLength: 5,
      pattern: "^a",
      patternHint: "starts with a",
      allowedValues: ["x", "y"],
      unique: true,
    });
  });

  it("NEVER invents `required` — that is the column's is_required, not a rule", () => {
    expect(parseValidationRules({ required: true })).toEqual({});
  });

  it("coerces numeric strings and drops non-finite numbers", () => {
    expect(parseValidationRules({ min: "3", max: "7.5" })).toEqual({ min: 3, max: 7.5 });
    expect(parseValidationRules({ min: Number.NaN, max: Infinity })).toEqual({});
    expect(parseValidationRules({ min: "abc" })).toEqual({});
  });

  it("refuses negative and fractional lengths, truncating the rest", () => {
    expect(parseValidationRules({ minLength: -1 })).toEqual({});
    expect(parseValidationRules({ maxLength: 5.9 })).toEqual({ maxLength: 5 });
  });

  it("drops a blank pattern, and a hint with no pattern", () => {
    expect(parseValidationRules({ pattern: "   " })).toEqual({});
    expect(parseValidationRules({ patternHint: "###" })).toEqual({});
  });

  it("normalizes allowedValues: strings, trimmed, de-duplicated, order kept", () => {
    expect(
      parseValidationRules({ allowedValues: [" Red ", "red", "Green", "", 7, null, true] }),
    ).toEqual({ allowedValues: ["Red", "Green", "7", "true"] });
    expect(parseValidationRules({ allowedValues: [] })).toEqual({});
  });

  it("treats `unique` as a flag, not a truthy value", () => {
    expect(parseValidationRules({ unique: "yes" })).toEqual({});
    expect(parseValidationRules({ unique: false })).toEqual({});
    expect(parseValidationRules({ unique: true })).toEqual({ unique: true });
  });
});

describe("hasValidationRules / serializeValidationRules", () => {
  it("knows an empty rule set from a real one", () => {
    expect(hasValidationRules(null)).toBe(false);
    expect(hasValidationRules({})).toBe(false);
    expect(hasValidationRules({ required: true })).toBe(false);
    expect(hasValidationRules({ min: 0 })).toBe(true);
  });

  it("stores {} when everything is cleared — the only way to clear the column", () => {
    // `update_user_table_config` COALESCEs validation_rules, so null would keep
    // the old rules forever. An empty object is what actually clears them.
    expect(serializeValidationRules({})).toEqual({});
    expect(serializeValidationRules(null)).toEqual({});
  });

  it("never stores `required`", () => {
    expect(serializeValidationRules({ required: true, min: 1 })).toEqual({ min: 1 });
  });

  it("drops a dangling hint and an empty allowedValues", () => {
    expect(serializeValidationRules({ patternHint: "###", allowedValues: [] })).toEqual({});
    expect(serializeValidationRules({ pattern: "^a$", patternHint: "a" })).toEqual({
      pattern: "^a$",
      patternHint: "a",
    });
  });
});

describe("validateCellValue — the empty-value law", () => {
  it("accepts every empty value regardless of rules", () => {
    const rules: ValidationRules = { min: 5, minLength: 3, pattern: "^x$", unique: true };
    expect(ok(rules, null)).toEqual({ ok: true });
    expect(ok(rules, undefined)).toEqual({ ok: true });
    expect(ok(rules, "")).toEqual({ ok: true });
    expect(ok(rules, "   ")).toEqual({ ok: true });
    expect(ok(rules, [])).toEqual({ ok: true });
  });

  it("accepts anything when the column declares no rules", () => {
    expect(ok({}, "whatever")).toEqual({ ok: true });
    expect(ok({ required: true }, "whatever")).toEqual({ ok: true });
  });
});

describe("validateCellValue — range", () => {
  const rules: ValidationRules = { min: 0, max: 100 };

  it("accepts values inside the range, bounds included", () => {
    expect(validateCellValue({ rules, dataType: "number", value: 0 })).toEqual({ ok: true });
    expect(validateCellValue({ rules, dataType: "number", value: 100 })).toEqual({ ok: true });
    expect(validateCellValue({ rules, dataType: "number", value: 42.5 })).toEqual({ ok: true });
  });

  it("refuses below the floor, in plain English", () => {
    expect(validateCellValue({ rules, dataType: "number", value: -1 })).toEqual({
      ok: false,
      reason: "Must be at least 0",
    });
  });

  it("refuses above the ceiling", () => {
    expect(validateCellValue({ rules, dataType: "number", value: 101 })).toEqual({
      ok: false,
      reason: "Must be at most 100",
    });
  });

  it("reads a numeric STRING, because that is what a half-typed cell holds", () => {
    expect(validateCellValue({ rules, dataType: "number", value: "-5" })).toEqual({
      ok: false,
      reason: "Must be at least 0",
    });
  });

  it("stays silent about a non-numeric value — that is a TYPE problem, already reported", () => {
    expect(validateCellValue({ rules, dataType: "number", value: "pending" })).toEqual({
      ok: true,
    });
  });
});

describe("validateCellValue — length", () => {
  it("refuses a too-short value and says how short it is", () => {
    expect(ok({ minLength: 3 }, "ab")).toEqual({
      ok: false,
      reason: "Must be at least 3 characters (this is 2)",
    });
  });

  it("refuses a too-long value", () => {
    expect(ok({ maxLength: 5 }, "abcdef")).toEqual({
      ok: false,
      reason: "Must be at most 5 characters (this is 6)",
    });
  });

  it("gets the singular right", () => {
    expect(ok({ minLength: 1, maxLength: 1 }, "ab")).toEqual({
      ok: false,
      reason: "Must be at most 1 character (this is 2)",
    });
  });

  it("measures a number by the characters the user sees", () => {
    expect(validateCellValue({ rules: { maxLength: 3 }, dataType: "integer", value: 12345 })).toEqual(
      { ok: false, reason: "Must be at most 3 characters (this is 5)" },
    );
  });
});

describe("validateCellValue — pattern", () => {
  const rules: ValidationRules = { pattern: "^\\d{3}-\\d{4}$", patternHint: "###-####" };

  it("accepts a matching value", () => {
    expect(ok(rules, "555-1234")).toEqual({ ok: true });
  });

  it("refuses with the HINT, which is what a non-technical user can act on", () => {
    expect(ok(rules, "5551234")).toEqual({
      ok: false,
      reason: "Must match the pattern ###-####",
    });
  });

  it("falls back to the regex itself when the author wrote no hint", () => {
    expect(ok({ pattern: "^a+$" }, "b")).toEqual({
      ok: false,
      reason: "Must match the pattern ^a+$",
    });
  });

  it("NEVER throws on an unparseable pattern — the author's defect is not the typist's", () => {
    expect(ok({ pattern: "([unclosed" }, "anything")).toEqual({ ok: true });
  });

  it("does not anchor for the author — an unanchored rule matches anywhere, in JS and in Postgres alike", () => {
    expect(ok({ pattern: "\\d{3}" }, "abc123def")).toEqual({ ok: true });
  });
});

describe("validateCellValue — allowed values", () => {
  const rules: ValidationRules = { allowedValues: ["Red", "Green", "Blue"] };

  it("accepts a listed value, case-insensitively", () => {
    expect(ok(rules, "Red")).toEqual({ ok: true });
    expect(ok(rules, "green")).toEqual({ ok: true });
    expect(ok(rules, "  BLUE  ")).toEqual({ ok: true });
  });

  it("refuses an unlisted value and shows the list", () => {
    expect(ok(rules, "Purple")).toEqual({
      ok: false,
      reason: "Must be one of: Red, Green, Blue",
    });
  });

  it("is SKIPPED on a choice column — its options are its format's job, once", () => {
    expect(
      validateCellValue({
        rules,
        dataType: "string",
        format: { id: "choice", options: { choices: [{ value: "Purple" }] } },
        value: "Purple",
      }),
    ).toEqual({ ok: true });
    expect(
      validateCellValue({
        rules,
        dataType: "array",
        format: { id: "multi_choice" },
        value: ["Purple"],
      }),
    ).toEqual({ ok: true });
  });
});

describe("validateCellValue — unique", () => {
  const rules: ValidationRules = { unique: true };

  it("is SKIPPED rather than guessed when the caller holds no other rows", () => {
    expect(ok(rules, "acme")).toEqual({ ok: true });
    expect(ok(rules, "acme", { existingValues: [] })).toEqual({ ok: true });
  });

  it("refuses a value another row already carries", () => {
    expect(ok(rules, "acme", { existingValues: ["beta", "ACME"] })).toEqual({
      ok: false,
      reason: 'Must be unique — another row already has "acme"',
    });
  });

  it("accepts a value nobody else carries", () => {
    expect(ok(rules, "acme", { existingValues: ["beta", "gamma"] })).toEqual({ ok: true });
  });

  it("does not count other rows' EMPTY cells as a clash", () => {
    expect(ok(rules, "acme", { existingValues: [null, "", "   "] })).toEqual({ ok: true });
  });
});

describe("validateCellValue — reporting order", () => {
  it("reports the FIRST failure a person would check, not all five", () => {
    const rules: ValidationRules = {
      min: 10,
      maxLength: 1,
      pattern: "^zzz$",
      allowedValues: ["q"],
    };
    expect(validateCellValue({ rules, dataType: "number", value: 5 })).toEqual({
      ok: false,
      reason: "Must be at least 10",
    });
  });
});

describe("describeValidationRules", () => {
  it("renders each rule as a phrase a non-technical user reads", () => {
    expect(
      describeValidationRules({
        min: 0,
        max: 100,
        minLength: 2,
        maxLength: 8,
        pattern: "^\\d+$",
        patternHint: "digits only",
        allowedValues: ["a", "b"],
        unique: true,
      }),
    ).toEqual([
      "Between 0 and 100",
      "2–8 characters",
      "Pattern digits only",
      "One of: a, b",
      "Unique across rows",
    ]);
  });

  it("says nothing about a column with no rules", () => {
    expect(describeValidationRules({})).toEqual([]);
  });
});
