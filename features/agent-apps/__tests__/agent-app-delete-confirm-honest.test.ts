/**
 * The agent-app delete confirms said 'Permanently delete "<name>"? This
 * cannot be undone.' while `deleteApp` (features/agents/redux/agent-apps/thunks.ts)
 * only stamps `deleted_at` — a soft delete. Census item for TAILS-24 #4
 * (VERIFIER-23's schedule delete finding, applied class-wide): every surface
 * that dispatches `deleteApp` must not claim permanence.
 */
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

const REPO_ROOT = join(__dirname, "..", "..", "..");

const PERMANENCE_PATTERNS: Array<{ label: string; re: RegExp }> = [
  { label: '"cannot be undone"', re: /cannot be undone/i },
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

function filesThatDeleteAgentApps(): string[] {
  const files: string[] = [];
  for (const dir of SEARCH_DIRS) walk(join(REPO_ROOT, dir), files);
  return files.filter((file) => {
    // The thunk's own file legitimately discusses the word in its soft-delete doc comment.
    if (file.endsWith(join("redux", "agent-apps", "thunks.ts"))) return false;
    return /\bdeleteApp\s*\(/.test(readFileSync(file, "utf8"));
  });
}

describe("agent app delete confirm copy is honest about a soft delete", () => {
  it("finds the delete surfaces it is supposed to be guarding", () => {
    expect(filesThatDeleteAgentApps().length).toBeGreaterThan(0);
  });

  it("no agent-app delete surface claims the delete is permanent", () => {
    const offences: string[] = [];
    for (const file of filesThatDeleteAgentApps()) {
      const source = readFileSync(file, "utf8");
      for (const { label, re } of PERMANENCE_PATTERNS) {
        if (re.test(source)) {
          offences.push(`${file.slice(REPO_ROOT.length + 1)} — ${label}`);
        }
      }
    }
    expect(offences).toEqual([]);
  });
});
