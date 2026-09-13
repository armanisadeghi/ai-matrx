import { emptyNoteReuseUpdates } from "./notesService";
import type { Note } from "../types";

const ORGANIZATION_ID = "11111111-1111-4111-8111-111111111112";
const FOLDER_ID = "22222222-2222-4222-8222-222222222222";
const targetFolder = { id: FOLDER_ID, name: "Draft" };

describe("emptyNoteReuseUpdates", () => {
  const existing = {
    id: "11111111-1111-4111-8111-111111111111",
    label: "New Note",
    folder_name: "Draft",
    folder_id: FOLDER_ID,
  } as Note;

  it("applies the explicit dialog name when reusing an empty note", () => {
    expect(
      emptyNoteReuseUpdates(existing, {
        label: "War-room incident note",
        folder_name: "Draft",
        organization_id: ORGANIZATION_ID,
      }, targetFolder),
    ).toEqual({ label: "War-room incident note" });
  });

  it("does not turn a default reuse into a redundant write", () => {
    expect(emptyNoteReuseUpdates(existing, { organization_id: ORGANIZATION_ID }, targetFolder)).toEqual({});
  });

  it("preserves explicit create metadata, ordering, visibility, and context links", () => {
    expect(emptyNoteReuseUpdates(existing, { organization_id: ORGANIZATION_ID, metadata: { source: "test" }, position: 4, visibility: "link", project_id: "22222222-2222-4222-8222-222222222222", task_id: "33333333-3333-4333-8333-333333333333" }, targetFolder)).toMatchObject({ metadata: { source: "test" }, position: 4, visibility: "link", project_id: "22222222-2222-4222-8222-222222222222", task_id: "33333333-3333-4333-8333-333333333333" });
  });

  it("updates reuse with the admitted folder identity and authoritative name", () => {
    expect(
      emptyNoteReuseUpdates(existing, { organization_id: ORGANIZATION_ID }, {
        id: "33333333-3333-4333-8333-333333333333",
        name: "Renamed",
      }),
    ).toEqual({
      folder_id: "33333333-3333-4333-8333-333333333333",
    });
  });
});
