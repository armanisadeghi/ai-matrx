/**
 * check:kind-marker-law — the guard's own RED/GREEN self-test.
 *
 * A guard you cannot demonstrate FAILING is not a guard. Every case drives
 * `scanSource` — the same function the CLI walks the repo with — over a source
 * fixture, so a change that makes the guard blind turns one of these red.
 *
 * Why this file exists: the line-regex guard only knew the LITERAL spelling
 * `"__kind"`. `delete values[KIND_KEY]` (the imported constant as a computed
 * key) walked straight past it in `features/mandates/admin/ProvisionOfferComposer.tsx`
 * and stripped the marker from every offer instance the mandate test bench
 * composed. The first RED case below is that exact line.
 */
import { scanSource } from "@/scripts/check-kind-marker-law";

const IMPORT = `import { KIND_KEY } from "@ai-matrx/content-ir";\n`;
const found = (body: string, file = "features/x/thing.ts") =>
  scanSource(file, IMPORT + body).map((v) => v.what);

describe("check:kind-marker-law — RED: every spelling of a strip is found", () => {
  it("flags `delete values[KIND_KEY]` (the ProvisionOfferComposer escape)", () => {
    expect(found(`const values = { ...i };\ndelete values[KIND_KEY];`)).toEqual([
      "deletes the `__kind` key",
    ]);
  });

  it('flags `delete x["__kind"]` and `delete x.__kind`', () => {
    expect(found(`delete x["__kind"];`)).toHaveLength(1);
    expect(found(`delete x.__kind;`)).toHaveLength(1);
    expect(found(`delete (x as Rec)[KIND_KEY];`)).toHaveLength(1);
  });

  it("flags `Reflect.deleteProperty(x, KIND_KEY | \"__kind\")`", () => {
    expect(found(`Reflect.deleteProperty(x, KIND_KEY);`)).toEqual(["deletes the `__kind` key"]);
    expect(found(`Reflect.deleteProperty(x, "__kind");`)).toHaveLength(1);
  });

  it("follows the constant under an import alias or a local re-binding", () => {
    const aliased = `import { KIND_KEY as K } from "@ai-matrx/content-ir";\ndelete v[K];`;
    expect(scanSource("features/x/a.ts", aliased)).toHaveLength(1);
    expect(found(`const MARK = KIND_KEY;\ndelete v[MARK];`)).toHaveLength(1);
    expect(found(`const MARK = "__kind";\ndelete v[MARK];`)).toHaveLength(1);
  });

  it("flags a destructure-away on one line, over several lines, and as a parameter", () => {
    expect(found(`const { [KIND_KEY]: _k, ...rest } = value;`)).toEqual([
      "destructures the `__kind` key away",
    ]);
    expect(
      found(`const {\n  [KIND_KEY]: _k,\n  ...rest\n} = value;`),
    ).toEqual(["destructures the `__kind` key away"]);
    expect(found(`const { __kind, ...rest } = value;`)).toHaveLength(1);
    expect(found(`const { "__kind": _k, ...rest } = value;`)).toHaveLength(1);
    expect(found(`const f = ({ [KIND_KEY]: _k, ...rest }: Rec) => rest;`)).toHaveLength(1);
  });

  it("flags a filter in either operand order, constant or literal", () => {
    expect(found(`e.filter(([k]) => k !== KIND_KEY);`)).toEqual(["filters the marker key out"]);
    expect(found(`e.filter(([k]) => KIND_KEY !== k);`)).toHaveLength(1);
    expect(found(`e.filter(([name]) => name !== "__kind");`)).toHaveLength(1);
    expect(found(`e.filter(([name]) => name != "__kind");`)).toHaveLength(1);
  });

  it("flags a call to a named reducer helper", () => {
    expect(found(`const out = stripKindDeep(value);`)).toEqual([
      "`stripKindDeep(…)` — strips `__kind` outside a lawful door",
    ]);
  });

  it("scans .tsx sources", () => {
    expect(found(`const C = () => { delete v[KIND_KEY]; return <div />; };`, "features/x/C.tsx")).toHaveLength(1);
  });
});

describe("check:kind-marker-law — GREEN: the fix and ordinary reads are never flagged", () => {
  it("never mistakes a STAMP for a strip", () => {
    expect(found(`const stamped = { [KIND_KEY]: kind, ...value };`)).toEqual([]);
    expect(found(`const stamped = {\n  [KIND_KEY]: kind,\n  ...value,\n};`)).toEqual([]);
    expect(found(`onApply({ [KIND_KEY]: kind, ...instance });`)).toEqual([]);
  });

  it("allows reading the marker and comparing its VALUE", () => {
    expect(found(`if (data[KIND_KEY] !== EXPECTED) return null;`)).toEqual([]);
    expect(found(`const { [KIND_KEY]: kind } = value;`)).toEqual([]);
    expect(found(`const k = value[KIND_KEY];`)).toEqual([]);
  });

  it("ignores deletes of other keys and comments that mention the strip", () => {
    expect(found(`delete values[OTHER_KEY];\ndelete values.name;`)).toEqual([]);
    expect(found(`// delete values[KIND_KEY];\n/* delete values[KIND_KEY]; */`)).toEqual([]);
  });

  it("reports the line of the offending node", () => {
    expect(scanSource("features/x/t.ts", `${IMPORT}\n\ndelete v[KIND_KEY];`)).toEqual([
      { line: 4, what: "deletes the `__kind` key" },
    ]);
  });
});
