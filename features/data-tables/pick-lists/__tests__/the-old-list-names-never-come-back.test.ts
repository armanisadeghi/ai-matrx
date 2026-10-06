/**
 * Pick lists are ONE feature — `features/data-tables/pick-lists` (domain tree: data-tables > pick-lists).
 * Breaks if the retired list system comes back under any of its old names: the `user-lists` or
 * `structured-lists` folders, the V1/V2 manager windows, the `/lists` route, the `get_user_lists`
 * renderer, or the `picklist` / `userlist_*` agent tool names (the one tool is `pick_list`).
 *
 * The scan walks the source tree under PICK_LISTS_CENSUS_ROOT (default: this repo). It reads code and
 * config; it skips markdown history (changelogs say what used to exist), generated database types,
 * migrations, and the redirect table in next.config.js, which must name the old paths.
 */
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";

const REPO = path.resolve(__dirname, "../../../..");

const SKIP_DIRS = new Set([
  "node_modules", ".next", ".git", "migrations", "supabase", "docs", ".matrx", "coverage", "dist",
]);
const SKIP_FILES = new Set([
  "next.config.js", "pnpm-lock.yaml", "FOUND_DEFECTS.md",
  "the-old-list-names-never-come-back.test.ts",
]);
const SCAN_EXT = /\.(ts|tsx|js|jsx|mjs|json|css)$/;
const SKIP_PATH = /(db-types|database\.types|\.generated\.)/;

const OLD_FOLDERS = [
  "features/user-lists",
  "features/structured-lists",
  "app/(core)/lists",
  "features/chat-tool-renderers/renderers/get-user-lists",
  "features/chat-tool-renderers/renderers/picklist",
];

const OLD_TEXT: Array<[string, RegExp]> = [
  ["the old feature folders", /features\/(user-lists|structured-lists)\b/],
  ["the V1/V2 manager names", /StructuredListManager|structuredListManager|StructuredListLanding/],
  ["the get_user_lists renderer", /get[-_]user[-_]lists/],
  ["the old selection hook", /useStructuredListForSelection|getStructuredListForSelection/],
  ["the /lists route", /(?<![\w/.-])\/lists(?=[/"'`?#)\s\]}]|$)/],
  ["the old agent tool names", /toolName:\s*["']picklist["']|\buserlist_(create|get|update|batch)/],
];

export function scan(root: string): string[] {
  const hits: string[] = [];
  for (const folder of OLD_FOLDERS) {
    if (fs.existsSync(path.join(root, folder))) hits.push(`folder exists: ${folder}`);
  }
  const check = (rel: string) => {
    const name = path.basename(rel);
    if (SKIP_FILES.has(name) || SKIP_PATH.test(rel) || !SCAN_EXT.test(name)) return;
    if (rel.split("/").some((part) => SKIP_DIRS.has(part))) return;
    let text: string;
    try {
      text = fs.readFileSync(path.join(root, rel), "utf8");
    } catch {
      return; // a file another process removed mid-scan
    }
    for (const [what, re] of OLD_TEXT) {
      if (re.test(text)) hits.push(`${rel}: ${what}`);
    }
  };
  if (fs.existsSync(path.join(root, ".git"))) {
    // Tracked files only: fast, and never reads untracked scratch.
    const tracked = execFileSync("git", ["ls-files", "-z"], { cwd: root, maxBuffer: 1 << 28 })
      .toString()
      .split("\0")
      .filter(Boolean);
    tracked.forEach(check);
  } else {
    const walk = (dir: string) => {
      for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) {
          if (!SKIP_DIRS.has(entry.name)) walk(full);
        } else check(path.relative(root, full));
      }
    };
    walk(root);
  }
  return hits;
}

test("the retired list names, folders, route and tool names are gone and stay gone", () => {
  expect(scan(process.env.PICK_LISTS_CENSUS_ROOT ?? REPO)).toEqual([]);
});
