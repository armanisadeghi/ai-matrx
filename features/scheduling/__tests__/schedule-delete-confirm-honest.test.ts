/**
 * The schedule delete dialog said "This cannot be undone" over a soft delete
 * (`deleted_at`, see `features/scheduling/service/queries.ts`,
 * `features/scheduling/hooks/useTaskListStream.ts`). VERIFIER-23, "Outside the
 * list": "The schedule delete dialog says a false thing. It reads 'This cannot
 * be undone.' The delete is soft: `scheduler.sch_task.deleted_at` is set …
 * and the row is still there."
 *
 * This is a CLASS guard: it scans every file that dispatches
 * `deleteScheduledTask` and fails if any of them claims permanence.
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

function filesThatDeleteSchedules(): string[] {
  const files: string[] = [];
  for (const dir of SEARCH_DIRS) walk(join(REPO_ROOT, dir), files);
  return files.filter((file) => /\bdeleteScheduledTask\s*\(/.test(readFileSync(file, "utf8")));
}

describe("schedule delete confirm copy is honest about a soft delete", () => {
  it("finds the delete surfaces it is supposed to be guarding", () => {
    expect(filesThatDeleteSchedules().length).toBeGreaterThan(0);
  });

  it("no schedule delete surface claims the delete is permanent", () => {
    const offences: string[] = [];
    for (const file of filesThatDeleteSchedules()) {
      const source = readFileSync(file, "utf8");
      for (const { label, re } of PERMANENCE_PATTERNS) {
        if (re.test(source)) {
          offences.push(`${file.slice(REPO_ROOT.length + 1)} — ${label}`);
        }
      }
    }
    expect(offences).toEqual([]);
  });

  it("the two known delete surfaces name the truth: archive, stop, list, restore", () => {
    for (const rel of [
      "features/scheduling/components/detail/ScheduleDetail.tsx",
      "features/scheduling/components/list/ScheduleRow.tsx",
    ]) {
      const source = readFileSync(join(REPO_ROOT, rel), "utf8");
      expect(source).toMatch(/This archives the schedule\. It stops running and leaves your list; an admin can restore it\./);
    }
  });
});
