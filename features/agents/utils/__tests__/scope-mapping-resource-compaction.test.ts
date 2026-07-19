import { mapScopeToInstanceWithSurface } from "../scope-mapping";

describe("resource-family scope compaction", () => {
  it("drops redundant full-document aliases when a file reference exists", () => {
    const result = mapScopeToInstanceWithSurface(
      {
        file_id: "11111111-1111-4111-8111-111111111111",
        processed_document_id: "22222222-2222-4222-8222-222222222222",
        full_document_text: "same body",
        active_scope_text: "same body",
        selection: "same body",
        content: "same body",
        scope_kind: "full",
      },
      null,
      null,
      [],
      [],
    );

    expect(result.contextEntries.map((entry) => entry.key)).toEqual([
      "file_id",
      "scope_kind",
    ]);
  });

  it("keeps explicitly mapped text and a non-full active slice", () => {
    const result = mapScopeToInstanceWithSurface(
      {
        file_id: "11111111-1111-4111-8111-111111111111",
        full_document_text: "full",
        active_scope_text: "selected",
        scope_kind: "selection",
      },
      { full_document_text: "document_body" },
      null,
      [],
      [],
    );

    expect(result.contextEntries).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ key: "document_body", value: "full" }),
        expect.objectContaining({ key: "active_scope_text", value: "selected" }),
      ]),
    );
  });
});
