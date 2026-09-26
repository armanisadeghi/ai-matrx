/**
 * A reasoning aside inside a sentence renders as an italic aside: its words
 * stay, its tags never show (RC-B3r R2 — /chat dropped the words, then printed
 * the raw tags).
 */
import { preprocessProse } from "@/components/rich-content/prose/prose-prepare";

describe("inline reasoning aside (RC-B3r R2)", () => {
  it("keeps the words, drops the tags", () => {
    const out = preprocessProse("The planner writes a <thinking> short scratch note </thinking> and then answers.");
    expect(out).toBe("The planner writes a <i>short scratch note</i> and then answers.");
  });
  it("leaves a code span that mentions the tags alone", () => {
    const out = preprocessProse("Search for `<thinking> x </thinking>` in the log.");
    expect(out).toContain("`<thinking> x </thinking>`");
  });
});

describe("front matter behind a byte-order mark (RC-B3r round 3, C1)", () => {
  it("is passed through as front matter, without the mark", () => {
    const out = preprocessProse("\uFEFF---\nnote: <artifact> x\n---\n\nBody.");
    expect(out.startsWith("---\nnote: <artifact> x\n---\n")).toBe(true);
  });
});
