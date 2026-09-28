/**
 * A COLUMN'S FILTER VALUES READ IN THEIR OWN ORDER (DATA-V2-BASICS-2 F20).
 * Harbor Dental's "Annual Max Used" (a Percent column) listed its filter values "0, 10, 15, 5":
 * text order. A column whose values are all numbers lists them smallest first; any other column
 * keeps most-used first, with ties in natural order ("Plan 2" before "Plan 10").
 * RED before: ties and numbers sorted as text.
 */
import { computeColumnFacets } from "../column-filters";

const rows = (key: string, values: unknown[]) => values.map((v) => ({ data: { [key]: v } }));

it("numbers list smallest first", () => {
  const f = computeColumnFacets({ tableId: "t", fieldName: "annual_max_used", rows: rows("annual_max_used", [10, 0, 15, 5, 0, 100, 5]) });
  expect(f.values.map((v) => v.value)).toEqual(["0", "5", "10", "15", "100"]);
});

it("words keep most-used first, ties in natural order", () => {
  const f = computeColumnFacets({ tableId: "t", fieldName: "plan", rows: rows("plan", ["Plan 10", "Plan 2", "PPO", "PPO"]) });
  expect(f.values.map((v) => v.value)).toEqual(["PPO", "Plan 2", "Plan 10"]);
});
