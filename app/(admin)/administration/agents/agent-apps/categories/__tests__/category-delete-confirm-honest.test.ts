/**
 * The agent-app category delete dialog said "Agent apps assigned to this
 * category will be orphaned ... This cannot be undone" — but
 * `deleteAgentAppCategory` (lib/services/agent-apps-admin-service.ts) calls
 * the `cat_archive` RPC, not a hard `.delete()` (its own comment: "🚨 SOFT,
 * NOW. This was a HARD `.delete()` ... so destroying an agent-app category
 * silently NULLed a live column on every row that named it"). Same RPC,
 * same class of bug the prior lane already fixed for the shortcut-category
 * dialog in components/admin/ContentBlocksManager.tsx (commit 8f48935eef).
 * Traced during data-doctrine-adoption v5 lane UNDONE-COPY-CENSUS-3.
 *
 * Class guard: scans every file calling `deleteAgentAppCategory(` for a
 * permanence claim.
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

function filesThatDeleteAgentAppCategories(): string[] {
  const files: string[] = [];
  for (const dir of SEARCH_DIRS) walk(join(REPO_ROOT, dir), files);
  return files.filter((file) => /\bdeleteAgentAppCategory\s*\(/.test(readFileSync(file, "utf8")));
}

describe("agent-app category delete confirm copy is honest about a soft archive", () => {
  it("finds the delete surface it is supposed to be guarding", () => {
    expect(filesThatDeleteAgentAppCategories().length).toBeGreaterThan(0);
  });

  it("no agent-app category delete surface claims the archive is permanent or orphans references", () => {
    const offences: string[] = [];
    for (const file of filesThatDeleteAgentAppCategories()) {
      const source = readFileSync(file, "utf8");
      for (const re of PERMANENCE_PATTERNS) {
        if (re.test(source)) offences.push(`${file.slice(REPO_ROOT.length + 1)} — ${re.source}`);
      }
    }
    expect(offences).toEqual([]);
  });
});
