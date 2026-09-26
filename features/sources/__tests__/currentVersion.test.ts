import {
  versionsFromFacts,
  viewedDocumentId,
} from "@/features/sources/currentVersion";

describe("which version a Source screen shows (from source_list_facts)", () => {
  it("a head with a live edit shows the edit; the head is one switch away", () => {
    const v = versionsFromFacts({
      headDocumentId: "head",
      currentDocumentId: "edit",
    });
    expect(v).toEqual({ originalId: "head", currentId: "edit", edited: true });
    expect(viewedDocumentId(v, false)).toBe("edit");
    expect(viewedDocumentId(v, true)).toBe("head");
  });

  it("an unedited Source is its own current version, and the switch is inert", () => {
    const v = versionsFromFacts({
      headDocumentId: "a",
      currentDocumentId: "a",
    });
    expect(v.edited).toBe(false);
    expect(viewedDocumentId(v, true)).toBe("a");
  });
});
