import {
  parseCreateEducationNotes,
  parseDeleteEducationNotes,
  parseUpdateEducationNotes,
} from "./educationNoteAgentWrites";

const OWNED = [
  {
    id: "note-1",
    title: "Cell biology",
    tags: ["biology"],
    organization_id: "org-1",
    version: 4,
  },
];

describe("Education note agent writes", () => {
  it("accepts a canonical Education-note creation shape", () => {
    expect(
      parseCreateEducationNotes([
        { title: "Lecture notes", content: "## Cells", tags: ["biology"] },
      ]),
    ).toEqual([
      { title: "Lecture notes", content: "## Cells", tags: ["biology"] },
    ]);
  });

  it("requires a loaded owned id and matching version for update", () => {
    expect(
      parseUpdateEducationNotes(
        [{ id: "note-1", expected_version: 4, title: "Cells" }],
        OWNED,
      )[0],
    ).toMatchObject({
      id: "note-1",
      title: "Cells",
      expectedVersion: 4,
      organizationId: "org-1",
      changed: ["title"],
    });
    expect(() =>
      parseUpdateEducationNotes(
        [{ id: "note-1", expected_version: 3, title: "Cells" }],
        OWNED,
      ),
    ).toThrow("does not match the loaded version");
  });

  it("requires a loaded owned id and matching version for Trash", () => {
    expect(
      parseDeleteEducationNotes(
        [{ id: "note-1", expected_version: 4 }],
        OWNED,
      )[0],
    ).toMatchObject({ id: "note-1", expectedVersion: 4 });
    expect(() =>
      parseDeleteEducationNotes(
        [{ id: "someone-else", expected_version: 4 }],
        OWNED,
      ),
    ).toThrow("not one of the loaded Education notes you own");
  });
});
