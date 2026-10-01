import { playerHrefForPlace } from "../useCitationPlace";

jest.mock("@/features/rag/components/source-inspector/useOpenCitation", () => ({ useOpenCitation: () => () => {} }));
jest.mock("@/features/rag/components/source-inspector/useCitedChunk", () => ({ useCitedChunk: () => ({}) }));

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
