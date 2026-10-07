#!/usr/bin/env npx tsx
/**
 * check:agent-run-tier — A RUN NEVER FETCHES THE AGENT DEFINITION.
 *
 * PACKAGE-INDEPENDENCE §3 (P24): agent definitions are read in three tiers —
 * the list (pickers, `@ai-matrx/agents/catalog`), the RUN TIER
 * (`fetchAgentRunTier` → `agx_get_run_tier`) and the full definition
 * (`fetchAgentExecutionFull`, `fetchFullAgent`), which only the builder needs
 * and which leaves the chat package at P25. The server loads the agent itself
 * and owns the `config_overrides` merge, so the run path has no use for the
 * definition.
 *
 * This counts calls to the two definition fetches in `../aidream/apps/shared/chat/src`
 * (tests excluded) outside the builder-tier files. The count is SHRINK-ONLY:
 * a file above its baseline fails; a file below it must lower its baseline in
 * the same commit. Reached 0 at P24v (voice reads a server-read realtime
 * session config). The legacy RPCs
 * `agx_get_execution_minimal|full` may be called ONLY by thunks.ts.
 *
 *   pnpm check:agent-run-tier              # fail on any regression
 *   pnpm check:agent-run-tier --self-test  # prove the guard can FAIL
 *   pnpm check:agent-run-tier --root <dir> # scan another tree (red proof)
 */
import { execSync } from "node:child_process";
import { gitFiles } from "./lib/source-roots.cjs";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

const ROOT = path.resolve(__dirname, "..");
const PKG = "../aidream/apps/shared/chat/src/";

/** A CALL of a definition fetch — prose and imports that name it are not reads. */
const DEFINITION_FETCH = /\b(?:fetchAgentExecutionFull|fetchFullAgent)\s*\(/g;
/** A direct call of a pre-P24 execution RPC. */
const LEGACY_RPC = /\.rpc\(\s*["'`]agx_get_execution_(?:minimal|full)["'`]/g;

/**
 * Builder tier (§3). Since B2 (2026-10-07) no package file is exempt: the
 * builder surfaces and `fetchFullAgent` itself live in the app
 * (`features/agents/redux/fetch-full-agent.thunk.ts`), so any definition
 * fetch inside chat counts against the run.
 */
const BUILDER_TIER = new Set<string>([]);
/**
 * SHRINK-ONLY BASELINE (2026-10-05, P24). Run-side definition fetches still
 * standing, with why. Never raise a number; lower it when a site moves.
 */
const BASELINE: Record<string, number> = {
  // (P25, 2026-10-05: the Quickset / Tools / Skills / Connections pickers
  // moved to `fetchAgentRunControls` → `agx_get_run_controls`; their 6 fetches
  // are gone.)
  // (P24v, 2026-10-05: voice reads its session config from aidream —
  // `POST /ai/agents/{id}/realtime-session` — so the 3 voice fetches are gone.
  // Zero run-side definition fetches remain.)
};

const LEGACY_RPC_ALLOWED = new Set<string>([
  `${PKG}agents/redux/agent-definition/thunks.ts`,
]);

const isTest = (f: string) =>
  /(__tests__|\.test\.tsx?$|\.spec\.tsx?$)/.test(f);

function stripComments(src: string): string {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, " "))
    .replace(/(^|[^:"'`])\/\/.*$/gm, "$1");
}

/** Run-side files OUTSIDE the package that §3 names (baseline 0). */
const APP_RUN_SIDE = [
  // Counts on the attach menu — mounted on every chat page.
  "features/resource-manager/resource-picker/useRunControlCounts.ts",
];

function sourceFiles(root: string): string[] {
  const out = gitFiles(root, ["ls-files", "--cached", "--others", "--exclude-standard", "--", `${PKG}*.ts`, `${PKG}*.tsx`, ...APP_RUN_SIDE]);
  return out.split("\n").filter(Boolean).filter((f) => !isTest(f));
}

interface Result {
  over: string[];
  under: string[];
  legacy: string[];
  total: number;
}

function scan(files: string[], root: string, baseline = BASELINE): Result {
  const res: Result = { over: [], under: [], legacy: [], total: 0 };
  const seen = new Map<string, number>();
  for (const file of files) {
    let src: string;
    try {
      src = stripComments(readFileSync(path.join(root, file), "utf8"));
    } catch {
      continue;
    }
    if (!LEGACY_RPC_ALLOWED.has(file) && (src.match(LEGACY_RPC)?.length ?? 0) > 0)
      res.legacy.push(file);
    if (BUILDER_TIER.has(file)) continue;
    const n = src.match(DEFINITION_FETCH)?.length ?? 0;
    if (n > 0) seen.set(file, n);
  }
  for (const [file, n] of seen) {
    res.total += n;
    const allowed = baseline[file] ?? 0;
    if (n > allowed) res.over.push(`${file}: ${n} (baseline ${allowed})`);
  }
  for (const [file, allowed] of Object.entries(baseline)) {
    const n = seen.get(file) ?? 0;
    if (n < allowed) res.under.push(`${file}: ${n} (baseline ${allowed}) — lower the baseline`);
  }
  return res;
}

function report(res: Result): boolean {
  const ok = res.over.length === 0 && res.under.length === 0 && res.legacy.length === 0;
  if (ok) {
    console.log(
      `check:agent-run-tier OK — ${res.total} run-side definition fetch(es), all within the shrink-only baseline.`,
    );
    return true;
  }
  for (const l of res.over)
    console.error(`✗ a run-side file fetches the agent DEFINITION: ${l}. Use fetchAgentRunTier (agx_get_run_tier).`);
  for (const l of res.legacy)
    console.error(`✗ ${l} calls agx_get_execution_minimal/full directly. Use fetchAgentRunTier.`);
  for (const l of res.under) console.error(`✗ ${l}`);
  return false;
}

function selfTest(): void {
  const dir = mkdtempSync(path.join(tmpdir(), "agent-run-tier-"));
  try {
    execSync("git init -q", { cwd: dir });
    const file = `${PKG}agents/run/Planted.tsx`;
    mkdirSync(path.join(dir, path.dirname(file)), { recursive: true });
    const write = (body: string) => writeFileSync(path.join(dir, file), body);
    const files = () => sourceFiles(dir);

    write(`// fetchFullAgent(id) in prose is fine\nexport const x = () => dispatch(fetchAgentRunTier(id));\n`);
    const clean = scan(files(), dir, {});
    if (clean.over.length || clean.legacy.length) throw new Error("self-test: a clean file was reported");

    write(`export const x = () => dispatch(fetchAgentExecutionFull(id));\n`);
    const planted = scan(files(), dir, {});
    if (planted.over.length !== 1) throw new Error("self-test: a planted definition fetch was NOT reported");

    write(`export const x = () => supabase.rpc("agx_get_execution_minimal", {});\n`);
    const rpc = scan(files(), dir, {});
    if (rpc.legacy.length !== 1) throw new Error("self-test: a planted legacy RPC was NOT reported");

    const shrunk = scan([], dir, { [file]: 1 });
    if (shrunk.under.length !== 1) throw new Error("self-test: a stale baseline was NOT reported");
    console.log("check:agent-run-tier --self-test OK — the guard fails on a planted fetch, a legacy RPC and a stale baseline, and passes clean.");
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

if (process.argv.includes("--self-test")) {
  selfTest();
} else {
  // --root <dir>: scan another checkout (e.g. an exported older tree) — used
  // to show the guard red on the pre-P24 code.
  const at = process.argv.indexOf("--root");
  const root = at > 0 ? path.resolve(process.argv[at + 1]) : ROOT;
  process.exit(report(scan(sourceFiles(root), root)) ? 0 : 1);
}
