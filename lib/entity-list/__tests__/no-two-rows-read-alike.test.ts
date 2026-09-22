/**
 * NO TWO ROWS IN A LIST ARE INDISTINGUISHABLE — a forcing function.
 *
 * Cold walk 21 (jobs-bar-2026-09-16, defect D): `/masterwork/all` showed three
 * rows all reading `walk21-Repaint or Recoat Verdict` and nothing on any of
 * them said which was which. Duplicate names are ALLOWED — Notion and Linear
 * both allow them and the create door reports `name_already_in_use` rather
 * than refusing — so the list has to do the telling apart.
 *
 * These cases are written against the real facts a Rulebook carries. Proven
 * failing before `lookalikeNotes` existed (the module did not resolve).
 */
import { lookalikeNotes } from "../lookalikes";

const JAN_3 = "2026-01-03T17:04:00.000Z";
const JAN_9 = "2026-01-09T17:04:00.000Z";

describe("lookalikeNotes", () => {
  it("says nothing about rows whose names are already unique", () => {
    const notes = lookalikeNotes([
      { id: "a", name: "Repaint or Recoat Verdict", createdAt: JAN_3 },
      { id: "b", name: "Stucco Intake Method", createdAt: JAN_9 },
    ]);
    expect(notes.size).toBe(0);
  });

  it("THE WALK'S OWN SHAPE: three rows with one name all get told apart", () => {
    const notes = lookalikeNotes(
      [
        { id: "a", name: "walk21-Repaint or Recoat Verdict", createdAt: JAN_3 },
        { id: "b", name: "walk21-Repaint or Recoat Verdict", createdAt: JAN_9 },
        {
          id: "c",
          name: "walk21-Repaint or Recoat Verdict",
          createdAt: "2026-02-14T09:00:00.000Z",
        },
      ],
      "Started",
    );
    expect(notes.size).toBe(3);
    const said = [notes.get("a"), notes.get("b"), notes.get("c")];
    // Every row says something, and no two rows say the same thing — which is
    // the whole promise of this module.
    expect(said.every((note) => typeof note === "string" && note.length > 0))
      .toBe(true);
    expect(new Set(said).size).toBe(3);
    expect(notes.get("a")).toContain("Started");
  });

  it("escalates to the minute when twins were made on one day", () => {
    const notes = lookalikeNotes([
      { id: "a", name: "Zone Failure Verdict", createdAt: JAN_3 },
      { id: "b", name: "Zone Failure Verdict", createdAt: JAN_3.replace("17:04", "19:41") },
    ]);
    expect(new Set([notes.get("a"), notes.get("b")]).size).toBe(2);
    // Two rows one day apart would have read the same as dates alone.
    expect(notes.get("a")).toMatch(/\bat\b/);
    expect(notes.get("b")).toMatch(/\bat\b/);
  });

  it("adds the extra detail only when it separates every twin", () => {
    const separating = lookalikeNotes([
      {
        id: "a",
        name: "Repaint Verdict",
        createdAt: JAN_3,
        detail: "1 interview · 5 documents",
      },
      { id: "b", name: "Repaint Verdict", createdAt: JAN_9, detail: "2 books" },
    ]);
    expect(separating.get("a")).toContain("1 interview · 5 documents");
    expect(separating.get("b")).toContain("2 books");

    const notSeparating = lookalikeNotes([
      { id: "a", name: "Repaint Verdict", createdAt: JAN_3, detail: "2 books" },
      { id: "b", name: "Repaint Verdict", createdAt: JAN_9, detail: "2 books" },
    ]);
    expect(notSeparating.get("a")).not.toContain("2 books");
    expect(notSeparating.get("b")).not.toContain("2 books");
  });

  it("reads case and spacing the way a person does", () => {
    const notes = lookalikeNotes([
      { id: "a", name: "Repaint  Verdict", createdAt: JAN_3 },
      { id: "b", name: "repaint verdict", createdAt: JAN_9 },
    ]);
    expect(notes.size).toBe(2);
  });

  it("invents nothing when a twin carries no distinguishing fact", () => {
    const notes = lookalikeNotes([
      { id: "a", name: "Repaint Verdict" },
      { id: "b", name: "Repaint Verdict" },
    ]);
    // A list that cannot tell two rows apart must not pretend it can.
    expect(notes.size).toBe(0);
  });
});
