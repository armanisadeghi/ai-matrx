import {
  isKindJsonText,
  rootKindSlug,
  valueCarriesKind,
} from "../json-kind-signal";

describe("valueCarriesKind — the value form of the kind signal", () => {
  it.each([
    [{ __kind: "flashcard_set", cards: [] }, true],
    [{ result: { deep: [{ __kind: "timeline" }] } }, true],
    [[1, "a", { __kind: "x" }], true],
    [{ payload: '{"__kind":"timeline","events":[]}' }, true],
    ['[{"__kind":"x"}]', true],
    [{ name: "Ada" }, false],
    [{ __kind: "" }, false],
    [{ __kind: 3 }, false],
    ["The `\"__kind\": \"x\"` key routes a payload.", false],
    [null, false],
    [42, false],
  ])("%j → %s", (value, expected) => {
    expect(valueCarriesKind(value)).toBe(expected);
  });

  it("survives a cycle", () => {
    const a: Record<string, unknown> = { name: "a" };
    a.self = a;
    expect(valueCarriesKind(a)).toBe(false);
  });

  it("reads the root slug and kind JSON text", () => {
    expect(rootKindSlug({ __kind: "timeline" })).toBe("timeline");
    expect(rootKindSlug([{ __kind: "timeline" }])).toBeNull();
    expect(isKindJsonText('  {"__kind":"a"}')).toBe(true);
    expect(isKindJsonText('see {"__kind":"a"}')).toBe(false);
  });
});
