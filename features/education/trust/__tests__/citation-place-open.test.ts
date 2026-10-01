import { playerHrefForPlace, recordIdOfCitation } from "../useCitationPlace";

jest.mock("@/features/rag/components/source-inspector/useOpenCitation", () => ({ useOpenCitation: () => () => {} }));
jest.mock("@/features/rag/components/source-inspector/useCitedChunk", () => ({ useCitedChunk: () => ({}), useRecordCitedFacts: () => ({}) }));

const DOC = "7d1f2c3a-1111-4222-8333-944455556666";

describe("a recording's citation opens the Source's own player at the cited time", () => {
  it("builds the Source page link that seeks (?t=ms) on the cited portion", () => {
    expect(
      playerHrefForPlace(DOC, { kind: "time", label: "2:50–4:13", seekMs: 170_000, pageNumber: 12 }),
    ).toBe(`/knowledge/sources/${DOC}?page=12&t=170000`);
  });

  it("anything that is not a recording keeps the inspector (no player link)", () => {
    expect(playerHrefForPlace(DOC, { kind: "section", label: "References", seekMs: null, pageNumber: 31 })).toBeNull();
    expect(playerHrefForPlace(DOC, { kind: "page", label: "Page 3", seekMs: null, pageNumber: 3 })).toBeNull();
    expect(playerHrefForPlace(null, { kind: "time", label: "0:04", seekMs: 4000, pageNumber: 1 })).toBeNull();
  });
});

describe("which citations are record-backed", () => {
  const REC = "26155ea9-9237-473a-824d-711500d1f8eb";
  it("a packed part of a record with no ids names its record", () => {
    expect(recordIdOfCitation({ sourceId: `${REC}:1`, sourceKind: "chunk", url: `/transcripts/processor?focus=${REC}` })).toBe(REC);
  });
  it("a citation with a document, a file, or a web url does not", () => {
    expect(recordIdOfCitation({ sourceId: `${REC}:1`, sourceKind: "chunk", documentId: DOC })).toBeNull();
    expect(recordIdOfCitation({ sourceId: `${REC}:1`, sourceKind: "chunk", url: "https://example.org" })).toBeNull();
    expect(recordIdOfCitation({ sourceId: "chunk-7", sourceKind: "chunk" })).toBeNull();
  });
});
