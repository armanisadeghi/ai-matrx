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

  it("keeps explicitly mapped text — and only it (engineered inputs, W-31)", () => {
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

    expect(result.contextEntries).toEqual([
      expect.objectContaining({ key: "document_body", value: "full" }),
    ]);
  });

  it("keeps a non-full active slice for an unmapped run", () => {
    const result = mapScopeToInstanceWithSurface(
      {
        file_id: "11111111-1111-4111-8111-111111111111",
        full_document_text: "full",
        active_scope_text: "selected",
        scope_kind: "selection",
      },
      null,
      null,
      [],
      [],
    );

    expect(result.contextEntries.map((entry) => entry.key)).toEqual([
      "file_id",
      "active_scope_text",
      "scope_kind",
    ]);
  });

  it("keeps fallbacks for a malformed file id", () => {
    const result = mapScopeToInstanceWithSurface(
      { file_id: "not-a-file", full_document_text: "fallback" },
      null,
      null,
      [],
      [],
    );
    expect(result.contextEntries.map((entry) => entry.key)).toEqual([
      "file_id",
      "full_document_text",
    ]);
  });

  it("does not duplicate a file mapped into a media variable", () => {
    const result = mapScopeToInstanceWithSurface(
      { file_id: "11111111-1111-4111-8111-111111111111" },
      null,
      {
        pdf_file: { mapType: "surface_value", target: "file_id" },
      },
      [
        {
          name: "pdf_file",
          defaultValue: "",
          customComponent: { type: "document" },
        },
      ],
      [],
    );
    expect(result.variableValues.pdf_file).toBe(
      "11111111-1111-4111-8111-111111111111",
    );
    expect(result.contextEntries).toEqual([]);
  });

  it("keeps processed-document and text fallbacks for a known-missing source", () => {
    const result = mapScopeToInstanceWithSurface(
      {
        file_id: "",
        processed_document_id: "22222222-2222-4222-8222-222222222222",
        full_document_text: "fallback",
      },
      null,
      null,
      [],
      [],
    );
    expect(result.contextEntries.map((entry) => entry.key)).toEqual([
      "file_id",
      "processed_document_id",
      "full_document_text",
    ]);
  });
});
