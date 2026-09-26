/**
 * Seated walk #2 (07c–07h): Save with a Project and a Scope toasted "filed in
 * 1 place" while the person believed two were chosen — a count hides WHICH
 * place was filed, so a dropped one is invisible. The toast names every place
 * the Save sent, in the person's words.
 */
import { filedPlacesWords } from "@/features/sources/saveSourceLogic";

describe("filedPlacesWords", () => {
  it("names each place, never just a count", () => {
    expect(
      filedPlacesWords(
        [
          { token: "project", id: "p", label: "AI Advancements, June 2026" },
          { token: "scope", id: "s", label: "AI Matrx" },
        ],
        null,
      ),
    ).toBe("filed in AI Advancements, June 2026 and AI Matrx");
  });

  it("includes the Library and uses commas for three or more", () => {
    expect(
      filedPlacesWords(
        [
          { token: "project", id: "p", label: "Alpha" },
          { token: "task", id: "t", label: "Beta" },
        ],
        "Pages captured in your browser",
      ),
    ).toBe("filed in Alpha, Beta and the Library Pages captured in your browser");
  });

  it("says nothing when nothing was filed", () => {
    expect(filedPlacesWords([], null)).toBe("");
  });
});
