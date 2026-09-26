/**
 * W1 — `relation`, the field type whose cell holds a record's ID and whose
 * screen shows that record's WORDS.
 *
 * THE USE CASE. Rincon Plumbing & Drain runs a dispatch board: a Service Calls
 * table whose `customer` column points at a row of its Customers table. Today
 * that column would be a `choice` holding "Maria Delgado — 1412 Calle Puente";
 * as a `relation` it holds her record's id and shows her name.
 *
 * THE TEN READERS, AND WHY THIS FILE IS SHORT. OLD-TABLES-CUTOVER §3.3 names
 * ten places that print the raw contents of a cell — the grid, formulas, the
 * column filter checklist, copy/paste/export, the row label, sorting, the agent
 * scope, `@table_cell`, the CMS export, and the server's distinct-values
 * endpoint — every one of which would have shown a customer a raw uuid. It is
 * NOT ten fixes: each of them asks `isChoiceFormat` / `CHOICE_FORMAT_IDS`
 * whether this column shows words rather than its stored value, and `person`
 * already proves that path. So the test that matters is that `relation` is IN
 * that list and that the predicate DERIVES from it — which is the arm that
 * would have failed before this wave, because `isChoiceFormat` spelled its
 * three ids out by hand and adding a fourth to the array changed nothing.
 */
import {
  CHOICE_FORMAT_IDS,
  isChoiceFormat,
  isIdentifierFormat,
  isPersonFormat,
  withResolvedChoices,
} from "../choices";
import { FIELD_FORMATS, FIELD_FORMAT_IDS } from "@ai-matrx/design-system/field-formats";
import {
  RELATION_WITHHELD_LABEL,
  looksLikeRecordId,
  relationCellState,
  unresolvedRelationText,
} from "../relation";
import type { FieldFormatConfig } from "@ai-matrx/design-system/field-formats";

const MARIA = "0b7c1f3e-2a44-4d19-9f81-6cb2d4e77a10";
const CUSTOMERS = [
  { value: MARIA, label: "Maria Delgado — 1412 Calle Puente" },
  { value: "3f6a9d21-88b0-4c55-a0e2-51d7c9b34f88", label: "Harbor View HOA" },
];

describe("relation format — the vocabulary", () => {
  it("is one new member of the registry, named `relation` and never `reference`", () => {
    expect(FIELD_FORMAT_IDS).toContain("relation");
    expect(FIELD_FORMAT_IDS).not.toContain("reference");
    // The doctrine's rename table reads `reference` (field type) → `relation`,
    // and `reference (as a link type)` is a retired word.
    expect(FIELD_FORMAT_IDS.filter((id) => id.includes("reference"))).toEqual([]);
  });

  it("carries a cardinality instead of a second format id", () => {
    // `choice` needed `multi_choice` beside it. `relation` does not: one field
    // type with `relation_max` is what `custom.field` already stores, so DD-031
    // carries the definition across instead of re-specifying it.
    expect(FIELD_FORMATS.relation.optionKeys).toContain("relation_max");
    expect(FIELD_FORMATS.relation.optionKeys).toContain("relation_target");
    expect(FIELD_FORMAT_IDS).not.toContain("multi_relation");
  });

  it("carries custom.field's own option key names, so the mover need not translate", () => {
    expect(FIELD_FORMATS.relation.optionKeys).toEqual(
      expect.arrayContaining(["relation_target", "relation_max", "on_delete", "display"]),
    );
  });
});

describe("relation format — the one list the ten readers ask", () => {
  it("is a member of CHOICE_FORMAT_IDS, where `person` already sits", () => {
    expect(CHOICE_FORMAT_IDS).toContain("relation");
    expect(CHOICE_FORMAT_IDS).toContain("person");
  });

  /**
   * THE ARM THAT WOULD HAVE FAILED. `isChoiceFormat` used to be
   * `id === "choice" || id === "multi_choice" || id === "person"` — three ids
   * spelled out beside the array rather than read from it. Adding `relation` to
   * CHOICE_FORMAT_IDS alone would have left all ten readers printing a uuid
   * while the list said otherwise. Every member of the list must answer true,
   * by construction, for every member there will ever be.
   */
  it("EVERY member of the list answers isChoiceFormat — the predicate is derived, not spelled out", () => {
    for (const id of CHOICE_FORMAT_IDS) {
      expect(isChoiceFormat(id)).toBe(true);
    }
    expect(isChoiceFormat("relation")).toBe(true);
    expect(isChoiceFormat("currency")).toBe(false);
    expect(isChoiceFormat(undefined)).toBe(false);
  });

  it("is an IDENTIFIER format, like `person` and unlike `choice`", () => {
    expect(isIdentifierFormat("relation")).toBe(true);
    expect(isIdentifierFormat("person")).toBe(true);
    expect(isIdentifierFormat("choice")).toBe(false);
    expect(isIdentifierFormat("multi_choice")).toBe(false);
    expect(isPersonFormat("relation")).toBe(false);
  });

  it("resolves through the same choiceMap path `person` uses", () => {
    const format: FieldFormatConfig = { id: "relation" };
    const resolved = withResolvedChoices(format, CUSTOMERS);
    expect(FIELD_FORMATS.relation.format(MARIA, resolved.options ?? {})).toBe(
      "Maria Delgado — 1412 Calle Puente",
    );
  });
});

describe("relation format — three states, three renderings, no fourth", () => {
  it("RESOLVED is the target's words", () => {
    expect(relationCellState(MARIA, "Maria Delgado — 1412 Calle Puente")).toBe("resolved");
  });

  it("UNRESOLVABLE keeps the id, as an identifier — never a blank and never bare text", () => {
    expect(relationCellState(MARIA, null)).toBe("unresolvable");
    const shown = unresolvedRelationText(MARIA);
    expect(shown).not.toBe("");
    expect(shown).toContain(MARIA.slice(0, 8));
    // It reads as a reference that did not resolve, not as the cell's contents.
    expect(shown).not.toBe(MARIA);
    expect(shown.startsWith("Record ")).toBe(true);
  });

  it("WITHHELD is the sentence and NO id — the identifier never leaks", () => {
    expect(relationCellState(MARIA, RELATION_WITHHELD_LABEL)).toBe("withheld");
    expect(RELATION_WITHHELD_LABEL).not.toContain(MARIA);
    // The same sentence in both stores, so nobody can tell which one refused.
    expect(RELATION_WITHHELD_LABEL).toBe("A record you have not been given access to");
  });

  it("an unresolved cell that is NOT a uuid still shows what is there", () => {
    // The fallback law: never blank, never throw.
    expect(unresolvedRelationText("Maria Delgado")).toBe("Maria Delgado");
  });
});

describe("relation format — what a cell may hold", () => {
  it("accepts a canonical uuid and nothing else", () => {
    expect(looksLikeRecordId(MARIA)).toBe(true);
    expect(looksLikeRecordId(MARIA.toUpperCase())).toBe(true);
    expect(looksLikeRecordId("Maria Delgado")).toBe(false);
    expect(looksLikeRecordId("4712")).toBe(false);
    expect(looksLikeRecordId("")).toBe(false);
    expect(looksLikeRecordId(null)).toBe(false);
  });
});

describe("relation format — the existing label columns are untouched", () => {
  it("choice and multi_choice still store and show labels, off-list ones included", () => {
    // The whole shape-A case: 13 live label columns and 344 filled cells do not
    // move, and the 2 off-list values `allowOther` keeps legible stay legible.
    const choices = [{ value: "On site" }, { value: "Invoiced" }];
    expect(FIELD_FORMATS.choice.format("On site", { choices })).toBe("On site");
    // An off-list value is a MISMATCH, which the renderer shows in amber — the
    // same behaviour as before this wave, asserted so a change is visible.
    expect(FIELD_FORMATS.choice.format("Waiting on the city", { choices })).toBeNull();
  });
});
