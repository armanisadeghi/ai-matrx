/**
 * `TopicList.tsx`'s delete-topic confirm said "Permanently delete ... This
 * cannot be undone" over a soft delete (`research.rs_topic.deleted_at`,
 * owner ruling 2026-09-20, db-rules §8 — the same handler's own comment says
 * so). UNDONE-COPY-CENSUS, continuing GATES-TAIL #4's census.
 *
 * Class guard: scans every file that updates `rs_topic.deleted_at` (via the
 * `handleDelete` path in this file) for permanence wording.
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

function filesThatDeleteTopics(): string[] {
  const files: string[] = [];
  for (const dir of SEARCH_DIRS) walk(join(REPO_ROOT, dir), files);
  return files.filter((file) => /rs_topic/.test(readFileSync(file, "utf8")));
}

describe("research topic delete confirm is honest about a soft delete", () => {
  it("finds the delete surface it is supposed to be guarding", () => {
    expect(filesThatDeleteTopics().length).toBeGreaterThan(0);
  });

  it("no surface touching rs_topic claims the delete is permanent", () => {
    const offences: string[] = [];
    for (const file of filesThatDeleteTopics()) {
      const source = readFileSync(file, "utf8");
      for (const { label, re } of PERMANENCE_PATTERNS) {
        if (re.test(source)) {
          offences.push(`${file.slice(REPO_ROOT.length + 1)} — ${label}`);
        }
      }
    }
    expect(offences).toEqual([]);
  });

  it("the dialog names the truth: archive and restore, not permanence", () => {
    const source = readFileSync(
      join(REPO_ROOT, "features/research/components/landing/TopicList.tsx"),
      "utf8",
    );
    expect(source).toMatch(/This archives /);
    expect(source).toMatch(/It leaves your topic list; an admin can restore it\./);
  });
});
