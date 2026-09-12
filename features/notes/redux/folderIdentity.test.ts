import { selectFolderReferences, selectNotesGroupedBy } from "./selectors";
import { moveNoteToFolder } from "./thunks";

const orgA = "11111111-1111-4111-8111-111111111111";
const orgB = "22222222-2222-4222-8222-222222222222";

function stateWithHomonyms() {
  return {
    notes: {
      notes: {
        a: { id: "a", label: "A", folder_name: "Research", folder_id: "folder-a", organization_id: orgA, tags: [], position: 0, deleted_at: null, _sharedWithMe: false },
        b: { id: "b", label: "B", folder_name: "Research", folder_id: "folder-b", organization_id: orgB, tags: [], position: 0, deleted_at: null, _sharedWithMe: false },
      },
    },
  };
}

describe("notes folder identity", () => {
  it("keeps same-name folders from different organizations as separate action targets", () => {
    const state = stateWithHomonyms() as never;
    expect(selectFolderReferences(state)).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: "folder-a", organizationId: orgA, name: "Research" }),
      expect.objectContaining({ id: "folder-b", organizationId: orgB, name: "Research" }),
    ]));
  });

  it("groups homonymous persisted folders separately", () => {
    const groups = selectNotesGroupedBy(stateWithHomonyms() as never).byFolder();
    expect(groups.size).toBe(2);
    expect([...groups.values()].map((notes) => notes[0].id).sort()).toEqual(["a", "b"]);
  });

  it("refuses a same-name folder from another organization before any move write", async () => {
    const dispatch = jest.fn();
    const state = {
      ...stateWithHomonyms(),
      userAuth: { id: "user-1" },
    } as never;

    const action = await moveNoteToFolder({
      noteId: "a",
      folder: "Research",
      folderId: "folder-b",
      organizationId: orgB,
    })(dispatch, () => state, undefined);

    if (!moveNoteToFolder.rejected.match(action)) {
      throw new Error("Expected the cross-organization move to be rejected.");
    }
    expect(action.meta.requestStatus).toBe("rejected");
    expect(action.error.message).toBe(
      "A note can only move to a folder in its own organization.",
    );
    expect(dispatch.mock.calls.map(([dispatched]) => dispatched.type)).toEqual([
      "notes/moveNoteToFolder/pending",
      "notes/moveNoteToFolder/rejected",
    ]);
  });
});
