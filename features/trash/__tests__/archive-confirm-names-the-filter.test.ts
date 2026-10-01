/**
 * V6-B (2026-10-01): the Sources page's archive confirm said "restore it from Trash" for two
 * Sources while the page itself offers the Archived only filter. A list that carries THE
 * ARCHIVED-ITEMS LAW filter restores in place, so its confirm names that filter through the shared
 * sentence (`archiveConfirmSentence(…, { restoreFrom: "archive_filter" })`).
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";

const ROOT = join(__dirname, "..", "..", "..");
const LISTS_WITH_THE_ARCHIVE_FILTER = [
  "features/sources/components/SourcesPage.tsx",
  "features/transcripts/browse/useTranscriptRowActions.tsx",
];

it.each(LISTS_WITH_THE_ARCHIVE_FILTER)("%s names the archive filter as the way back", (path) => {
  const src = readFileSync(join(ROOT, path), "utf8");
  const calls = src.match(/archiveConfirmSentence\([\s\S]*?\)\s*[,}]/g) ?? [];
  expect(calls.length).toBeGreaterThan(0);
  calls.forEach((call) => expect(call).toContain('restoreFrom: "archive_filter"'));
});
