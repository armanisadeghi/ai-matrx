import { cleanSnippet } from "@/features/knowledge/hub/hubPresentation";
import { aroundMatch } from "@/features/knowledge/hub/components/HubResultRow";
import { snippetKindText } from "@/features/content-ir/surfaces/kind-snippet-text";

const COMPLETE = '{"__kind":"flashcard_set","title":"Cells","cards":[{"front":"a","back":"b"}]}';

describe("a search snippet never shows a kind as JSON", () => {
  it("replaces a complete kind with its one-line form, keeping the prose around it", () => {
    const out = cleanSnippet(`here is the <b>forklift</b> set ${COMPLETE} and then more`);
    expect(out).toBe("here is the forklift set Cells · Flashcard Set and then more");
    expect(out).not.toContain("__kind");
  });
  it("a fragment that ends inside the kind reads as the kind's name", () => {
    const out = cleanSnippet('study forklift {"__kind":"flashcard_set","title":"Cells","cards":[{"front":"a","b');
    expect(out).toBe("study forklift Flashcard Set");
  });
  it("a fragment that starts inside the kind drops the cut JSON up to its close", () => {
    const out = cleanSnippet('ront":"a","back":"b"}],"__kind":"flashcard_set","title":"Cells"} after forklift');
    expect(out).toBe("Flashcard Set after forklift");
    expect(out).not.toContain("__kind");
  });
  it("a kind inside a json fence", () => {
    const out = cleanSnippet("x ```json\n" + COMPLETE + "\n``` forklift");
    expect(out).not.toContain("__kind");
    expect(out).toContain("Flashcard Set");
    expect(out).toContain("forklift");
  });
  it("kindless JSON and plain prose are unchanged", () => {
    expect(cleanSnippet('x {"a":1,"b":[1,2]} y')).toBe('x {"a":1,"b":[1,2]} y');
    expect(snippetKindText('x {"a":1}')).toBe('x {"a":1}');
  });
  it("the searched word still lands on screen in the surrounding prose", () => {
    const text = cleanSnippet(`${"lorem ipsum dolor sit amet ".repeat(4)}${COMPLETE} the forklift passes inspection`);
    const shown = aroundMatch(text, "forklift");
    expect(shown).toContain("forklift");
    expect(shown).not.toContain("__kind");
  });
});
