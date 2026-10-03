/** GRIDS REVIEW 3: Add Column with a Relation and no table did nothing, silently; a Formula took no formula. */
import { whatTheColumnStillNeeds } from "../column-still-needs";

const base = { name: "Vendor", nameProblem: null, defaultProblem: null, defaultAsked: false };

it("a relation with no table picked says to pick one", () => {
  expect(whatTheColumnStillNeeds({ ...base, format: { id: "relation" } as never, relationTargets: [{ id: "t", name: "Vendors" }] })).toMatch(/Pick the table/);
  expect(whatTheColumnStillNeeds({ ...base, format: { id: "relation", options: { relation_target: "t" } } as never })).toBeNull();
  expect(whatTheColumnStillNeeds({ ...base, format: { id: "relation" } as never, relationTargets: [] })).toMatch(/no other table/);
});

it("a formula needs a formula that reads", () => {
  expect(whatTheColumnStillNeeds({ ...base, format: { id: "formula" } as never })).toMatch(/Write the formula/);
  expect(whatTheColumnStillNeeds({ ...base, format: { id: "formula", options: { formula: { expression: "1 +" } } } as never })).toMatch(/mistake/);
  expect(whatTheColumnStillNeeds({ ...base, format: { id: "formula", options: { formula: { expression: "1 + 2" } } } as never })).toBeNull();
});

it("a plain column with a name needs nothing", () => {
  expect(whatTheColumnStillNeeds({ ...base, format: { id: "text" } as never })).toBeNull();
  expect(whatTheColumnStillNeeds({ ...base, name: "  ", format: { id: "text" } as never })).toBe("Name the column.");
});
