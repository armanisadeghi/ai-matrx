/**
 * The row menu's delete ("..." and right-click) judges "empty, delete without
 * asking" on the BODY. A sidebar row carries only a preview, so for any note
 * not yet opened `ctx.content` is null — the menu used to read that as empty
 * and delete a note full of text without a confirmation (final review,
 * 2026-09-15, proved on both menus).
 */
const confirm = jest.fn();
const toastError = jest.fn();
const deleteNote = Object.assign(jest.fn((id: string) => ({ type: "notes/deleteNote", id })), {
  rejected: { match: () => false },
});
const ensureNoteBodiesLoaded = jest.fn();

jest.mock("@/components/dialogs/confirm/ConfirmDialogHost", () => ({ confirm: (...a: unknown[]) => confirm(...a) }));
jest.mock("@/lib/toast", () => ({ toast: { error: (...a: unknown[]) => toastError(...a), success: jest.fn() } }));
jest.mock("@/lib/redux/slices/overlaySlice", () => ({ openOverlay: jest.fn() }));
jest.mock("../../redux/thunks", () => ({
  // A getter, so the real thunk's shape survives (`deleteNote.rejected.match`).
  get deleteNote() {
    return deleteNote;
  },
  restoreNote: jest.fn(),
  moveNoteToFolder: jest.fn(),
  copyNote: jest.fn(),
  ensureNoteBodiesLoaded: (ids: string[]) => ensureNoteBodiesLoaded(ids),
}));

import { deleteNoteAction, type NoteMenuContext } from "./noteMenuRegistry";

function ctx(dispatch: jest.Mock): NoteMenuContext {
  return {
    instanceId: "i1",
    noteId: "n1",
    label: "Chemistry homework",
    content: null, // a preview-only sidebar row
    folder: null,
    allFolders: [],
    openKnowledge: jest.fn(),
    onCreateFolder: jest.fn(),
    dispatch: dispatch as never,
  };
}

describe("row menu delete", () => {
  beforeEach(() => {
    confirm.mockReset();
    toastError.mockReset();
    deleteNote.mockClear();
    ensureNoteBodiesLoaded.mockReset();
  });

  it("asks before deleting a note whose body has text, even when the row held only a preview", async () => {
    ensureNoteBodiesLoaded.mockReturnValue({ unwrap: async () => [{ id: "n1", content: "Balance the equation..." }] });
    confirm.mockResolvedValue(false);
    const dispatch = jest.fn((action: unknown) => action);
    await deleteNoteAction(ctx(dispatch));
    expect(confirm).toHaveBeenCalledTimes(1);
    expect(deleteNote).not.toHaveBeenCalled();
  });

  it("deletes a truly empty note without asking", async () => {
    ensureNoteBodiesLoaded.mockReturnValue({ unwrap: async () => [{ id: "n1", content: "" }] });
    const dispatch = jest.fn((action: unknown) => action);
    await deleteNoteAction(ctx(dispatch));
    expect(confirm).not.toHaveBeenCalled();
    expect(deleteNote).toHaveBeenCalledWith("n1");
  });

  it("says so and deletes nothing when the body cannot be loaded", async () => {
    ensureNoteBodiesLoaded.mockReturnValue({ unwrap: async () => { throw new Error("offline"); } });
    const dispatch = jest.fn((action: unknown) => action);
    await deleteNoteAction(ctx(dispatch));
    expect(toastError).toHaveBeenCalled();
    expect(deleteNote).not.toHaveBeenCalled();
    expect(confirm).not.toHaveBeenCalled();
  });
});
