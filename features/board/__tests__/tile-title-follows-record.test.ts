/**
 * A tile's title follows its record's CURRENT name (renamed by an agent or on the
 * record's own page): deck and study kit joined note, task, project, scope and table.
 * Each record body must feed the record's name through `titleToAdopt`.
 */
import { readFileSync } from "fs";
import { join } from "path";
import { titleToAdopt } from "../items/feature-items.logic";

const read = (rel: string) => readFileSync(join(__dirname, "..", rel), "utf8");

describe("a record tile follows the record's name", () => {
  it("adopts a renamed deck's name and ignores blanks", () => {
    expect(titleToAdopt("Spanish verbs", "Spanish verbs, unit 2")).toBe("Spanish verbs, unit 2");
    expect(titleToAdopt("Spanish verbs", "   ")).toBeNull();
    expect(titleToAdopt("Spanish verbs", "Spanish verbs")).toBeNull();
  });

  it("the deck body hears the deck's name from the page's own store read", () => {
    const edu = read("items/education-items.tsx");
    expect(edu).toMatch(/<SetDetailView[^>]*onNameKnown=\{follow\}/);
    expect(read("../flashcards/components/set-detail/SetDetailView.tsx")).toMatch(/onNameKnown\?\.\(currentName\)|onNameKnown\?\.\(/);
  });

  it("the study kit body hears the kit's title from its hub header slot", () => {
    const edu = read("items/education-items.tsx");
    expect(edu).toMatch(/renderHeader=\{\(\{ title \}\) => <FollowKitTitle/);
    expect(edu).not.toMatch(/renderHeader=\{\(\) => null\}/);
  });

  it("scope and picklist (table) bodies already adopt", () => {
    expect(read("items/scope-items.tsx")).toMatch(/titleToAdopt\(title, scope\?\.name\)/);
    expect(read("items/data-items.tsx")).toMatch(/titleToAdopt\(title, table\.data\?\.name\)/);
  });
});
