import {
  parseGroundedPassageCitations,
  serializeGroundedPassages,
} from "./grounding";
import {
  parseTutorCitationPointer,
  tutorCitationPointers,
} from "@/features/education/tutor/grounding";

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

  test("recovers persisted citation coordinates without rerunning retrieval", () => {
    const serialized = serializeGroundedPassages([
      {
        chunkId: "chunk-14",
        text: "Railways improved trade & helped cities grow.",
        title: 'AP World "Guide"',
        sourceKind: "cld_file",
        sourceId: "file-1",
        fileId: "file-1",
        documentId: "document-1",
        page: 14,
        locator: "p. 14",
        score: 0.91,
      },
    ]);

    expect(parseGroundedPassageCitations(serialized)).toEqual([
      {
        sourceId: "chunk-14",
        sourceKind: "chunk",
        title: 'AP World "Guide"',
        excerpt: "Railways improved trade & helped cities grow.",
        locator: "p. 14",
        fileId: "file-1",
        documentId: "document-1",
        page: 14,
      },
    ]);
  });

  test("persists compact citation coordinates beside deferred evidence", () => {
    const pointers = tutorCitationPointers({
      status: "retrieved",
      passages: [
        {
          chunkId: "chunk-14",
          text: "evidence",
          title: "AP World guide",
          sourceKind: "cld_file",
          sourceId: "file-1",
          fileId: "file-1",
          documentId: "document-1",
          page: 14,
          locator: "p. 14",
          score: 0.9,
        },
      ],
      trust: {
        citations: [],
        confidence: "inferred",
        groundedIn: "uploaded material",
      },
    });

    const [pointer] = pointers;
    expect(pointers).toHaveLength(4);
    expect(pointer.value.length).toBeLessThan(200);
    expect(parseTutorCitationPointer(pointer.value)).toEqual({
      sourceId: "chunk-14",
      sourceKind: "chunk",
      title: "AP World guide",
      locator: "p. 14",
      fileId: "file-1",
      documentId: "document-1",
      page: 14,
    });
  });

  test("overwrites every citation slot when a later turn has fewer or zero passages", () => {
    const fourPassages = Array.from({ length: 4 }, (_, index) => ({
      chunkId: `chunk-${index + 1}`,
      text: `evidence ${index + 1}`,
      title: `Source ${index + 1}`,
      sourceKind: "cld_file",
      sourceId: "file-1",
      fileId: "file-1",
      documentId: "document-1",
      page: index + 1,
      locator: `p. ${index + 1}`,
      score: 0.9,
    }));
    const trust = {
      citations: [],
      confidence: "inferred" as const,
      groundedIn: "uploaded material",
    };
    const context = new Map(
      tutorCitationPointers({
        status: "retrieved",
        passages: fourPassages,
        trust,
      }).map(({ key, value }) => [key, value]),
    );

    for (const pointer of tutorCitationPointers({
      status: "retrieved",
      passages: [fourPassages[0]],
      trust,
    })) {
      context.set(pointer.key, pointer.value);
    }
    expect(
      [...context.values()].map(parseTutorCitationPointer).filter(Boolean),
    ).toHaveLength(1);

    for (const pointer of tutorCitationPointers({
      status: "empty",
      passages: [],
      trust,
    })) {
      context.set(pointer.key, pointer.value);
    }
    expect(
      [...context.values()].map(parseTutorCitationPointer).filter(Boolean),
    ).toHaveLength(0);
  });
});
