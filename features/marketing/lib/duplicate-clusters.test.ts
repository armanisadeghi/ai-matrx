import {
  buildDuplicateClusters,
  simhashHamming,
  simhashSimilarity,
  type FingerprintPageRow,
} from "@/features/marketing/lib/duplicate-clusters";

function row(
  id: string,
  exactSha256: string,
  simhash64: string,
  overrides: Partial<FingerprintPageRow> = {},
): FingerprintPageRow {
  return {
    snapshotId: id,
    pageId: `page-${id}`,
    url: `https://example.com/${id}`,
    wordCount: 100,
    fingerprint: {
      version: 1,
      exactSha256,
      simhash64,
      shingleSize: 3,
      tokenCount: 100,
    },
    ...overrides,
  };
}

describe("simhashHamming", () => {
  it("counts differing bits across the full 64-bit value", () => {
    expect(simhashHamming("0000000000000000", "0000000000000000")).toBe(0);
    expect(simhashHamming("ffffffffffffffff", "0000000000000000")).toBe(64);
    expect(simhashHamming("8000000000000001", "0000000000000000")).toBe(2);
    expect(simhashHamming("00000000000000ff", "0000000000000000")).toBe(8);
  });

  it("maps to percentage similarity", () => {
    // 6 differing bits of 64 → 90.625% — at Screaming Frog's 90% default.
    expect(simhashSimilarity("000000000000003f", "0000000000000000")).toBeCloseTo(
      90.625,
    );
  });
});

describe("buildDuplicateClusters", () => {
  it("groups exact duplicates by exact hash", () => {
    const report = buildDuplicateClusters([
      row("a", "hash-1", "0000000000000000"),
      row("b", "hash-1", "0000000000000000"),
      row("c", "hash-2", "ffffffffffffffff"),
    ]);
    expect(report.exact).toHaveLength(1);
    expect(report.exact[0].pages.map((page) => page.snapshotId)).toEqual([
      "a",
      "b",
    ]);
    expect(report.exact[0].similarity).toBe(100);
    expect(report.duplicatePages).toBe(2);
  });

  it("clusters near duplicates above the threshold and leaves distant pages out", () => {
    const report = buildDuplicateClusters(
      [
        row("a", "hash-1", "0000000000000000"),
        row("b", "hash-2", "0000000000000003"), // hamming 2 → 96.9%
        row("c", "hash-3", "ffffffffffffffff"), // hamming 62/64 → far
      ],
      90,
    );
    expect(report.exact).toHaveLength(0);
    expect(report.near).toHaveLength(1);
    expect(report.near[0].pages.map((page) => page.snapshotId)).toEqual([
      "a",
      "b",
    ]);
    expect(report.near[0].similarity).toBeCloseTo(96.875);
  });

  it("respects a tightened threshold", () => {
    const rows = [
      row("a", "hash-1", "0000000000000000"),
      row("b", "hash-2", "00000000000000ff"), // hamming 8 → 87.5%
    ];
    expect(buildDuplicateClusters(rows, 90).near).toHaveLength(0);
    expect(buildDuplicateClusters(rows, 85).near).toHaveLength(1);
  });

  it("collapses exact groups to one near-cluster node and reports all pages", () => {
    const report = buildDuplicateClusters(
      [
        row("a1", "hash-1", "0000000000000000"),
        row("a2", "hash-1", "0000000000000000"),
        row("b", "hash-2", "0000000000000001"),
      ],
      90,
    );
    expect(report.exact).toHaveLength(1);
    expect(report.near).toHaveLength(1);
    expect(report.near[0].pages).toHaveLength(3);
  });

  it("does not report a lone exact group as near-duplicate of itself", () => {
    const report = buildDuplicateClusters(
      [
        row("a1", "hash-1", "0000000000000000"),
        row("a2", "hash-1", "0000000000000000"),
      ],
      90,
    );
    expect(report.exact).toHaveLength(1);
    expect(report.near).toHaveLength(0);
  });

  it("never compares fingerprints of different versions", () => {
    const legacy = row("b", "hash-2", "0000000000000000");
    legacy.fingerprint = { ...legacy.fingerprint!, version: 2 };
    const report = buildDuplicateClusters(
      [row("a", "hash-1", "0000000000000000"), legacy],
      90,
    );
    expect(report.near).toHaveLength(0);
  });

  it("counts rows without fingerprints separately", () => {
    const report = buildDuplicateClusters([
      row("a", "hash-1", "0000000000000000"),
      { ...row("b", "x", "0"), fingerprint: null },
    ]);
    expect(report.fingerprinted).toBe(1);
    expect(report.withoutFingerprint).toBe(1);
  });
});
