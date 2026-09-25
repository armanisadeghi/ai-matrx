/**
 * The three "Delete list" confirm dialogs (ListDetailClient.tsx,
 * ListsTableView.tsx, ListsTreeNav.tsx) said "This will permanently delete
 * the list and all its items. This action cannot be undone." — false.
 * `deleteListAction` (features/user-lists/actions/list-actions.ts) sets
 * `workbench.udt_structured_lists.deleted_at`, a genuine soft delete, and the
 * table is registered in `platform.entity_types` with
 * `user_artifact_kind = 'structured_list'`, `has_soft_delete = true`,
 * `is_listed = true` — the SAME generic iteration
 * `app/(core)/trash/page.tsx` (`trash_list` / `entity_undelete` RPCs) uses for
 * every other listed soft-deletable entity. A deleted list is restorable from
 * the Trash page, so the dialog's "cannot be undone" was a lie.
 *
 * This is a CLASS guard: it scans every file that dispatches
 * `deleteListAction` and fails if any of them claims permanence.
 */
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

const REPO_ROOT = join(__dirname, "..", "..", "..");

const PERMANENCE_PATTERNS: Array<{ label: string; re: RegExp }> = [
  { label: '"cannot be undone"', re: /cannot be undone/i },
  { label: '"can\'t be undone"', re: /can(?:'|’|&rsquo;)t be undone/i },
  { label: '"permanently"', re: /permanently (?:removes?|deletes?)/i },
  { label: '"irreversible"', re: /irreversible/i },
];

const SEARCH_DIRS = ["app", "components", "features", "lib", "hooks"];
const SKIP_DIRS = new Set(["node_modules", ".next", "dist", "__snapshots__"]);

function walk(dir: string, out: string[]): string[] {
  for (const entry of readdirSync(dir)) {
    if (SKIP_DIRS.has(entry)) continue;
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) walk(full, out);
    else if (/\.tsx?$/.test(entry)) out.push(full);
  }
  return out;
}

function filesThatDeleteLists(): string[] {
  const files: string[] = [];
  for (const dir of SEARCH_DIRS) walk(join(REPO_ROOT, dir), files);
  return files.filter((file) => /\bdeleteListAction\s*\(/.test(readFileSync(file, "utf8")));
}

/**
 * Isolate the "Delete list" dialog's own description text within a file that
 * may ALSO contain an unrelated, separately-verified destructive confirm
 * (e.g. ListDetailClient.tsx's per-item "permanently removed" dialog, which
 * calls a different action — `deleteItemAction` — with no restore path and
 * is correctly worded as-is). Only the description prop attached to the
 * `Delete "..."?` list title is in scope for this guard.
 */
function listDeleteDialogBlock(source: string): string {
  const titleIdx = source.indexOf('title={`Delete "');
  if (titleIdx === -1) return "";
  const closeIdx = source.indexOf("/>", titleIdx);
  return source.slice(titleIdx, closeIdx === -1 ? undefined : closeIdx);
}

describe("user-list delete confirm copy is honest about a soft delete", () => {
  it("finds the delete surfaces it is supposed to be guarding", () => {
    expect(filesThatDeleteLists().length).toBeGreaterThanOrEqual(3);
  });

  it("no list delete surface claims the delete is permanent", () => {
    const offences: string[] = [];
    for (const file of filesThatDeleteLists()) {
      const block = listDeleteDialogBlock(readFileSync(file, "utf8"));
      for (const { label, re } of PERMANENCE_PATTERNS) {
        if (re.test(block)) {
          offences.push(`${file.slice(REPO_ROOT.length + 1)} — ${label}`);
        }
      }
    }
    expect(offences).toEqual([]);
  });

  it("the three known delete surfaces name the truth: moves, trash, restorable", () => {
    for (const rel of [
      "features/user-lists/components/ListDetailClient.tsx",
      "features/user-lists/components/ListsTableView.tsx",
      "features/user-lists/components/ListsTreeNav.tsx",
    ]) {
      const source = readFileSync(join(REPO_ROOT, rel), "utf8");
      expect(source).toMatch(
        /This moves the list and its items to the Trash\. It stops appearing in your lists — restorable from the Trash\./,
      );
    }
  });
});
