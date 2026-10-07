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
  gridColumnFromField,
  gridDataType,
  gridFormat,
  gridRowData,
  gridRowOrdering,
  withHandOrder,
  gridValidationRules,
  storeDefaultSort,
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
    expect(gridDataType(f)).toBe(dataType);
    expect(gridFormat(f, null)?.id ?? null).toBe(formatId);
  });

  it("carries a relation's target and cardinality in the older option names", () => {
    const f = field({ type: "relation", format: "relation", relation_target: "415c", relation_max: 1, on_target_delete: "set_null" } as never);
    expect(gridFormat(f, null)).toEqual({
      id: "relation",
      options: { relation_target: "415c", relation_max: 1, on_delete: "set_null" },
    });
  });

  it("hands a list its option Table's words as choices", () => {
    const choices = [choiceFromOption({ data: { name: "Queued", color: "amber" } })!, choiceFromOption({ data: { name: "Done" } })!];
    expect(choices).toEqual([{ value: "Queued", color: "amber" }, { value: "Done" }]);
    // An option Table the store made itself for a `select` column keys its words `title`.
    expect(choiceFromOption({ data: { title: "Complete" } })).toEqual({ value: "Complete" });
    expect(gridFormat(field({ type: "list", format: "choice" } as never), choices)).toEqual({
      id: "choice",
      // allow-other is said out loud: the store's default is off, the grid's is on.
      options: { choices, allowOther: false },
    });
  });

  it("reads a formula's TEXT from formula_text first — what the store keeps beside its expression", () => {
    const f = field({ type: "formula", format: "formula", expression: "{A}+{B}", config: { formula_text: "{A} + {B}" } } as never);
    expect(gridFormat(f, null)).toEqual({ id: "formula", options: { formula: { expression: "{A} + {B}" } } });
  });

  it("takes a display format set on the store whole, options and all", () => {
    const f = field({ type: "text", format: "text", display_format: { id: "currency", options: { currency: "EUR" } } } as never);
    expect(gridFormat(f, null)).toEqual({ id: "currency", options: { currency: "EUR" } });
  });

  it("drops a format word the grid does not draw instead of casting it", () => {
    expect(gridFormat(field({ type: "text", format: "hologram" } as never), null)).toBeNull();
  });

  it("turns the store's rules back into the older rule keys", () => {
    expect(
      gridValidationRules([
        { kind: "pattern", value: "^WO-[0-9]{4}$" },
        { kind: "length", value: 8 },
        { kind: "min", value: 0 },
      ]),
    ).toEqual({ pattern: "^WO-[0-9]{4}$", maxLength: 8, min: 0 });
    expect(gridValidationRules([])).toBeNull();
  });

  it("builds the whole column row the grid reads a column from", () => {
    const col = gridColumnFromField(
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
      gridRowData(
        { status: "Queued", payload: '{"index": 119, "owner": "Esme"}', _choices: { status: { id: "x" } } },
        columns,
      ),
    ).toEqual({ status: "Queued", payload: { index: 119, owner: "Esme" } });
  });

  it("keeps json text that is not JSON exactly as stored", () => {
    expect(gridRowData({ payload: "not json" }, columns)).toEqual({ payload: "not json" });
  });

  it("writes a json column's object as the canonical text the store takes, and nothing else changes", () => {
    expect(storeValue({ data_type: "json" }, { a: 1 })).toBe('{"a":1}');
    expect(storeValue({ data_type: "string" }, "Queued")).toBe("Queued");
    expect(storeValue(undefined, 5)).toBe(5);
    // Text that is a number, into a number column: what a pasted chat table or CSV carries.
    expect(storeValue({ data_type: "integer" }, " 3 ")).toBe(3);
    expect(storeValue({ data_type: "number" }, "18.25")).toBe(18.25);
    expect(storeValue({ data_type: "number" }, "about 3")).toBe("about 3"); // the store refuses it, in words
    expect(storeValue({ data_type: "boolean" }, "TRUE")).toBe(true);
    expect(storeValue({ data_type: "string" }, "3")).toBe("3");
    // A blank pasted into a number or date column is an EMPTY cell (lane DATA-V2-BASICS): a sheet row
    // with nothing under "Discount Percent" was refused whole — "takes a number, and it was given a string".
    expect(storeValue({ data_type: "number" }, "")).toBeNull();
    expect(storeValue({ data_type: "integer" }, "   ")).toBeNull();
    expect(storeValue({ data_type: "date" }, "")).toBeNull();
    expect(storeValue({ data_type: "datetime" }, " ")).toBeNull();
    expect(storeValue({ data_type: "string" }, "")).toBe("");
  });
});

describe("jsonb text", () => {
  it("writes jsonb::text — keys by length then bytes, ', ' and ': '", () => {
    expect(jsonbText({ work_order: "WO-1", stage: "On site", a: [1, true, null] })).toBe(
      '{"a": [1, true, null], "stage": "On site", "work_order": "WO-1"}',
    );
  });
});

describe("a table's saved default sort is read and written in the store's own words", () => {
  // The value the store holds for the moved "Coding Accounts" table (clone, TABLE-PARITY S2):
  // default_sort: [{field: "reset_date", direction: "asc"}].
  const stored = [{ field: "reset_date", direction: "asc" }];
  const fields = [{ key: "account" }, { key: "reset_date" }];

  it("reads the stored {field} sort as the grid's default sort", () => {
    expect(gridRowOrdering(stored, fields)).toEqual({ default_sort: { field: "reset_date", direction: "asc" } });
  });

  it("writes Save as default as {field}, which reads back as the same sort", () => {
    const written = storeDefaultSort("reset_date", "desc");
    expect(written).toEqual([{ field: "reset_date", direction: "desc" }]);
    expect(gridRowOrdering(written, fields)).toEqual({ default_sort: { field: "reset_date", direction: "desc" } });
  });

  it("still reads a {key} entry this seam wrote before the fix", () => {
    expect(gridRowOrdering([{ key: "account", direction: "desc" }], fields)).toEqual({
      default_sort: { field: "account", direction: "desc" },
    });
  });

  it("answers no sort for a column the table no longer has, or no saved sort", () => {
    expect(gridRowOrdering([{ field: "gone", direction: "asc" }], fields)).toBeNull();
    expect(gridRowOrdering([], fields)).toBeNull();
    expect(storeDefaultSort(undefined, undefined)).toEqual([]);
  });
});

describe("a table's hand-set order (G13) reaches the grid as the older row ordering", () => {
  // Coding Accounts on production: row_order "manual" and a Reset Date default sort. Three
  // accounts dragged into an order on its hand-ordered view.
  const sort = { default_sort: { field: "reset_date", direction: "asc" } };
  const order = ["49154b37-d134-4e1e-992f-7e95ca4b128e", "fbfbea36-cb6e-4eb1-b787-abeca7f0a7e6", "a68a644c-abc7-49be-9d46-621206e25663"];

  it("hands the grid the order INSTEAD of the saved sort when the store keeps it (ORDER-FIX: the order is the sort)", () => {
    expect(withHandOrder(sort, { status: "served", enabled: true, order })).toEqual({ enabled: true, order });
    expect(withHandOrder(null, { status: "served", enabled: true, order: [] })).toEqual({ enabled: true, order: [] });
  });

  it("hands only the sort when the table is sorted, or the store cannot keep an order", () => {
    expect(withHandOrder(sort, { status: "served", enabled: false, order })).toBe(sort);
    expect(
      withHandOrder(sort, { status: "The record store this page is connected to does not have custom.read_records_in_view_order yet", enabled: true, order }),
    ).toBe(sort);
  });
});

describe("an entity reference in the Sheet reads as its things' words (lane REFERENCE-CARRY)", () => {
  // admin's Workspace · Model Picks: "Model" points at AI models (an entity reference). The Sheet
  // drew "[object Object]" in every Model cell (walk, 2026-09-29).
  const model = field({ key: "model", label: "Model", type: "relation", multi: false, config: { target_mode: "any", allowed_types: ["ai_model"] } } as never);

  it("has no older look (the older grid's relation is ids of one table)", () => {
    expect(gridFormat(model, null)).toBeNull();
  });

  it("a cell holding {token, id, label} reads as the label, and a list as its labels", () => {
    const one = { token: "ai_model", id: "eabcd5b0-53dc-4cef-bcd0-067d4bac56ed", label: "gemini-3.5-flash-lite" };
    const two = { token: "ai_model", id: "8c3c4436-d3b1-489d-b802-29456fb7f659", label: "claude-opus-5-5" };
    const cols = [{ field_name: "model", data_type: "string" }] as never;
    expect(gridRowData({ model: one }, cols)).toEqual({ model: "gemini-3.5-flash-lite" });
    expect(gridRowData({ model: [one, two] }, cols)).toEqual({ model: "gemini-3.5-flash-lite, claude-opus-5-5" });
    // Anything else is exactly as stored.
    expect(gridRowData({ purpose: "Cheap, high-volume simple work", tags: ["a", "b"] }, cols)).toEqual({ purpose: "Cheap, high-volume simple work", tags: ["a", "b"] });
  });
});
