/**
 * V6-B (2026-10-01): the Sources page's archive confirm said "restore it from Trash" for two
 * Sources while the page itself offers the Archived only filter. A list that carries THE
 * ARCHIVED-ITEMS LAW filter restores in place, so its confirm names that filter through the shared
 * sentence (`archiveConfirmSentence(…, { restoreFrom })`).
 *
 * verify-7 #2 (2026-10-01): /education/flashcards → Actions → Archive said "restore it from Trash"
 * with no Trash control on the page; the list's archive axis is the entity list's Filters panel
 * (section "Archived", `EntityFilterPanel`) — not the Sources page's "Archived only" control. Each
 * confirm names the control ITS page renders.
 *
 * RED proof without touching the tree: ARCHIVE_FILTER_SOURCE_REF=<sha> reads that commit.
 */
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const ROOT = join(__dirname, "..", "..", "..");

const PLACE_BY_FILE: Record<string, "archive_filter" | "list_filters"> = {
  // The Sources page renders the design-system ArchiveFilter ("Archived only").
  "features/sources/components/SourcesPage.tsx": "archive_filter",
  // Entity lists (lib/entity-list, supportsArchived not false) — Filters → Archived.
  "features/transcripts/browse/useTranscriptRowActions.tsx": "list_filters",
  "features/flashcards/components/home/useFlashcardSetRowActions.tsx": "list_filters",
  "features/flashcards/components/home/flashcardSetList.tsx": "list_filters",
  "features/education/assessment/components/home/useAssessmentRowActions.tsx": "list_filters",
};

function source(path: string): string {
  const ref = process.env.ARCHIVE_FILTER_SOURCE_REF;
  return ref
    ? execFileSync("git", ["show", `${ref}:${path}`], { cwd: ROOT, encoding: "utf8" })
    : readFileSync(join(ROOT, path), "utf8");
}

it.each(Object.entries(PLACE_BY_FILE))("%s names its own restore control", (path, place) => {
  const calls = source(path).match(/archiveConfirmSentence\([\s\S]*?\)\s*[,}]/g) ?? [];
  expect(calls.length).toBeGreaterThan(0);
  calls.forEach((call) => expect(call).toContain(`restoreFrom: "${place}"`));
});

it("no confirm hand-writes a restore place beside the shared sentence", () => {
  // flashcardSetList's bulk confirm said "from Trash or the Archived filter" in its own words.
  for (const path of Object.keys(PLACE_BY_FILE)) {
    expect(source(path)).not.toMatch(/restore (it|them) from Trash or/);
  }
});
