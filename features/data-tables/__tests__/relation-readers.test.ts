/**
 * THE TEN READERS OF A `relation` CELL — lane OLD-TABLES-2, W3.
 *
 * A `relation` column stores a record's ID and shows that record's WORDS. Ten
 * places print the contents of a cell, and every one of them would have shown a
 * customer a raw uuid (OLD-TABLES-CUTOVER rev 2 §3.3). This suite is the proof
 * for the ones that are PURE — the row label, the formula engine, copy, export
 * and the agent payload — each asserted on the value a person would actually
 * see. The grid, the filter checklist and the agent scope resolve through
 * `choiceMap`, whose arm is covered by `lib/field-formats/__tests__/relation-format`
 * and by the headless walk.
 *
 * THE USE CASE. Rincon Plumbing & Drain's dispatch board, the real one this
 * lane's SQL suites run against: a Service Calls table whose `customer` column
 * points at a Customers table, one work order per row.
 */

import {
  cellTextForReader,
  isRelationFormat,
  relationCellText,
  relationIdsInColumn,
  type RelationWordsByField,
} from "../relation-words";
import { rowLabelText } from "../row-label";
import { withComputedColumns } from "@ai-matrx/design-system/formulas";
import { copyValueOf, dataTableRowsToMarkdown } from "../table-copy";

const MARIA = "771155c3-cc6f-431b-a2cd-cd15af2c8941";
const HARBOR = "d955d546-7c4c-4bf3-9a00-ed29014c3797";
const GONE = "9f2c7a10-5b44-4e88-9d31-0a6e1c4b7f22";
const WITHHELD = "A record you have not been given access to";

/** What the older store's door answered for this page of the dispatch board. */
const WORDS: RelationWordsByField = new Map([
  [
    "customer",
    new Map([
      [MARIA, "Maria Delgado"],
      [HARBOR, WITHHELD],
      // GONE is deliberately ABSENT — the row it names is not there.
    ]),
  ],
]);

const RELATION_FIELD = {
  field_name: "customer",
  display_name: "Customer",
  data_type: "string",
  field_order: 1,
  metadata: {
    format: {
      id: "relation",
      options: { relation_target: "415c3e23", relation_max: 1, display: "household" },
    },
  },
};

const WORK_ORDER_FIELD = {
  field_name: "work_order",
  display_name: "Work order",
  data_type: "string",
  field_order: 0,
  metadata: {},
};

const ROWS: { id: string; data: Record<string, unknown> }[] = [
  { id: "r1", data: { work_order: "WO-4471", customer: MARIA } },
  { id: "r2", data: { work_order: "WO-4472", customer: HARBOR } },
  { id: "r3", data: { work_order: "WO-4474", customer: GONE } },
  { id: "r4", data: { work_order: "WO-4475", customer: null } },
];

describe("the three states a relation cell reads in", () => {
  it("resolved reads the words", () => {
    expect(relationCellText(MARIA, WORDS.get("customer"))).toBe("Maria Delgado");
  });

  it("withheld reads the store's sentence, and carries NO id", () => {
    const text = relationCellText(HARBOR, WORDS.get("customer"));
    expect(text).toBe(WITHHELD);
    expect(text).not.toContain(HARBOR.slice(0, 8));
  });

  it("unresolvable reads the identifier marked as one — never a bare uuid, never a blank", () => {
    const text = relationCellText(GONE, WORDS.get("customer"));
    expect(text).toBe("Record 9f2c7a10");
    expect(text).not.toBe(GONE);
    expect(text).not.toBe("");
  });

  it("a cleared cell reads as empty, not as a missing record", () => {
    expect(relationCellText(null, WORDS.get("customer"))).toBe("");
  });

  it("a many-valued cell joins its parts", () => {
    expect(relationCellText([MARIA, GONE], WORDS.get("customer"))).toBe(
      "Maria Delgado, Record 9f2c7a10",
    );
  });

  it("every other column is handed straight back", () => {
    expect(cellTextForReader("WO-4471", { id: "text" }, WORDS, "work_order")).toBe("WO-4471");
    expect(isRelationFormat("text")).toBe(false);
  });

  it("the ids asked for are the ones the page actually points at, de-duplicated", () => {
    expect(relationIdsInColumn(ROWS, "customer")).toEqual([MARIA, HARBOR, GONE]);
  });
});

describe("reader 5 — the row label names a row by the words, never by a uuid", () => {
  const fields = [WORK_ORDER_FIELD, RELATION_FIELD];

  it("resolves through the relation column", () => {
    const label = rowLabelText(ROWS[0]!, fields, { kind: "field", field: "customer" }, WORDS);
    expect(label.text).toBe("Maria Delgado");
  });

  it("without the words, a row is still never named by a bare uuid", () => {
    const label = rowLabelText(ROWS[0]!, fields, { kind: "field", field: "customer" });
    expect(label.text).toBe("Record 771155c3");
    expect(label.text).not.toContain(MARIA);
  });

  it("a MERGED label reads the words too — the formula seam, not the comparison", () => {
    const label = rowLabelText(
      ROWS[0]!,
      fields,
      { kind: "formula", expression: '{Work order} & " — " & {Customer}' },
      WORDS,
    );
    expect(label.text).toBe("WO-4471 — Maria Delgado");
  });
});

describe("reader 2 — a formula over a relation column compares words, not record ids", () => {
  const formulaField = {
    field_name: "who",
    display_name: "Who",
    data_type: "string",
    metadata: { format: { id: "formula", options: { formula: { expression: "{Customer}" } } } },
  };
  const eqField = {
    field_name: "is_maria",
    display_name: "Is Maria",
    data_type: "string",
    metadata: {
      format: { id: "formula", options: { formula: { expression: '{Customer} = "Maria Delgado"' } } },
    },
  };
  const displayValueOf = (fieldName: string, raw: unknown) =>
    fieldName === "customer" ? relationCellText(raw, WORDS.get("customer")) : raw;

  it("echoes the words", () => {
    const out = withComputedColumns(ROWS, [WORK_ORDER_FIELD, RELATION_FIELD, formulaField], displayValueOf);
    expect(out.rows[0]!.data.who).toBe("Maria Delgado");
    expect(out.rows[1]!.data.who).toBe(WITHHELD);
  });

  it("compares the words", () => {
    const out = withComputedColumns(ROWS, [WORK_ORDER_FIELD, RELATION_FIELD, eqField], displayValueOf);
    expect(out.rows[0]!.data.is_maria).toBe(true);
    expect(out.rows[1]!.data.is_maria).toBe(false);
  });

  it("WITHOUT the seam the same formula echoes a uuid — the defect this is here for", () => {
    const out = withComputedColumns(ROWS, [WORK_ORDER_FIELD, RELATION_FIELD, formulaField]);
    expect(out.rows[0]!.data.who).toBe(MARIA);
  });
});

describe("reader 4 — copy, Markdown and the agent payload", () => {
  const copyFields = [
    { id: "f1", field_name: "work_order", display_name: "Work order", data_type: "string" },
    {
      id: "f2",
      field_name: "customer",
      display_name: "Customer",
      data_type: "string",
      metadata: RELATION_FIELD.metadata,
    },
  ];

  it("a copied cell is the words", () => {
    expect(copyValueOf(ROWS[0]!, copyFields[1]!, WORDS)).toBe("Maria Delgado");
    expect(copyValueOf(ROWS[0]!, copyFields[0]!, WORDS)).toBe("WO-4471");
  });

  it("a Markdown table has no uuid in it anywhere", () => {
    const md = dataTableRowsToMarkdown("Rincon Plumbing — Service Calls", ROWS, copyFields, WORDS);
    expect(md).toContain("Maria Delgado");
    expect(md).toContain(WITHHELD);
    expect(md).not.toContain(MARIA);
    expect(md).not.toContain(HARBOR);
    expect(md).not.toContain(GONE);
  });

  it("without the words it is still never a BARE uuid — only an unresolved identifier", () => {
    const md = dataTableRowsToMarkdown("Rincon Plumbing — Service Calls", ROWS, copyFields);
    expect(md).toContain("Record 771155c3");
    expect(md).not.toContain(MARIA);
  });

  it("with the column's FORMAT unknown — the pre-W3 state — it is a column of uuids", () => {
    // This is the defect, reconstructed: before W3 the copy path read
    // `row.data[field_name]` with no idea what kind of column it was, so a
    // relation column put record ids on the clipboard. Strip the format and the
    // old behaviour comes straight back.
    const blind = copyFields.map(({ metadata: _ignored, ...rest }) => rest);
    const md = dataTableRowsToMarkdown("Rincon Plumbing — Service Calls", ROWS, blind, WORDS);
    expect(md).toContain(MARIA);
    expect(md).toContain(HARBOR);
  });
});
