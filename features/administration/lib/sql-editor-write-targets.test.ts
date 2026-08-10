import {
  SQL_QUERY_WRITE_MAX_CHARS,
  validateSqlQueryWrite,
} from "./sql-editor-write-targets";

describe("validateSqlQueryWrite", () => {
  it("returns the SQL unchanged when it is already clean", () => {
    const sql = "SELECT id, email FROM auth.users ORDER BY created_at DESC";
    expect(validateSqlQueryWrite(sql)).toBe(sql);
  });

  it("trims leading/trailing whitespace (documented in the target description)", () => {
    expect(validateSqlQueryWrite("\n  SELECT 1  \n")).toBe("SELECT 1");
  });

  it("preserves interior formatting of a multi-line query", () => {
    const sql = "SELECT a,\n       b\nFROM t\nWHERE a > 1";
    expect(validateSqlQueryWrite(sql)).toBe(sql);
  });

  it("stages DDL/DML text — inert until the admin presses Execute", () => {
    const sql = "ALTER TABLE public.notes ADD COLUMN archived boolean";
    expect(validateSqlQueryWrite(sql)).toBe(sql);
  });

  it.each([
    ["a number", 42],
    ["null", null],
    ["undefined", undefined],
    ["an object", { query: "SELECT 1" }],
    ["an array", ["SELECT 1"]],
  ])("throws on %s rather than coercing", (_label, value) => {
    expect(() => validateSqlQueryWrite(value)).toThrow(
      /sql_query must be a string/,
    );
  });

  it.each([
    ["an opening fence", "```sql\nSELECT 1\n```"],
    ["a bare fence", "```\nSELECT 1\n```"],
    ["a trailing fence only", "SELECT 1\n```"],
  ])("throws on markdown fences (%s) instead of stripping them", (_l, value) => {
    expect(() => validateSqlQueryWrite(value)).toThrow(/not a markdown code block/);
  });

  it.each([
    ["an empty string", ""],
    ["whitespace only", "   \n\t "],
  ])("throws on %s — clearing the editor stays the admin's action", (_l, v) => {
    expect(() => validateSqlQueryWrite(v)).toThrow(/must not be empty/);
  });

  it("throws when the query exceeds the staged-query limit", () => {
    const tooLong = "a".repeat(SQL_QUERY_WRITE_MAX_CHARS + 1);
    expect(() => validateSqlQueryWrite(tooLong)).toThrow(
      new RegExp(`over the ${SQL_QUERY_WRITE_MAX_CHARS}-character limit`),
    );
  });

  it("accepts a query exactly at the limit", () => {
    const atLimit = "b".repeat(SQL_QUERY_WRITE_MAX_CHARS);
    expect(validateSqlQueryWrite(atLimit)).toBe(atLimit);
  });
});
