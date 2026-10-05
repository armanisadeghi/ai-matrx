import {
  isKindJsonText,
  markdownCarriesKind,
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
    // H1 (round 5): prose BEFORE an embedded kind region still carries it.
    [{ answer: 'Here are your cards: ```json\n{"__kind":"flashcard_set","cards":[]}\n```' }, true],
    ['Here are your cards:\n\n```json\n{"__kind":"flashcard_set","cards":[]}\n```', true],
    ['Your timeline: {"__kind":"timeline","events":[]} — enjoy.', true],
    [['intro', 'See: {"__kind":"timeline","events":[]}'], true],
    ['Markdown escaped: {"\\_\\_kind":"timeline","events":[]}', true],
    // Quoted source stays source: a code span or a non-JSON fence.
    ['Write `{"__kind":"timeline"}` to route.', false],
    ['Example:\n```ts\nconst k = {"__kind": "timeline"};\n```', false],
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

describe("markdownCarriesKind — kind data a reader would see raw in prose", () => {
  it.each([
    ['```json\n{"__kind":"a"}\n```', true],
    ['```JSON\n{"__kind":"a"}\n```', true],
    ['```\n{"__kind":"a"}\n```', true],
    ['~~~json\n{"__kind":"a"}\n~~~', true],
    ['  {"__kind":"a","x":1}', true],
    ['Here: {"__kind":"a","x":1}', true],
    ['| a | {"__kind":"a"} |', true],
    ['Text\n\n    {"__kind":"a"}', true],
    ['> {"__kind":"a"}', true],
    ['> ```json\n> {"__kind":"a"}\n> ```', true],
    ['> ```ts\n> {"__kind":"a"}\n> ```', false],
    ['```markdown\n{"__kind":"a"}\n```', false],
    ['`{"__kind":"a"}` and ```', false],
    ['```xml\n{"__kind":"a"}\n```', false],
    ['  ```ts\n  const k = {"__kind": "a"};\n  ```', false],
    ['Use `"__kind": "a"` to route.', false],
    ["No kind here.", false],
  ])("%j → %s", (text, expected) => {
    expect(markdownCarriesKind(text)).toBe(expected);
  });
});
