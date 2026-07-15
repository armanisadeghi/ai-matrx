import {
  allRagAiCopyOptions,
  buildRagAiPayload,
  createRagAiCopyBundle,
  identifiersOnlyRagAiCopyOptions,
  withRagAiSections,
} from "@/features/rag/components/search/ragAiCopy";
import type { RagHitView } from "@/features/rag/components/hit-card/types";

const VIEW: RagHitView = {
  sourceKind: "cld_file",
  sourceId: "e9868104-e276-4cdb-97a4-b948a13eb135",
  chunkId: "5797e82e-e2a9-418b-84b8-5b4cfd6dbe1c",
  fieldId: null,
  parentChunkId: null,
  chunkKind: "chunked_coarse",
  title: "AMAGuides5thv2.pdf",
  pageNumber: 393,
  pageNumbers: [393],
  score: 0.814997,
  snippet: "Retrieved passage content",
  vectorRank: 4,
  lexicalRank: 2,
  rerankScore: 0.814997,
  entityRank: null,
  entities: [],
  metadata: {
    role: "multigranularity",
    source: { file_name: "AMAGuides5thv2.pdf", page_count: 618 },
  },
  libraryShortCode: null,
};

describe("RAG Copy for AI payload", () => {
  it("always preserves true source and retrieval identifiers", () => {
    const bundle = createRagAiCopyBundle(
      VIEW,
      "AMAGuides5thv2.pdf",
      "File",
      "/files/f/e9868104",
    );
    const payload = buildRagAiPayload(
      bundle,
      identifiersOnlyRagAiCopyOptions(),
    );

    expect(payload.context).toMatchObject({
      source_id: VIEW.sourceId,
      file_id: VIEW.sourceId,
      chunk_id: VIEW.chunkId,
    });
    expect(payload.data).toMatchObject({
      source: {
        id: VIEW.sourceId,
        name: "AMAGuides5thv2.pdf",
        file_id: VIEW.sourceId,
      },
      retrieval: { chunk_id: VIEW.chunkId, page_number: 393 },
    });
    expect(payload.data).not.toHaveProperty("content");
  });

  it("includes selected structured sections and labels honest truncation", () => {
    const base = createRagAiCopyBundle(
      VIEW,
      "AMAGuides5thv2.pdf",
      "File",
      "/files/f/e9868104",
    );
    const bundle = withRagAiSections(base, [
      {
        key: "tables",
        label: "Tables",
        description: "Visible table rows",
        humanText: "A\tB\n1\t2",
        data: { rows: [{ cells: ["a very long cell", "2"] }] },
        count: 1,
        total: 7,
      },
    ]);
    const options = allRagAiCopyOptions(bundle);
    options.maxTextChars = 5;
    options.maxItems = 1;
    const payload = buildRagAiPayload(bundle, options);
    const serialized = JSON.stringify(payload.data);

    expect(serialized).toContain("tables");
    expect(serialized).toContain("chars omitted");
    expect(payload.attributes).toMatchObject({ included_sections: 2 });
  });
});
