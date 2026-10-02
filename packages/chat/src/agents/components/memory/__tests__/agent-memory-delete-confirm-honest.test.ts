/**
 * agent_memory deletes are soft (`deleted_at`, see
 * features/agents/components/memory/service/agent-memory.service.ts's own doc
 * comment: "Deletes are soft (deleted_at) — callers must filter deleted_at is
 * null"), but AgentMemorySidebar's confirm said "This cannot be undone."
 * Census item for TAILS-24 #4 (VERIFIER-23's schedule-delete finding, applied
 * class-wide).
 */
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

const REPO_ROOT = join(__dirname, "..", "..", "..", "..", "..");

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

/**
 * `deleteMemory` is not a unique name — `features/memory/service/memoryService.ts` (a
 * different feature entirely, `chat.memories`, a genuine hard `.delete()`) exports one too.
 * Scope to files that actually consume THIS agent_memory hook, never a bare name match.
 */
function filesThatDeleteAgentMemories(): string[] {
  const files: string[] = [];
  for (const dir of SEARCH_DIRS) walk(join(REPO_ROOT, dir), files);
  return files.filter((file) => {
    if (file.endsWith(join("memory", "hooks", "useAgentMemories.ts"))) return false;
    if (file.endsWith(join("memory", "service", "agent-memory.service.ts"))) return false;
    const source = readFileSync(file, "utf8");
    if (!/\bdeleteMemory\s*\(/.test(source)) return false;
    return /useAgentMemories/.test(source);
  });
}

describe("agent memory delete confirm copy is honest about a soft delete", () => {
  it("finds the delete surface it is supposed to be guarding", () => {
    expect(filesThatDeleteAgentMemories().length).toBeGreaterThan(0);
  });

  it("no agent-memory delete surface claims the delete is permanent", () => {
    const offences: string[] = [];
    for (const file of filesThatDeleteAgentMemories()) {
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
