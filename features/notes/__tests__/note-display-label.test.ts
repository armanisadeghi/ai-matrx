/**
 * FORCING FUNCTION: a note label that is the raw first line the old paste path
 * derived from the body ("# AP Chemistry Nomenclature") displays clean; a label
 * a person typed displays exactly as typed; nothing is written back.
 *
 * Use case: a chemistry teacher's pasted unit notes, and a dispatcher who
 * deliberately named a note "# Route board (draft)".
 */
import { noteDisplayLabel } from "@/features/notes/format";

describe("noteDisplayLabel", () => {
  it("cleans a label that equals the body's raw first line (list rows read the preview)", () => {
    const note = {
      label: "# AP Chemistry Nomenclature: Ionic Compounds",
      content_preview: "# AP Chemistry Nomenclature: Ionic Compounds\n\nCations are named first…",
    };
    expect(noteDisplayLabel(note)).toBe("AP Chemistry Nomenclature: Ionic Compounds");
    expect(note.label).toBe("# AP Chemistry Nomenclature: Ionic Compounds");
  });

  it("cleans the 60-character cut the paste path stored", () => {
    const first = "# Unit 4 — Reaction Types, Balancing Equations and Stoichiometry Practice";
    expect(noteDisplayLabel({ label: first.slice(0, 60), content: `${first}\n\nbody` })).toBe(
      "Unit 4 — Reaction Types, Balancing Equations and Stoichiom",
    );
  });

  it("leaves a typed label alone, even one that starts with #", () => {
    expect(
      noteDisplayLabel({ label: "# Route board (draft)", content: "North Industrial runs Tuesday." }),
    ).toBe("# Route board (draft)");
    expect(noteDisplayLabel({ label: "  ", content: "x" })).toBe("Untitled note");
  });
});
