/** kindTextLabel — one readable line for a person; never a `__kind` key. */
import { kindTextLabel } from "../surfaces/kind-text-label";

const SET_JSON = JSON.stringify({
  __kind: "flashcard_set",
  title: "Cell biology",
  cards: [{ __kind: "flashcard", front: "Powerhouse?", back: "Mitochondria" }],
});

describe("kindTextLabel", () => {
  it("names a whole kind by its kind and title", () => {
    const label = kindTextLabel(SET_JSON);
    expect(label).toContain("Cell biology");
    expect(label).not.toContain("__kind");
    expect(label).not.toContain("{");
    expect(label).not.toContain("\n");
  });
  it("names a fenced kind the same way", () => {
    expect(kindTextLabel(`\`\`\`json\n${SET_JSON}\n\`\`\``)).toBe(kindTextLabel(SET_JSON));
  });
  it("keeps the prose line of prose with a kind in it", () => {
    const label = kindTextLabel(`Here are your cards:\n\n${SET_JSON}`);
    expect(label).toBe("Here are your cards:");
  });
  it("never prints the fragment of a cut-off kind", () => {
    const label = kindTextLabel(SET_JSON.slice(0, 40));
    expect(label).not.toContain("__kind");
    expect(label).not.toContain("{");
    expect(label.length).toBeGreaterThan(0);
  });
  it("leaves kindless text collapsed and clipped", () => {
    expect(kindTextLabel("a  b\n\nc")).toBe("a b c");
    expect(kindTextLabel("x".repeat(200), 20)).toHaveLength(20);
  });
  it("handles empty", () => {
    expect(kindTextLabel(null)).toBe("");
  });
});
