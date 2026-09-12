import { selectFolderReferences, selectNotesGroupedBy } from "./selectors";

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
});
