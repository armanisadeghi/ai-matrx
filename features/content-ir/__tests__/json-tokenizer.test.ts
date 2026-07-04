import { JsonStreamTokenizer, type JsonToken } from "../core/json-tokenizer";
import { chunkText } from "./seeded-random";
import {
  FLASHCARD_SET_JSON,
  FLASHCARD_SET_WITH_EXTRAS_JSON,
} from "./fixtures/flashcards-fixture";

function tokenizeWhole(input: string): JsonToken[] {
  const tokens: JsonToken[] = [];
  const tokenizer = new JsonStreamTokenizer((t) => tokens.push(t));
  tokenizer.push(input);
  tokenizer.end();
  return tokens;
}

function tokenizeChunked(input: string, seed: number): JsonToken[] {
  const tokens: JsonToken[] = [];
  const tokenizer = new JsonStreamTokenizer((t) => tokens.push(t));
  for (const chunk of chunkText(input, seed)) {
    tokenizer.push(chunk);
  }
  tokenizer.end();
  return tokens;
}

const TRICKY_JSON = JSON.stringify({
  __kind: "edge_cases",
  quoted: 'she said "hi" and left',
  escaped: "line1\nline2\ttabbed \\ backslash",
  unicode: "café — résumé 😀",
  negative: -42.75,
  exponent: 6.022e23,
  flag: true,
  nothing: null,
  emptyString: "",
  emptyArray: [],
  emptyObject: {},
  deep: { a: [{ b: [1, 2, { c: "d" }] }] },
});

describe("JsonStreamTokenizer chunk-boundary invariance", () => {
  const fixtures: Array<[string, string]> = [
    ["flashcard set", FLASHCARD_SET_JSON],
    ["set with extras", FLASHCARD_SET_WITH_EXTRAS_JSON],
    ["tricky escapes/unicode/numbers", TRICKY_JSON],
  ];

  it.each(fixtures)(
    "%s: chunked tokens === whole tokens across 25 seeds",
    (_label, input) => {
      const whole = tokenizeWhole(input);
      expect(whole.length).toBeGreaterThan(0);

      for (let seed = 1; seed <= 25; seed++) {
        expect(tokenizeChunked(input, seed)).toEqual(whole);
      }
    },
  );

  it("survives a chunk boundary inside a \\uXXXX escape", () => {
    const input = '{"k":"a\\u00e9b"}';
    // Force the split mid-escape: '...\\u00' | 'e9b"}'
    const tokens: JsonToken[] = [];
    const tokenizer = new JsonStreamTokenizer((t) => tokens.push(t));
    tokenizer.push(input.slice(0, 11));
    tokenizer.push(input.slice(11));
    tokenizer.end();

    const stringTokens = tokens.filter((t) => t.type === "string");
    expect(stringTokens.map((t) => t.value)).toEqual(["k", "aéb"]);
  });

  it("throws on truncated stream (mid-string)", () => {
    const tokenizer = new JsonStreamTokenizer(() => {});
    tokenizer.push('{"k":"unfinished');
    expect(() => tokenizer.end()).toThrow(/Stream ended/);
  });
});
