/**
 * Lane TRASH-COVERAGE — the class guard. Each confirm below sits in front of a
 * SOFT delete (`deleted_at`) of a kind /trash lists and restores
 * (`platform.entity_types.user_artifact_kind`, proven by
 * scripts/campaign-tests/trashcoverage_green.sql). Each must say the shared
 * archive sentence (`archiveConfirmSentence`, features/trash/archiveCopy.ts)
 * and never claim permanence.
 *
 * RED proof without touching the working tree: `TRASHCOVERAGE_SOURCE_REF=<sha>`
 * reads every file from that commit (`git show <sha>:<path>`) instead of disk.
 */
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const ROOT = join(__dirname, "..", "..", "..");
const REF = process.env.TRASHCOVERAGE_SOURCE_REF;

function source(path: string): string {
  if (REF) {
    return execFileSync("git", ["show", `${REF}:${path}`], {
      cwd: ROOT,
      encoding: "utf8",
    });
  }
  return readFileSync(join(ROOT, path), "utf8");
}

const PERMANENCE = /cannot be undone|can't be undone|can&apos;t be undone|permanently (delete|removed)|will be permanently/i;

const FEATURES: Record<string, string[]> = {
  podcasts: [
    "features/podcasts/components/admin/PodcastDetailPanel.tsx",
    "features/podcasts/components/admin/PodcastsTable.tsx",
    "features/podcasts/components/admin/ShowDetailClient.tsx",
    "features/podcasts/components/admin/ShowsClient.tsx",
  ],
  "research templates": ["features/research/admin/TemplatesManager.tsx"],
  projects: ["features/projects/components/DangerZone.tsx"],
  "canvas maps": ["features/canvas/maps/useMapRowActions.tsx"],
  "MCP tools": ["features/tool-call-visualization/admin/McpToolsManager.tsx"],
  education: [
    "features/education/assessment/components/AssessmentDetail.tsx",
    "features/education/study/components/StudyPlanner.tsx",
  ],
  "code library": ["features/code/views/library/LibraryPanel.tsx"],
  "markdown studio": ["components/markdown-studio/SampleLibrarySheet.tsx"],
};

describe.each(Object.entries(FEATURES))("%s archive confirm", (_feature, files) => {
  it.each(files)("%s says the shared archive sentence", (path) => {
    const src = source(path);
    expect(src).toMatch(/archiveConfirmSentence\(/);
    expect(src).toContain('from "@/features/trash/archiveCopy"');
  });

  it.each(files)("%s never claims the archive is permanent", (path) => {
    // McpToolsManager's BULK delete is a real hard `.delete()` ("Delete
    // forever") and keeps its honest copy; it never says "cannot be undone".
    expect(source(path)).not.toMatch(PERMANENCE);
  });
});

describe("code folders archive in the canonical shape", () => {
  it("deleteCodeFolder writes deleted_at (what /trash lists), not is_active=false", () => {
    const src = source("features/code-files/service/codeFilesService.ts");
    const body = src.slice(src.indexOf("export async function deleteCodeFolder"));
    const fn = body.slice(0, body.indexOf("\n}\n"));
    expect(fn).toMatch(/deleted_at:\s*new Date\(\)\.toISOString\(\)/);
    expect(fn).not.toMatch(/is_active:\s*false/);
  });
});
