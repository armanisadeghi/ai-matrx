/**
 * The org shortcut-category delete dialog said "Child categories and
 * shortcuts assigned to this category may be orphaned ... This cannot be
 * undone" — but `deleteCategory` (features/agents/redux/agent-shortcut-categories/thunks.ts)
 * calls `DELETE /api/agent-shortcut-categories/[id]`, whose own comment says:
 * "🚨 SOFT, NOW. This was a HARD `.delete()` ... `cat_archive` soft-deletes,
 * like `cat_delete` and every sibling writer already did." Same `cat_archive`
 * RPC family the prior lane already fixed for
 * components/admin/ContentBlocksManager.tsx (commit 8f48935eef) and this
 * lane fixed for the agent-app category dialog. Traced during
 * data-doctrine-adoption v5 lane UNDONE-COPY-CENSUS-3.
 *
 * Class guard: scans every file calling `deleteCategory(` (the org
 * shortcut-category thunk import) for a permanence claim.
 */
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

const REPO_ROOT = join(__dirname, "..", "..", "..", "..", "..", "..", "..");

const PERMANENCE_PATTERNS: RegExp[] = [
  /cannot be undone/i,
  /can(?:'|'|&rsquo;)t be undone/i,
  /permanently (?:removes?|deletes?)/i,
  /irreversible/i,
  /orphaned/i,
];

const SEARCH_DIRS = ["app", "components", "features", "lib"];
const SKIP_DIRS = new Set(["node_modules", ".next", "dist", "__snapshots__"]);

function walk(dir: string, out: string[]): string[] {
  for (const entry of readdirSync(dir)) {
    if (SKIP_DIRS.has(entry)) continue;
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) walk(full, out);
    else if (/\.tsx?$/.test(entry) && !/\.test\.tsx?$/.test(entry)) out.push(full);
  }
  return out;
}

function targetFile(): string {
  return join(
    REPO_ROOT,
    "app",
    "(core)",
    "organizations",
    "[orgId]",
    "shortcuts",
    "categories",
    "page.tsx",
  );
}

describe("org shortcut-category delete confirm copy is honest about a soft archive", () => {
  it("guards a file that still imports deleteCategory from the shortcut-category thunks", () => {
    const source = readFileSync(targetFile(), "utf8");
    expect(source).toMatch(/deleteCategory/);
  });

  it("no shortcut-category delete surface claims the archive is permanent or orphans references", () => {
    const files = walk(join(REPO_ROOT, "app", "(core)", "organizations"), []).filter((f) =>
      /shortcuts[\\/]categories/.test(f),
    );
    expect(files.length).toBeGreaterThan(0);
    const offences: string[] = [];
    for (const file of files) {
      const source = readFileSync(file, "utf8");
      for (const re of PERMANENCE_PATTERNS) {
        if (re.test(source)) offences.push(`${file.slice(REPO_ROOT.length + 1)} — ${re.source}`);
      }
    }
    expect(offences).toEqual([]);
  });
});
