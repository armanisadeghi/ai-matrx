/**
 * CENSUS — THE CMS HAS NO QUEUE OF ITS OWN, AND CANNOT GROW ONE BACK.
 *
 * Human-in-the-loop policy rule 5: "Approval surfaces are one place, not many."
 * Until 2026-09-19 the CMS had a second one — `ApprovalsQueuePanel`, its
 * `CmsApprovalsService` and `POST /api/cms/approvals` — whose Approve flipped
 * `status` / `reviewed_by` / `reviewed_at` on `client_content_exceptions` from
 * the browser with the CMS secret key. That is a second review screen AND a
 * second writer of a standing safety policy. All three are deleted (chair
 * ruling, register row Q-1) and the rows are this queue's `cms_content_exception`
 * kind, decided through `cms-door.ts`.
 *
 * 🚨 A DELETION IS NOT A GUARD. Nothing stops the next agent re-creating the
 * panel or the route from an old branch, a stale doc or a half-reverted merge —
 * and a second queue is invisible from inside either one. So the tree is
 * SEARCHED, and the only places these names may still appear are the sentences
 * that say they are gone.
 */

import { execFileSync } from "node:child_process";
import { join } from "node:path";

const REPO_ROOT = join(__dirname, "..", "..", "..");

/** Every tracked file naming this string, as git itself lists them. */
function filesNaming(needle: string): string[] {
  try {
    const out = execFileSync(
      "git",
      ["grep", "-l", "--fixed-strings", needle, "--", "*.ts", "*.tsx", "*.md"],
      { cwd: REPO_ROOT, encoding: "utf8" },
    );
    return out.split("\n").filter(Boolean);
  } catch (error) {
    // `git grep` exits 1 when nothing matched — the good case here.
    const status = (error as { status?: number }).status;
    if (status === 1) return [];
    throw error;
  }
}

/**
 * The files allowed to say the name: this guard, and the three docs that record
 * the deletion. A file that only EXPLAINS the removal is not a second queue; a
 * file that imports, calls or routes it is.
 */
const EXPLAINING_THE_DELETION = [
  "features/approvals/__tests__/one-queue-for-cms.test.ts",
  "features/approvals/FEATURE.md",
  "features/cms/FEATURE.md",
  "features/cms/types.ts",
  "features/cms/services/cmsService.ts",
  "app/(core)/cms/admin/page.tsx",
  "app/(admin)/administration/knowledge/cms-agents/page.tsx",
  "docs/handoffs/agent-copy-data-knowledge-cluster.md",
];

describe("the CMS's second approval queue stays deleted", () => {
  it.each([
    ["ApprovalsQueuePanel", "the bespoke CMS review screen"],
    ["CmsApprovalsService", "the client-side approve/reject writer"],
    ["/api/cms/approvals", "the Next.js route that wrote the CMS row"],
  ])("%s exists nowhere but the notes saying it is gone", (needle, what) => {
    const offenders = filesNaming(needle).filter(
      (file) => !EXPLAINING_THE_DELETION.includes(file),
    );
    expect(offenders).toEqual([]);
    if (offenders.length > 0) {
      throw new Error(
        `${what} (${needle}) is back in: ${offenders.join(", ")}. CMS content ` +
          "exceptions are decided in THE ONE approval queue " +
          "(features/approvals, kind cms_content_exception) through " +
          "cms-door.ts — never a second screen and never a browser write.",
      );
    }
  });

  it("the deleted files themselves are not tracked any more", () => {
    const tracked = execFileSync("git", ["ls-files"], {
      cwd: REPO_ROOT,
      encoding: "utf8",
      maxBuffer: 64 * 1024 * 1024,
    }).split("\n");
    expect(tracked).not.toContain(
      "features/cms/components/admin/ApprovalsQueuePanel.tsx",
    );
    expect(tracked).not.toContain("app/api/cms/approvals/route.ts");
  });
});
