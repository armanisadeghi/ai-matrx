/**
 * D15 — the Outputs Studio's structured-generator coercers, previously inline
 * in JSX with zero tests. Guards the two live contracts (deck must carry
 * non-empty `slides`; SEO must carry a string `title`) and the loud,
 * shape-specific failure messages.
 */
import {
  coercePresentationDeck,
  coerceSeoPackage,
  extractMarkdownTitle,
} from "./parsers";

describe("coercePresentationDeck", () => {
  it("passes a real deck envelope through untouched", () => {
    const deck = {
      __kind: "presentation_deck",
      title: "Cold Brew 2026",
      slides: [{ __kind: "presentation_slide", type: "intro" }],
    };
    expect(coercePresentationDeck(deck)).toBe(deck);
  });

  it("rejects a deck with no slides, naming the keys it saw", () => {
    expect(() =>
      coercePresentationDeck({ title: "Empty", slides: [] }),
    ).toThrow(/isn't a deck \(keys: title, slides\)/);
  });

  it("rejects a missing slides array", () => {
    expect(() => coercePresentationDeck({ title: "No slides" })).toThrow(
      /isn't a deck/,
    );
  });

  it("rejects non-objects, naming the type", () => {
    expect(() => coercePresentationDeck(null)).toThrow(/type: object/);
    expect(() => coercePresentationDeck("markdown")).toThrow(/type: string/);
  });
});

describe("coerceSeoPackage", () => {
  it("passes a package with a string title through untouched", () => {
    const seo = { __kind: "seo_package", title: "T", slug: "t" };
    expect(coerceSeoPackage(seo)).toBe(seo);
  });

  it("rejects a package without a title", () => {
    expect(() => coerceSeoPackage({ slug: "t" })).toThrow(
      /didn't return a valid package/,
    );
  });

  it("rejects non-objects and null", () => {
    expect(() => coerceSeoPackage(null)).toThrow(/valid package/);
    expect(() => coerceSeoPackage("title")).toThrow(/valid package/);
  });
});

describe("extractMarkdownTitle", () => {
  it("finds the first H1 anywhere in the doc", () => {
    expect(extractMarkdownTitle("intro\n\n# The Title\n\nbody")).toBe(
      "The Title",
    );
  });

  it("ignores deeper headings and returns null without an H1", () => {
    expect(extractMarkdownTitle("## Only H2\ntext")).toBeNull();
  });
});
