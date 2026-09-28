/**
 * ONE LIST OF WHAT A COLUMN STORES, IN A PERSON'S WORDS (DATA-V2-BASICS-2 T3).
 * RED before: three pickers, three vocabularies ("String", "Integer", "Whole number" for one thing),
 * and the change pickers offered kinds a record-store column cannot become.
 */
import { COLUMN_STORAGE_TYPES, storageTypeLabel, storageTypesToChangeInto } from "../column-storage-types";

it("no storage word or engineer's word reaches a person", () => {
  const words = COLUMN_STORAGE_TYPES.map((t) => t.label);
  for (const bad of ["String", "Json", "JSON", "Array", "Integer", "Boolean", "DateTime", "Datetime", "string"]) {
    expect(words).not.toContain(bad);
  }
  expect(storageTypeLabel("integer")).toBe("Whole number");
});

it("on a record-store table a column is offered only what the store can change it into", () => {
  const offered = storageTypesToChangeInto({ onTheRecordStore: true, changeInto: ["string", "number", "integer", "boolean", "date", "datetime"], current: "string" });
  expect(offered.map((t) => t.label)).toEqual(["Text", "Number", "Whole number", "Yes / No", "Date", "Date & time"]);
  const moved = storageTypesToChangeInto({ onTheRecordStore: true, changeInto: ["string"], current: "json" });
  expect(moved.map((t) => t.value)).toEqual(["string", "json"]);
});
