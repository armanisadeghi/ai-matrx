import {
  resolveSourceVersions,
  viewedDocumentId,
} from "@/features/sources/currentVersion";

const capture = {
  id: "cap",
  canonical_clean_id: "edit",
  derivation_kind: "recapture",
  parent_processed_id: "older",
};

describe("which version a Source screen shows", () => {
  it("a capture with a live edit shows the edit; the original is one switch away", () => {
    const v = resolveSourceVersions(capture, true);
    expect(v).toEqual({ originalId: "cap", currentId: "edit", edited: true });
    expect(viewedDocumentId(v, false)).toBe("edit");
    expect(viewedDocumentId(v, true)).toBe("cap");
  });

  it("an edit that was trashed is not current", () => {
    expect(resolveSourceVersions(capture, false)).toEqual({
      originalId: "cap",
      currentId: "cap",
      edited: false,
    });
  });

  it("opening the edit itself resolves to the same pair", () => {
    expect(
      resolveSourceVersions(
        {
          id: "edit",
          canonical_clean_id: null,
          derivation_kind: "manual_curation",
          parent_processed_id: "cap",
        },
        false,
      ),
    ).toEqual({ originalId: "cap", currentId: "edit", edited: true });
  });

  it("an unedited Source is its own current version", () => {
    const v = resolveSourceVersions(
      {
        id: "a",
        canonical_clean_id: null,
        derivation_kind: "initial_extract",
        parent_processed_id: null,
      },
      false,
    );
    expect(viewedDocumentId(v, true)).toBe("a");
  });
});
