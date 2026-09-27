/**
 * Knowledge search (2026-09-27 audit, the #1 gap): the kind filter offered only
 * Files / Notes / Code while the Sources page lists web pages, transcripts and
 * pasted text; results were labelled by id ("Transcript source 61cdb294") and
 * opened on legacy routes instead of the Source screen at the matched chunk.
 */
import {
  SEARCH_SOURCE_KIND_FILTERS,
  FILTERABLE_SOURCE_KINDS,
  searchFilterForKinds,
} from "@/features/rag/search-controls";
import {
  SOURCE_KIND_GROUP_KINDS,
  SOURCE_KIND_LABEL,
} from "@/features/sources/sourceRows";
import {
  searchHitHref,
  searchHitSourceView,
  originFacets,
} from "@/features/rag/search-hit-source";
import type { RagSearchHit } from "@/features/rag/api/search";

function hit(over: Partial<RagSearchHit>): RagSearchHit {
  return {
    chunk_id: "chunk-1",
    source_kind: "scrape_parsed_page",
    source_id: "61cdb294-0000-4000-8000-000000000000",
    field_id: null,
    parent_chunk_id: null,
    chunk_kind: "child",
    snippet: "the passage",
    score: 1,
    vector_rank: 1,
    lexical_rank: null,
    rerank_score: null,
    entity_rank: null,
    entities: [],
    metadata: {},
    processed_document_id: "pd-1",
    ...over,
  };
}

describe("the search kind filter covers every kind the Sources page shows", () => {
  it.each(Object.entries(SOURCE_KIND_GROUP_KINDS))(
    "%s has a filter position, in the Sources page's word, sending exactly its stored kinds",
    (group, kinds) => {
      const position = SEARCH_SOURCE_KIND_FILTERS.find((f) => f.value === group);
      expect(position).toBeDefined();
      expect(position?.label).toBe(
        SOURCE_KIND_LABEL[group as keyof typeof SOURCE_KIND_LABEL],
      );
      expect([...(position?.sourceKinds ?? [])].sort()).toEqual([...kinds].sort());
      for (const kind of kinds) expect(FILTERABLE_SOURCE_KINDS).toContain(kind);
    },
  );

  it("a web-page kind token maps back onto the Web page position; mixed groups do not", () => {
    expect(searchFilterForKinds(["scrape_parsed_page"])?.value).toBe("web_page");
    expect(searchFilterForKinds(["web_page", "scrape_parsed_page"])?.value).toBe(
      "web_page",
    );
    expect(searchFilterForKinds(["note", "transcript"])).toBeNull();
  });
});

describe("a search result reads as its Source, not an id", () => {
  it("opens on the Source screen at the matched chunk", () => {
    expect(searchHitHref(hit({}))).toBe("/knowledge/sources/pd-1?chunk=chunk-1");
  });

  it("shows the Source's title, kind and where it came from", () => {
    const view = searchHitSourceView(hit({}), {
      id: "pd-1",
      name: "Why <b>OpenAI</b> ships",
      source_kind: "scrape_parsed_page",
      origin_client: "extension",
      capture_method: "own_browser",
      canonical_identity: "https://www.example.com/post",
    });
    expect(view.title).toBe("Why OpenAI ships");
    expect(view.kindLabel).toBe("Web page");
    expect(view.from).toBe("Extension · your browser");
    expect(view.site).toBe("example.com");
  });

  it("never falls back to an id as the title", () => {
    const view = searchHitSourceView(hit({ source_kind: "transcript" }), null);
    expect(view.title).not.toMatch(/61cdb294/);
    expect(view.kindLabel).toBe("Transcript");
  });

  it("counts results by where they came from, for narrowing the result list", () => {
    const facets = originFacets([
      { origin_client: "extension" },
      { origin_client: "research" },
      { origin_client: "extension" },
      null,
    ]);
    expect(facets).toEqual([
      { origin: "extension", label: "Extension", count: 2 },
      { origin: "research", label: "Research", count: 1 },
    ]);
  });
});
