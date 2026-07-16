import {
  chunkPdfPageNumbers,
  MAX_PDF_CHUNKS_PER_BATCH,
} from "@/features/pdf/utils/page-chunks";

describe("chunkPdfPageNumbers", () => {
  it("uses the same page-size and overlap stride as page extraction", () => {
    expect(chunkPdfPageNumbers([1, 2, 3, 4, 5, 6, 7], 3, 1)).toEqual([
      [1, 2, 3],
      [3, 4, 5],
      [5, 6, 7],
    ]);
  });

  it("preserves an explicit discontinuous selection without adding pages", () => {
    expect(chunkPdfPageNumbers([1, 3, 7, 9], 3, 1)).toEqual([
      [1, 3, 7],
      [7, 9],
    ]);
  });

  it("publishes the batch guardrail for callers", () => {
    expect(MAX_PDF_CHUNKS_PER_BATCH).toBe(100);
  });
});
