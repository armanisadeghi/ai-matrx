import {
  endsInPartialKindKey,
  firstKindSlug,
  hasKindKey,
  jsonKindSignal,
} from "../json-kind-signal";

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

  // V6: a LATER `__kind` key before its colon has arrived — the frames
  // between `"__k` and `:` could be a kind, so nothing raw flashes.
  it.each([
    ['[{"x":1}, {"__k', "undecided"],
    ['[{"x":1}, {"__kind', "undecided"],
    ['{"data":{"__kind', "undecided"],
    ['{"data":{"__kind"', "undecided"],
    ['{"data":{"__kind" ', "undecided"],
    ['{"data":{"__kind":', "kind"],
    ['{"title":"x","__ki', "undecided"],
  ])("%j → %s (a later key reaching \"__k holds the loader)", (text, expected) => {
    expect(jsonKindSignal(text)).toBe(expected);
  });

  it.each([
    ['{"_id":1,"_t'],
    ['{"title":"x","_'],
    ['{"title":"x","__'],
    ['{"title":"x","__key"'],
    ['{"title":"x","__type":"a"'],
    ['{"note":"__k'],
    ['{"tags":["__kind'],
    ['{"a":1,"b":"x, \\"__k'],
  ])("%j stays JSON (underscore keys and string values never flicker)", (text) => {
    expect(jsonKindSignal(text)).toBe("not_kind");
  });

  it("partial-key detection is key position only", () => {
    expect(endsInPartialKindKey('{"a":{"__ki')).toBe(true);
    expect(endsInPartialKindKey('{"a":"__ki')).toBe(false);
    expect(endsInPartialKindKey('["__ki')).toBe(false);
  });

  // V7: JSON lets any key character be a \uXXXX escape.
  it.each([
    ['{"\\u005f_kind":"flashcard_set"'],
    ['{"\\u005F\\u005Fkind": "flashcard_set"'],
    ['{"title":"x","_\\u005fkin\\u0064":"quiz"'],
  ])("%j is a kind (escaped key)", (text) => {
    expect(hasKindKey(text)).toBe(true);
    expect(jsonKindSignal(text)).toBe("kind");
    expect(JSON.parse(text + "}")).toHaveProperty("__kind");
  });

  it("the slug reads through escapes, in the key and the value", () => {
    expect(firstKindSlug('{"\\u005f_kind":"flashcard_set"}')).toBe("flashcard_set");
    expect(firstKindSlug('{"__kind":"flash\\u0063ard_set"}')).toBe("flashcard_set");
    expect(firstKindSlug('{"__kind":"not a slug!"}')).toBeNull();
    expect(firstKindSlug('{"__kind":"quiz"}')).toBe("quiz");
  });

  it("an escaped occurrence inside a string value is still not a key", () => {
    expect(hasKindKey('{"note":"x \\"\\u005f_kind\\": y"')).toBe(false);
  });
});
