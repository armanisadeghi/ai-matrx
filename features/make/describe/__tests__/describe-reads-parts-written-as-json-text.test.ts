// features/make/describe/__tests__/describe-reads-parts-written-as-json-text.test.ts — lane MAKE-WORKS.
//
// THE USE CASE. 2026-10-09, both test seats, five realistic sentences ("a content calendar for my 6 agency
// clients…", "track my team's PTO", …): the mandate answered every table, form, view and relationship as a
// JSON STRING (`tables: ["{\"token\":\"client\",…}"]`, `business: "{\"name\":…}"`). The box handed that to
// the store's check, which died on "t.fields is not iterable" — every request on /make failed in ~50 s with
// words no person can act on.
//
// BREAKS THIS CATCHES: a stringified part reaching the check · a parse that changes a real string value
// (a use case that merely starts with a brace is not JSON) · the read answer differing in any way from the
// same answer written as objects.

import { checkDescribeTemplate, coerceDescribeAnswer } from "../describeTemplate";
import goldReduced from "./fixtures/gold-reduced-to-describe.json";

/** The live failure's shape: every list entry and every object part written as JSON text. */
function asTheModelWroteIt(template: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(template)) {
    if (Array.isArray(v)) out[k] = v.map((item) => (item && typeof item === "object" ? JSON.stringify(item) : item));
    else if (v && typeof v === "object") out[k] = JSON.stringify(v);
    else out[k] = v;
  }
  return out;
}

describe("the describe box reads parts the model wrote as JSON text", () => {
  const template = { ...(JSON.parse(JSON.stringify(goldReduced)) as Record<string, unknown>), __kind: "describe_template_result" };

  it("reads every stringified table, form, view and relationship as the object it names", () => {
    const stringified = asTheModelWroteIt(template);
    expect(typeof (stringified.tables as unknown[])[0]).toBe("string");
    const read = coerceDescribeAnswer({ template: stringified, notes: [], reuses: [] });
    expect(read.template).toEqual(template);
  });

  it("checks the stringified answer exactly as it checks the same answer written as objects", () => {
    const direct = checkDescribeTemplate(coerceDescribeAnswer({ template }).template);
    const fromText = checkDescribeTemplate(coerceDescribeAnswer({ template: asTheModelWroteIt(template) }).template);
    expect(fromText.ok).toBe(direct.ok);
    expect(fromText.spec).toEqual(direct.spec);
  });

  it("leaves a real string alone, even one that starts with a brace", () => {
    const read = coerceDescribeAnswer({ template: { ...template, useCase: "{Front desk} books first visits" } });
    expect(read.template.useCase).toBe("{Front desk} books first visits");
  });
});
