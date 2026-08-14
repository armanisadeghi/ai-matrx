/**
 * Guards for THE FALLBACK LAW and the format registry.
 *
 * The load-bearing property is the fallback: a value that does not fit its
 * declared format must render as the STORED value with `ok: false`, never as
 * an empty cell and never as a thrown error. Every "the column went blank"
 * report is a break of one of these assertions.
 */
import {
  formatFieldValue,
  parseFieldInput,
  resolveFieldFormat,
} from "../format";
import {
  FIELD_FORMAT_LIST,
  defaultFormatForBase,
  formatsForBase,
} from "../registry";
import type { FieldFormatId, FieldFormatOptions } from "../types";

const f = (
  value: unknown,
  id: string,
  options: FieldFormatOptions = {},
  dataType?: string,
) => formatFieldValue(value, { id: id as FieldFormatId, options }, dataType);

describe("formatFieldValue — display", () => {
  it("formats money, percent, duration, size and lists", () => {
    expect(f(1234.5, "currency").text).toBe("$1,234.50");
    expect(f(1234.5, "currency", { currency: "EUR" }).text).toBe("€1,234.50");
    expect(f(45, "percent").text).toBe("45%");
    expect(f(0.45, "percent", { percentScale: "fraction" }).text).toBe("45%");
    expect(f(45.678, "percent", { precision: 1 }).text).toBe("45.7%");
    expect(f(3725, "duration").text).toBe("1:02:05");
    expect(f(90, "duration", { durationUnit: "minutes" }).text).toBe("1:30:00");
    expect(f(1536, "file_size").text).toBe("1.5 KB");
    expect(f(1234567, "integer").text).toBe("1,234,567");
    expect(f(72, "number", { suffix: " kg" }).text).toBe("72 kg");
    expect(f(["a", "b"], "tags").text).toBe("a, b");
    expect(f("#3B82F6", "color").text).toBe("#3b82f6");
    expect(f(true, "boolean").text).toBe("Yes");
  });
});

describe("THE FALLBACK LAW", () => {
  it("shows the stored value, flagged, when it does not fit the format", () => {
    const bad = f("n/a", "currency", {}, "number");
    expect(bad.ok).toBe(false);
    expect(bad.text).toBe("n/a"); // never blank
    expect(typeof bad.reason).toBe("string");

    expect(f("not-an-email", "email", {}, "string")).toMatchObject({
      ok: false,
      text: "not-an-email",
    });
    expect(f(99, "rating", {}, "integer")).toMatchObject({
      ok: false,
      text: "99",
    });
    expect(f("hello", "date", {}, "date")).toMatchObject({
      ok: false,
      text: "hello",
    });
  });

  it("treats empty as empty, not as a mismatch", () => {
    expect(f(null, "currency")).toMatchObject({ empty: true, ok: true });
    expect(f("", "currency").empty).toBe(true);
  });

  it("degrades an unknown format id to the storage type instead of failing", () => {
    const r = formatFieldValue(5, { id: "no_such_format" as FieldFormatId }, "number");
    expect(r).toMatchObject({ ok: true, text: "5" });
  });

  it("still shows the money when the currency code is invalid", () => {
    expect(f(10, "currency", { currency: "ZZZ" }).text).toContain("10");
  });
});

describe("parseFieldInput", () => {
  it("accepts what the formatted value looks like", () => {
    expect(parseFieldInput("$1,234.50", { id: "currency" })).toBe(1234.5);
    expect(parseFieldInput("45%", { id: "percent" })).toBe(45);
    expect(parseFieldInput("a, b", { id: "tags" })).toEqual(["a", "b"]);
    expect(parseFieldInput("", { id: "currency" })).toBeNull();
  });
});

describe("resolveFieldFormat + registry", () => {
  it("falls back to the storage type's identity format", () => {
    expect(resolveFieldFormat("number", {}).id).toBe("number");
    expect(resolveFieldFormat("number", { format: { id: "currency" } }).id).toBe(
      "currency",
    );
    // A format id that no longer exists must not break the column.
    expect(resolveFieldFormat("number", { format: { id: "bogus" } }).id).toBe(
      "number",
    );
  });

  it("offers every storage type at least its own default format", () => {
    for (const base of [
      "string",
      "number",
      "integer",
      "boolean",
      "date",
      "datetime",
      "json",
      "array",
    ]) {
      const def = defaultFormatForBase(base);
      expect(formatsForBase(base).some((d) => d.id === def)).toBe(true);
    }
  });

  it("has no duplicate ids", () => {
    const ids = FIELD_FORMAT_LIST.map((d) => d.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});
