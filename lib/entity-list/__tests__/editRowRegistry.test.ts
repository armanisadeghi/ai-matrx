import { EditRowRegistry } from "../editRowRegistry";

describe("EditRowRegistry", () => {
  it("retains an edited row when a refreshed server page no longer contains it", () => {
    const registry = new EditRowRegistry<{ id: string; kind: string }>();
    registry.remember([{ id: "edited", kind: "transcript" }], (row) => row.id);
    registry.remember([{ id: "new-page", kind: "session" }], (row) => row.id);

    expect(registry.get("edited")).toEqual({ id: "edited", kind: "transcript" });
  });

  it("uses the newest snapshot for a row", () => {
    const registry = new EditRowRegistry<{ id: string; title: string }>();
    registry.remember([{ id: "row", title: "Before" }], (row) => row.id);
    registry.remember([{ id: "row", title: "After" }], (row) => row.id);

    expect(registry.get("row")?.title).toBe("After");
  });
});
