import type { RagSearchHit } from "@/features/rag/api/search";
import {
  canonicalSourceNameForHit,
  hitViewFromSearchHit,
  normalizeSourceName,
} from "@/features/rag/components/hit-card/adapters";
import { factsOnlyMetadata } from "@/features/rag/components/hit-card/copyMetadata";

const SOURCE_ID = "e9868104-1234-4123-8123-123456789abc";

function hit(
  chunkId: string,
  metadata: Record<string, unknown> = {},
): RagSearchHit {
  return {
    chunk_id: chunkId,
    source_kind: "cld_file",
    source_id: SOURCE_ID,
    field_id: null,
    parent_chunk_id: null,
    chunk_kind: "page",
    snippet: "Content is present only to satisfy the API shape.",
    score: 0.9,
    vector_rank: 1,
    lexical_rank: null,
    rerank_score: null,
    entity_rank: null,
    entities: [],
    metadata,
  };
}

describe("RAG hit identity", () => {
  it("hydrates every hit with a real filename carried by a sibling hit", () => {
    const unnamed = hit("chunk-1", { page_number: 393 });
    const named = hit("chunk-2", {
      page_number: 394,
      source: { file_name: "AMAGuides5thv2.pdf" },
    });

    expect(canonicalSourceNameForHit(unnamed, [unnamed, named])).toBe(
      "AMAGuides5thv2.pdf",
    );
  });

  it("never treats a UUID or UUID fragment as a human source name", () => {
    expect(normalizeSourceName(SOURCE_ID, SOURCE_ID)).toBeNull();
    expect(normalizeSourceName("#e9868104", SOURCE_ID)).toBeNull();
    expect(normalizeSourceName("e9868104…789a", SOURCE_ID)).toBeNull();
  });

  it("ignores an ID-like override and keeps the metadata filename", () => {
    const view = hitViewFromSearchHit(
      hit("chunk-3", { source: { path: "/uploads/AMAGuides5thv2.pdf" } }),
      { name: "#e9868104" },
    );

    expect(view.title).toBe("AMAGuides5thv2.pdf");
  });

  it("uses an explicit metadata page range when page_number is absent", () => {
    const view = hitViewFromSearchHit(
      hit("chunk-4", { first_page: 391, last_page: 391 }),
    );

    expect(view.pageNumber).toBe(391);
    expect(view.pageNumbers).toEqual([391]);
  });

  it("keeps identity facts but strips table headers and other content", () => {
    expect(
      factsOnlyMetadata({
        role: "child",
        table_rows: 2,
        table_header: ["DRE Cervical Category I"],
        source: {
          file_name: "AMAGuides5thv2.pdf",
          page_count: 618,
          raw_text: "document content",
        },
      }),
    ).toEqual({
      role: "child",
      table_rows: 2,
      source: {
        file_name: "AMAGuides5thv2.pdf",
        page_count: 618,
      },
    });
  });
});
