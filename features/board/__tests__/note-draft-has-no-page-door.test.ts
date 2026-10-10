import { WORK_ITEMS } from "../items/work-items";
import { noteDraftSource, noteSource } from "../items/work-sources";

describe("note tile door", () => {
  const note = WORK_ITEMS.find((t) => t.key === "note")!;
  it("an unsaved draft offers no page link (its page would not exist)", () => {
    expect(note.href?.(noteDraftSource({ kind: "entity", entity: "note", id: null }, "draft-1"))).toBeNull();
  });
  it("a saved note opens its page", () => {
    expect(note.href?.(noteSource({ kind: "entity", entity: "note", id: null }, "n-1"))).toBe("/notes/n-1");
  });
});
