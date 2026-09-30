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
 * is gone; the Knowledge hub's trash (sourceActions.trashSource) is guarded
 * by name, and the live Sources page is covered by the class scan.
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

  it("the Knowledge hub trashes a Source through the one soft-delete door, with a restorable confirm", () => {
    const hub = readFileSync(
      join(REPO_ROOT, "features/knowledge/hub/components/KnowledgeHubPage.tsx"),
      "utf8",
    );
    const door = readFileSync(join(REPO_ROOT, "features/sources/sourceActions.ts"), "utf8");
    // The hub's Sources rows share the one soft-delete door (the Sources page is live again at /knowledge/library and guarded by the class scan above).
    expect(door).toMatch(/fn_delete_library_document_and_source/);
    expect(door).toMatch(/moved to the trash/);
    expect(hub).toMatch(/trashSource\(row\)/);
    expect(hub).toMatch(/trashConfirmSentence/);
    expect(hub).toMatch(/Move to Trash/);
  });
});
