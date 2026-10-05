/**
 * Kind never raw: the cleaned-transcript field SHOWS a kind answer as its
 * readable markdown. What is persisted/applied (the answer text itself) is not
 * this function's business and stays the data. A person's edit always wins.
 */
import { cleanedResponseShown } from "../cleaned-response-shown";

const KIND = JSON.stringify({ __kind: "checklist", title: "Packing", items: [{ text: "Passport" }] });

describe("cleanedResponseShown", () => {
  it("a settled kind answer shows as markdown, never __kind JSON", () => {
    const shown = cleanedResponseShown(null, KIND, false);
    expect(shown).not.toContain("__kind");
    expect(shown).toContain("Passport");
  });
  it("a kind still arriving shows no half-arrived JSON", () => {
    expect(cleanedResponseShown(null, '{"__kind":"checklist","title":"Pa', true)).not.toContain("__kind");
  });
  it("plain cleaned text is byte for byte", () => {
    expect(cleanedResponseShown(null, "Hello there.", false)).toBe("Hello there.");
  });
  it("the person's edit wins", () => {
    expect(cleanedResponseShown("my edit", KIND, false)).toBe("my edit");
  });
});
