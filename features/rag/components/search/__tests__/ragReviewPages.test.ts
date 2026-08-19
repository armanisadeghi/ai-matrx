import { buildRagReviewPages } from "@/features/rag/components/search/ragReviewPages";

describe("buildRagReviewPages", () => {
  it("adds one physical page before and after a one-page hit", () => {
    expect(buildRagReviewPages([393], 393, 618)).toEqual([392, 393, 394]);
  });

  it("fills a multi-page span and adds context on both sides", () => {
    expect(buildRagReviewPages([393, 394], 393, 618)).toEqual([
      392, 393, 394, 395,
    ]);
  });

  it("clamps context to the physical document bounds", () => {
    expect(buildRagReviewPages([1], 1, 2)).toEqual([1, 2]);
    expect(buildRagReviewPages([2], 2, 2)).toEqual([1, 2]);
  });

  it("returns no packet when the hit has no page provenance", () => {
    expect(buildRagReviewPages([], null, 10)).toEqual([]);
  });
});
