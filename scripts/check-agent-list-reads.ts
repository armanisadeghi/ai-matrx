#!/usr/bin/env npx tsx
/**
 * check:agent-list-reads — THE AGENT LIST IS READ IN EXACTLY ONE PLACE.
 *
 * Owner ruling D1 (2026-09-08): the agent picker and ALL of its logic live in
 * `@ai-matrx/agents/catalog`. That package owns `agx_get_list`,
 * `agx_get_list_full` and `agx_search`; this repo's four list thunks are thin
 * hydrators that ask the package catalog and project its rows into the
 * `agent-definition` registry.
 *
 * Re-adding one of those RPCs here rebuilds the second membership rule, the
 * second ordering rule and the second freshness window that made the pickers
 * across our apps disagree in the first place. It is a defect, not a shortcut,
 * so this guard refuses it.
 *
 *   pnpm check:agent-list-reads              # fail on any hit
 *   pnpm check:agent-list-reads --self-test  # prove the guard can FAIL
 *
 * `--self-test` writes a temporary file containing a banned read, asserts the
 * scan reports it, deletes it, and asserts the scan is clean again. A guard
 * that cannot be demonstrated failing is not a guard.
 */

import { execSync } from "node:child_process";
import { readFileSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";

const ROOT = path.resolve(__dirname, "..");

/**
 * An actual READ — `.rpc("agx_get_list" | "agx_get_list_full" | "agx_search")`.
 * Prose that NAMES the RPC is documentation, not a second catalogue, so this
 * matches the call and nothing else.
 */
const BANNED = /\.rpc\(\s*["'`]agx_(?:get_list\w*|search)["'`]/g;

/**
 * The two files allowed to contain the pattern, each for a stated reason.
 * A code file that reads the list gets no exemption at all.
 */
const ALLOWED_FILES = new Set<string>([
  // This guard: it has to carry the pattern to look for it.
  "scripts/check-agent-list-reads.ts",
  // 🚨 KNOWN GAP, reported 2026-09-08 with the picker adoption. The SSR seed
  // for the temporary `/agents/classic` gallery runs on the SERVER, and
  // `@ai-matrx/agents/catalog` has no server entry (it is built around a
  // browser Supabase client plus Redux identity). It is a 30-row first-paint
  // read, not a picker and not a store, and the client immediately hydrates
  // the same page from the package catalog. The real fix is a package-side
  // server read; until then this ONE call is named here rather than hidden.
  "lib/agents/data.ts",
]);

const SCANNED_ROOTS =
  /^(app|components|features|hooks|lib|providers|scripts|utils|types|actions|config|database)\//;

interface Finding {
  file: string;
  line: number;
  text: string;
}

function sourceFiles(): string[] {
  const out = execSync(
    "git ls-files --cached --others --exclude-standard '*.ts' '*.tsx'",
    { cwd: ROOT, encoding: "utf8", maxBuffer: 32 * 1024 * 1024 },
  );
  return out
    .split("\n")
    .filter(Boolean)
    .filter((file) => SCANNED_ROOTS.test(file))
    .filter((file) => !ALLOWED_FILES.has(file));
}

function scan(): Finding[] {
  const findings: Finding[] = [];
  for (const file of sourceFiles()) {
    let text: string;
    try {
      text = readFileSync(path.join(ROOT, file), "utf8");
    } catch {
      continue; // deleted between listing and read
    }
    const lines = text.split("\n");
    lines.forEach((line, i) => {
      BANNED.lastIndex = 0;
      if (BANNED.test(line)) {
        findings.push({ file, line: i + 1, text: line.trim() });
      }
    });
  }
  return findings;
}

function report(findings: Finding[]): void {
  console.error("\n🚨 AN AGENT-LIST RPC IS BEING READ OUTSIDE THE PACKAGE\n");
  for (const f of findings) {
    console.error(`  ✗ ${f.file}:${f.line} — ${f.text}`);
  }
  console.error(
    "\n`agx_get_list`, `agx_get_list_full` and `agx_search` belong to\n" +
      "@ai-matrx/agents/catalog. Ask the catalog instead:\n" +
      "  getAgentCatalog().ensureLoaded()   → rows\n" +
      "  getAgentCatalog().searchServer(q)  → matching ids\n" +
      "and project what you need into the agent-definition registry (see\n" +
      "features/agents/redux/agent-definition/thunks.ts). Needing a field the\n" +
      "catalog does not expose is a PACKAGE gap — fix it there and release.\n",
  );
}

function selfTest(): void {
  const before = scan();
  if (before.length > 0) {
    console.error("self-test: the tree is already failing; fix that first.");
    report(before);
    process.exit(1);
  }
  const probe = path.join(ROOT, "lib", "__agent_list_read_probe__.ts");
  writeFileSync(
    probe,
    'export const probe = () => supabase.rpc("agx_get_list_full");\n',
  );
  try {
    const during = scan();
    const caught = during.some((f) =>
      f.file.endsWith("__agent_list_read_probe__.ts"),
    );
    if (!caught) {
      console.error(
        "🚨 self-test FAILED: the guard did not catch a reintroduced " +
          "`agx_get_list_full` read. This guard proves nothing.",
      );
      process.exit(1);
    }
    console.log(
      "self-test: RED with a reintroduced read (" +
        `${during.length} finding(s)) …`,
    );
  } finally {
    rmSync(probe, { force: true });
  }
  const after = scan();
  if (after.length > 0) {
    console.error("🚨 self-test FAILED: still red after removing the probe.");
    report(after);
    process.exit(1);
  }
  console.log("self-test: GREEN once the read is gone. ✅ The guard works.");
}

function main(): void {
  if (process.argv.includes("--self-test")) {
    selfTest();
    return;
  }
  const findings = scan();
  if (findings.length === 0) {
    console.log(
      "✅ The agent list is read only by @ai-matrx/agents/catalog — no " +
        "`agx_get_list*` / `agx_search` call in this repo.",
    );
    return;
  }
  report(findings);
  process.exit(1);
}

main();
