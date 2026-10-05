import { sourceKindNoun } from "./sourceKinds";

// A picked table says Table and a picked pick list says Pick list — never Dataset, Structured
// List or the stand-in "Record" (the bundled entity vocabulary has neither token).
describe("a picked table or pick list names itself", () => {
  const draft = (resource_type: string) =>
    ({ kind: "resource", ref: { resource_type, resource_id: "x" } }) as unknown as Parameters<typeof sourceKindNoun>[0];
  it("table", () => expect(sourceKindNoun(draft("dataset"))).toBe("Table"));
  it("pick list", () => expect(sourceKindNoun(draft("structured_list"))).toBe("Pick list"));
});
