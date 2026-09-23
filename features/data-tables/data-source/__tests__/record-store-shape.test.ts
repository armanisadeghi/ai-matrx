/**
 * The dictionary between the record store and the grid (`record-store-shape.ts`).
 *
 * Every Field below is the SHAPE the mover actually wrote on the dev clone
 * (OLD-TABLES-4, Grid Parity Fixture and Rincon Plumbing — Service Calls), and
 * every expectation is what the older store held for the same column. If the
 * inverse mapping drifts — a currency read back as a bare number, a choice as
 * free text, a json cell as a string — the grid draws a different screen over
 * the same data, and these go red.
 */
import type { Field } from "@ai-matrx/records";

import {
  choiceFromOption,
  jsonbText,
  olderColumnFromField,
  olderDataType,
  olderFormat,
  olderRowData,
  olderValidationRules,
  searchRowsLikeTheOlderStore,
  sortRowsLikeTheOlderStore,
  storeValue,
} from "../record-store-shape";

function field(data: Partial<Field> & Record<string, unknown>): Field {
  return {
    id: "00000000-0000-4000-8000-000000000001",
    key: "k",
    label: "K",
    type: "text",
    multi: false,
    config: {},
    rules: [],
    required: false,
    sort: 0,
    format: null,
    ...data,
  } as unknown as Field;
}

describe("a store Field reads back as the column the older grid drew", () => {
  it.each([
    // [store shape, older data_type, older format id]
    [{ type: "range", config: { kind: "number" }, format: "currency", unit: "currency" }, "number", "currency"],
    [{ type: "range", config: { kind: "number" }, format: "percent" }, "number", "percent"],
    [{ type: "range", config: { kind: "number" }, format: "integer" }, "integer", "integer"],
    [{ type: "range", config: { kind: "number" }, format: "rating" }, "integer", "rating"],
    [{ type: "range", config: { kind: "number" }, format: "file_size" }, "integer", "file_size"],
    [{ type: "range", config: { kind: "date" }, format: "date" }, "date", "date"],
    [{ type: "range", config: { kind: "datetime" }, format: "relative_time" }, "datetime", "relative_time"],
    [{ type: "boolean", format: "boolean" }, "boolean", "boolean"],
    [{ type: "text", format: "json" }, "json", "json"],
    [{ type: "text", format: "tags", multi: true }, "array", "tags"],
    [{ type: "text", format: "long_text" }, "string", "long_text"],
    [{ type: "text", format: null }, "string", null],
    [{ type: "list", format: "choice", config: { options_table_id: "x" } }, "string", "choice"],
    [{ type: "list", format: "multi_choice", multi: true, config: { options_table_id: "x" } }, "array", "multi_choice"],
    [{ type: "relation", format: "relation", relation_target: "t", relation_max: 1 }, "string", "relation"],
    [{ type: "formula", format: "formula", expression: "{Amount} * {Qty}" }, "string", "formula"],
  ])("%j → %s / %s", (shape, dataType, formatId) => {
    const f = field(shape as Record<string, unknown>);
    expect(olderDataType(f)).toBe(dataType);
    expect(olderFormat(f, null)?.id ?? null).toBe(formatId);
  });

  it("carries a relation's target and cardinality in the older option names", () => {
    const f = field({ type: "relation", format: "relation", relation_target: "415c", relation_max: 1, on_target_delete: "set_null" } as never);
    expect(olderFormat(f, null)).toEqual({
      id: "relation",
      options: { relation_target: "415c", relation_max: 1, on_delete: "set_null" },
    });
  });

  it("hands a list its option Table's words as choices", () => {
    const choices = [choiceFromOption({ data: { name: "Queued", color: "amber" } })!, choiceFromOption({ data: { name: "Done" } })!];
    expect(choices).toEqual([{ value: "Queued", color: "amber" }, { value: "Done" }]);
    // An option Table the store made itself for a `select` column keys its words `title`.
    expect(choiceFromOption({ data: { title: "Complete" } })).toEqual({ value: "Complete" });
    expect(olderFormat(field({ type: "list", format: "choice" } as never), choices)).toEqual({
      id: "choice",
      options: { choices },
    });
  });

  it("reads a formula's TEXT from formula_text first — what the store keeps beside its expression", () => {
    const f = field({ type: "formula", format: "formula", expression: "{A}+{B}", config: { formula_text: "{A} + {B}" } } as never);
    expect(olderFormat(f, null)).toEqual({ id: "formula", options: { formula: { expression: "{A} + {B}" } } });
  });

  it("takes a display format set on the store whole, options and all", () => {
    const f = field({ type: "text", format: "text", display_format: { id: "currency", options: { currency: "EUR" } } } as never);
    expect(olderFormat(f, null)).toEqual({ id: "currency", options: { currency: "EUR" } });
  });

  it("drops a format word the grid does not draw instead of casting it", () => {
    expect(olderFormat(field({ type: "text", format: "hologram" } as never), null)).toBeNull();
  });

  it("turns the store's rules back into the older rule keys", () => {
    expect(
      olderValidationRules([
        { kind: "pattern", value: "^WO-[0-9]{4}$" },
        { kind: "length", value: 8 },
        { kind: "min", value: 0 },
      ]),
    ).toEqual({ pattern: "^WO-[0-9]{4}$", maxLength: 8, min: 0 });
    expect(olderValidationRules([])).toBeNull();
  });

  it("builds the whole udt_dataset_fields row the grid reads a column from", () => {
    const col = olderColumnFromField(
      field({ id: "378f", key: "work_order", label: "Work order", sort: 0, required: false, rules: [{ kind: "pattern", value: "^WO-" }] } as never),
      "dbc7",
      null,
    );
    expect(col).toMatchObject({
      id: "378f",
      table_id: "dbc7",
      field_name: "work_order",
      display_name: "Work order",
      data_type: "string",
      field_order: 0,
      is_required: false,
      validation_rules: { pattern: "^WO-" },
      metadata: {},
    });
  });
});

describe("a record document reads back as the row the older grid held", () => {
  const columns = [
    { field_name: "payload", data_type: "json" as const },
    { field_name: "status", data_type: "string" as const },
  ];

  it("leaves the store's own keys out and gives a json column its object back", () => {
    expect(
      olderRowData(
        { status: "Queued", payload: '{"index": 119, "owner": "Esme"}', _choices: { status: { id: "x" } } },
        columns,
      ),
    ).toEqual({ status: "Queued", payload: { index: 119, owner: "Esme" } });
  });

  it("keeps json text that is not JSON exactly as stored", () => {
    expect(olderRowData({ payload: "not json" }, columns)).toEqual({ payload: "not json" });
  });

  it("writes a json column's object as the canonical text the store takes, and nothing else changes", () => {
    expect(storeValue({ data_type: "json" }, { a: 1 })).toBe('{"a":1}');
    expect(storeValue({ data_type: "string" }, "Queued")).toBe("Queued");
    expect(storeValue(undefined, 5)).toBe(5);
  });
});

describe("sort and search are the older page door's own rules", () => {
  const rows = [
    { id: "c", data: { n: "10", d: "2026-01-02", t: "$6,000 voucher" } },
    { id: "a", data: { n: "9", d: "2025-12-31", t: "**Stipulations**" } },
    { id: "b", data: { n: null, d: "", t: "apple" } },
    { id: "d", data: { n: "x", d: null, t: "Banana" } },
  ];
  const ids = (r: { id: string }[]) => r.map((x) => x.id).join("");

  it("orders numbers as numbers, text that is not a number as blank, blanks last both ways, id breaking ties", () => {
    expect(ids(sortRowsLikeTheOlderStore(rows, "n", "asc", "number"))).toBe("acbd");
    expect(ids(sortRowsLikeTheOlderStore(rows, "n", "desc", "number"))).toBe("cabd");
  });

  it("orders dates as instants", () => {
    expect(ids(sortRowsLikeTheOlderStore(rows, "d", "asc", "date"))).toBe("acbd");
  });

  it("orders text the way the database collation does — words, not code points", () => {
    // en_US: punctuation does not lead, case does not split.
    expect(ids(sortRowsLikeTheOlderStore(rows, "t", "asc", "string"))).toBe("acbd");
  });

  it("writes jsonb::text — keys by length then bytes, ', ' and ': '", () => {
    expect(jsonbText({ work_order: "WO-1", stage: "On site", a: [1, true, null] })).toBe(
      '{"a": [1, true, null], "stage": "On site", "work_order": "WO-1"}',
    );
  });

  it("searches the row's jsonb text case-insensitively, as ILIKE did", () => {
    expect(ids(searchRowsLikeTheOlderStore(rows, "BANANA"))).toBe("d");
    expect(ids(searchRowsLikeTheOlderStore(rows, '"t": "apple"'))).toBe("b");
    expect(ids(searchRowsLikeTheOlderStore(rows, ""))).toBe("cabd");
  });
});
