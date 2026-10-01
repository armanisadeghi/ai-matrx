import { jsonKindSignal } from "../json-kind-signal";

describe("jsonKindSignal — the first-key rule", () => {
  it.each([
    ["", "undecided"],
    ["   ", "undecided"],
    ["{", "undecided"],
    ['{"', "undecided"],
    ['{"__ki', "undecided"],
    ['{"tit', "undecided"],
    ["[", "undecided"],
    ["[ {", "undecided"],
    ['[{"__k', "undecided"],
  ])("%j → %s (first key not arrived)", (text, expected) => {
    expect(jsonKindSignal(text)).toBe(expected);
  });

  it.each([
    ['{"__kind"', "kind"],
    ['{\n  "__kind": "flashcard_set"', "kind"],
    ['[{"__kind":"flashcard"', "kind"],
    ['{"title":"x","__kind":"flashcard_set"', "kind"],
    ['{"title":"x","items":[{"__kind" :"flashcard"', "kind"],
  ])("%j → %s (a __kind key, first or later, any depth)", (text, expected) => {
    expect(jsonKindSignal(text)).toBe(expected);
  });

  it.each([
    ['{"title"', "not_kind"],
    ['{"title":"x","n":1', "not_kind"],
    ["{}", "not_kind"],
    ["[1, 2", "not_kind"],
    ["hello", "not_kind"],
    ['{"note":"the key is \\"__kind\\": here"', "not_kind"],
  ])("%j → %s (first key is not __kind, no __kind key seen)", (text, expected) => {
    expect(jsonKindSignal(text)).toBe(expected);
  });

  it("an escaped quote inside the first key does not end it early", () => {
    expect(jsonKindSignal('{"a\\"b')).toBe("undecided");
    expect(jsonKindSignal('{"a\\"b"')).toBe("not_kind");
  });

  it("never holds forever: a huge undecided region concedes to JSON", () => {
    expect(jsonKindSignal("{" + " ".repeat(3000))).toBe("not_kind");
  });
});
