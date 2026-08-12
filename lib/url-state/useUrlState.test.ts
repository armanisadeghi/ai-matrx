/** @jest-environment jsdom */

import {
  booleanUrlCodec,
  commitUrlParams,
  enumUrlCodec,
  jsonUrlCodec,
  positiveIntegerUrlCodec,
  stringUrlCodec,
} from "./useUrlState";

describe("URL state codecs", () => {
  it("omits defaults and rejects invalid enum/integer values", () => {
    expect(stringUrlCodec().serialize("")).toBeNull();
    expect(booleanUrlCodec(false).serialize(true)).toBe("1");
    expect(enumUrlCodec(["a", "b"] as const, "a").parse("nope")).toBe("a");
    expect(positiveIntegerUrlCodec(25).parse("-4")).toBe(25);
  });

  it("round-trips validated JSON and falls back loudly-safe on malformed input", () => {
    const codec = jsonUrlCodec<{ tags: string[] }>(
      { tags: [] },
      (value): value is { tags: string[] } =>
        Boolean(value) &&
        typeof value === "object" &&
        !Array.isArray(value) &&
        Array.isArray((value as { tags?: unknown }).tags),
    );
    expect(codec.parse('{"tags":["one"]}')).toEqual({ tags: ["one"] });
    expect(codec.parse("not-json")).toEqual({ tags: [] });
  });
});

describe("commitUrlParams", () => {
  it("preserves unrelated params and creates a Back/Forward-restorable entry", () => {
    window.history.replaceState({}, "", "/database?keep=1");
    commitUrlParams({ q: "users", sort: "name.asc" }, "push");
    expect(window.location.search).toBe("?keep=1&q=users&sort=name.asc");

    commitUrlParams({ q: null }, "replace");
    expect(window.location.search).toBe("?keep=1&sort=name.asc");
  });
});
