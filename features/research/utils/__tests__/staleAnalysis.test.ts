import { staleAnalysisSentence } from "../staleAnalysis";

it("names both versions in one sentence", () => {
  expect(staleAnalysisSentence(2, 3)).toBe(
    "Showing analysis from v2 of this content. You've edited it since (now v3), so this may be out of date — re-analyze to refresh. Your previous analysis was kept, not deleted.",
  );
});

it("never leaves a hole when the current version is unknown", () => {
  const s = staleAnalysisSentence(2, null);
  expect(s).toContain("from v2 of this content");
  expect(s).not.toMatch(/from\s+of|now v\)|\(now v\s*\)/);
});
