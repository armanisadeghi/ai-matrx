/**
 * (History) `LibraryDocDetailSheet.tsx`'s "Delete file" confirm called
 * `fn_delete_library_document_and_source`, whose own success toast says
 * "moved to trash ... Restorable from the trash" — the exact same soft
 * delete `LibraryTrashSheet.tsx` restores from — yet the confirm dialog and
 * the button's own title both said "Cannot be undone." (UNDONE-COPY-CENSUS,
 * continuing GATES-TAIL #4's census).
 *
 * Class guard: scans every file that calls
 * `fn_delete_library_document_and_source` for permanence wording. The sheet
 * was retired 2026-09-26 with the old library page; the Sources page's bulk
 * delete (SOURCE-CONVERGENCE §8.1) is the surface guarded by name now.
 */
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

const REPO_ROOT = join(__dirname, "..", "..", "..", "..", "..");

const PERMANENCE_PATTERNS: Array<{ label: string; re: RegExp }> = [
  { label: '"cannot be undone"', re: /cannot be undone/i },
  { label: '"can\'t be undone"', re: /can(?:'|’|&rsquo;)t be undone/i },
  { label: '"permanently"', re: /permanently (?:removes?|deletes?)/i },
];

const SEARCH_DIRS = ["app", "components", "features", "lib", "hooks"];
const SKIP_DIRS = new Set(["node_modules", ".next", "dist", "__snapshots__"]);

function walk(dir: string, out: string[]): string[] {
  for (const entry of readdirSync(dir)) {
    if (SKIP_DIRS.has(entry)) continue;
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) walk(full, out);
    else if (/\.tsx?$/.test(entry) && !/\.test\.tsx?$/.test(entry) && !full.includes("__tests__")) out.push(full);
  }
  return out;
}

function filesThatDeleteAndSource(): string[] {
  const files: string[] = [];
  for (const dir of SEARCH_DIRS) walk(join(REPO_ROOT, dir), files);
  return files.filter((file) =>
    /fn_delete_library_document_and_source/.test(readFileSync(file, "utf8")),
  );
}

describe("library document 'delete file' confirm is honest about a soft delete", () => {
  it("finds the delete surface it is supposed to be guarding", () => {
    expect(filesThatDeleteAndSource().length).toBeGreaterThan(0);
  });

  it("no surface calling fn_delete_library_document_and_source claims permanence", () => {
    const offences: string[] = [];
    for (const file of filesThatDeleteAndSource()) {
      const source = readFileSync(file, "utf8");
      for (const { label, re } of PERMANENCE_PATTERNS) {
        if (re.test(source)) {
          offences.push(`${file.slice(REPO_ROOT.length + 1)} — ${label}`);
        }
      }
    }
    expect(offences).toEqual([]);
  });

  it("the Sources page's bulk delete names the truth: trash and restore, not permanence", () => {
    const source = readFileSync(
      join(REPO_ROOT, "features/sources/components/SourcesPage.tsx"),
      "utf8",
    );
    // The confirm sits in an AlertDialog and says where the Sources go and how they come back.
    expect(source).toMatch(/AlertDialog/);
    expect(source).toMatch(/to the\s+trash\.\s+Restorable from the trash\./);
    expect(source).toMatch(/goes to the trash together with its file/);
    expect(source).toMatch(/Move to trash/);
  });
});
