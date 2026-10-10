/**
 * The scope value screens' pure rules (`scope-detail-values.ts`): how a cell reads as text, which fields an agent may set from text, how it names a field,
 * and the one `ContextValueWrite` a person's draft becomes.
 * Breaks it catches: an empty cell reported as a value; a structured field (a reference, a smart
 * input) accepted as plain text; a number typed as text written as a string; a reference draft
 * written as `value` instead of `references`.
 */
import { joinFieldValues, type ContextField, type ContextValue } from "@ai-matrx/records/scopes";
import {
  cellText,
  cellWrite,
  hasCellValue,
  settableByText,
  valueFor,
} from "../scope-detail-values";

const SCOPE = "22222222-2222-4222-8222-222222222222";

const field = (over: Partial<ContextField>): ContextField =>
  ({
    id: "11111111-1111-4111-8111-111111111111",
    scope_type_id: "33333333-3333-4333-8333-333333333333",
    key: "primary_contact",
    label: "Primary contact",
    kind: "string",
    sort: 0,
    custom_component: null,
    ...over,
  }) as ContextField;

const cell = (over: Partial<ContextValue>): ContextValue =>
  ({
    scope_id: SCOPE,
    field_id: "11111111-1111-4111-8111-111111111111",
    key: "primary_contact",
    kind: "string",
    value: null,
    references: [],
    version: 1,
    set_at: null,
    source_type: "manual",
    authored_by: null,
    whole_value: null,
    incomplete: null,
    ...over,
  }) as ContextValue;

describe("scope value rules", () => {
  it("reads an empty cell as null and a filled one as its text", () => {
    expect(cellText(null)).toBeNull();
    expect(cellText(cell({ value: "" }))).toBeNull();
    expect(cellText(cell({ value: "Luis Rivera, 949 555 0142" }))).toBe("Luis Rivera, 949 555 0142");
    expect(cellText(cell({ kind: "number", value: 4200 }))).toBe("4200");
    expect(cellText(cell({ kind: "boolean", value: false }))).toBe("false");
    expect(hasCellValue(cell({ kind: "reference", references: [] }))).toBe(false);
    expect(hasCellValue(cell({ kind: "reference", references: [{ id: SCOPE, type: "scope" }] }))).toBe(true);
  });

  it("sets only text-shaped fields from text", () => {
    expect(settableByText(field({ kind: "string" }))).toBe(true);
    expect(settableByText(field({ kind: "reference" }))).toBe(false);
    expect(settableByText(field({ kind: "object" }))).toBe(false);
    expect(settableByText(field({ kind: "string", custom_component: { type: "select" } }))).toBe(false);
  });

  it("names a field by id first, then by key, and nothing else", () => {
    const rows = joinFieldValues([field({}), field({ id: "44444444-4444-4444-8444-444444444444", key: "budget", sort: 1 })], {});
    expect(valueFor(rows, "44444444-4444-4444-8444-444444444444", "primary_contact")?.field.key).toBe("budget");
    expect(valueFor(rows, undefined, "primary_contact")?.field.key).toBe("primary_contact");
    expect(valueFor(rows, undefined, "primary-contact-of-another-scope")).toBeNull();
  });

  it("turns a draft into one cell in the field's kind", () => {
    expect(cellWrite(SCOPE, field({ kind: "number" }), "4200")).toMatchObject({ kind: "number", value: 4200, source_type: "manual" });
    expect(cellWrite(SCOPE, field({ kind: "boolean" }), "true")).toMatchObject({ value: true });
    expect(cellWrite(SCOPE, field({ kind: "string" }), "  ")).toMatchObject({ value: null });
    const refs = [{ id: SCOPE, type: "scope" }];
    const w = cellWrite(SCOPE, field({ kind: "reference" }), refs, "Linked the estate plan");
    expect(w).toMatchObject({ references: refs, change_summary: "Linked the estate plan" });
    expect("value" in w).toBe(false);
  });
});
