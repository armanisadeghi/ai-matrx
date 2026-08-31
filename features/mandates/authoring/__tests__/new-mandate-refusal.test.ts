/**
 * V2-4 — THE CREATION PAGE'S REFUSAL IS DERIVED, NOT REMEMBERED.
 *
 * The defect, walked on production 2026-08-31: press "Create mandate" on the
 * empty form and a red line appears under the key field — "Not yet — this
 * mandate still needs a name (the top field), the key, the goal." Fill in all
 * three and THE SENTENCE IS STILL THERE, unchanged, while the grey line beside
 * the button updates correctly. One form, two sentences about it, one false.
 *
 * Cause: the refusal was WRITTEN into `serverError` — the state that holds the
 * server's verbatim key refusal — and nothing ever cleared it. A fact that is
 * a pure function of three fields must never be stored, or it outlives its
 * condition. The button now carries the refusal itself (UI-STANDARD 14, the
 * shape `Apply` and `Set your own answer` already use), and `serverError`
 * holds only what a server said.
 *
 * The pure half is tested directly; the wiring half is read from the SOURCE,
 * because "the sentence is not stored" is a claim about the component's state
 * handling that no snapshot of one render can make.
 */
import { readFileSync } from "fs";
import { join } from "path";
import { missingCreationPieces } from "../NewMandatePage";

const PAGE = join(process.cwd(), "features/mandates/authoring/NewMandatePage.tsx");

describe("what the creation form is still missing", () => {
  it("names all three when the form is empty", () => {
    expect(
      missingCreationPieces({ label: "", mandateKey: "", goal: "" }),
    ).toEqual(["a name (the top field)", "the key", "the goal"]);
  });

  it("is EMPTY the moment the three pieces are supplied", () => {
    expect(
      missingCreationPieces({
        label: "Scratch job",
        mandateKey: "zzz.scratch_job",
        goal: "Do the thing well.",
      }),
    ).toEqual([]);
  });

  it("whitespace is not an answer", () => {
    expect(
      missingCreationPieces({
        label: "   ",
        mandateKey: "zzz.scratch_job",
        goal: "Do the thing well.",
      }),
    ).toEqual(["a name (the top field)"]);
  });
});

describe("the refusal cannot go stale", () => {
  const source = readFileSync(PAGE, "utf8");

  it("is reading the page it means to guard", () => {
    expect(source).toContain("Create mandate");
    expect(source).toContain("setServerError");
  });

  it("the missing-pieces sentence is never written into state", () => {
    // The exact regression: `setServerError(\`Not yet — this mandate still
    // needs ${missing.join(", ")}.\`)`.
    const stored = /setServerError\(\s*`?[^)]*still needs/.test(source);
    expect(stored).toBe(false);
  });

  it("the Create button is refused ON the control while pieces are missing", () => {
    expect(/disabled=\{[^}]*missing\.length > 0/.test(source)).toBe(true);
  });

  it("the server's own refusal is cleared when the fields it named change", () => {
    // Three fields, three clears, plus the reset inside the submit path.
    const clears = source.match(/setServerError\(null\)/g) ?? [];
    expect(clears.length).toBeGreaterThanOrEqual(4);
  });
});
