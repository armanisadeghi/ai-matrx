/**
 * The notice shown when a page's analysis was made from an older version of
 * its text. One plain string, so no version number can drop out of the
 * sentence ("Showing analysis from of this content" shipped that way).
 */
export function staleAnalysisSentence(
  analysisVersion: number,
  currentVersion: number | null,
): string {
  const now = currentVersion != null ? ` (now v${currentVersion})` : "";
  return `Showing analysis from v${analysisVersion} of this content. You've edited it since${now}, so this may be out of date — re-analyze to refresh. Your previous analysis was kept, not deleted.`;
}
