// verify-1 (2026-09-28): citations showed "chunk 199f610f-…", a bare "22" and
// "Open web source" on a note. What a person reads is plain words.
import { openSourceLabel, plainGroundedIn, plainLocator } from "../plainWords";

describe("citation plain words", () => {
  it("drops chunk ids from Grounded in", () => {
    expect(
      plainGroundedIn("Big Idea 1: Evolution, chunk 199f610f-c4d4-4cfa-8d3b-e68e64c602eb"),
    ).toBe("Big Idea 1: Evolution");
    expect(plainGroundedIn("active transport, chunk 9449c7d0-3313-4a2c-8d2f-37c209df11d2:2")).toBe(
      "active transport",
    );
    expect(plainGroundedIn("the passage (chunk 1_3)")).toBe("the passage");
    expect(plainGroundedIn("chunk 199f610f-c4d4-4cfa-8d3b-e68e64c602eb")).toBeUndefined();
    expect(plainGroundedIn("Chapter 2: Cells")).toBe("Chapter 2: Cells");
  });

  it("says Page for a page locator", () => {
    expect(plainLocator("22")).toBe("Page 22");
    expect(plainLocator("p. 22-24")).toBe("Pages 22–24");
    expect(plainLocator("chunk 199f610f-c4d4-4cfa-8d3b-e68e64c602eb (page 4)")).toBe("Page 4");
    expect(plainLocator("0:04–2:31")).toBe("0:04–2:31");
    expect(plainLocator("199f610f-c4d4-4cfa-8d3b-e68e64c602eb")).toBeUndefined();
  });

  it("calls an in-app note a source, not a web source", () => {
    expect(openSourceLabel("/notes/abc")).toBe("Open the source");
    expect(openSourceLabel("https://en.wikipedia.org/wiki/Osmosis")).toBe("Open the web page");
    expect(openSourceLabel(null)).toBe("Open the source");
  });
});
