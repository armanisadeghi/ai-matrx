/**
 * A ROW FORM NAMES A COLUMN'S KIND IN A PERSON'S WORDS (DATA-V2-BASICS-2 F33).
 *
 * THE USE CASE: Cedar Ridge Physical Therapy's "Clinic Supplies Count" — Add New Row printed
 * "string" beside Title, Room and Stock Status (a choice column) and "number" beside Stock Count.
 * RED before: the forms printed `field.data_type` and no helper existed.
 */
import { columnKindWord } from "../column-kind-word";

it("a plain text column reads Text, never string", () => {
  expect(columnKindWord({ data_type: "string", metadata: {} })).toBe("Text");
});

it("a choice column reads Choice", () => {
  expect(columnKindWord({ data_type: "string", metadata: { format: { id: "choice", options: { choices: [{ value: "In stock" }] } } } })).toBe("Choice");
});

it("a number column reads Number, a date-and-time column Date & time", () => {
  expect(columnKindWord({ data_type: "number", metadata: {} })).toBe("Number");
  expect(columnKindWord({ data_type: "datetime", metadata: {} })).toMatch(/Date/);
});

it("no storage word ever reaches the form", () => {
  for (const t of ["string", "number", "integer", "boolean", "date", "datetime", "json", "array"]) {
    expect(columnKindWord({ data_type: t, metadata: {} })).not.toBe(t);
  }
});
