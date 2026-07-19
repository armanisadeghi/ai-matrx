import { withSurfaceDocumentEvidence } from "../document-evidence";

const DOCUMENT_ID = "660e8400-e29b-41d4-a716-446655440000";
const FILE_ID = "550e8400-e29b-41d4-a716-446655440000";

describe("withSurfaceDocumentEvidence", () => {
  it("uses a canonical file reference without duplicating a processed source", () => {
    const input = {
      file_id: FILE_ID,
      processed_document_id: DOCUMENT_ID,
    };

    expect(withSurfaceDocumentEvidence("matrx-user/pdf-extractor", input)).toBe(
      input,
    );
  });

  it("injects the canonical lazy processed-document source", () => {
    const scope = withSurfaceDocumentEvidence("matrx-user/pdf-extractor", {
      processed_document_id: DOCUMENT_ID,
      filename: "evidence.pdf",
      context: { existing: "kept" },
    });

    expect(scope.context).toEqual({
      existing: "kept",
      [`attached_document_${DOCUMENT_ID}`]: {
        source: {
          kind: "processed_document",
          id: DOCUMENT_ID,
          extra: {
            attached_as: "surface",
            surface_name: "matrx-user/pdf-extractor",
          },
        },
        type: "json",
        label: "evidence.pdf",
        description:
          "Document Evidence System source supplied by the active surface.",
      },
    });
  });

  it("inherits the PDF evidence contract on child surfaces", () => {
    const scope = withSurfaceDocumentEvidence("matrx-user/extractor-chunker", {
      processed_document_id: DOCUMENT_ID,
    });

    expect(scope.context).toHaveProperty(`attached_document_${DOCUMENT_ID}`);
  });

  it("leaves the scope unchanged until the document id is available", () => {
    const input = { filename: "still-loading.pdf" };

    expect(withSurfaceDocumentEvidence("matrx-user/pdf-extractor", input)).toBe(
      input,
    );
  });
});
