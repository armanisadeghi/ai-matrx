/**
 * EVERY LOOK ADD COLUMN OFFERS CAN BE MADE ON THE RECORD STORE (lane TABLE-EDIT-DEFECTS, T05; safety net
 * live-0419-before on www: Add Column → "Date & time" stayed open with 'The record store has no
 * "datetime" kind of column' while the picker offered it). The picker sends the storage type of the
 * look picked (`getFieldFormat(id).base`); every one of them must turn into a store Field spec.
 * RED on the HEAD bytes: `datetime` → null.
 */
jest.mock("@/utils/supabase/client", () => ({ createClient: jest.fn() }));

import { FIELD_FORMAT_LIST } from "@ai-matrx/design-system/field-formats";

import { specForNewColumn } from "../data-source/record-store";
import { FIELD_DATA_TYPES } from "../types";

it("every storage type a column can hold has a spec", () => {
  const missing = FIELD_DATA_TYPES.filter((t) => specForNewColumn(t) === null);
  expect(missing).toEqual([]);
});

it("every look's storage type has a spec (the picker sends the look's base)", () => {
  const bases = [...new Set(FIELD_FORMAT_LIST.map((f) => f.base).filter((b): b is NonNullable<typeof b> => !!b))];
  const offered = bases.filter((b) => (FIELD_DATA_TYPES as readonly string[]).includes(b));
  const missing = offered.filter((b) => specForNewColumn(b) === null);
  expect(missing).toEqual([]);
});

it("Date & time makes a date-AND-time column, not a day (custom._field_document_for reads spec.kind)", () => {
  expect(specForNewColumn("datetime")).toEqual({ type: "datetime", kind: "datetime" });
});
