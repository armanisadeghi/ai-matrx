import { emptyNoteReuseUpdates } from "./notesService";
import type { Note } from "../types";

describe("emptyNoteReuseUpdates", () => {
  const existing = {
    id: "11111111-1111-4111-8111-111111111111",
    label: "New Note",
    folder_name: "Draft",
  } as Note;

  it("applies the explicit dialog name when reusing an empty note", () => {
    expect(
      emptyNoteReuseUpdates(existing, {
        label: "War-room incident note",
        folder_name: "Draft",
      }),
    ).toEqual({ label: "War-room incident note" });
  });

  it("does not turn a default reuse into a redundant write", () => {
    expect(emptyNoteReuseUpdates(existing, {})).toEqual({});
  });
});
