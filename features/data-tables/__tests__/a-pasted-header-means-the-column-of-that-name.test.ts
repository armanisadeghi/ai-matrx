/**
 * A PASTED HEADER MEANS THE COLUMN OF THAT NAME (lane DATA-V2-BASICS; BREAKER-1 F10).
 * Measured on production (Hygiene Fee Schedule, 2026-09-27): after renaming "Discount Percent" to
 * "Fee Percent" and adding a new "Discount Percent", a pasted "Discount Percent" header went into
 * "Fee Percent" (its key is still `discount_percent`) and the real "Discount Percent" was left empty.
 * RED on the pre-lane matcher (key only): the first case maps both headers to the renamed column.
 */
import { matchPasteHeaders } from "../paste-header-match";

const FEE = { field_name: "discount_percent", display_name: "Fee Percent" };
const DISCOUNT = { field_name: "discount_percent_2", display_name: "Discount Percent" };
const TITLE = { field_name: "title", display_name: "Title" };

test("a header matches the column whose NAME reads the same, never the renamed column that kept the key", () => {
  const m = matchPasteHeaders(["Title", "Discount Percent", "Fee Percent"], [TITLE, FEE, DISCOUNT]);
  expect(m.map((x) => x.matchedField?.display_name ?? null)).toEqual(["Title", "Discount Percent", "Fee Percent"]);
});

test("a header no name matches may still land by the key it spells, but never on a column a name took", () => {
  const m = matchPasteHeaders(["discount percent ", "Title"], [TITLE, FEE]);
  expect(m.map((x) => x.matchedField?.display_name ?? null)).toEqual(["Fee Percent", "Title"]);
  const m2 = matchPasteHeaders(["Fee Percent", "discount_percent"], [FEE]);
  expect(m2.map((x) => x.matchedField?.display_name ?? null)).toEqual(["Fee Percent", null]);
});

test("a name two columns share matches neither, and says why", () => {
  const twin = { field_name: "notes", display_name: "Patient Name" };
  const name = { field_name: "patient_name", display_name: "Patient Name" };
  const m = matchPasteHeaders(["Patient Name"], [name, twin]);
  expect(m[0]!.matchedField).toBeNull();
  expect(m[0]!.why).toBe('2 columns are called "Patient Name" — rename one, then paste again');
});
