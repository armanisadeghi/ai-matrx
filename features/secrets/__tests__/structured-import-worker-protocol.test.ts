import { hasValidStructuredImportFileNotices } from "../structured-import-worker-protocol";

describe("structured import file notices", () => {
  test("accepts only the closed, unique, bounded positive-count contract", () => {
    expect(
      hasValidStructuredImportFileNotices(
        [
          { code: "unsupported_archive_members", count: 1 },
          { code: "unsupported_binary_definitions", count: 2 },
          { code: "deleted_tombstones", count: 3 },
        ],
        3,
      ),
    ).toBe(true);
  });

  test.each([
    [[{ code: "unknown", count: 1 }]],
    [[{ code: "deleted_tombstones", count: 1 }, { code: "deleted_tombstones", count: 2 }]],
    [[{ code: "deleted_tombstones", count: 0 }]],
    [[{ code: "deleted_tombstones", count: 1.5 }]],
    [[{ code: "deleted_tombstones", count: 4 }]],
    [[{ code: "deleted_tombstones", count: Number.MAX_SAFE_INTEGER + 1 }]],
    [[{ code: "deleted_tombstones", count: 1, source: "must-not-render" }]],
    [[["deleted_tombstones", 1]]],
    [Array.from({ length: 4 }, () => ({ code: "deleted_tombstones", count: 1 }))],
  ])("rejects invalid notices: %j", (notices) => {
    expect(hasValidStructuredImportFileNotices(notices, 3)).toBe(false);
  });

  test("rejects inherited fields instead of accepting a prototype-shaped notice", () => {
    const inherited = Object.create({ code: "deleted_tombstones", count: 1 });
    expect(hasValidStructuredImportFileNotices([inherited], 3)).toBe(false);
  });
});
