/**
 * THE PHANTOM CONFLICT on the RichDocument save-back path (review, 2026-09-13):
 * the adapter sent `expectedVersion` with no edit base, so a bookkeeping-only
 * version bump between prepare and save threw NoteUpdateConflictError and the
 * editor toasted "This note changed elsewhere" on every retry.
 */
const persistNoteUpdate = jest.fn();
jest.mock("@/features/notes/service/notesService", () => ({ persistNoteUpdate }));

import { noteAdapter } from "./note";

describe("noteAdapter.edit", () => {
  it("passes the acknowledged edit base so the service can rebase a phantom CAS miss", async () => {
    persistNoteUpdate.mockResolvedValue({ databaseWrite: "saved" });
    const NOTE = "11111111-1111-4111-8111-111111111111";
    const ORG = "22222222-2222-4222-8222-222222222222";
    const USER = "33333333-3333-4333-8333-333333333333";
    const snapshot = {
      id: NOTE, organization_id: ORG, version: 4, content: "base", label: "L",
      folder_name: "Draft", folder_id: "f1", tags: ["a"], metadata: {}, visibility: "personal",
      position: 0, project_id: null, task_id: null,
    };
    const source = {
      type: "note", mode: "editable", noteId: NOTE, sourceId: "source-1", snapshotId: "snapshot-1",
      editBase: { noteId: NOTE, version: 4, organizationId: ORG, actorId: USER },
      acknowledgedPhysicalSnapshot: snapshot, displayedPhysicalSnapshot: snapshot,
    };
    await noteAdapter.edit({ newContent: "edited", source } as never);
    expect(persistNoteUpdate).toHaveBeenCalledWith(NOTE, { content: "edited" }, expect.objectContaining({
      expectedVersion: 4,
      acknowledgedBase: { content: "base", label: "L", folder_id: "f1", folder_name: "Draft", tags: ["a"], visibility: "personal" },
    }));
  });
});
