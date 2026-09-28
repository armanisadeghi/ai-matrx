// Rows whose names differ only past the on-screen cut read the same, so they
// get the "Created …" note too (page-pass 2026-09-28, /education/flashcards).
import { lookalikeNotes } from "./lookalikes";

const base = "AP Chemistry Nomenclature: the Absolute Core - ";

describe("lookalikeNotes", () => {
  it("notes identical names", () => {
    const notes = lookalikeNotes([
      { id: "a", name: "Flashcards", createdAt: "2026-09-27T14:46:00Z" },
      { id: "b", name: "Flashcards", createdAt: "2026-09-28T12:51:00Z" },
      { id: "c", name: "Other", createdAt: "2026-09-28T12:51:00Z" },
    ]);
    expect([...notes.keys()].sort()).toEqual(["a", "b"]);
  });

  it("without visibleChars, names that differ past the cut are not twins", () => {
    const notes = lookalikeNotes([
      { id: "a", name: `${base}Ions`, createdAt: "2026-09-20T10:00:00Z" },
      { id: "b", name: `${base}Acids`, createdAt: "2026-09-21T10:00:00Z" },
    ]);
    expect(notes.size).toBe(0);
  });

  it("with visibleChars, names that read the same once cut get a note", () => {
    const notes = lookalikeNotes(
      [
        { id: "a", name: `${base}Ions`, createdAt: "2026-09-20T10:00:00Z" },
        { id: "b", name: `${base}Acids`, createdAt: "2026-09-21T10:00:00Z" },
        { id: "c", name: "AP Chemistry: Core", createdAt: "2026-09-21T10:00:00Z" },
      ],
      "Created",
      30,
    );
    expect([...notes.keys()].sort()).toEqual(["a", "b"]);
    expect(notes.get("a")).toMatch(/^Created /);
  });
});
