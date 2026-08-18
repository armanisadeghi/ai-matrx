import { serializeGroundedPassages } from "./grounding";

describe("serializeGroundedPassages", () => {
  test("preserves the durable citation coordinates in stable markers", () => {
    const serialized = serializeGroundedPassages([
      {
        chunkId: "chunk-14",
        text: "A verbatim passage from the uploaded PDF.",
        title: "Course guide",
        sourceKind: "cld_file",
        sourceId: "file-1",
        fileId: "file-1",
        documentId: "document-1",
        page: 14,
        locator: "p. 14",
        score: 0.91,
      },
    ]);

    expect(serialized).toContain('chunk_id="chunk-14"');
    expect(serialized).toContain('document_id="document-1"');
    expect(serialized).toContain('file_id="file-1"');
    expect(serialized).toContain('page="14"');
    expect(serialized).toContain("A verbatim passage from the uploaded PDF.");
  });
});
